export const PROVIDER_CAPABILITIES = Object.freeze([
  "translate",
  "chat",
  "summarize",
  "detectLanguage",
  "dictionary",
  "suggest",
  "segmentSubtitle",
  "transcribe",
  "recognizeText",
  "parseImage",
  "analyzeLayout",
  "evaluate",
  "synthesizeSpeech",
  "speak",
]);

export const providerError = (code, message) =>
  Object.assign(new Error(message), { code });

export function getSupportedCapabilityDescriptor(instance, capability) {
  if (!PROVIDER_CAPABILITIES.includes(capability)) return undefined;
  const base = instance?.provider?.capabilities?.[capability];
  if (!base || !instance.provider.models) return base;
  const field = instance.provider.modelField || "model";
  const selected = instance.pluginConfig?.[field] ?? instance[field];
  const model = instance.provider.models.find((entry) => entry.id === selected);
  // The catalogue suggests IDs; unknown IDs and unrestricted entries use the service contract.
  if (!model?.capabilities) return base;
  const restriction = model?.capabilities?.[capability];
  if (!restriction) return undefined;
  // Model metadata can restrict the service contract, never grant a new handler or feature.
  const modes = (base.outputModes || ["complete"]).filter(
    (mode) => !restriction.outputModes || restriction.outputModes.includes(mode)
  );
  const modalities = (base.inputModalities || ["text"]).filter(
    (mode) =>
      !restriction.inputModalities || restriction.inputModalities.includes(mode)
  );
  const limits = [base.batch?.maxItems, restriction.batch?.maxItems].filter(
    (value) => value !== undefined
  );
  return {
    ...base,
    outputModes: modes,
    inputModalities: modalities,
    batch: {
      supported: Boolean(
        base.batch?.supported && restriction.batch?.supported !== false
      ),
      ...(limits.length && { maxItems: Math.min(...limits) }),
    },
    coordinates: Boolean(base.coordinates && restriction.coordinates !== false),
    ...((base.taskModes || restriction.taskModes) && { taskModes: (base.taskModes || ["doc"]).filter((mode) =>
      !restriction.taskModes || restriction.taskModes.includes(mode)) }),
    timestamps: Boolean(base.timestamps && restriction.timestamps !== false),
  };
}


export function usesStreaming(instance, capability) {
  return (
    instance.useStream !== false &&
    Boolean(
      getCapabilityDescriptor(instance, capability)?.outputModes?.includes(
        "stream"
      )
    )
  );
}

export function supportedCapabilities(instance) {
  return PROVIDER_CAPABILITIES.filter((name) => {
    const descriptor = getSupportedCapabilityDescriptor(instance, name);
    return descriptor && descriptor.outputModes?.length !== 0;
  });
}

/** An omitted selection uses the definition default; an explicit empty array disables every capability. */
export function getCapabilityDescriptor(instance, capability) {
  if (
    instance?.enabledCapabilities !== undefined &&
    (!Array.isArray(instance.enabledCapabilities) ||
      !instance.enabledCapabilities.includes(capability))
  )
    return undefined;
  return getSupportedCapabilityDescriptor(instance, capability);
}

export function validateEnabledCapabilities(instance, enabled) {
  const supported = supportedCapabilities(instance);
  if (
    !Array.isArray(enabled) ||
    new Set(enabled).size !== enabled.length ||
    enabled.some((name) => !supported.includes(name))
  )
    throw providerError(
      "INVALID_CONFIG",
      "Enabled capabilities must be supported by the selected service and model."
    );
  return [...enabled];
}

export function reconcileEnabledCapabilities(previous, supported) {
  const kept = (previous || supported).filter((name) =>
    supported.includes(name)
  );
  return kept.length ? kept : [...supported];
}

export function supportsProviderCapability(
  instance,
  capability,
  requirements = {}
) {
  const descriptor = getCapabilityDescriptor(instance, capability);
  if (
    !descriptor ||
    descriptor.outputModes?.length === 0 ||
    instance.isDisabled ||
    instance.provider.apiVersion !== "1"
  )
    return false;
  if (requirements.stream && !descriptor.outputModes?.includes("stream"))
    return false;
  if (requirements.coordinates && descriptor.coordinates !== true) return false;
  if (requirements.taskMode &&
      !(descriptor.taskModes || ["doc"]).includes(requirements.taskMode)) return false;
  if (requirements.timestamps && descriptor.timestamps !== true) return false;
  return true;
}
