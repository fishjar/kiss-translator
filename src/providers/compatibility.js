import { providerError } from "./capabilities";
import { supportsSdkVersion } from "./sdk/version";

export function assertPluginCompatibility(definition) {
  if (
    Object.hasOwn(definition, "manifestVersion") ||
    Object.hasOwn(definition, "rulesVersion")
  )
    throw providerError(
      "INVALID_MANIFEST",
      "Legacy version fields are not supported."
    );
  if (!supportsSdkVersion(definition.apiVersion))
    throw providerError(
      "SDK_VERSION_UNSUPPORTED",
      `Unsupported plugin API ${definition.apiVersion}. Update the host to a version supporting this API.`
    );
  if (
    definition.capabilities?.speak &&
    definition.implementation?.kind !== "native"
  )
    throw providerError("INVALID_MANIFEST", "System speech is native-only.");
  if (definition.kind !== undefined && definition.kind !== "provider")
    throw providerError(
      "UNSUPPORTED_PLUGIN_KIND",
      `Unsupported plugin kind: ${String(definition.kind)}`
    );
}

export function pluginCompatibilityError(definition) {
  try {
    assertPluginCompatibility(definition);
    return null;
  } catch (error) {
    return error;
  }
}

export function pluginCompatibilityFields(definition) {
  return {
    ...(definition.apiVersion !== undefined && {
      apiVersion: definition.apiVersion,
    }),
    ...(definition.kind !== undefined && { kind: definition.kind }),
  };
}
