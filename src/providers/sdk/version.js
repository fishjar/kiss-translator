// SDK contract version, independent of the extension's release version.
export const SDK_VERSION = "2";
export const SUPPORTED_SDK_VERSIONS = Object.freeze(["1", SDK_VERSION]);
export const supportsSdkVersion = (version) =>
  SUPPORTED_SDK_VERSIONS.includes(version);
