import { logger } from "../../libs/log";
/** A cache lookup is optional; cancellation and identity errors remain authoritative. */
export async function readAsrCache(read, signal) {
  if (signal?.aborted)
    throw signal.reason || new DOMException("Cancelled", "AbortError");
  try {
    const result = await read(0);
    if (signal?.aborted)
      throw signal.reason || new DOMException("Cancelled", "AbortError");
    return result;
  } catch (cause) {
    if (
      signal?.aborted ||
      cause.name === "AbortError" ||
      cause.code === "STALE_VIDEO" ||
      cause.code === "AUDIO_IDENTITY_MISMATCH"
    )
      throw cause;
    logger
      .child("subtitle")
      .debug(
        "[YouTube ASR cache] read failed; using network",
        cause.code || cause.name
      );
    return null;
  }
}

export async function audioSessionId(identity, key) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key)
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `audio-${identity.videoId}-${hash}`;
}
