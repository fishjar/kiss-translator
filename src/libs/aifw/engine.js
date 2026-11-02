/**
 * @file engine.js
 * @description aifw-js 引擎核心：扩展后台宿主（Chrome offscreen / Firefox 背景页）
 * 与页面回退共用同一套实现。
 *
 * 宿主模式（configureEngine({ context: "host" })）：
 * - 模型全局只下载/缓存一份（扩展 origin 的 CacheStorage）；
 * - 写模型状态时省略 origin（设置页不显示来源站点）。
 * 页面模式（默认）：内容脚本回退方案，状态里记录 location.origin。
 *
 * 下载看门狗与重试：
 * - 每次 init 持有一个 AbortController，init 期间对 globalThis.fetch 的包装会把
 *   init abort 合并到实际请求的 signal（手写合并，兼容旧 Firefox）；
 * - 模型资源响应体读取超过 AIFW_DOWNLOAD_IDLE_TIMEOUT_MS 没有新数据时中止该请求，
 *   使 init 失败并提示“模型下载超时，请重试”；
 * - retryEngine 可中止卡住的 init，保留已完成的缓存文件后重新 init（managed 模式续传）。
 *
 * 对外能力：ensureEngine / getEngineStatus / maskOnEngine / restoreOnEngine /
 * retryEngine / resetEngine / warmupEngine / configureEngine。
 */

import { logger } from "../log";
import {
  AIFW_DOWNLOAD_IDLE_TIMEOUT_MS,
  AIFW_INIT_RETRY_INTERVAL_MS,
  AIFW_INIT_TIMEOUT_MS,
  AIFW_LOG_MODULE,
  AIFW_PROGRESS_THROTTLE_MS,
} from "./constants";
import { loadAifwModule, resolveAifwModuleUrl } from "./loader";
import {
  clearModelCaches,
  measureModelCacheSize,
  writeModelStatus,
} from "./status";

const log = logger.child(AIFW_LOG_MODULE);

/** 模型资源 host 白名单（aifw-js managed 模式的三个上游源）。 */
const MODEL_ASSET_HOSTS = [
  "raw.githubusercontent.com",
  "huggingface.co",
  "modelscope.cn",
];

/** 下载卡住超时后写入模型状态的可读文案。 */
const DOWNLOAD_TIMEOUT_MESSAGE = "模型下载超时，请重试";

/** "page" | "host" */
let engineContext = "page";

/** aifw-js 在当前环境是否可用；首次访问时计算一次。 */
let availability = null;

/** 已加载并初始化成功的 aifw-js 模块。 */
let aifwModule = null;

/** 初始化状态："idle" | "loading" | "ready" | "error"。 */
let initState = "idle";

/** 进行中的初始化 promise（单例，供并发请求复用）。 */
let initPromise = null;

/** 最近一次初始化失败的原因（面向用户的可读文本）。 */
let initError = null;

/** 最近一次初始化开始的时间戳，用于失败后的重试限流。 */
let lastInitAttemptAt = 0;

/** 初始化代数：retryEngine/resetEngine 自增，旧的 init 链完成后据此放弃写状态。 */
let initGeneration = 0;

/** 当前在途初始化的中止控制器（用于重试时中断卡住的下载）。 */
let initAbortController = null;

/** 本次 init 是否因下载看门狗超时失败（用于映射状态文案）。 */
let downloadTimedOut = false;

/**
 * 因 retryEngine 主动中止而放弃的 init 代数。
 * 该代数的旧 init 收尾时不做 deinit（新 init 可能已在复用同一模块实例）。
 */
let retryAbortedGeneration = -1;

/** 状态中最多保留的模型文件条数，避免 storage 写入负载过大。 */
const MAX_STATUS_FILES = 15;

/** 已观察到的模型文件（按首次出现顺序）与 URL 索引。 */
let trackedFiles = [];
let trackedFileByUrl = new Map();

/** 本次 init 内已计入统计的 URL（同一 URL 只统计一次）。 */
let countedFileUrls = new Set();

/** 实时下载速度估算：最近 SPEED_WINDOW_MS 的字节采样。 */
const SPEED_WINDOW_MS = 2000;
const SPEED_MIN_SPAN_MS = 250;
let speedSamples = [];
let speedBps = 0;
let speedSettleTimer = null;

/** 初始化期间对 globalThis.fetch 的包装恢复函数。 */
let restoreFetchTracking = null;

/** 在途看门狗定时器（初始化结束/中止时统一清理）。 */
const activeWatchdogTimers = new Set();

/**
 * 配置引擎运行上下文。
 * @param {object} [options]
 * @param {"page"|"host"} [options.context] 页面回退引擎或后台宿主引擎
 * @returns {"page"|"host"} 生效的上下文
 */
export function configureEngine({ context } = {}) {
  if (context === "page" || context === "host") engineContext = context;
  return engineContext;
}

function getOrigin() {
  try {
    return globalThis.location?.origin || "";
  } catch {
    return "";
  }
}

/** 状态里的 origin：页面模式记录站点来源，宿主模式省略。 */
function statusOrigin() {
  return engineContext === "host" ? undefined : getOrigin();
}

function isAvailable() {
  if (availability === null) {
    try {
      availability = Boolean(resolveAifwModuleUrl());
    } catch {
      availability = false;
    }
  }
  return availability;
}

function toErrorMessage(err) {
  if (err instanceof Error) return err.message || String(err);
  return String(err || "unknown error");
}

function createAbortError() {
  try {
    return new DOMException("The operation was aborted.", "AbortError");
  } catch {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return error;
  }
}

/** 写模型状态（吞掉所有异常，保证不打断翻译主流程）。 */
async function writeStatus(patch) {
  try {
    await writeModelStatus(patch);
  } catch (err) {
    log.debug("write model status failed:", toErrorMessage(err));
  }
}

function isModelAssetUrl(input) {
  try {
    const href =
      typeof input === "string" ? input : input?.url || input?.href || "";
    if (!href) return false;
    const url = new URL(href, getOrigin() || "http://localhost/");
    // 只统计真实网络下载：排除 chrome-extension:/moz-extension:/blob:/data:
    // 等扩展内自带资源（例如 aifw core wasm），避免污染文件列表与总大小。
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname || "";
    if (MODEL_ASSET_HOSTS.some((assetHost) => host.includes(assetHost)))
      return true;
    return url.pathname.endsWith(".onnx") || url.pathname.endsWith(".wasm");
  } catch {
    return false;
  }
}

function urlOf(input) {
  if (typeof input === "string") return input;
  return input?.url || input?.href || "";
}

/** hello.json 只用于版本探测，不进入模型文件列表。 */
function isHelloJsonUrl(input) {
  const href = urlOf(input);
  if (!href) return false;
  return /\/hello\.json(?:$|[?#])/.test(href) || href.endsWith("hello.json");
}

/** 相对 assets 根目录的文件名（如 models/.../model_quantized.onnx、wasm/ort-wasm-simd.wasm）。 */
function buildFileName(input) {
  const href = urlOf(input);
  try {
    const pathname = new URL(href, getOrigin() || "http://localhost/").pathname;
    // 取最后一个 models/ 或 wasm/ 段作为 assets 根目录：
    // 各镜像 URL 前缀不同（如 modelscope 的 /models/<owner>/.../master/wasm/...）。
    const segments = pathname.split("/");
    for (let index = segments.length - 2; index >= 0; index -= 1) {
      if (segments[index] === "models" || segments[index] === "wasm") {
        return segments.slice(index).join("/");
      }
    }
    return pathname.replace(/^\/+/, "");
  } catch {
    return href;
  }
}

/** 取（或登记）一个模型文件跟踪条目；超过上限后不再新增。 */
function getTrackedFile(input) {
  const href = urlOf(input);
  if (!href) return null;
  const existing = trackedFileByUrl.get(href);
  if (existing) return existing;
  if (trackedFiles.length >= MAX_STATUS_FILES) return null;
  const entry = {
    name: buildFileName(input),
    url: href,
    downloadedBytes: 0,
    totalBytes: 0,
    done: false,
  };
  trackedFiles.push(entry);
  trackedFileByUrl.set(href, entry);
  return entry;
}

function fileSnapshot() {
  return trackedFiles.map((file) => ({ ...file }));
}

/**
 * 全局进度 = 文件列表之和（保证「总大小 == 文件列表之和」且 downloaded <= total）。
 * 单文件 downloaded 已按 totalBytes clamp；未知 total 的文件不计入全局下载量。
 */
function aggregateTotals() {
  let downloadedBytes = 0;
  let totalBytes = 0;
  for (const file of trackedFiles) {
    totalBytes += file.totalBytes;
    if (file.totalBytes > 0) {
      downloadedBytes += Math.min(file.downloadedBytes, file.totalBytes);
    }
  }
  return { downloadedBytes, totalBytes };
}

function recordSpeedSample(bytes) {
  if (!(bytes > 0)) return;
  const now = Date.now();
  speedSamples.push({ at: now, bytes });
  while (speedSamples.length && now - speedSamples[0].at > SPEED_WINDOW_MS) {
    speedSamples.shift();
  }
  const span = Math.max(SPEED_MIN_SPAN_MS, now - speedSamples[0].at);
  const total = speedSamples.reduce((sum, sample) => sum + sample.bytes, 0);
  speedBps = Math.round((total * 1000) / span);
}

function currentSpeedBps() {
  if (!speedSamples.length) return 0;
  const lastAt = speedSamples[speedSamples.length - 1].at;
  if (Date.now() - lastAt > SPEED_WINDOW_MS) return 0;
  return speedBps;
}

function resetDownloadDetails() {
  trackedFiles = [];
  trackedFileByUrl = new Map();
  countedFileUrls = new Set();
  speedSamples = [];
  speedBps = 0;
  if (speedSettleTimer) {
    clearTimeout(speedSettleTimer);
    activeWatchdogTimers.delete(speedSettleTimer);
    speedSettleTimer = null;
  }
}

function clearWatchdogTimers() {
  for (const timer of [...activeWatchdogTimers]) {
    clearTimeout(timer);
    activeWatchdogTimers.delete(timer);
  }
  speedSettleTimer = null;
}

function stopFetchProgressTracking() {
  const restore = restoreFetchTracking;
  restoreFetchTracking = null;
  clearWatchdogTimers();
  if (typeof restore !== "function") return;
  try {
    restore();
  } catch (err) {
    log.debug("restore fetch failed:", toErrorMessage(err));
  }
}

/** 手写合并多个 AbortSignal（兼容不支持 AbortSignal.any 的旧 Firefox）。 */
function createRequestController(...signals) {
  const controller = new AbortController();
  const abortNow = () => {
    try {
      controller.abort();
    } catch {
      // 已取消时忽略。
    }
  };
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      abortNow();
      continue;
    }
    try {
      signal.addEventListener("abort", abortNow, { once: true });
    } catch {
      // 老环境不支持时退化为仅使用 init abort。
    }
  }
  return controller;
}

/**
 * 初始化期间临时包装 globalThis.fetch：
 * - 把 init 的 abort 合并到实际请求 signal；
 * - 统计模型资源下载进度（写状态节流 AIFW_PROGRESS_THROTTLE_MS）；
 * - 响应体读取超过 AIFW_DOWNLOAD_IDLE_TIMEOUT_MS 无新数据时中止该请求。
 * @param {number} generation 当前初始化代数
 * @param {AbortController} initController 当前 init 的中止控制器
 * @returns {() => void} 恢复原 fetch
 */
function beginFetchProgressTracking(generation, initController) {
  stopFetchProgressTracking();
  if (typeof globalThis.fetch !== "function") return () => {};

  const originalFetch = globalThis.fetch;
  const initSignal = initController?.signal;
  let disposed = false;
  let lastProgressAt = 0;

  const emitProgress = (force) => {
    if (disposed || generation !== initGeneration) return;
    const now = Date.now();
    if (!force && now - lastProgressAt < AIFW_PROGRESS_THROTTLE_MS) return;
    lastProgressAt = now;
    const totals = aggregateTotals();
    void writeStatus({
      downloadedBytes: totals.downloadedBytes,
      totalBytes: totals.totalBytes,
      speedBps: currentSpeedBps(),
      files: fileSnapshot(),
    });
  };

  /** 超过 SPEED_WINDOW_MS 没有新数据时把速度归零（避免状态里残留旧速度）。 */
  const scheduleSpeedSettle = () => {
    if (speedSettleTimer) {
      clearTimeout(speedSettleTimer);
      activeWatchdogTimers.delete(speedSettleTimer);
      speedSettleTimer = null;
    }
    if (disposed || generation !== initGeneration) return;
    const lastAt = speedSamples.length
      ? speedSamples[speedSamples.length - 1].at
      : Date.now();
    const delay = Math.max(0, SPEED_WINDOW_MS - (Date.now() - lastAt));
    speedSettleTimer = setTimeout(() => {
      activeWatchdogTimers.delete(speedSettleTimer);
      speedSettleTimer = null;
      if (disposed || generation !== initGeneration) return;
      speedSamples = [];
      speedBps = 0;
      void writeStatus({ speedBps: 0, files: fileSnapshot() });
    }, delay);
    activeWatchdogTimers.add(speedSettleTimer);
  };

  const trackedFetch = (input, init) => {
    const requestController = createRequestController(initSignal, init?.signal);
    const requestPromise = Promise.resolve().then(() => {
      if (requestController.signal.aborted) throw createAbortError();
      return originalFetch(input, {
        ...(init || {}),
        signal: requestController.signal,
      });
    });

    return requestPromise.then((response) => {
      let watchdogTimer = null;

      const clearAssetWatchdog = () => {
        if (!watchdogTimer) return;
        clearTimeout(watchdogTimer);
        activeWatchdogTimers.delete(watchdogTimer);
        watchdogTimer = null;
      };

      const armWatchdog = () => {
        clearAssetWatchdog();
        if (disposed || generation !== initGeneration) return;
        watchdogTimer = setTimeout(() => {
          activeWatchdogTimers.delete(watchdogTimer);
          watchdogTimer = null;
          if (disposed || generation !== initGeneration) return;
          downloadTimedOut = true;
          log.warn("aifw model download stalled; aborting request");
          try {
            requestController.abort();
          } catch {
            // 已取消时忽略。
          }
        }, AIFW_DOWNLOAD_IDLE_TIMEOUT_MS);
        activeWatchdogTimers.add(watchdogTimer);
      };

      try {
        if (!isModelAssetUrl(input)) return response;
        const declared = Number(response?.headers?.get?.("content-length"));
        const href = urlOf(input);
        // hello.json 只做版本探测，不进入模型文件列表。
        const fileEntry = isHelloJsonUrl(input) ? null : getTrackedFile(input);
        // 同一 URL 在单次 init 内可能被多次 fetch（预取 + transformers 再次拉取），
        // 只统计第一次，避免字节数重复累加。
        const counted = Boolean(
          fileEntry && href && !countedFileUrls.has(href)
        );
        if (counted) {
          countedFileUrls.add(href);
          if (Number.isFinite(declared) && declared > 0) {
            fileEntry.totalBytes = declared;
          }
        }
        emitProgress(false);
        if (typeof response?.clone === "function") {
          const reader = response.clone()?.body?.getReader?.();
          if (reader) {
            // 重复 fetch 不计入统计，但仍保留 watchdog 以检测卡住。
            armWatchdog();
            void (async () => {
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const byteLength = value?.byteLength || 0;
                  if (counted && fileEntry && !fileEntry.done) {
                    const nextBytes = fileEntry.downloadedBytes + byteLength;
                    // 按 content-length clamp，防止服务端多给/统计误差。
                    fileEntry.downloadedBytes =
                      fileEntry.totalBytes > 0
                        ? Math.min(nextBytes, fileEntry.totalBytes)
                        : Math.max(0, nextBytes);
                    if (
                      fileEntry.totalBytes > 0 &&
                      fileEntry.downloadedBytes >= fileEntry.totalBytes
                    ) {
                      // 达到已知总长度即完成，后续字节冻结。
                      fileEntry.done = true;
                    }
                    recordSpeedSample(byteLength);
                    emitProgress(false);
                    scheduleSpeedSettle();
                  }
                  armWatchdog();
                }
                if (counted && fileEntry && !fileEntry.done) {
                  if (fileEntry.totalBytes > 0) {
                    fileEntry.downloadedBytes = Math.min(
                      fileEntry.downloadedBytes,
                      fileEntry.totalBytes
                    );
                  }
                  fileEntry.done = true;
                }
                if (counted && fileEntry) {
                  // 完成状态强制写一次，避免被 250ms 节流吞掉。
                  emitProgress(true);
                }
              } catch {
                // 请求被 abort / 读取失败：交给 init 的 catch 处理。
              } finally {
                clearAssetWatchdog();
              }
            })();
          }
        }
        return response;
      } catch (err) {
        log.debug("fetch progress tracking failed:", toErrorMessage(err));
        return response;
      }
    });
  };

  const restore = () => {
    if (disposed) return;
    disposed = true;
    clearWatchdogTimers();
    if (globalThis.fetch === trackedFetch) globalThis.fetch = originalFetch;
    if (restoreFetchTracking === restore) restoreFetchTracking = null;
  };
  restoreFetchTracking = restore;
  globalThis.fetch = trackedFetch;
  return restore;
}

function startInit() {
  const generation = initGeneration;
  initState = "loading";
  initError = null;
  lastInitAttemptAt = Date.now();
  downloadTimedOut = false;
  resetDownloadDetails();

  const controller = new AbortController();
  initAbortController = controller;
  const restoreFetch = beginFetchProgressTracking(generation, controller);
  const abortPromise = new Promise((_, reject) => {
    if (controller.signal.aborted) {
      reject(createAbortError());
      return;
    }
    controller.signal.addEventListener(
      "abort",
      () => reject(createAbortError()),
      {
        once: true,
      }
    );
  });
  // abortPromise 可能与 init 的 race 一起被放弃，单独兜底避免未处理拒绝。
  abortPromise.catch(() => {});

  void writeStatus({
    state: "loading",
    downloadedBytes: 0,
    totalBytes: 0,
    speedBps: 0,
    files: [],
    error: null,
    origin: statusOrigin(),
  });

  initPromise = loadAifwModule()
    .then(async (mod) => {
      if (generation !== initGeneration) {
        restoreFetch();
        try {
          await mod?.deinit?.();
        } catch {
          // 放弃的初始化实例清理失败可忽略。
        }
        return;
      }
      try {
        // 默认 managed 模式：由库自行下载 / 缓存 NER 模型与 ORT wasm。
        // race 保证 retryEngine 中止时 init 立即失败，不必等待库内部收尾。
        await Promise.race([mod.init({}), abortPromise]);
      } finally {
        restoreFetch();
      }
      if (generation !== initGeneration) {
        // 被重试/重置中止：不写状态。retry 场景下新 init 可能已在复用该模块，
        // 不能 deinit；reset 场景仍清理旧实例。
        if (generation !== retryAbortedGeneration) {
          try {
            await mod?.deinit?.();
          } catch {
            // 清理失败可忽略。
          }
        }
        return;
      }

      aifwModule = mod;
      initState = "ready";

      let sizeBytes = 0;
      try {
        sizeBytes = await measureModelCacheSize();
      } catch (err) {
        log.debug("measure model cache size failed:", toErrorMessage(err));
      }
      const totals = aggregateTotals();
      await writeStatus({
        state: "ready",
        sizeBytes,
        downloadedBytes: totals.downloadedBytes,
        totalBytes: totals.totalBytes,
        speedBps: 0,
        files: fileSnapshot(),
        error: null,
        origin: statusOrigin(),
      });
    })
    .catch(async (err) => {
      restoreFetch();
      if (generation !== initGeneration) return;
      initState = "error";
      initError = downloadTimedOut
        ? DOWNLOAD_TIMEOUT_MESSAGE
        : toErrorMessage(err);
      log.warn("init failed; privacy masking is skipped:", initError);
      const totals = aggregateTotals();
      await writeStatus({
        state: "error",
        downloadedBytes: totals.downloadedBytes,
        totalBytes: totals.totalBytes,
        speedBps: 0,
        files: fileSnapshot(),
        error: initError,
        origin: statusOrigin(),
      });
    })
    .finally(() => {
      if (generation === initGeneration) initPromise = null;
      if (initAbortController === controller) initAbortController = null;
    });
}

function waitForInit(pending, timeoutMs, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve(ready);
    };
    const onAbort = () => finish(false);
    timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    pending.then(
      () => finish(initState === "ready"),
      () => finish(false)
    );
  });
}

/**
 * 确保引擎可用（必要时启动初始化）。
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs] 有界等待时间，默认 AIFW_INIT_TIMEOUT_MS
 * @returns {Promise<boolean>} 是否已 ready
 */
export async function ensureEngine({
  signal,
  timeoutMs = AIFW_INIT_TIMEOUT_MS,
} = {}) {
  if (initState === "ready") return true;
  if (!isAvailable()) return false;
  if (signal?.aborted) return false;

  if (!initPromise) {
    if (
      initState === "error" &&
      Date.now() - lastInitAttemptAt < AIFW_INIT_RETRY_INTERVAL_MS
    ) {
      // 上次初始化失败且仍在冷却期，快速跳过，避免反复触发下载。
      return false;
    }
    startInit();
  }

  // 超时后本次直接跳过，但后台初始化会继续完成。
  return waitForInit(initPromise, timeoutMs, signal);
}

/**
 * 触发一次后台预热（不等待初始化完成）。
 * @returns {boolean} 是否已 ready 或已触发初始化
 */
export function warmupEngine() {
  if (initState === "ready") return true;
  if (!isAvailable()) return false;
  if (
    !initPromise &&
    initState === "error" &&
    Date.now() - lastInitAttemptAt < AIFW_INIT_RETRY_INTERVAL_MS
  ) {
    return false;
  }
  void ensureEngine({ timeoutMs: 0 }).catch(() => {});
  return true;
}

/**
 * 查询引擎状态（同步）。
 * @returns {{ state: "unavailable"|"idle"|"loading"|"ready"|"error", error?: string }}
 */
export function getEngineStatus() {
  if (!isAvailable()) return { state: "unavailable" };
  if (initState === "error" && initError) {
    return { state: "error", error: initError };
  }
  return { state: initState };
}

/**
 * 对文本做脱敏。
 * @param {string} text
 * @param {string} [lang="auto"]
 * @returns {Promise<null | { maskedText: string, maskMeta: Uint8Array }>}
 */
export async function maskOnEngine(text, lang = "auto") {
  if (typeof text !== "string" || !text.trim()) return null;
  if (!isAvailable() || initState !== "ready" || !aifwModule) return null;

  try {
    const [maskedText, maskMeta] = await aifwModule.maskText(
      text,
      lang || "auto"
    );
    if (typeof maskedText !== "string") {
      log.warn("maskText returned an invalid result");
      return null;
    }
    return { maskedText, maskMeta };
  } catch (err) {
    log.warn("maskText failed:", toErrorMessage(err));
    return null;
  }
}

/**
 * 用 maskMeta 还原译文；失败时静默返回传入文本。
 * @param {string} text
 * @param {Uint8Array} maskMeta
 * @returns {Promise<string>}
 */
export async function restoreOnEngine(text, maskMeta) {
  if (typeof text !== "string") return text;
  if (!aifwModule || initState !== "ready" || !maskMeta) return text;
  try {
    const restored = await aifwModule.restoreText(text, maskMeta);
    return typeof restored === "string" ? restored : text;
  } catch (err) {
    log.warn(
      "restoreText failed; falling back to translated text:",
      toErrorMessage(err)
    );
    return text;
  }
}

/**
 * 重试模型初始化：中止卡住的在途 init，保留已下载的缓存文件后重新 init
 * （aifw-js managed 模式会命中 CacheStorage 续传，不会重新下载已完成的文件）。
 * @param {object} [options]
 * @param {boolean} [options.redownload=false] 是否立即重新开始初始化（由调用方按 privacyMask 决定）
 * @returns {Promise<{ retried: boolean }>} retried 表示是否执行了中止或重新初始化
 */
export async function retryEngine({ redownload = false } = {}) {
  const controller = initAbortController;
  const hadInFlight = initState === "loading" || Boolean(initPromise);
  if (hadInFlight) retryAbortedGeneration = initGeneration;

  // 作废在途 init：代数自增后旧链完成/失败都不会再写状态。
  initGeneration += 1;
  initState = "idle";
  initError = null;
  initPromise = null;
  lastInitAttemptAt = 0;
  downloadTimedOut = false;
  initAbortController = null;
  resetDownloadDetails();
  stopFetchProgressTracking();

  if (hadInFlight && controller) {
    try {
      controller.abort();
    } catch (err) {
      log.debug("abort in-flight aifw init failed:", toErrorMessage(err));
    }
  }

  // 不清理 CacheStorage：已完成的下载文件保留，重新 init 时命中缓存续传。
  await writeStatus({
    state: "idle",
    sizeBytes: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speedBps: 0,
    files: [],
    error: null,
    origin: statusOrigin(),
  });

  const started = Boolean(redownload) && isAvailable();
  if (started) startInit();
  return { retried: hadInFlight || started };
}

/**
 * 清空模型缓存并重置初始化状态。
 * @param {object} [options]
 * @param {boolean} [options.redownload=true] 是否清空后立即重新下载
 * @returns {Promise<{ cleared: number }>} cleared 为删除的缓存数量
 */
export async function resetEngine({ redownload = true } = {}) {
  stopFetchProgressTracking();

  const mod = aifwModule;
  aifwModule = null;
  if (mod?.deinit) {
    try {
      await mod.deinit();
    } catch (err) {
      log.debug("deinit failed:", toErrorMessage(err));
    }
  }

  let cleared = 0;
  try {
    cleared = await clearModelCaches();
  } catch (err) {
    log.debug("clearModelCaches failed:", toErrorMessage(err));
  }

  // 作废所有在途初始化（其完成回调会因代数不匹配而放弃写状态）。
  initGeneration += 1;
  initState = "idle";
  initError = null;
  initPromise = null;
  lastInitAttemptAt = 0;
  downloadTimedOut = false;
  initAbortController = null;
  resetDownloadDetails();

  await writeStatus({
    state: "idle",
    sizeBytes: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speedBps: 0,
    files: [],
    error: null,
    origin: statusOrigin(),
  });

  if (redownload && isAvailable()) startInit();
  return { cleared };
}
