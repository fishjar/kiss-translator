/**
 * @file client.js
 * @description 页面侧（内容脚本/设置页）的 aifw 远程宿主客户端。
 *
 * 通过 browser.runtime.sendMessage 走 AIFW_RPC 协议；maskMeta 以 base64 传输。
 * 宿主不可用/超时/返回失败时抛错，由调用方决定回退策略。
 */

import { browser } from "../browser";
import { isExt } from "../client";
import { logger } from "../log";
import {
  AIFW_ENSURE_TIMEOUT_MS,
  AIFW_ERROR_HOST_UNAVAILABLE,
  AIFW_ERROR_MASK_FAILED,
  AIFW_ERROR_NOT_READY,
  AIFW_METHOD_ENSURE,
  AIFW_METHOD_MASK,
  AIFW_METHOD_RESET,
  AIFW_METHOD_RESTORE,
  AIFW_METHOD_RETRY,
  AIFW_METHOD_STATUS,
  AIFW_RPC,
  AIFW_RPC_TIMEOUT_MS,
  createAifwError,
  decodeMaskMeta,
  encodeMaskMeta,
} from "./protocol";

const log = logger.child("aifw");

function toErrorMessage(err) {
  if (err instanceof Error) return err.message || String(err);
  return String(err || "unknown error");
}

/**
 * 当前环境是否支持远程宿主 RPC（扩展环境 + runtime.sendMessage）。
 * @returns {boolean}
 */
export function isRemoteHostSupported() {
  try {
    return Boolean(
      isExt && typeof browser?.runtime?.sendMessage === "function"
    );
  } catch {
    return false;
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`aifw ${label} rpc timed out`));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function sendRpc(message, timeoutMs) {
  const label = message?.method || "unknown";
  return withTimeout(
    Promise.resolve().then(() => browser.runtime.sendMessage(message)),
    timeoutMs,
    label
  );
}

/** 握手 promise 缓存；失败时清空以便重试。 */
let ensurePromise = null;

function clearEnsureCache() {
  ensurePromise = null;
}

/**
 * 确保后台宿主可用（握手成功后被缓存；失败后可重试）。
 * @returns {Promise<boolean>}
 */
export function ensureRemoteHost() {
  if (ensurePromise) return ensurePromise;
  if (!isRemoteHostSupported()) {
    return Promise.reject(new Error("aifw remote host is not supported"));
  }

  const attempt = sendRpc(
    { type: AIFW_RPC, method: AIFW_METHOD_ENSURE },
    AIFW_ENSURE_TIMEOUT_MS
  ).then((response) => {
    if (!response || response.ok !== true) {
      throw new Error(response?.error || "aifw remote host is unavailable");
    }
    return true;
  });
  ensurePromise = attempt;
  attempt.catch(() => {
    if (ensurePromise === attempt) ensurePromise = null;
  });
  return attempt;
}

async function callHost(message, timeoutMs) {
  await ensureRemoteHost();
  try {
    const response = await sendRpc(message, timeoutMs);
    if (!response || response.ok !== true) {
      throw new Error(response?.error || `aifw ${message.method} failed`);
    }
    return response;
  } catch (err) {
    // 宿主可能已退出（例如 offscreen 被关闭），下次调用重新握手。
    clearEnsureCache();
    log.debug("aifw host rpc failed:", toErrorMessage(err));
    throw err;
  }
}

/**
 * 远程脱敏。
 * 失败时抛出带 code 的错误：
 * - AIFW_NOT_READY：模型加载中（可立即重试，调用方不应设置长期冷却）；
 * - AIFW_MASK_FAILED：脱敏执行失败；
 * - AIFW_HOST_UNAVAILABLE：宿主连接/超时/不可用。
 * @param {string} text
 * @returns {Promise<{ maskedText: string, maskMeta: Uint8Array|null }>}
 */
export async function remoteMask(text) {
  let response;
  try {
    await ensureRemoteHost();
    response = await sendRpc(
      { type: AIFW_RPC, method: AIFW_METHOD_MASK, text, lang: "auto" },
      AIFW_RPC_TIMEOUT_MS
    );
  } catch (err) {
    clearEnsureCache();
    throw createAifwError(
      AIFW_ERROR_HOST_UNAVAILABLE,
      `aifw host unavailable: ${toErrorMessage(err)}`,
      err
    );
  }

  if (!response || response.ok !== true) {
    clearEnsureCache();
    if (
      response?.code === AIFW_ERROR_NOT_READY ||
      response?.code === AIFW_ERROR_MASK_FAILED
    ) {
      throw createAifwError(response.code, response.error || response.code);
    }
    throw createAifwError(
      AIFW_ERROR_HOST_UNAVAILABLE,
      response?.error || "aifw host unavailable"
    );
  }

  if (typeof response.maskedText !== "string") {
    throw createAifwError(
      AIFW_ERROR_MASK_FAILED,
      "aifw mask returned an invalid result"
    );
  }

  return {
    maskedText: response.maskedText,
    maskMeta: decodeMaskMeta(response.maskMeta),
  };
}

/**
 * 远程还原译文。
 * @param {string} text 模型返回的译文
 * @param {Uint8Array} maskMeta
 * @returns {Promise<string>}
 */
export async function remoteRestore(text, maskMeta) {
  const response = await callHost(
    {
      type: AIFW_RPC,
      method: AIFW_METHOD_RESTORE,
      text,
      maskMeta: encodeMaskMeta(maskMeta),
    },
    AIFW_RPC_TIMEOUT_MS
  );
  if (typeof response.text !== "string") {
    throw new Error("aifw remote restore returned invalid text");
  }
  return response.text;
}

/**
 * 远程清空模型缓存并（按需）重新下载。
 * @param {object} [options]
 * @param {boolean} [options.redownload=true]
 * @returns {Promise<{ cleared: number }>}
 */
export async function remoteReset({ redownload = true } = {}) {
  const response = await callHost(
    { type: AIFW_RPC, method: AIFW_METHOD_RESET, redownload },
    AIFW_RPC_TIMEOUT_MS
  );
  return { cleared: Number(response.cleared) || 0 };
}

/**
 * 远程重试模型初始化（中止卡住的下载并从缓存续传）。
 * @param {object} [options]
 * @param {boolean} [options.redownload=true]
 * @returns {Promise<object>} 宿主响应（ok:true）
 */
export async function remoteRetry({ redownload = true } = {}) {
  try {
    return await callHost(
      { type: AIFW_RPC, method: AIFW_METHOD_RETRY, redownload },
      AIFW_RPC_TIMEOUT_MS
    );
  } catch (err) {
    if (err?.code) throw err;
    throw createAifwError(
      AIFW_ERROR_HOST_UNAVAILABLE,
      `aifw host unavailable: ${toErrorMessage(err)}`,
      err
    );
  }
}

/**
 * 远程查询引擎状态。
 * @returns {Promise<null | { state: string, error?: string }>}
 */
export async function remoteStatus() {
  const response = await callHost(
    { type: AIFW_RPC, method: AIFW_METHOD_STATUS },
    AIFW_ENSURE_TIMEOUT_MS
  );
  return response.status || null;
}
