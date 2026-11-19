// Plugin API contract version, independent of release versions.
export const SDK_VERSION = 2;
export const SUPPORTED_SDK_VERSIONS = Object.freeze(
  /** @type {const} */ ([1, SDK_VERSION])
);
export const supportsSdkVersion = (version) =>
  Number.isSafeInteger(version) &&
  version > 0 &&
  SUPPORTED_SDK_VERSIONS.includes(version);
