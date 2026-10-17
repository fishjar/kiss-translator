import { asrMaxDurationSeconds } from "../../providers/asrLimits";
import { supportedApiFeature } from "../../config/serviceSelection";
import { OPT_TRANS_LOCALAI } from "../../config/apiConstants";
import { resolveBuiltinCapabilities } from "../../builtin-plugins/capabilities";

export function isLocalAsrService(service) {
  return (
    service.apiType === OPT_TRANS_LOCALAI &&
    (!service.provider?.implementation ||
      service.provider.implementation.kind === "native")
  );
}

export function declaredAsrTimestampSupport(service) {
  return isLocalAsrService(service)
    ? resolveBuiltinCapabilities(service).transcribe?.timestamps
    : supportedApiFeature(service, "transcribe")?.timestamps;
}

export function asrSupportsTimestamps(service) {
  if (!isLocalAsrService(service)) {
    if (service.asrTimestampSupport === "supported") return true;
    if (service.asrTimestampSupport === "unsupported") return false;
  }
  return declaredAsrTimestampSupport(service) === true;
}

export function asrChunkDurationSeconds(service, downgraded = false) {
  const duration = asrMaxDurationSeconds(service.asrMaxDurationSeconds);
  return !downgraded && asrSupportsTimestamps(service)
    ? duration
    : Math.min(5, duration);
}

export function asrSegmentCues(segments, timingSource = "asr") {
  return segments
    .filter((segment) => segment.text.trim())
    .map((segment) => ({
      start: segment.start * 1000,
      end: segment.end * 1000,
      text: segment.text,
      translation: "",
      timingSource,
    }));
}
