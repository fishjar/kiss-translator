import { validateConfig } from "./instances";
import { supportsProviderCapability, usesStreaming } from "./capabilities";
import { supportsApiCapability } from "../config/serviceSelection";

const references = Object.freeze({
  apiSlug: "translate",
  apiSlugs: "translate",
  visionServiceSlug: "parseImage",
  segSlug: "segmentSubtitle",
  summaryApiSlug: "summarize",
  aiDictApiSlug: "dictionary",
  ttsApiSlug: "synthesizeSpeech",
  layoutApiSlug: "analyzeLayout",
  asrApiSlug: "transcribe",
  langDetector: "detectLanguage",
  enSug: "suggest",
});
const opaque = new Set([
  "transApis",
  "providerPlugins",
  "provider",
  "pluginConfig",
  "prompts",
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const secret = (field) => field.isSecret === true || field.type === "password";

export function instanceTestSignature(api) {
  return JSON.stringify([
    api.provider,
    api.pluginConfig,
    api.enabledCapabilities,
    api.useBatchFetch,
    api.outputProtocol,
    Object.keys(api.provider?.capabilities || {}).map((name) => [
      name,
      usesStreaming(api, name),
    ]),
    api.batchPromptSlug,
    api.nobatchPromptSlug,
    api.dictPromptSlug,
    api.subtitlePromptSlug,
    api.systemPrompt,
    api.batchUserPrompt,
    api.nobatchPrompt,
    api.nobatchUserPrompt,
    api.dictPrompt,
    api.dictUserPrompt,
    api.subtitlePrompt,
  ]);
}

/** Copy only compatible values. Changed enum/range constraints require the new default or user input. */
export function copyCompatibleConfig(api, fields) {
  const values = {};
  const skipped = [];
  for (const field of fields) {
    const previous = api.provider.settings.find(
      (item) => item.key === field.key
    );
    const value = api.pluginConfig?.[field.key];
    if (!previous || value === undefined) continue;
    if (previous.type !== field.type || secret(previous) !== secret(field)) {
      skipped.push(field.key);
      continue;
    }
    try {
      values[field.key] = validateConfig([field], { [field.key]: value })[
        field.key
      ];
    } catch {
      skipped.push(field.key);
    }
  }
  return { values: clone(values), skipped };
}

export function serviceReferences(setting, rules, oldSlug, targetApi) {
  const found = [];
  const walk = (node, path, scope) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (
        opaque.has(key) ||
        (key === "apiSlugs" && path.at(-1) !== "tranboxSetting")
      )
        continue;
      const next = [...path, key];
      if (
        references[key] &&
        (value === oldSlug || (Array.isArray(value) && value.includes(oldSlug)))
      )
        found.push({
          scope,
          path: next,
          capability:
            key === "apiSlug" &&
            ["recognizeText", "parseImage"].includes(node.capability)
              ? node.capability
              : key === "ttsApiSlug" &&
                  supportsProviderCapability(
                    targetApi ||
                      setting.transApis?.find((api) => api.apiSlug === oldSlug),
                    "speak"
                  ) &&
                  !supportsProviderCapability(
                    targetApi ||
                      setting.transApis?.find((api) => api.apiSlug === oldSlug),
                    "synthesizeSpeech"
                  )
                ? "speak"
                : references[key],
          label: `${scope}.${next.join(".")}`,
          ...(scope === "rules" && { anchor: JSON.stringify(rules[next[0]]) }),
        });
      else if (value && typeof value === "object") walk(value, next, scope);
    }
  };
  walk(setting, [], "setting");
  walk(rules, [], "rules");
  return found;
}

/** Rebase the reviewed paths, never scan-and-replace IDs inside instances, credentials, or source code. */
export function replaceServiceReferences(
  setting,
  rules,
  oldSlug,
  newApi,
  selected
) {
  if (newApi.isDisabled) throw new Error("新实例已禁用");
  const latest = serviceReferences(setting, rules, oldSlug, newApi);
  const result = { setting: clone(setting), rules: clone(rules) };
  for (const reference of selected) {
    const current = latest.find(
      (item) =>
        item.scope === reference.scope &&
        JSON.stringify(item.path) === JSON.stringify(reference.path)
    );
    if (
      !current ||
      current.anchor !== reference.anchor ||
      current.capability !== reference.capability
    )
      throw new Error("引用在预览后发生变化，请重新预览");
    const compatible = newApi.provider
      ? supportsProviderCapability(newApi, current.capability)
      : supportsApiCapability(
          newApi,
          current.capability === "translate" ? "translate" : current.capability
        );
    if (!compatible) throw new Error(`新实例缺少 ${current.capability} 能力`);
    let owner = result[current.scope];
    for (const key of current.path.slice(0, -1)) owner = owner[key];
    const key = current.path.at(-1);
    owner[key] = Array.isArray(owner[key])
      ? [
          ...new Set(
            owner[key].map((id) => (id === oldSlug ? newApi.apiSlug : id))
          ),
        ]
      : newApi.apiSlug;
  }
  return result;
}
