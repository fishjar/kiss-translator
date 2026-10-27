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

function pathValid(path) {
  return (
    typeof path === "string" &&
    /^(config|input)(?:\.[A-Za-z_$][\w$]*|\[\d+\])+$/.test(path) &&
    !path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .some((key) => unsafe.has(key))
  );
}

// v2 exposes data references and typed setting branches, not a language.
function validateNode(node, fields, code, depth = 0) {
  check(depth <= 32, code, "Rule nesting limit exceeded.");
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((value) => validateNode(value, fields, code, depth + 1));
    return;
  }
  if (Object.hasOwn(node, "$if")) {
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
        validateNode(node[branch], fields, code, depth + 1);
    return;
  }
  if (Object.hasOwn(node, "$ref")) {
    check(
      pathValid(node.$ref) &&
        Object.keys(node).every((key) =>
          ["$ref", "omitIfEmpty", "omitValues"].includes(key)
        ),
      code,
      "Invalid field reference."
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
  for (const [key, value] of Object.entries(node)) {
    check(
      !unsafe.has(key) && !key.startsWith("$"),
      code,
      "Unknown or unsafe rule operator."
    );
    validateNode(value, fields, code, depth + 1);
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
      [1, 2].includes(rules.rulesVersion) &&
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
    if (rules.rulesVersion === 1) {
      check(
        rule.request && ["json", "asset"].includes(rule.response?.kind),
        code,
        "Missing declarative request or response kind."
      );
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
    if (rules.rulesVersion === 1) {
      check(
        !(descriptor.outputModes || []).includes("stream"),
        code,
        "Rules v1 do not support streaming."
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
