/**
 * @file index.js
 * @description 本地隐私脱敏客户端（OneAIFW aifw-js 适配层）。
 *
 * 在把待翻译文本发给翻译接口之前，用本地 NER 模型识别邮箱、电话、人名等
 * 敏感信息并替换为占位符；译文返回后按 maskMeta 还原为原文，从而在不改变
 * 译文含义的前提下避免把 PII 发送给远端翻译服务。
 *
 * 运行位置：
 * - 扩展环境只走后台宿主（Chrome offscreen / Firefox 背景页）的消息 RPC，
 *   模型全局只下载/缓存一份。
 * - Web 环境保留页面内引擎（页面 origin 只有 kiss-translator 站点，属正常模式）。
 * - 油猴/其它无扩展后台且非 Web 的环境不脱敏（返回 null）。
 *
 * 安全优先：扩展/Web 环境启用隐私脱敏后，若脱敏服务不可用或模型未就绪，
 * createRedaction 会 **抛出带 code 的错误阻止本次翻译**（绝不原文直发），
 * 并通过页面 Banner + console.warn 提示用户；用户可在设置中关闭开关恢复翻译。
 *
 * 对外接口（其他模块按此对接，签名不要改动）：
 * - createRedaction({ text, fromLang, toLang, apiSetting, signal })
 *   -> Promise<null | { maskedText: string, restore(translatedText): Promise<string> }>
 *   失败时会 reject（错误带 code）。
 * - getRedactionStatus()
 *   -> { enabled: boolean, state: "unavailable"|"idle"|"loading"|"ready"|"error", error?: string }
 * - setRedactionNotifier(fn) 注册页面提示回调（common.js 传入 showErr）
 * - requestModelReset() -> Promise<{ tabs, delivered }>（设置页“重新下载”）
 * - requestModelRetry() -> Promise<{ tabs, delivered }>（设置页“重试”卡住的模型下载）
 * - resetAifwModel({ redownload }) -> Promise<{ cleared?: number }>（内部/兼容用）
 * - 另从 status.js 透出 readModelStatus / subscribeModelStatus 供设置页使用。
 */

import {
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_LOCALAI,
} from "../../config/apiConstants";
import { isWeb } from "../client";
import { logger } from "../log";
import { getSettingWithDefault } from "../storage";
import {
  isRemoteHostSupported,
  remoteMask,
  remoteReset,
  remoteRestore,
  remoteRetry,
} from "./client";
import { AIFW_SETTING_CACHE_TTL_MS } from "./constants";
import {
  ensureEngine,
  getEngineStatus,
  maskOnEngine,
  resetEngine,
  restoreOnEngine,
} from "./engine";
import {
  AIFW_ERROR_HOST_UNAVAILABLE,
  AIFW_ERROR_MASK_FAILED,
  AIFW_ERROR_NOT_READY,
  createAifwError,
} from "./protocol";

const log = logger.child("aifw");

/** 文本不会离开本机的翻译引擎，无需脱敏。 */
const LOCAL_API_TYPES = [OPT_TRANS_LOCALAI, OPT_TRANS_BUILTINAI];

/** 远程宿主失败后，多久内不再尝试（避免每个段落都等一次超时）。 */
const REMOTE_RETRY_COOLDOWN_MS = 60000;

/** 模型尚未就绪时的提示文案（阻断本次翻译，不设置冷却）。 */
const NOT_READY_MESSAGE = "隐私脱敏模型尚未就绪，已暂停本次翻译，请稍候重试。";

/** 脱敏服务不可用时的提示文案（阻断本次翻译，提示可关闭开关）。 */
const UNAVAILABLE_MESSAGE =
  "隐私脱敏服务不可用，已阻止本次翻译；如不需要脱敏，可在设置中关闭「本地隐私脱敏」。";

/**
 * 阻断错误的 message。
 * 该 message 会被翻译 UI 直接当作“译文内容”渲染，必须保持短文案；
 * 完整说明通过 notifier Banner 展示。
 */
const NOT_READY_ERROR_MESSAGE = "隐私脱敏模型尚未就绪，已暂停翻译";
const UNAVAILABLE_ERROR_MESSAGE = "隐私脱敏不可用，已阻止翻译";

/** 最近一次读取到的隐私脱敏开关（getRedactionStatus 是同步接口，需缓存）。 */
let enabled = false;

/** privacyMask 开关的进程内短缓存，避免整页翻译时每个段落都读一次 storage。 */
let settingCache = null;
let settingCachedAt = 0;

/** 进行中的开关读取 promise，用于合并同一时刻的并发读取。 */
let settingReadPromise = null;

/** 远程宿主失败后的冷却截止时间戳。 */
let remoteUnavailableUntil = 0;

/** 页面提示回调与各错误码最近一次提示时间（60s 节流，避免刷屏）。 */
let redactionNotifier = null;
const lastNotifiedAtByCode = new Map();

/**
 * 注册“脱敏不可用”的页面提示回调（common.js 传入顶部红色 Banner）。
 * 传非函数值可清除。未注册时仅保留 console 日志。
 * @param {null | ((message: string) => void)} fn
 */
export function setRedactionNotifier(fn) {
  redactionNotifier = typeof fn === "function" ? fn : null;
}

function isLocalApi(apiSetting) {
  return LOCAL_API_TYPES.includes(apiSetting?.apiType);
}

function toErrorMessage(err) {
  if (err instanceof Error) return err.message || String(err);
  return String(err || "unknown error");
}

/**
 * 页面提示（Banner），同一错误码 60s 内最多一次。
 * @param {string} code
 */
function notifyBlocked(code) {
  if (!redactionNotifier) return;
  const now = Date.now();
  if (now - (lastNotifiedAtByCode.get(code) || 0) < REMOTE_RETRY_COOLDOWN_MS)
    return;
  lastNotifiedAtByCode.set(code, now);

  const message =
    code === AIFW_ERROR_NOT_READY ? NOT_READY_MESSAGE : UNAVAILABLE_MESSAGE;
  try {
    redactionNotifier(message);
  } catch (err) {
    log.debug("aifw notifier failed:", toErrorMessage(err));
  }
}

/**
 * 远程脱敏失败时阻断翻译（安全优先：不原文直发）。
 * - AIFW_NOT_READY：不设置冷却（模型就绪后可立即恢复），提示“尚未就绪”；
 * - 其它错误：设置 60s 冷却，提示“服务不可用，可在设置关闭开关”。
 * @param {unknown} err 远程失败原因
 * @throws {Error & { code: string }}
 */
function blockRemoteTranslation(err) {
  const code = err?.code;
  if (code === AIFW_ERROR_NOT_READY) {
    log.warn(
      "aifw engine not ready; pausing translation:",
      toErrorMessage(err)
    );
    notifyBlocked(AIFW_ERROR_NOT_READY);
    throw createAifwError(AIFW_ERROR_NOT_READY, NOT_READY_ERROR_MESSAGE, err);
  }

  remoteUnavailableUntil = Date.now() + REMOTE_RETRY_COOLDOWN_MS;
  log.warn("aifw host unavailable; blocking translation:", toErrorMessage(err));
  notifyBlocked(AIFW_ERROR_HOST_UNAVAILABLE);
  throw createAifwError(
    AIFW_ERROR_HOST_UNAVAILABLE,
    UNAVAILABLE_ERROR_MESSAGE,
    err
  );
}

/**
 * 读取 privacyMask 开关（带 TTL 缓存）。
 * 连续段落翻译最多每 AIFW_SETTING_CACHE_TTL_MS 读一次 storage；
 * 同一时刻的并发读取共用同一个 promise。
 * @returns {Promise<object>} 归一化后的设置对象。
 */
function readSettingWithCache() {
  if (
    settingCache !== null &&
    Date.now() - settingCachedAt < AIFW_SETTING_CACHE_TTL_MS
  ) {
    return Promise.resolve(settingCache);
  }

  if (!settingReadPromise) {
    settingReadPromise = getSettingWithDefault()
      .then((setting) => {
        settingCache = setting;
        settingCachedAt = Date.now();
        return setting;
      })
      .finally(() => {
        settingReadPromise = null;
      });
  }

  return settingReadPromise;
}

/**
 * 扩展环境：远程宿主脱敏；失败抛错阻断翻译。
 * @param {string} text
 * @returns {Promise<null | { maskedText: string, restore: Function }>}
 */
async function createRemoteRedaction(text) {
  let masked;
  try {
    masked = await remoteMask(text);
  } catch (err) {
    blockRemoteTranslation(err);
  }

  if (masked.maskedText === text) return null;
  if (!masked.maskMeta) {
    blockRemoteTranslation(
      createAifwError(AIFW_ERROR_MASK_FAILED, "aifw mask meta missing")
    );
  }

  return {
    maskedText: masked.maskedText,
    restore: async (translatedText) => {
      if (typeof translatedText !== "string") return translatedText;
      try {
        return await remoteRestore(translatedText, masked.maskMeta);
      } catch (err) {
        log.warn(
          "remote restoreText failed; falling back to translated text:",
          toErrorMessage(err)
        );
        return translatedText;
      }
    },
  };
}

/**
 * Web 环境：页面内引擎脱敏；失败抛错阻断翻译（同样安全优先）。
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @returns {Promise<null | { maskedText: string, restore: Function }>}
 */
async function createPageRedaction(text, signal) {
  const ready = await ensureEngine({ signal });
  if (!ready) {
    if (signal?.aborted) return null;
    log.warn("aifw page engine not ready; blocking translation");
    notifyBlocked(AIFW_ERROR_HOST_UNAVAILABLE);
    throw createAifwError(
      AIFW_ERROR_HOST_UNAVAILABLE,
      UNAVAILABLE_ERROR_MESSAGE
    );
  }
  if (signal?.aborted) return null;

  const masked = await maskOnEngine(text, "auto");
  if (!masked || typeof masked.maskedText !== "string") {
    log.warn("aifw page engine mask failed; blocking translation");
    notifyBlocked(AIFW_ERROR_HOST_UNAVAILABLE);
    throw createAifwError(AIFW_ERROR_MASK_FAILED, UNAVAILABLE_ERROR_MESSAGE);
  }
  // 文本中没有任何 PII 被替换时不返回 redaction：调用方据此保留流式增量等行为。
  if (masked.maskedText === text) return null;

  return {
    maskedText: masked.maskedText,
    restore: (translatedText) =>
      restoreOnEngine(translatedText, masked.maskMeta),
  };
}

/**
 * 为一次翻译请求创建脱敏包装。
 *
 * @param {object} [params]
 * @param {string} params.text 待脱敏的源文本。
 * @param {string} [params.fromLang] 源语言（保留参数，当前 maskText 使用自动检测）。
 * @param {string} [params.toLang] 目标语言（保留参数）。
 * @param {object} [params.apiSetting] 当前翻译服务实例，用于识别本地 AI 引擎。
 * @param {AbortSignal} [params.signal] 调用方取消信号。
 * @returns {Promise<null | { maskedText: string, restore: (translatedText: string) => Promise<string> }>}
 *   null 表示本次无需脱敏（未启用 / 不适用 / 文本中没有可替换的 PII）。
 * @throws {Error & { code: string }} 扩展/Web 环境脱敏不可用时抛出，调用方应让本次翻译失败。
 */
export async function createRedaction({ text, apiSetting, signal } = {}) {
  if (typeof text !== "string" || !text.trim()) return null;
  if (isLocalApi(apiSetting)) return null;
  if (signal?.aborted) return null;

  try {
    const setting = await readSettingWithCache();
    // privacyMask 由设置页任务添加；字段缺失时按关闭处理。
    enabled = setting?.privacyMask === true;
  } catch (err) {
    // 读取失败按关闭处理；降为 debug，避免整页翻译时按段落刷 warn。
    log.debug("failed to read privacyMask setting:", toErrorMessage(err));
    return null;
  }
  if (!enabled) return null;
  if (signal?.aborted) return null;

  if (isRemoteHostSupported()) {
    if (Date.now() < remoteUnavailableUntil) {
      // 冷却期内直接阻断，不重复提示/日志、不再请求宿主。
      throw createAifwError(
        AIFW_ERROR_HOST_UNAVAILABLE,
        UNAVAILABLE_ERROR_MESSAGE
      );
    }
    return createRemoteRedaction(text);
  }

  // 只有 Web 环境保留页面内引擎；油猴/其它环境功能不可用，不阻断翻译。
  if (isWeb) return createPageRedaction(text, signal);
  return null;
}

/**
 * 查询隐私脱敏能力状态（同步）。
 * 设置页只用它判断“当前环境是否支持脱敏”（unavailable）。
 * @returns {{ enabled: boolean, state: "unavailable"|"idle"|"loading"|"ready"|"error", error?: string }}
 */
export function getRedactionStatus() {
  if (isRemoteHostSupported()) {
    // 远程宿主可用性需异步探测；能力可用即返回 idle（设置页只判断 unavailable）。
    return { enabled, state: "idle" };
  }

  const status = getEngineStatus();
  if (status.state === "error" && status.error) {
    return { enabled, state: "error", error: status.error };
  }
  return { enabled, state: status.state };
}

/**
 * 清空模型缓存并重新下载（设置页“重新下载”入口）。
 * 扩展环境走后台宿主 RPC。
 * @returns {Promise<{ tabs: number, delivered: number }>}
 *   delivered=1 表示宿主已受理；0 表示宿主不可用（缓存未清空）。
 */
export async function requestModelReset() {
  if (!isRemoteHostSupported()) return { tabs: 0, delivered: 0 };

  let redownload = true;
  try {
    const setting = await getSettingWithDefault();
    redownload = setting?.privacyMask === true;
  } catch (err) {
    log.debug("failed to read privacyMask setting:", toErrorMessage(err));
  }

  try {
    await remoteReset({ redownload });
    return { tabs: 1, delivered: 1 };
  } catch (err) {
    log.debug("remote aifw reset failed:", toErrorMessage(err));
    return { tabs: 0, delivered: 0 };
  }
}

/**
 * 重试模型初始化（设置页“重试”卡住的下载）。
 * 扩展环境走后台宿主 RPC（中止在途 init、保留缓存续传、重新开始）；
 * 非扩展环境返回 { tabs:0, delivered:0 }。
 * @returns {Promise<{ tabs: number, delivered: number }>}
 *   delivered=1 表示宿主已受理；0 表示宿主不可用（重试未执行）。
 */
export async function requestModelRetry() {
  if (!isRemoteHostSupported()) return { tabs: 0, delivered: 0 };

  let redownload = true;
  try {
    // 与 requestModelReset 一致：开关关闭时只重置状态，不主动重新下载。
    const setting = await getSettingWithDefault();
    redownload = setting?.privacyMask === true;
  } catch (err) {
    log.debug("failed to read privacyMask setting:", toErrorMessage(err));
  }

  try {
    await remoteRetry({ redownload });
    return { tabs: 1, delivered: 1 };
  } catch (err) {
    log.debug("remote aifw retry failed:", toErrorMessage(err));
    return { tabs: 0, delivered: 0 };
  }
}

/**
 * 重置模型：扩展环境只走远程宿主（失败返回 { cleared: 0 }，不回退本地），
 * Web 环境使用页面内引擎。
 * @param {object} [options]
 * @param {boolean} [options.redownload=true]
 * @returns {Promise<{ cleared?: number }>}
 */
export async function resetAifwModel({ redownload = true } = {}) {
  if (isRemoteHostSupported()) {
    try {
      return await remoteReset({ redownload });
    } catch (err) {
      log.warn("remote aifw reset failed:", toErrorMessage(err));
      return { cleared: 0 };
    }
  }
  if (!isWeb) return { cleared: 0 };
  return resetEngine({ redownload });
}

export { readModelStatus, subscribeModelStatus } from "./status";
