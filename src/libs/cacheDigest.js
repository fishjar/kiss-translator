import { MSG_SHA256 } from "../config/msg";
import { isExt } from "./client";
import { sendBgMsg } from "./msg";
import { sha256 } from "./utils";

const simpleHash = (text) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
};

const getSimpleCacheDigest = (text, salt = "") => simpleHash(`${text}${salt}`);

/**
 * 生成缓存签名。优先使用 SHA-256；受限 content 页面没有 Web Crypto 时，
 * 先请求 background 代算，仍失败再降级为仅用于缓存 key 的简单稳定 hash。
 */
export const getCacheDigest = async (text, salt = "") => {
  if (globalThis.crypto?.subtle?.digest) {
    return sha256(text, salt);
  }

  if (isExt) {
    try {
      const digest = await sendBgMsg(MSG_SHA256, { text, salt });
      if (typeof digest === "string" && digest) {
        return digest;
      }
    } catch (err) {
      // 缓存签名不能阻断页面翻译；失败时继续走本地稳定 hash。
    }
  }

  return getSimpleCacheDigest(text, salt);
};
