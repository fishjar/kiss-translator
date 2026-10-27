import packageInfo from "../../package.json";
import { providerError } from "./capabilities";
import { supportsSdkVersion } from "./sdk/version";

const versionParts = (value) => {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value))
    throw providerError(
      "INVALID_MANIFEST",
      "minHostVersion must be a three-part version."
    );
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger))
    throw providerError(
      "INVALID_MANIFEST",
      "Version components exceed safe integers."
    );
  return parts;
};

// Read defaults without normalizing the manifest: fingerprints of old packages stay stable.
export function validatePluginCompatibilityFields(definition) {
  if (
    definition.apiVersion !== undefined &&
    !supportsSdkVersion(definition.apiVersion)
  )
    throw providerError(
      "SDK_VERSION_UNSUPPORTED",
      `Unsupported plugin SDK ${definition.apiVersion}. Update the host to a version supporting this SDK.`
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
  if (definition.minHostVersion !== undefined)
    versionParts(definition.minHostVersion);
}

export function assertPluginCompatibility(
  definition,
  currentVersion = packageInfo.version
) {
  validatePluginCompatibilityFields(definition);
  if (definition.minHostVersion === undefined) return;
  const required = versionParts(definition.minHostVersion);
  const current = versionParts(currentVersion);
  const diff =
    current
      .map((part, index) => part - required[index])
      .find((part) => part !== 0) || 0;
  if (diff < 0)
    throw providerError(
      "HOST_VERSION_UNSUPPORTED",
      `Requires KISS Translator ${definition.minHostVersion}; current version is ${currentVersion}.`
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
    ...(definition.minHostVersion !== undefined && {
      minHostVersion: definition.minHostVersion,
    }),
  };
}
