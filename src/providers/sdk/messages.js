import { providerError } from "../capabilities";
import { encodeBytes } from "./encoding";

/** Convert standard task-owned parts to Chat Completions wire messages. */
export async function prepareMessages(messages, readAsset) {
  const prepared = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      prepared.push({ ...message });
      continue;
    }
    const content = [];
    for (const part of message.content) {
      if (part.type === "text") {
        content.push({ ...part });
        continue;
      }
      const ref = part.asset;
      const mime = ref?.mimeType;
      const format = {
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
      }[mime];
      if (
        part.type === "image"
          ? !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
              mime
            )
          : part.type !== "audio" || !format
      )
        throw providerError(
          "INVALID_ASSET",
          "Unsupported chat asset MIME type."
        );
      const buffer = await readAsset(ref);
      if (
        Object.prototype.toString.call(buffer) !== "[object ArrayBuffer]" ||
        buffer.byteLength > 8 * 1024 * 1024
      )
        throw providerError(
          "RESOURCE_BUDGET_EXCEEDED",
          "Invalid or oversized chat asset."
        );
      const data = encodeBytes(new Uint8Array(buffer), "base64");
      content.push(
        part.type === "image"
          ? {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${data}` },
            }
          : { type: "input_audio", input_audio: { data, format } }
      );
    }
    prepared.push({ ...message, content });
  }
  return prepared;
}

// Keep non-text parts intact; omit blank text without changing roles or content.
export function compactMessages(messages) {
  return messages.flatMap((message) => {
    // Gemini context includes non-message steps such as thought signatures.
    if (message.type && message.type !== "user_input") return [message];
    const key = Object.hasOwn(message, "parts") ? "parts" : "content";
    const value = message[key];
    if (Array.isArray(value)) {
      const parts = value.filter((part) =>
        part.type === "text" || (!part.type && Object.hasOwn(part, "text"))
          ? Boolean(String(part.text ?? "").trim())
          : true
      );
      return parts.length ? [{ ...message, [key]: parts }] : [];
    }
    return typeof value === "string" && value.trim() ? [message] : [];
  });
}

export function requireConversationInput(messages, protocol) {
  if (!compactMessages(messages).length)
    throw providerError(
      "INVALID_INPUT",
      `${protocol} 不支持仅系统提示词，请在用户模板中明确提供内容`
    );
}
