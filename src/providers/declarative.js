import { buildTextTaskMessages, parseTextTaskResult } from "./sdk/textTasks";
import { providerError } from "./capabilities";
import { validateDeclarativeRules, validRuleUrlPath } from "./declarativeRules";
import { protocolCapabilities } from "./protocolCapabilities";

const OMIT = Symbol("omit");
const unsafe = new Set(["__proto__", "prototype", "constructor"]);
function read(path, roots) {
  if (
    typeof path !== "string" ||
    !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*$/.test(path)
  )
    throw providerError("INVALID_RULE", "Invalid field path.");
  let value = roots;
  for (const key of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (unsafe.has(key))
      throw providerError("INVALID_RULE", "Unsafe field path.");
    if (!value || !Object.prototype.hasOwnProperty.call(value, key))
      return undefined;
    value = value[key];
  }
  return value;
}

/** Fixed typed operators only. No eval, regex, function expressions or dynamic paths. */
function resolve(node, roots, ctx, depth = 0) {
  if (depth > 32)
    throw providerError("INVALID_RULE", "Rule nesting limit exceeded.");
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    const values = node.map((item) => resolve(item, roots, ctx, depth + 1));
    return roots.format === "protocol"
      ? values.filter((value) => value !== OMIT)
      : values;
  }
  if (Object.hasOwn(node, "$if")) {
    if (roots.format !== "protocol")
      throw providerError(
        "INVALID_RULE",
        "Conditional rules require protocol format."
      );
    const value = read(node.$if.$ref, roots);
    const condition = Object.hasOwn(node.$if, "equals")
      ? value === node.$if.equals
      : value;
    if (typeof condition !== "boolean")
      throw providerError("INVALID_INPUT", "Condition value must be boolean.");
    const branch = condition ? "then" : "else";
    return Object.hasOwn(node, branch)
      ? resolve(node[branch], roots, ctx, depth + 1)
      : OMIT;
  }
  if (node.$ref !== undefined) {
    let value = read(node.$ref, roots);
    if (value == null && Object.hasOwn(node, "fallbackRef"))
      value = read(node.fallbackRef, roots);
    if (
      (node.omitIfEmpty &&
        (value === undefined || value === null || value === "")) ||
      node.omitValues?.includes(value)
    )
      return OMIT;
    if (value === undefined)
      throw providerError("INVALID_INPUT", `Missing field: ${node.$ref}`);
    if (node.transform) {
      if (node.transform !== "languages.toIso6391")
        throw providerError("INVALID_RULE", "Unsupported transform.");
      value = ctx.helpers.languages.toIso6391(value);
    }
    return value;
  }
  if (node.$secret !== undefined) return ctx.secrets.ref(node.$secret);
  if (node.$asset !== undefined) {
    const value = read(node.$asset, roots);
    if (!value?.assetId)
      throw providerError("INVALID_INPUT", "Missing asset reference.");
    return value;
  }
  if (node.$url) {
    const base = read(node.$url.base, roots);
    if (typeof base !== "string" || !validRuleUrlPath(node.$url.path))
      throw providerError("INVALID_RULE", "Invalid URL rule.");
    let directory, target;
    try {
      directory = new URL(base);
      directory.search = "";
      directory.hash = "";
      directory.pathname = directory.pathname.replace(/\/+$/, "") + "/";
      target = new URL(node.$url.path, directory);
    } catch {
      throw providerError("INVALID_RULE", "Invalid URL rule.");
    }
    if (
      target.origin !== directory.origin ||
      !target.pathname.startsWith(directory.pathname)
    )
      throw providerError("INVALID_RULE", "URL leaves its base directory.");
    return target.href;
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (unsafe.has(key) || key.startsWith("$"))
      throw providerError("INVALID_RULE", "Unknown or unsafe rule operator.");
    const resolved = resolve(value, roots, ctx, depth + 1);
    if (resolved !== OMIT) result[key] = resolved;
  }
  return result;
}

export async function runDeclarative(snapshot, handler, input, ctx) {
  if (
    snapshot.apiVersion !== 1 ||
    Object.hasOwn(snapshot, "manifestVersion") ||
    Object.hasOwn(snapshot, "rulesVersion")
  )
    throw providerError(
      "SDK_VERSION_UNSUPPORTED",
      "Unsupported plugin API contract."
    );
  const rules = snapshot.rules;
  validateDeclarativeRules(rules, snapshot.capabilities, snapshot.settings);
  if (unsafe.has(handler))
    throw providerError("INVALID_RULE", "Unsupported rule format or handler.");
  const rule = rules.handlers?.[handler];
  if (!rule)
    throw providerError("HANDLER_MISSING", "Declarative handler not found.");
  if (rules.format === "protocol")
    return runProtocol(rule, input, ctx, {
      ...snapshot.capabilities?.[rule.task],
      format: "markdown",
    });
  if (ctx.options?.streaming)
    throw providerError(
      "STREAM_UNSUPPORTED",
      "HTTP rules do not support streaming."
    );
  const request = resolve(
    rule.request,
    { config: ctx.config, input, resources: ctx.resources },
    ctx
  );
  const response = await ctx.http.request(request);
  if (rule.response.kind === "asset") {
    if (!response.body?.assetId)
      throw providerError("INVALID_RESPONSE", "Missing audio asset.");
    return { audio: response.body, mimeType: response.body.mimeType };
  }
  if (rule.response.kind !== "json")
    throw providerError("INVALID_RULE", "Unsupported response kind.");
  const data = JSON.parse(response.body);
  const error =
    rule.response.errorPath &&
    read(`response.${rule.response.errorPath}`, { response: data });
  if (error) throw providerError("PROVIDER_ERROR", String(error));
  return resolve(rule.response.map, { response: data }, ctx);
}

async function runProtocol(rule, input, ctx, descriptor = {}) {
  const sdk = ctx.helpers.openai.chatCompletions;
  const streaming = Boolean(ctx.options?.streaming);
  if (streaming && !protocolCapabilities[rule.task].stream)
    throw providerError(
      "STREAM_UNSUPPORTED",
      "This task requires a complete response."
    );
  const resolved = resolve(
    rule.request,
    { config: ctx.config, input, format: "protocol" },
    ctx
  );
  if (rule.protocol !== "openai-chat-completions") {
    const audio = ctx.helpers.openai.audio;
    const request =
      rule.task === "transcribe"
        ? audio.buildTranscriptionRequest({
            ...resolved.parameters,
            ...input,
            baseUrl: resolved.baseUrl,
            model: resolved.model,
            auth: resolved.auth,
            requireTimestamps:
              input.requireTimestamps ?? descriptor.timestamps ?? false,
          })
        : audio.buildSpeechRequest({
            ...resolved.parameters,
            ...input,
            baseUrl: resolved.baseUrl,
            model: resolved.model,
            auth: resolved.auth,
            voice: input.voice ?? ctx.config.voice,
            speed: input.speed ?? ctx.config.speed,
          });
    // Vendor parameters can add options, but cannot replace the task-owned payload.
    request.body = { ...resolved.parameters, ...request.body };
    const response = await ctx.http.request(request);
    if (rule.task === "transcribe") return audio.parseTranscription(response);
    if (!response.body?.assetId)
      throw providerError("INVALID_RESPONSE", "Missing audio asset.");
    return { audio: response.body, mimeType: response.body.mimeType };
  }
  const standardMessages =
    rule.task === "translate"
      ? ctx.helpers.translation.buildMessages(input)
      : rule.task === "chat"
        ? input.messages
        : buildTextTaskMessages(rule.task, input, descriptor);
  const messages = await sdk.prepareMessages(standardMessages, async (ref) => {
    const blob = ctx.assets.get(ref);
    if (blob.size > 8 * 1024 * 1024)
      throw providerError("RESOURCE_BUDGET_EXCEEDED", "Asset exceeds 8 MiB.");
    if (blob.type !== ref.mimeType)
      throw providerError("INVALID_ASSET", "Asset MIME type mismatch.");
    return blob.arrayBuffer();
  });
  const request = sdk.buildRequest({
    ...resolved.parameters,
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    auth: resolved.auth,
    messages,
    stream: streaming,
  });
  let result;
  if (!streaming) result = sdk.parseResponse(await ctx.http.request(request));
  else {
    const parser = sdk.createStreamParser();
    const translation =
      rule.task === "translate"
        ? await ctx.helpers.translation.createStreamParser(input)
        : null;
    for await (const frame of ctx.http.stream(request)) {
      if (frame.type !== "sse") continue;
      for (const event of parser.push(frame.data)) {
        if (!translation) await ctx.emit(event);
        else if (event.type === "text.delta")
          for (const item of translation.push(event.text)) await ctx.emit(item);
      }
    }
    result = parser.finish();
    if (translation) return translation.finish();
  }
  if (rule.task === "translate")
    return ctx.helpers.translation.parseResult(result.text, input);
  if (rule.task !== "chat")
    return parseTextTaskResult(rule.task, result.text, input, {
      ...descriptor,
      model: resolved.model,
      usage: result.usage,
    });
  return result;
}
