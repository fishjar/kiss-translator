/**
 * @file status.js
 * @description aifw 模型状态持久化、缓存清理与“重新下载”广播的底层能力。
 *
 * 状态写入扩展的 storage.local（aifw 宿主与 options 页共享同一份）：
 * - 宿主（Chrome offscreen / Firefox 背景页）在 init 生命周期内写入
 *   loading / ready / error 与下载进度；
 * - options 设置页通过 readModelStatus / subscribeModelStatus 展示；
 * - 设置页点击“重新下载”时通过 index.js 的 requestModelReset 走消息 RPC 让宿主重置。
 *
 * 所有能力在缺少扩展 API / CacheStorage 的环境中都必须安全降级（返回空值或 no-op），
 * 绝不能抛错影响翻译主流程。
 */

import { browser } from "../browser";
import { logger } from "../log";

/** 模型状态在 storage.local 中的键名（扩展内多上下文共享）。 */
export const AIFW_MODEL_STATUS_KEY = "kiss-translator_aifw_model_status";

/** 广播“清空模型缓存并重新下载”的 runtime 消息类型。 */
export const AIFW_RESET_MESSAGE = "AIFW_RESET_MODELS";

/** 宿主没有 storage.local 时（Edge offscreen），把状态转交后台写入。 */
export const AIFW_MODEL_STATUS_UPDATE = "AIFW_MODEL_STATUS_UPDATE";

/** aifw-js managed 模式的 CacheStorage 缓存名前缀（oneaifw-assets-v<version>）。 */
export const AIFW_CACHE_NAME_PREFIX = "oneaifw-assets-v";

const log = logger.child("aifw");

function toErrorText(err) {
  if (err instanceof Error) return err.message || String(err);
  return String(err || "unknown error");
}

function getStorageLocal() {
  // 优先 webextension-polyfill 的 browser；个别 Chromium 分支（如 Edge 的
  // offscreen 上下文）polyfill 可能不可用，此时回退到原生 chrome.storage。
  const candidates = [];
  try {
    if (browser?.storage?.local) candidates.push(browser.storage.local);
  } catch {
    // 忽略
  }
  try {
    if (globalThis.chrome?.storage?.local) {
      candidates.push(globalThis.chrome.storage.local);
    }
  } catch {
    // 忽略
  }
  return (
    candidates.find(
      (area) => typeof area?.get === "function" && typeof area?.set === "function"
    ) || null
  );
}

function getStorageOnChanged() {
  try {
    if (browser?.storage?.onChanged?.addListener) {
      return browser.storage.onChanged;
    }
  } catch {
    // 忽略
  }
  try {
    if (globalThis.chrome?.storage?.onChanged?.addListener) {
      return globalThis.chrome.storage.onChanged;
    }
  } catch {
    // 忽略
  }
  return null;
}

function getCaches() {
  try {
    const cachesApi = globalThis.caches;
    return cachesApi && typeof cachesApi.keys === "function" ? cachesApi : null;
  } catch {
    return null;
  }
}

function isModelCacheName(name) {
  return typeof name === "string" && name.startsWith(AIFW_CACHE_NAME_PREFIX);
}

/**
 * 读取当前模型状态。
 * @returns {Promise<null | { state: string, downloadedBytes?: number, totalBytes?: number,
 *   sizeBytes?: number, error?: string|null, origin?: string, updatedAt?: number }>}
 */
export async function readModelStatus() {
  const area = getStorageLocal();
  if (!area?.get) return null;
  try {
    const data = await area.get(AIFW_MODEL_STATUS_KEY);
    const status = data?.[AIFW_MODEL_STATUS_KEY];
    return status && typeof status === "object" ? status : null;
  } catch (err) {
    log.debug("readModelStatus failed:", toErrorText(err));
    return null;
  }
}

/** 进程内最近一次写入的状态，写操作串行化以免并发 patch 互相覆盖。 */
let memoryStatus = null;
let writeChain = Promise.resolve();

let persistWarned = false;

/** 通过后台（service worker/背景页）写入模型状态。 */
async function relayModelStatus(status) {
  try {
    const runtime = browser?.runtime || globalThis.chrome?.runtime;
    if (typeof runtime?.sendMessage !== "function") return false;
    await runtime.sendMessage({
      type: AIFW_MODEL_STATUS_UPDATE,
      status,
    });
    return true;
  } catch (err) {
    log.debug("relay model status failed:", toErrorText(err));
    return false;
  }
}

async function persistModelStatus(status) {
  const area = getStorageLocal();
  if (!area?.set) {
    // Edge 的 offscreen 文档里可能没有 storage.local；交给后台写。
    if (!(await relayModelStatus(status)) && !persistWarned) {
      persistWarned = true;
      log.warn(
        "writeModelStatus skipped: no storage.local and background relay unavailable"
      );
    }
    return;
  }
  try {
    await area.set({ [AIFW_MODEL_STATUS_KEY]: status });
    return;
  } catch (err) {
    // polyfill 失败时再用原生 chrome.storage 试一次（Edge offscreen 等场景）。
    try {
      const chromeArea = globalThis.chrome?.storage?.local;
      if (chromeArea && chromeArea !== area && chromeArea.set) {
        await chromeArea.set({ [AIFW_MODEL_STATUS_KEY]: status });
        return;
      }
    } catch {
      // 继续走下面的兜底
    }
    if (await relayModelStatus(status)) return;
    if (!persistWarned) {
      persistWarned = true;
      log.warn("writeModelStatus failed:", toErrorText(err));
    }
  }
}

/**
 * 合并写入模型状态（读取旧值 + patch，写回 storage.local）。
 * 无扩展 storage 时静默 no-op，但仍维护进程内状态以便本上下文读取。
 * @param {object} patch 要更新的字段。
 * @returns {Promise<object|undefined>} 合并后的状态。
 */
export function writeModelStatus(patch) {
  const next = writeChain.then(async () => {
    let base = memoryStatus;
    if (!base) base = (await readModelStatus()) || {};
    const merged = { ...base };
    // patch 中显式传 undefined 表示删除该字段（例如 host 模式清除页面 origin）。
    for (const [key, value] of Object.entries(patch || {})) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    merged.updatedAt = Date.now();
    memoryStatus = merged;
    await persistModelStatus(merged);
    return merged;
  });
  // 写链永不中断，避免一次失败让后续写入全部跳过。
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * 订阅模型状态变化（storage.onChanged）。无扩展 API 时返回 no-op 取消函数。
 * @param {(status: object|null) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeModelStatus(listener) {
  if (typeof listener !== "function") return () => {};
  const onChanged = getStorageOnChanged();
  if (!onChanged?.addListener) return () => {};

  const handler = (changes) => {
    if (
      !changes ||
      !Object.prototype.hasOwnProperty.call(changes, AIFW_MODEL_STATUS_KEY)
    )
      return;
    const change = changes[AIFW_MODEL_STATUS_KEY];
    try {
      listener(change?.newValue ?? null);
    } catch (err) {
      log.debug("model status listener failed:", toErrorText(err));
    }
  };

  try {
    onChanged.addListener(handler);
  } catch (err) {
    log.debug("subscribeModelStatus failed:", toErrorText(err));
    return () => {};
  }

  return () => {
    try {
      onChanged.removeListener?.(handler);
    } catch (err) {
      log.debug("unsubscribeModelStatus failed:", toErrorText(err));
    }
  };
}

/**
 * 删除 aifw-js 的模型缓存（oneaifw-assets-v*）。
 * @returns {Promise<number>} 成功删除的缓存数量。
 */
export async function clearModelCaches() {
  const cachesApi = getCaches();
  if (!cachesApi || typeof cachesApi.delete !== "function") return 0;
  let deleted = 0;
  try {
    const names = await cachesApi.keys();
    const targets = (names || []).filter(isModelCacheName);
    for (const name of targets) {
      try {
        if (await cachesApi.delete(name)) deleted += 1;
      } catch (err) {
        log.debug("delete model cache failed:", name, toErrorText(err));
      }
    }
  } catch (err) {
    log.debug("clearModelCaches failed:", toErrorText(err));
    return deleted;
  }
  return deleted;
}

async function measureResponseBytes(response) {
  if (!response) return 0;
  try {
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > 0) return declared;
  } catch {
    // 忽略 header 读取失败，继续尝试读取 body。
  }
  try {
    const source =
      typeof response.clone === "function" ? response.clone() : response;
    if (typeof source.arrayBuffer === "function") {
      const buffer = await source.arrayBuffer();
      return buffer?.byteLength || 0;
    }
    const reader = source.body?.getReader?.();
    if (!reader) return 0;
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength || 0;
    }
    return bytes;
  } catch (err) {
    log.debug("measureResponseBytes failed:", toErrorText(err));
    return 0;
  }
}

/**
 * 统计 aifw-js 模型缓存占用的字节数。
 * 优先使用响应 content-length，缺失时回退读取 body 字节。
 * @returns {Promise<number>} 字节数；无 CacheStorage 时返回 0。
 */
export async function measureModelCacheSize() {
  const cachesApi = getCaches();
  if (!cachesApi || typeof cachesApi.open !== "function") return 0;
  let total = 0;
  try {
    const names = await cachesApi.keys();
    const targets = (names || []).filter(isModelCacheName);
    for (const name of targets) {
      try {
        const cache = await cachesApi.open(name);
        const requests = await cache.keys();
        for (const request of requests || []) {
          try {
            const response = await cache.match(request);
            total += await measureResponseBytes(response);
          } catch (err) {
            log.debug("measure cache entry failed:", toErrorText(err));
          }
        }
      } catch (err) {
        log.debug("measure model cache failed:", name, toErrorText(err));
      }
    }
  } catch (err) {
    log.debug("measureModelCacheSize failed:", toErrorText(err));
  }
  return total;
}

/**
 * 通知所有标签页清空模型缓存并重新下载。
 * @returns {Promise<{ tabs: number, delivered: number }>}
 */
export async function requestModelReset() {
  let tabsApi = null;
  try {
    tabsApi = browser?.tabs || null;
  } catch {
    tabsApi = null;
  }
  if (!tabsApi?.query || !tabsApi?.sendMessage) {
    return { tabs: 0, delivered: 0 };
  }

  let tabs = [];
  try {
    tabs = (await tabsApi.query({})) || [];
  } catch (err) {
    log.debug("requestModelReset query failed:", toErrorText(err));
    return { tabs: 0, delivered: 0 };
  }

  const targets = tabs.filter((tab) => tab && typeof tab.id === "number");
  if (targets.length === 0) return { tabs: 0, delivered: 0 };

  const results = await Promise.allSettled(
    targets.map((tab) =>
      Promise.resolve(tabsApi.sendMessage(tab.id, { type: AIFW_RESET_MESSAGE }))
    )
  );
  const delivered = results.filter(
    (result) => result.status === "fulfilled"
  ).length;
  return { tabs: targets.length, delivered };
}
