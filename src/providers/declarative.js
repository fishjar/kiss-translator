import { providerError } from "./capabilities";
import { validateDeclarativeRules } from "./declarativeRules";

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
    return roots.rulesVersion === 2
      ? values.filter((value) => value !== OMIT)
      : values;
  }
  if (Object.hasOwn(node, "$if")) {
    if (roots.rulesVersion !== 2)
      throw providerError(
        "INVALID_RULE",
        "Conditional rules require rulesVersion 2."
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
    if (
      typeof base !== "string" ||
      typeof node.$url.path !== "string" ||
      node.$url.path.startsWith("/") ||
      node.$url.path.includes(":") ||
      node.$url.path.split("/").includes("..")
    )
      throw providerError("INVALID_RULE", "Invalid URL rule.");
    return new URL(node.$url.path, `${base.replace(/\/+$/, "")}/`).href;
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
  const rules = snapshot.rules;
  validateDeclarativeRules(rules, snapshot.capabilities, snapshot.settings);
  if (unsafe.has(handler))
    throw providerError(
      "INVALID_RULE",
      "Unsupported rules version or handler."
    );
  const rule = rules.handlers?.[handler];
  if (!rule)
    throw providerError("HANDLER_MISSING", "Declarative handler not found.");
  if (rules.rulesVersion === 2) return runProtocol(rule, input, ctx);
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

async function runProtocol(rule, input, ctx) {
  const sdk = ctx.helpers.openai.chatCompletions;
  const streaming = Boolean(ctx.options?.streaming);
  if (streaming && rule.task === "parseImage")
    throw providerError(
      "STREAM_UNSUPPORTED",
      "Image parsing requires a complete response."
    );
  let messages;
  if (rule.task === "translate")
    messages = ctx.helpers.translation.buildMessages(input);
  else if (rule.task === "chat") messages = input.messages;
  else {
    const blob = ctx.assets.get(input.image);
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        blob.type
      ) ||
      blob.type !== input.image.mimeType
    )
      throw providerError(
        "INVALID_ASSET",
        "Unsupported or mismatched image MIME type."
      );
    if (blob.size > 8 * 1024 * 1024)
      throw providerError(
        "RESOURCE_BUDGET_EXCEEDED",
        "Image exceeds the asset budget."
      );
    const bytes = await blob.arrayBuffer();
    messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              input.prompt ??
              "Extract the visible text faithfully. Output only the recognized text.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${blob.type};base64,${ctx.helpers.encoding.bytesToBase64(bytes)}`,
            },
          },
        ],
      },
    ];
  }
  const resolved = resolve(
    rule.request,
    { config: ctx.config, input, rulesVersion: 2 },
    ctx
  );
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
  if (rule.task === "parseImage")
    return {
      text: result.text,
      format: "text",
      items: result.text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((text) => ({ text, poly: null })),
    };
  return result;
}
