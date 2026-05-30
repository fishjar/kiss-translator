import { isExt, isGm } from "./client";
import { sendBgMsg } from "./msg";
import { getSettingWithDefault } from "./storage";
import { MSG_FETCH, DEFAULT_HTTP_TIMEOUT, PORT_STREAM_FETCH } from "../config";
import { isBg } from "./browser";
import { kissLog } from "./log";
import { getFetchPool } from "./pool";
import { getHttpCachePolyfill, parseResponse } from "./cache";
import { createSSEParser, createAsyncQueue } from "./stream";
import browser from "webextension-polyfill";

/**
 * @file fetch.js
 * @description 统一的网络请求封装模块，完美兼容并封装了 Web、扩展（Content/Background）以及油猴脚本环境下的网络请求与 SSE 流式读取功能。
 */

/**
 * 油猴脚本环境下的 GM.xmlHttpRequest 请求封装，支持跨域
 * @param {string} input 目标 URL
 * @param {Object} [init] 配置参数 (method, headers, body, timeout)
 * @returns {Promise<Object>} 包含响应体、头部及状态的普通对象
 */
export const fetchGM = async (
  input,
  { method = "GET", headers, body, timeout } = {}
) =>
  new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method,
      url: input,
      headers,
      data: body,
      // withCredentials: true,
      timeout,
      onload: ({ response, responseHeaders, status, statusText }) => {
        const headers = {};
        try {
          // REVIEW:
          // 此处的 responseHeaders.split("\n")，在标准 HTTP/1.1 规范中响应头是以 "\r\n" (CRLF) 分割的。
          // 直接按 "\n" 分割，可能会导致拆分出的 value 字符串尾部带有一个隐藏的 "\r" 字符。
          // 幸而下方执行了 `item.trim()`，利用正则去空字符抹去了尾部的 "\r"，因此目前是安全的。
          // 但作为规范写法，建议使用 `responseHeaders.split(/\r?\n/)` 更能防患未然。
          responseHeaders &&
            responseHeaders.split("\n").forEach((line) => {
              const [name, value] = line.split(":").map((item) => item.trim());
              if (name && value) {
                headers[name] = value;
              }
            });
        } catch (e) {
          kissLog("fetchGM parse headers error", e);
        }

        resolve({
          body: response,
          headers,
          status,
          statusText,
        });
      },
      onerror: reject,
      onabort: () => {
        reject(new Error("GM request onabort."));
      },
      ontimeout: () => {
        reject(new Error("GM request timeout."));
      },
    });
  });

/**
 * 请求环境调度补丁：根据 Gm 或 WebExtension 自动选择底层的网络请求机制，并对超时进行强行拦截。
 * @param {string} input
 * @param {Object} init
 * @param {Object} [opts]
 * @returns {Promise<Response>} 返回一个标准的 Fetch Response 实例
 */
export const fetchPatcher = async (input, init = {}, opts) => {
  let timeout = opts?.httpTimeout;
  if (!timeout) {
    try {
      timeout = (await getSettingWithDefault()).httpTimeout;
    } catch (err) {
      kissLog("getSettingWithDefault", err);
    }
  }
  if (!timeout) {
    timeout = DEFAULT_HTTP_TIMEOUT;
  }

  // 1. 油猴脚本环境：优先使用支持跨域的 GM.xmlHttpRequest
  if (isGm) {
    // todo: 自定义接口 init 可能包含了 signal
    Object.assign(init, { timeout });

    const { body, headers, status, statusText } = window.KISS_GM
      ? await window.KISS_GM.fetch(input, init)
      : await fetchGM(input, init);

    return new Response(body, {
      headers: new Headers(headers),
      status,
      statusText,
    });
  }

  // 2. 插件环境/Web 环境：使用浏览器原生的 fetch
  // 若支持 AbortSignal.timeout，则注入信号以支持超时控制
  if (AbortSignal?.timeout && !init.signal) {
    Object.assign(init, { signal: AbortSignal.timeout(timeout) });
  }

  return fetch(input, init);
};

/**
 * 执行网络请求并对响应的数据格式（JSON、Text 等）做解析
 * @param {Object} param0
 * @returns {Promise<*>} 解析后的最终数据
 */
export const fetchHandle = async ({ input, init, opts }) => {
  const res = await fetchPatcher(input, init, opts);
  return parseResponse(res, opts.expect);
};

/**
 * 跨域请求的垫片（Polyfill）：在插件 Content Script 下，无法绕过同源策略直接向非同源 API 发起请求。
 * 此时会使用 extension 消息，将请求派发给 Background 脚本代发，绕过跨域限制。
 * @param {Object} param0
 * @returns {Promise<*>}
 */
export const fnPolyfill = ({ fn, msg = MSG_FETCH, ...args }) => {
  // 插件前端（Content Script）：将网络任务发送至 Background 中转执行
  if (isExt && !isBg()) {
    return sendBgMsg(msg, { ...args });
  }

  // 插件后端（Background）、网页演示、油猴脚本：本地环境拥有高权限或本就处于同源，直接在当前上下文执行
  return fn({ ...args });
};

/**
 * 统一的数据请求总入口：整合了翻译结果的本地缓存以及请求任务池（控制并发与间隔时长）
 * @param {string} input 请求网址
 * @param {Object} init 原生 fetch 初始化对象
 * @param {Object} options 选项：是否使用缓存、是否进入请求并发池等
 * @returns {Promise<*>} 翻译结果数据
 */
export const fetchData = async (
  input,
  init,
  { useCache, usePool, fetchInterval, fetchLimit, ...opts } = {}
) => {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  // 1. 优先尝试提取历史翻译缓存，若存在则不发起实际网络请求
  if (useCache) {
    const resCache = await getHttpCachePolyfill(input, init);
    if (resCache) {
      return resCache;
    }
  }

  // 2. 通过并发任务池发送请求（用于防范高频请求被封禁、控制 QPS 等）
  if (usePool) {
    const fetchPool = getFetchPool(fetchInterval, fetchLimit);
    return fetchPool.push(fnPolyfill, { fn: fetchHandle, input, init, opts });
  }

  // 3. 直接发起请求
  return fnPolyfill({ fn: fetchHandle, input, init, opts });
};

/**
 * 油猴脚本流式请求（带 SSE 处理）
 * @param {*} input
 * @param {*} init
 * @returns {AsyncGenerator<string>}
 */
/**
 * 油猴脚本环境下的异步流式请求（接收 SSE 数据块并提取出文本）
 * @param {string} input 请求 URL
 * @param {Object} [init] 配置对象 (method, headers, body, timeout)
 * @returns {AsyncGenerator<string>}
 */
async function* fetchStreamGM(
  input,
  { method = "GET", headers, body, timeout } = {}
) {
  const asyncQueue = createAsyncQueue();
  const parseSSE = createSSEParser();

  const gmRequest = window.KISS_GM?.xmlHttpRequest || GM.xmlHttpRequest;
  // 调用 GM.xmlHttpRequest 并指定响应为 stream 流类型
  const requestHandle = gmRequest({
    method,
    url: input,
    headers,
    data: body,
    timeout,
    responseType: "stream",
    onloadstart: async ({ response }) => {
      try {
        const reader = response.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;
          // 解码数据块并输入到 SSE 生成器解析出 data 片段，塞入异步队列中
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
    onabort: () => asyncQueue.error(new Error("GM stream request aborted")),
    ontimeout: () => asyncQueue.error(new Error("GM stream request timeout")),
  });

  try {
    yield* asyncQueue.iterate(); // 使用异步迭代器，实时向外 yield 接收到的有效段落字符
  } finally {
    requestHandle?.abort?.(); // 结束或中断时，关闭底层网络连接
  }
}

/**
 * 浏览器原生 fetch 流式请求（内置 SSE 解包逻辑）
 * @param {string} input 请求 URL
 * @param {Object} init 原生 fetch 选项
 * @param {number} timeout 超时时间 (毫秒)
 * @returns {AsyncGenerator<string>}
 */
export async function* fetchStreamNative(input, init, timeout) {
  const signal = AbortSignal?.timeout?.(timeout);
  const response = await fetch(input, { ...init, signal });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parseSSE = createSSEParser();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // 解析出 SSE 的 data 内容向外产出
    for (const data of parseSSE(decoder.decode(value, { stream: true }))) {
      yield data;
    }
  }
}

/**
 * 浏览器插件前端 (Content Script) 专用：通过 Chrome Port 端口长连接向 Background 发起流式网络请求。
 * 解决了 Content Script 中无法读取非跨域资源且传统消息（sendMessage）单次往返不支持流式传输的痛点。
 * @param {string} input
 * @param {Object} init
 * @param {Object} opts
 * @returns {AsyncGenerator<string>}
 */
async function* fetchStreamViaPort(input, init, opts) {
  const asyncQueue = createAsyncQueue();

  let port;
  try {
    // 建立专有长连接通道
    port = browser.runtime.connect({ name: PORT_STREAM_FETCH });
  } catch (e) {
    throw new Error("Failed to connect to background: " + e.message);
  }

  // 监听来自后台脚本的数据泵送
  port.onMessage.addListener((message) => {
    switch (message.type) {
      case "delta":
        asyncQueue.push(message.data); // 收到增量字符，塞入异步队列
        break;
      case "done":
        asyncQueue.finish(); // 传输完成
        break;
      case "error":
        asyncQueue.error(new Error(message.error)); // 后台发生错误
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

  // 通知后台开始代发流式 fetch
  port.postMessage({
    action: "start",
    args: { input, init, opts },
  });

  try {
    yield* asyncQueue.iterate();
  } finally {
    port.disconnect(); // 清理长连接端口
  }
}

/**
 * 流式请求的分发补丁（Polyfill）：根据客户端类型及上下文执行环境选择最佳的 SSE 读取机制。
 * @param {string} input
 * @param {Object} init
 * @param {Object} opts
 * @returns {AsyncGenerator<string>}
 */
async function* fnPolyfillStream(input, init, opts) {
  opts = {
    ...opts,
    httpTimeout: opts?.httpTimeout || DEFAULT_HTTP_TIMEOUT,
  };

  // 1. 插件内容脚本：通过 Port 发起跨域中转流式请求
  if (isExt && !isBg()) {
    yield* fetchStreamViaPort(input, init, opts);
    return;
  }

  // 2. 油猴脚本环境
  if (isGm) {
    yield* fetchStreamGM(input, { ...init, timeout: opts?.httpTimeout });
    return;
  }

  // 3. 插件后台 (Background) 或 普通 Web 环境：使用原生流式 fetch
  yield* fetchStreamNative(input, init, opts?.httpTimeout);
}

/**
 * 统一的流式翻译请求总入口 (含缓存检查及高频限制请求池包装)
 * @param {string} input
 * @param {Object} init
 * @param {Object} options
 * @yields {string} 流式解析出的文本片段
 */
export async function* fetchStream(
  input,
  init,
  { useCache, usePool, fetchInterval, fetchLimit, ...opts } = {}
) {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  // 1. 优先提取缓存 (若流式翻译已经缓存过，直接一次性 yield 出来即可，免去网络请求)
  if (useCache) {
    const resCache = await getHttpCachePolyfill(input, init);
    if (resCache) {
      yield resCache;
      return;
    }
  }

  // 2. 通过并发池机制流式传输（异步等待并发信号后在队列中产出）
  if (usePool) {
    const fetchPool = getFetchPool(fetchInterval, fetchLimit);
    const asyncQueue = createAsyncQueue();

    // 在任务池里异步执行，并将流式传输灌入 asyncQueue
    const streamPromise = fetchPool.push(async () => {
      try {
        for await (const chunk of fnPolyfillStream(input, init, opts)) {
          asyncQueue.push(chunk);
        }
        asyncQueue.finish();
      } catch (e) {
        asyncQueue.error(e);
      }
      return null;
    });

    yield* asyncQueue.iterate();
    await streamPromise;
    return;
  }

  // 3. 直接发起流式请求
  yield* fnPolyfillStream(input, init, opts);
}
