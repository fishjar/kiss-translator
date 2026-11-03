import { supportsSdkVersion } from "./sdk/version";

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
  return instance?.provider?.capabilities?.[capability];
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
      "Enabled capabilities must be supported by the selected service."
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
    !supportsSdkVersion(instance.provider.apiVersion) ||
    (capability === "speak" &&
      (instance.provider.implementation?.kind !== "native" ||
        instance.provider.source?.external))
  )
    return false;
  if (requirements.stream && !descriptor.outputModes?.includes("stream"))
    return false;
  if (requirements.coordinates && descriptor.coordinates !== true) return false;
  if (
    requirements.taskMode &&
    !(descriptor.taskModes || ["doc"]).includes(requirements.taskMode)
  )
    return false;
  if (requirements.timestamps && descriptor.timestamps !== true) return false;
  return true;
}
