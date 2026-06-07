/**
 * @file requestStream.js
 * @description 流式网络请求的跨环境适配层。负责 native fetch stream、油猴 stream、
 * WebExtension Port 代理，以及 SSE 数据帧的增量解包与取消传播。
 */

import browser from "webextension-polyfill";
import { isExt, isGm } from "./client";
import { isBg } from "./browser";
import { PORT_STREAM_FETCH, DEFAULT_HTTP_TIMEOUT } from "../config";
import { createSSEParser, createAsyncQueue } from "./stream";
import {
  createTimeoutSignal,
  mergeAbortSignals,
  resolveHttpTimeout,
} from "./request";

/**
 * 油猴环境下的 SSE 流式请求。
 *
 * @param {string} input 请求 URL。
 * @param {Object} [init] 请求初始化参数。
 * @param {string} [init.method="GET"] HTTP 方法。
 * @param {Object} [init.headers] 请求头。
 * @param {*} [init.body] 请求体。
 * @param {number} [init.timeout] 超时时间。
 * @param {AbortSignal} [init.signal] 外部取消信号。
 * @returns {AsyncGenerator<string>} 逐条产出 SSE data 字段。
 */
async function* fetchStreamGM(
  input,
  { method = "GET", headers, body, timeout, signal } = {}
) {
  const asyncQueue = createAsyncQueue();
  const parseSSE = createSSEParser();

  const gmRequest = window.KISS_GM?.xmlHttpRequest || GM.xmlHttpRequest;
  const requestHandle = gmRequest({
    method,
    url: input,
    headers,
    data: body,
    anonymous: true,
    timeout,
    responseType: "stream",
    onloadstart: async ({ response }) => {
      try {
        const reader = response.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;
          for (const data of parseSSE(
            decoder.decode(value, { stream: true })
          )) {
            asyncQueue.push(data);
          }
        }
      } catch (e) {
        asyncQueue.error(e);
        return;
      }
      asyncQueue.finish();
    },
    onerror: (e) => asyncQueue.error(e),
    onabort: () =>
      asyncQueue.error(
        new DOMException("The operation was aborted.", "AbortError")
      ),
    ontimeout: () => asyncQueue.error(new Error("GM stream request timeout")),
  });

  const abortBySignal = () => requestHandle?.abort?.();
  if (signal?.aborted) abortBySignal();
  signal?.addEventListener?.("abort", abortBySignal, { once: true });

  try {
    yield* asyncQueue.iterate();
  } finally {
    signal?.removeEventListener?.("abort", abortBySignal);
    requestHandle?.abort?.();
  }
}

/**
 * 浏览器原生 fetch 的 SSE 流式请求。
 *
 * @param {string} input 请求 URL。
 * @param {Object} [init={}] Fetch 初始化参数。
 * @param {Object|number} [opts] 请求选项；兼容旧调用传入 timeout number。
 * @param {number} [opts.httpTimeout] 超时时间。
 * @param {AbortSignal} [opts.signal] 外部取消信号。
 * @returns {AsyncGenerator<string>} 逐条产出 SSE data 字段。
 */
export async function* fetchStreamNative(input, init = {}, opts = {}) {
  const options = typeof opts === "number" ? { httpTimeout: opts } : opts || {};
  let timeout = options.httpTimeout || DEFAULT_HTTP_TIMEOUT;
  timeout = timeout > 600 ? timeout : timeout * 1000;
  const signal = mergeAbortSignals([
    init.signal,
    options.signal,
    createTimeoutSignal(timeout),
  ]);
  const response = await fetch(input, { ...init, signal });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parseSSE = createSSEParser();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const data of parseSSE(decoder.decode(value, { stream: true }))) {
        yield data;
      }
    }
  } finally {
    // 当调用方提前结束 async generator 时，主动释放 reader 锁并推动底层连接关闭。
    await reader.cancel?.();
  }
}

/**
 * WebExtension content script 通过 Port 代理发起 SSE 请求。
 *
 * @param {string} input 请求 URL。
 * @param {Object} init Fetch 初始化参数。
 * @param {Object} opts 请求选项。
 * @returns {AsyncGenerator<string>} 逐条产出 background 推送的 SSE data 字段。
 */
async function* fetchStreamViaPort(input, init, opts) {
  const asyncQueue = createAsyncQueue();
  const { signal, ...serializableOpts } = opts || {};

  let port;
  try {
    port = browser.runtime.connect({ name: PORT_STREAM_FETCH });
  } catch (e) {
    throw new Error("Failed to connect to background: " + e.message);
  }
  const disconnectPort = () => {
    try {
      port.disconnect();
    } catch {
      // Port 可能已被对端关闭，重复断开不应覆盖真正的流式请求错误。
    }
  };

  port.onMessage.addListener((message) => {
    switch (message.type) {
      case "delta":
        asyncQueue.push(message.data);
        break;
      case "done":
        asyncQueue.finish();
        break;
      case "error":
        asyncQueue.error(new Error(message.error));
        break;
      default:
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    const lastError = browser.runtime.lastError;
    if (lastError) {
      asyncQueue.error(new Error(lastError.message || "Port disconnected"));
    }
  });

  const abortBySignal = () => {
    asyncQueue.error(
      new DOMException("The operation was aborted.", "AbortError")
    );
    disconnectPort();
  };

  const alreadyAborted = signal?.aborted;
  if (alreadyAborted) {
    abortBySignal();
  } else {
    signal?.addEventListener?.("abort", abortBySignal, { once: true });
  }

  if (!alreadyAborted) {
    port.postMessage({
      action: "start",
      // AbortSignal 不能可靠穿过 Port 结构化克隆，background 端会为本次连接重新创建控制器。
      args: { input, init, opts: serializableOpts },
    });
  }

  try {
    yield* asyncQueue.iterate();
  } finally {
    signal?.removeEventListener?.("abort", abortBySignal);
    // 前台停止消费流时断开 Port，background 会据此 abort 底层 fetch，避免请求继续空跑。
    disconnectPort();
  }
}

/**
 * 根据当前运行环境选择合适的 SSE 流式请求通道。
 *
 * @param {string} input 请求 URL。
 * @param {Object} init Fetch 初始化参数。
 * @param {Object} opts 请求选项。
 * @returns {AsyncGenerator<string>} 逐条产出 SSE data 字段。
 */
export async function* requestStream(input, init, opts = {}) {
  const httpTimeout = await resolveHttpTimeout(opts);
  opts = {
    ...opts,
    httpTimeout,
  };

  if (isExt && !isBg()) {
    yield* fetchStreamViaPort(input, init, opts);
    return;
  }

  if (isGm) {
    yield* fetchStreamGM(input, {
      ...init,
      timeout: opts.httpTimeout,
      signal: opts.signal,
    });
    return;
  }

  yield* fetchStreamNative(input, init, opts);
}
