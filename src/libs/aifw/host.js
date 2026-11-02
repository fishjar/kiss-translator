/**
 * @file host.js
 * @description aifw 后台宿主的消息处理层（运行在 Chrome offscreen / Firefox 背景页）。
 *
 * 消息链路：
 *   内容脚本/设置页 --AIFW_RPC--> 扩展后台（background.js 路由）
 *   扩展后台 --AIFW_HOST_RPC--> 本模块（offscreen 文档）
 * 也允许后台页（Firefox/Thunderbird）直接调用 handleHostRequest 处理 AIFW_RPC。
 */

import { browser } from "../browser";
import { logger } from "../log";
import {
  configureEngine,
  ensureEngine,
  getEngineStatus,
  maskOnEngine,
  resetEngine,
  restoreOnEngine,
  retryEngine,
  warmupEngine,
} from "./engine";
import {
  AIFW_ERROR_MASK_FAILED,
  AIFW_ERROR_NOT_READY,
  AIFW_HOST_RPC,
  AIFW_METHOD_ENSURE,
  AIFW_METHOD_MASK,
  AIFW_METHOD_RESET,
  AIFW_METHOD_RESTORE,
  AIFW_METHOD_RETRY,
  AIFW_METHOD_STATUS,
  decodeMaskMeta,
  encodeMaskMeta,
} from "./protocol";

const log = logger.child("aifw");

let hostConfigured = false;

function configureHost() {
  if (hostConfigured) return;
  configureEngine({ context: "host" });
  hostConfigured = true;
}

function toErrorMessage(err) {
  if (err instanceof Error) return err.message || String(err);
  return String(err || "unknown error");
}

/**
 * 处理一条宿主 RPC 请求（协议见 protocol.js）。
 * 永不抛错：失败统一返回 { ok: false, error }。
 * @param {object} message
 * @returns {Promise<{ ok: boolean, [key: string]: any }>}
 */
export async function handleHostRequest(message) {
  if (!message || typeof message !== "object") {
    return { ok: false, error: "invalid aifw request" };
  }
  configureHost();
  const method = message.method;

  try {
    if (method === AIFW_METHOD_ENSURE) {
      // 握手时顺带预热，让首次翻译不用等太久。
      warmupEngine();
      return { ok: true, status: getEngineStatus() };
    }

    if (method === AIFW_METHOD_STATUS) {
      return { ok: true, status: getEngineStatus() };
    }

    if (method === AIFW_METHOD_MASK) {
      const text = typeof message.text === "string" ? message.text : "";
      if (!text.trim()) {
        // 空文本无需脱敏：按“成功且无替换”返回。
        return { ok: true, maskedText: text, maskMeta: null };
      }

      const ready = await ensureEngine({});
      if (!ready) {
        return {
          ok: false,
          code: AIFW_ERROR_NOT_READY,
          error: "engine not ready",
        };
      }

      const masked = await maskOnEngine(text, message.lang || "auto");
      if (!masked || typeof masked.maskedText !== "string") {
        return {
          ok: false,
          code: AIFW_ERROR_MASK_FAILED,
          error: "mask failed",
        };
      }
      return {
        ok: true,
        maskedText: masked.maskedText,
        maskMeta: encodeMaskMeta(masked.maskMeta),
      };
    }

    if (method === AIFW_METHOD_RETRY) {
      // 重试：中止卡住的 init，保留缓存续传；由调用方按 privacyMask 决定是否立即重新下载。
      await retryEngine({ redownload: message.redownload === true });
      return { ok: true };
    }

    if (method === AIFW_METHOD_RESTORE) {
      const text = typeof message.text === "string" ? message.text : "";
      const maskMeta = decodeMaskMeta(message.maskMeta);
      if (!maskMeta) return { ok: false, error: "invalid aifw maskMeta" };
      return { ok: true, text: await restoreOnEngine(text, maskMeta) };
    }

    if (method === AIFW_METHOD_RESET) {
      const { cleared } = await resetEngine({
        redownload: message.redownload !== false,
      });
      return { ok: true, cleared };
    }

    return { ok: false, error: `unknown aifw method: ${String(method)}` };
  } catch (err) {
    if (method === AIFW_METHOD_MASK) {
      // 真实失败原因必须能在控制台看到（此前 debug 在默认日志级别下不可见）。
      log.warn(
        "aifw host mask failed:",
        { method, code: AIFW_ERROR_MASK_FAILED },
        toErrorMessage(err)
      );
    } else {
      log.debug("aifw host request failed:", toErrorMessage(err));
    }
    return {
      ok: false,
      ...(method === AIFW_METHOD_MASK ? { code: AIFW_ERROR_MASK_FAILED } : {}),
      error: toErrorMessage(err),
    };
  }
}

let listenerInstalled = false;
let messageListener = null;

/**
 * 注册宿主 RPC 监听（仅处理 AIFW_HOST_RPC，幂等）。
 * @returns {boolean} 是否已安装/可用
 */
export function installAifwHostListener() {
  let onMessage = null;
  try {
    onMessage = browser?.runtime?.onMessage || null;
  } catch {
    onMessage = null;
  }
  if (!onMessage?.addListener) return false;
  if (listenerInstalled) return true;

  messageListener = (message) => {
    if (!message || message.type !== AIFW_HOST_RPC) return undefined;
    return handleHostRequest(message).then(
      (response) => response,
      (err) => ({ ok: false, error: toErrorMessage(err) })
    );
  };

  try {
    onMessage.addListener(messageListener);
  } catch (err) {
    messageListener = null;
    log.debug("install aifw host listener failed:", toErrorMessage(err));
    return false;
  }
  listenerInstalled = true;
  return true;
}
