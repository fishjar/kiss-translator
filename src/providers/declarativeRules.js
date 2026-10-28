import { providerError } from "./capabilities";
import { getSettingOptions } from "./instances";
import { protocolCapabilities } from "./protocolCapabilities";

const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const unsafe = new Set(["__proto__", "prototype", "constructor"]);
const reserved = new Set(["baseUrl", "auth", "model", "messages", "stream"]);

function check(valid, code, message) {
  if (!valid) throw providerError(code, message);
}

export function validRuleUrlPath(path) {
  if (typeof path !== "string") return false;
  try {
    const decoded = decodeURIComponent(path);
    return (
      !path.startsWith("/") &&
      path === path.trim() &&
      !path.includes(":") &&
      ![path, decoded].some((value) =>
        Array.from(value).some(
          (char) =>
            char === "\\" ||
            char.charCodeAt(0) < 32 ||
            char.charCodeAt(0) === 127
        )
      ) &&
      !decoded.split(/[/?#]/).includes("..")
    );
  } catch {
    return false;
  }
}

function pathValid(path, roots = ["config", "input"]) {
  return (
    typeof path === "string" &&
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])+$/.test(path) &&
    roots.includes(path.split(/[.[]/)[0]) &&
    !path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .some((key) => unsafe.has(key))
  );
}

// Fixed references and typed operators, never expressions or executable code.
function validateNode(node, fields, code, depth = 0, mode = "protocol") {
  check(depth <= 32, code, "Rule nesting limit exceeded.");
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((value) => validateNode(value, fields, code, depth + 1, mode));
    return;
  }
  if (Object.hasOwn(node, "$if")) {
    check(mode === "protocol", code, "Conditions require protocol format.");
    check(
      Object.keys(node).every((key) => ["$if", "then", "else"].includes(key)),
      code,
      "Invalid conditional rule."
    );
    check(
      object(node.$if) &&
        Object.keys(node.$if).every((key) => ["$ref", "equals"].includes(key)),
      code,
      "Condition must be a setting reference."
    );
    const field = fields.find(
      (field) => `config.${field.key}` === node.$if.$ref
    );
    check(
      !field?.isSecret &&
        (Object.hasOwn(node.$if, "equals")
          ? field?.type === "select" &&
            getSettingOptions(field).some(
              (option) => option.value === node.$if.equals
            )
          : field?.type === "boolean"),
      code,
      "Condition must reference a nonsecret boolean setting or compare a declared select option."
    );
    check(
      Object.hasOwn(node, "then") || Object.hasOwn(node, "else"),
      code,
      "Conditional rule needs a branch."
    );
    for (const branch of ["then", "else"])
      if (Object.hasOwn(node, branch))
        validateNode(node[branch], fields, code, depth + 1, mode);
    return;
  }
  if (Object.hasOwn(node, "$ref")) {
    check(
      pathValid(
        node.$ref,
        mode === "response"
          ? ["response"]
          : mode === "http"
            ? ["config", "input", "resources"]
            : ["config", "input"]
      ) &&
        Object.keys(node).every((key) =>
          [
            "$ref",
            "fallbackRef",
            "omitIfEmpty",
            "omitValues",
            "transform",
          ].includes(key)
        ),
      code,
      "Invalid field reference."
    );
    const nonsecret = (path) =>
      !path.startsWith("config.") ||
      !fields.some(
        (field) =>
          field.key === path.slice(7).split(/[.[]/)[0] &&
          (field.isSecret || field.type === "password")
      );
    check(nonsecret(node.$ref), code, "Secrets require $secret references.");
    if (Object.hasOwn(node, "fallbackRef"))
      check(
        mode !== "response" &&
          pathValid(node.$ref) &&
          pathValid(node.fallbackRef) &&
          nonsecret(node.fallbackRef),
        code,
        "Invalid fallback reference."
      );
    check(
      node.transform === undefined || node.transform === "languages.toIso6391",
      code,
      "Unsupported transform."
    );
    check(
      node.omitIfEmpty === undefined || typeof node.omitIfEmpty === "boolean",
      code,
      "Invalid omission flag."
    );
    check(
      node.omitValues === undefined || Array.isArray(node.omitValues),
      code,
      "Invalid omission values."
    );
    return;
  }
  if (mode === "http" && Object.hasOwn(node, "$secret")) {
    check(
      Object.keys(node).length === 1 &&
        fields.some(
          (field) =>
            field.key === node.$secret &&
            (field.isSecret || field.type === "password")
        ),
      code,
      "Secret reference requires a declared secret."
    );
    return;
  }
  if (mode === "http" && Object.hasOwn(node, "$asset")) {
    check(
      Object.keys(node).length === 1 && pathValid(node.$asset, ["input"]),
      code,
      "Invalid asset reference."
    );
    return;
  }
  if (mode === "http" && Object.hasOwn(node, "$url")) {
    const url = node.$url;
    check(
      Object.keys(node).length === 1 &&
        object(url) &&
        Object.keys(url).every((key) => ["base", "path"].includes(key)) &&
        pathValid(url.base, ["config"]) &&
        validRuleUrlPath(url.path),
      code,
      "Invalid URL rule."
    );
    check(
      !fields.some(
        (field) =>
          field.key === url.base.slice(7).split(/[.[]/)[0] &&
          (field.isSecret || field.type === "password")
      ),
      code,
      "Secrets require $secret references."
    );
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    check(
      !unsafe.has(key) && !key.startsWith("$") && key !== "fallbackRef",
      code,
      "Unknown or unsafe rule operator."
    );
    validateNode(value, fields, code, depth + 1, mode);
  }
}

/** Shared by package ingestion and execution of independent instance snapshots. */
export function validateDeclarativeRules(
  rules,
  capabilities = {},
  fields = [],
  code = "INVALID_RULE"
) {
  check(
    object(rules) &&
      ["http", "protocol"].includes(rules.format) &&
      !Object.hasOwn(rules, "rulesVersion") &&
      !Object.hasOwn(rules, "manifestVersion") &&
      object(rules.handlers),
    code,
    "Unsupported declarative rules."
  );
  for (const [handler, rule] of Object.entries(rules.handlers)) {
    check(
      /^[A-Za-z_$][\w$]*$/.test(handler) &&
        !unsafe.has(handler) &&
        object(rule),
      code,
      "Invalid declarative handler."
    );
    if (rules.format === "http") {
      check(
        rule.request && ["json", "asset"].includes(rule.response?.kind),
        code,
        "Missing declarative request or response kind."
      );
      validateNode(rule.request, fields, code, 0, "http");
      validateNode(rule.response.map, fields, code, 0, "response");
      continue;
    }
    check(
      Object.keys(rule).every((key) =>
        ["protocol", "task", "request"].includes(key)
      ) &&
        Object.hasOwn(protocolCapabilities, rule.task) &&
        rule.protocol === protocolCapabilities[rule.task].protocol,
      code,
      "Unsupported protocol or task."
    );
    const request = rule.request;
    check(
      object(request) &&
        Object.keys(request).every((key) =>
          ["baseUrl", "model", "auth", "parameters"].includes(key)
        ) &&
        request.baseUrl !== undefined &&
        request.model !== undefined,
      code,
      "Invalid protocol request."
    );
    validateNode(request.baseUrl, fields, code);
    validateNode(request.model, fields, code);
    check(
      object(request.auth) &&
        Object.keys(request.auth).every((key) =>
          ["type", "secret"].includes(key)
        ) &&
        request.auth.type === "bearer" &&
        object(request.auth.secret) &&
        Object.keys(request.auth.secret).length === 1 &&
        fields.some(
          (field) =>
            field.key === request.auth.secret.$secret &&
            (field.isSecret || field.type === "password")
        ),
      code,
      "Bearer auth requires a declared secret."
    );
    check(
      request.parameters === undefined || object(request.parameters),
      code,
      "Parameters must be an object."
    );
    for (const [key, value] of Object.entries(request.parameters || {})) {
      check(
        !reserved.has(key) &&
          (rule.protocol === "openai-chat-completions" ||
            ![
              "file",
              "input",
              "audio",
              "language",
              "voice",
              "speed",
              "response_format",
              "timestamp_granularities[]",
            ].includes(key)) &&
          !unsafe.has(key) &&
          !key.startsWith("$"),
        code,
        "Reserved protocol parameter."
      );
      validateNode(value, fields, code);
    }
  }
  for (const [capability, descriptor] of Object.entries(capabilities)) {
    const rule = rules.handlers[descriptor.handler];
    check(
      Object.hasOwn(rules.handlers, descriptor.handler) && object(rule),
      code,
      "Missing declarative handler."
    );
    check(capability !== "speak", code, "System speech is native-only.");
    if (rules.format === "http") {
      check(
        !(descriptor.outputModes || []).includes("stream"),
        code,
        "HTTP rules do not support streaming."
      );
      continue;
    }
    check(
      rule.task === capability,
      code,
      "Protocol task does not match capability."
    );
    const support = protocolCapabilities[capability];
    check(
      (!descriptor.coordinates || support.coordinates) &&
        (!descriptor.timestamps || support.timestamps) &&
        (!descriptor.batch?.supported || support.batch) &&
        (descriptor.outputModes || ["complete"]).every(
          (mode) => mode === "complete" || (mode === "stream" && support.stream)
        ) &&
        (descriptor.inputModalities || ["text"]).every((mode) =>
          support.modalities.includes(mode)
        ),
      code,
      "Unsupported protocol capability features."
    );
  }
}
