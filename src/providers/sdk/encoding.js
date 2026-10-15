import { providerError } from "../capabilities";

export const encodeBytes = (bytes, encoding = "hex") => {
  if (encoding === "hex")
    return [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  if (encoding === "base64") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  throw providerError("INVALID_INPUT", "Unsupported digest encoding.");
};

export function utf8ToBase64(text) {
  return encodeBytes(new TextEncoder().encode(text), "base64");
}
export function base64ToUtf8(text) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
  );
}
export async function digest(
  text,
  encoding = "hex",
  cryptoImpl = globalThis.crypto
) {
  return encodeBytes(
    new Uint8Array(
      await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(text))
    ),
    encoding
  );
}

/** Only the Broker calls this with an actual secret; scripts receive the signature, not the key. */
export async function signHmac(
  secret,
  { data, algorithm = "hmac-sha256", encoding = "hex" },
  cryptoImpl = globalThis.crypto
) {
  if (
    algorithm !== "hmac-sha256" ||
    typeof data !== "string" ||
    new TextEncoder().encode(data).length > 1024 * 1024
  )
    throw providerError("INVALID_INPUT", "Invalid or oversized signing input.");
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return encodeBytes(
    new Uint8Array(
      await cryptoImpl.subtle.sign("HMAC", key, new TextEncoder().encode(data))
    ),
    encoding
  );
}
