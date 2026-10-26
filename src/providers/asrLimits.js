import { providerError } from "./capabilities";

export const DEFAULT_ASR_MAX_DURATION_SECONDS = 20;

export function asrMaxDurationSeconds(value) {
  if (value === undefined) return DEFAULT_ASR_MAX_DURATION_SECONDS;
  if (!Number.isInteger(value) || value < 1 || value > 300)
    throw providerError(
      "INVALID_CONFIG",
      "ASR duration must be an integer between 1 and 300 seconds."
    );
  return value;
}
