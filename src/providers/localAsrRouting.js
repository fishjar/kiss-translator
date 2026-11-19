import { supportsSdkVersion } from "./sdk/version";
import { OPT_TRANS_LOCALAI } from "../config/apiConstants";

/** Only the compiled local transcription adapter may use this privileged route.
 * @returns {boolean}
 */
export function isHostedLocalAsr(instance, capability) {
  const provider = instance?.provider;
  return (
    capability === "transcribe" &&
    instance?.apiType === OPT_TRANS_LOCALAI &&
    (!provider ||
      (supportsSdkVersion(provider.apiVersion) &&
        !provider.source?.external &&
        provider.implementation?.kind === "native" &&
        provider.implementation.entry === OPT_TRANS_LOCALAI))
  );
}
