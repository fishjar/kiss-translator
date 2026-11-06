/**
 * @file protocol.js
 * @description aifw 后台宿主 RPC 协议：消息类型、方法名与 maskMeta 的 base64 序列化。
 *
 * 消息通道全部是 browser.runtime.sendMessage（JSON 序列化），Uint8Array 无法直接传输，
 * 因此 maskMeta 统一用 base64 字符串承载。
 */

/** 内容脚本 / 设置页 -> 扩展后台（background.js 路由）。 */
export const AIFW_RPC = "AIFW_RPC";

/** 扩展后台 -> offscreen 文档（Chrome）。 */
export const AIFW_HOST_RPC = "AIFW_HOST_RPC";

export const AIFW_METHOD_ENSURE = "ensure";
export const AIFW_METHOD_MASK = "mask";
export const AIFW_METHOD_RESTORE = "restore";
export const AIFW_METHOD_RESET = "reset";
export const AIFW_METHOD_RETRY = "retry";
export const AIFW_METHOD_STATUS = "status";

/** 页面侧 mask/restore RPC 的超时时间（毫秒）。 */
export const AIFW_RPC_TIMEOUT_MS = 20000;

/** 页面侧 ensure 握手超时时间（毫秒）。 */
export const AIFW_ENSURE_TIMEOUT_MS = 8000;

/** 宿主 RPC 失败码：引擎尚未就绪（模型加载中，可稍后重试）。 */
export const AIFW_ERROR_NOT_READY = "AIFW_NOT_READY";

/** 宿主 RPC 失败码：脱敏执行失败。 */
export const AIFW_ERROR_MASK_FAILED = "AIFW_MASK_FAILED";

/** 页面侧失败码：宿主连接/超时/不可用。 */
export const AIFW_ERROR_HOST_UNAVAILABLE = "AIFW_HOST_UNAVAILABLE";

/**
 * 构造带 code 的 aifw 错误（message 面向用户可读）。
 * @param {string} code
 * @param {string} [message]
 * @param {unknown} [cause]
 * @returns {Error & { code: string, cause?: unknown }}
 */
export function createAifwError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

/** Uint8Array -> base64 字符串（空值返回 null）。 */
export function encodeMaskMeta(maskMeta) {
  if (!maskMeta) return null;
  const bytes =
    maskMeta instanceof Uint8Array ? maskMeta : new Uint8Array(maskMeta);
  if (bytes.length === 0) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

/** base64 字符串 -> Uint8Array（空值/非法值返回 null）。 */
export function decodeMaskMeta(base64) {
  if (typeof base64 !== "string" || base64.length === 0) return null;
  try {
    const binary =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
