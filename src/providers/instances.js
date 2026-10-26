import {
  PROVIDER_CAPABILITIES,
  providerError,
  supportedCapabilities,
  validateEnabledCapabilities,
} from "./capabilities";
import { providerHelpers } from "./sdk";
import { validateDefaultPrompts } from "./defaultPrompts";

import {
  assertPluginCompatibility,
  pluginCompatibilityFields,
} from "./compatibility";

const copy = (value) => JSON.parse(JSON.stringify(value));
const forbidden = new Set(["__proto__", "constructor", "prototype"]);

export function validateCapabilities(capabilities) {
  if (
    !capabilities ||
    Array.isArray(capabilities) ||
    typeof capabilities !== "object" ||
    !Object.keys(capabilities).length
  )
    throw providerError("INVALID_MANIFEST", "Missing capabilities.");
  for (const [name, descriptor] of Object.entries(capabilities)) {
    if (
      !PROVIDER_CAPABILITIES.includes(name) ||
      !descriptor ||
      typeof descriptor.handler !== "string" ||
      !/^[A-Za-z_$][\w$]*$/.test(descriptor.handler) ||
      forbidden.has(descriptor.handler) ||
      (descriptor.taskModes !== undefined &&
        (!Array.isArray(descriptor.taskModes) ||
          !descriptor.taskModes.length ||
          descriptor.taskModes.some(
            (mode) => !["doc", "table", "formula"].includes(mode)
          ))) ||
      (descriptor.inputModalities !== undefined &&
        (!Array.isArray(descriptor.inputModalities) ||
          !descriptor.inputModalities.length ||
          descriptor.inputModalities.some(
            (mode) => !["text", "image", "audio"].includes(mode)
          ))) ||
      ["coordinates", "timestamps"].some(
        (key) =>
          descriptor[key] !== undefined && typeof descriptor[key] !== "boolean"
      ) ||
      (descriptor.outputModes !== undefined &&
        (!Array.isArray(descriptor.outputModes) ||
          !descriptor.outputModes.length ||
          descriptor.outputModes.some(
            (mode) => !["complete", "stream"].includes(mode)
          ))) ||
      (descriptor.batch !== undefined &&
        (typeof descriptor.batch.supported !== "boolean" ||
          (descriptor.batch.maxItems !== undefined &&
            (!Number.isInteger(descriptor.batch.maxItems) ||
              descriptor.batch.maxItems < 1))))
    ) {
      throw providerError("INVALID_MANIFEST", "Invalid capability descriptor.");
    }
  }
}

export function mergeSettingFields(shared = [], settings = []) {
  if (!Array.isArray(shared) || !Array.isArray(settings))
    throw providerError("INVALID_MANIFEST", "Settings must be field arrays.");
  const fields = new Map();
  for (const field of [...shared, ...settings]) {
    if (
      !field?.key ||
      !/^[A-Za-z_$][\w$]*$/.test(field.key) ||
      forbidden.has(field.key) ||
      !["text", "password", "number", "boolean", "select"].includes(field.type)
    ) {
      throw providerError("INVALID_MANIFEST", "Invalid setting field.");
    }
    const secret = field.type === "password" || field.isSecret === true;
    if (field.options && field.optionsSource)
      throw providerError(
        "INVALID_MANIFEST",
        "Static options and optionsSource cannot be combined."
      );
    if (
      (field.min !== undefined && !Number.isFinite(field.min)) ||
      (field.max !== undefined && !Number.isFinite(field.max)) ||
      (field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max)
    )
      throw providerError("INVALID_MANIFEST", "Invalid setting bounds.");
    if (field.type === "select") getSettingOptions(field);
    const previous = fields.get(field.key);
    if (
      previous &&
      (previous.type !== field.type || previous.isSecret !== secret)
    ) {
      throw providerError(
        "SETTING_CONFLICT",
        `Incompatible setting: ${field.key}`
      );
    }
    fields.set(field.key, { ...previous, ...copy(field), isSecret: secret });
  }
  return [...fields.values()];
}

export const isSettingVisible = (field, enabled) =>
  !field.visibleForCapabilities ||
  field.visibleForCapabilities.some((name) => enabled.includes(name));
export function validateFieldCapabilities(service, fields, permissions = {}) {
  for (const field of fields) {
    const names = field.visibleForCapabilities;
    if (names === undefined) continue;
    if (
      !Array.isArray(names) ||
      !names.length ||
      new Set(names).size !== names.length ||
      names.some(
        (name) =>
          !PROVIDER_CAPABILITIES.includes(name) ||
          !Object.prototype.hasOwnProperty.call(service.capabilities, name)
      ) ||
      field.isSecret ||
      field.key === (service.modelField || "model") ||
      permissions.endpointFields?.includes(field.key)
    )
      throw providerError(
        "INVALID_MANIFEST",
        "Invalid capability field binding: " + field.key
      );
  }
}

/** Copies a definition into an independent instance. No template lookup at invocation time. */
export function createServiceInstance(
  manifest,
  serviceId,
  implementation,
  values,
  apiSlug,
  resources = {},
  enabledCapabilities
) {
  if (
    manifest.manifestVersion !== 1 ||
    manifest.apiVersion !== "1" ||
    !apiSlug
  ) {
    throw providerError(
      "INVALID_MANIFEST",
      "Unsupported manifest/SDK or missing instance ID."
    );
  }
  assertPluginCompatibility(manifest);
  const service = manifest.services.find((item) => item.id === serviceId);
  if (
    !service ||
    !["script", "declarative"].includes(service.implementation.kind)
  ) {
    throw providerError(
      "INVALID_MANIFEST",
      "External service implementation must be script or declarative."
    );
  }
  const capabilities = copy(service.capabilities);
  validateDefaultPrompts(service);
  validateCapabilities(capabilities);
  const fields = mergeSettingFields(manifest.sharedSettings, service.settings);
  validateModels(service, fields);
  validatePermissions(manifest.permissions, fields);
  validateFieldCapabilities(service, fields, manifest.permissions);
  const provider = {
    ...pluginCompatibilityFields(manifest),
    apiVersion: "1",
    id: service.id,
    name: service.name,
    ...(service.nameI18n && { nameI18n: copy(service.nameI18n) }),
    implementation: copy(service.implementation),
    capabilities,
    settings: fields,
    ...(service.defaultPrompts && {
      defaultPrompts: copy(service.defaultPrompts),
    }),
    ...(service.modelField && { modelField: service.modelField }),
    ...(service.models && {
      models: copy(service.models),
      modelField: service.modelField || "model",
    }),
    permissions: copy(manifest.permissions || {}),
    ...(Object.keys(resources).length && { resources: copy(resources) }),
    source: {
      pluginId: manifest.id,
      pluginName: manifest.name,
      ...(manifest.nameI18n && { pluginNameI18n: copy(manifest.nameI18n) }),
      serviceId,
      version: manifest.version,
      external: true,
    },
  };
  if (service.implementation.kind === "script") {
    if (typeof implementation !== "string" || !implementation.trim())
      throw providerError("INVALID_MANIFEST", "Missing script source.");
    provider.code = implementation;
  } else provider.rules = copy(implementation);
  const candidate = {
    provider,
    pluginConfig: {
      ...Object.fromEntries(
        fields
          .filter((field) => field.defaultValue !== undefined)
          .map((field) => [field.key, field.defaultValue])
      ),
      ...values,
    },
  };
  const modelField = service.modelField || "model";
  if (
    candidate.pluginConfig[modelField] === undefined &&
    service.models?.length
  )
    candidate.pluginConfig[modelField] = service.models[0].id;
  const enabled = validateEnabledCapabilities(
    candidate,
    enabledCapabilities ?? supportedCapabilities(candidate)
  );
  // Adding selects an editable instance immediately. Required values are checked
  // when saving/executing, rather than blocking creation of its snapshot.
  const config = {
    ...candidate.pluginConfig,
    ...validateConfig(
      fields
        .filter((field) => isSettingVisible(field, enabled))
        .map((field) => ({ ...field, required: false })),
      candidate.pluginConfig
    ),
  };
  return {
    apiSlug,
    apiName: service.name,
    apiType: "Plugin",
    sourceType: "network",
    isDisabled: false,
    // The host's legacy form defaults are merged by callers. Explicitly clear
    // inherited native prompt references; users can bind prompt entities later.
    batchPromptSlug: "",
    nobatchPromptSlug: "",
    dictPromptSlug: "",
    subtitlePromptSlug: "",
    vlmPromptSlug: "",
    provider,
    pluginConfig: config,
    enabledCapabilities: enabled,
  };
}

export function projectInstanceConfig(instance) {
  const config = { ...instance.pluginConfig };
  const secrets = {};
  for (const field of instance.provider.settings || []) {
    if (field.isSecret || field.type === "password") {
      secrets[field.key] = config[field.key];
      delete config[field.key];
    }
  }
  return { config, secrets };
}

/** Create and edit use the same validation, so saving cannot bypass template constraints. */
export function validateConfig(fields, values) {
  const config = {};
  for (const field of fields) {
    const value = values?.[field.key] ?? field.defaultValue;
    if (
      field.required &&
      (value === undefined ||
        value === null ||
        (typeof value === "string" && !value.trim()))
    )
      throw providerError("INVALID_CONFIG", `Required field: ${field.key}`);
    if (value !== undefined) config[field.key] = copy(value);
    if (value !== undefined) {
      if (
        field.type === "number" &&
        (!Number.isFinite(value) ||
          (field.min !== undefined && value < field.min) ||
          (field.max !== undefined && value > field.max))
      )
        throw providerError("INVALID_CONFIG", `Invalid number: ${field.key}`);
      if (field.type === "boolean" && typeof value !== "boolean")
        throw providerError("INVALID_CONFIG", `Invalid boolean: ${field.key}`);
      if (
        ["text", "password"].includes(field.type) &&
        typeof value !== "string"
      )
        throw providerError("INVALID_CONFIG", `Invalid text: ${field.key}`);
      if (
        field.type === "select" &&
        !getSettingOptions(field).some((option) => option.value === value)
      )
        throw providerError(
          "INVALID_CONFIG",
          `Invalid selection: ${field.key}`
        );
    }
  }
  return config;
}

/** Dictionary names refer to bundled data, never to a remote schema or shared instance values. */
export function getSettingOptions(field) {
  if (field.options) {
    if (
      !Array.isArray(field.options) ||
      field.options.some(
        (option) =>
          !option || !["string", "number"].includes(typeof option.value)
      )
    )
      throw providerError("INVALID_MANIFEST", "Invalid select options.");
    return field.options;
  }
  if (field.optionsSource === "speech.voices.openai.tts-1")
    return providerHelpers.speech.voices.openai["tts-1"];
  throw providerError("INVALID_MANIFEST", "Unsupported select options source.");
}

export function validateModels(service, fields) {
  if (service.models === undefined) return;
  if (
    !Array.isArray(service.models) ||
    !service.models.length ||
    !fields.some(
      (field) =>
        field.key === (service.modelField || "model") &&
        !field.isSecret &&
        field.type === "text"
    )
  )
    throw providerError(
      "INVALID_MANIFEST",
      "Models require a non-secret model setting."
    );
  const ids = new Set();
  for (const model of service.models) {
    if (typeof model?.id !== "string" || !model.id || ids.has(model.id))
      throw providerError("INVALID_MANIFEST", "Invalid model definition.");
    if (model.capabilities !== undefined)
      throw providerError(
        "INVALID_MANIFEST",
        "Models only list IDs and names; declare capabilities on separate services."
      );
    ids.add(model.id);
  }
}

export function validateServiceConfig(
  service,
  values,
  enabled = Object.keys(service.capabilities || {})
) {
  // Hidden values survive a toggle; validation resumes when the task is enabled.
  const retained = Object.fromEntries(
    (service.settings || [])
      .filter((field) => values?.[field.key] !== undefined)
      .map((field) => [field.key, copy(values[field.key])])
  );
  const config = {
    ...retained,
    ...validateConfig(
      (service.settings || []).filter((field) =>
        isSettingVisible(field, enabled)
      ),
      values
    ),
  };
  return config;
}

export function validatePermissions(permissions = {}, fields) {
  if (
    !permissions ||
    typeof permissions !== "object" ||
    Array.isArray(permissions) ||
    (permissions.network !== undefined &&
      !Array.isArray(permissions.network)) ||
    (permissions.endpointFields !== undefined &&
      !Array.isArray(permissions.endpointFields))
  )
    throw providerError("INVALID_MANIFEST", "Invalid network permissions.");
  for (const origin of permissions.network || []) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw providerError(
        "INVALID_MANIFEST",
        "Network permissions require origins."
      );
    }
    if (
      typeof origin !== "string" ||
      url.origin !== origin ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw providerError(
        "INVALID_MANIFEST",
        "Network permissions require HTTPS or loopback origins."
      );
  }
  for (const key of permissions.endpointFields || [])
    if (
      !fields.some(
        (field) => field.key === key && field.type === "text" && !field.isSecret
      )
    )
      throw providerError(
        "INVALID_MANIFEST",
        "Endpoint permission requires a non-secret text field."
      );
}
