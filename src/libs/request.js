/**
 * @file request.js
 * @description 普通网络请求的跨环境适配层。负责 native fetch、油猴 GM.xmlHttpRequest、
 * WebExtension content script 到 background 的代理，以及超时信号与外部取消信号的合并。
 */

import { isExt, isGm } from "./client";
import { sendBgMsg } from "./msg";
import { getSettingWithDefault } from "./storage";
import { MSG_FETCH, DEFAULT_HTTP_TIMEOUT } from "../config";
import { isBg } from "./browser";
import { kissLog } from "./log";
import { parseResponse } from "./response";

/**
 * 将用户配置的请求超时时间统一归一化为毫秒。
 *
 * @param {number} [timeout] 用户配置的超时时间。新配置单位为秒，旧配置可能为毫秒。
 * @returns {number} 最终使用的超时时间，单位毫秒。
 */
export const normalizeHttpTimeout = (timeout) => {
  const normalizedTimeout = timeout || DEFAULT_HTTP_TIMEOUT;
  // 如果值大于 600，说明是旧配置（毫秒），直接返回；否则视为新配置（秒）并乘以 1000
  return normalizedTimeout > 600 ? normalizedTimeout : normalizedTimeout * 1000;
};

/**
 * 读取当前请求应使用的 HTTP 超时时间。
 *
 * @param {Object} [opts] 请求选项。
 * @param {number} [opts.httpTimeout] 调用方显式传入的超时时间。
 * @returns {Promise<number>} 最终使用的超时时间，单位毫秒。
 */
export const resolveHttpTimeout = async (opts = {}) => {
  let timeout = opts?.httpTimeout;
  if (!timeout) {
    try {
      timeout = (await getSettingWithDefault())?.httpTimeout;
    } catch (err) {
      kissLog("getSettingWithDefault", err);
    }
  }

  return normalizeHttpTimeout(timeout);
};

/**
 * 合并多个 AbortSignal，任意一个信号中止时都会中止合并后的信号。
 *
 * @param {Array<AbortSignal|undefined|null>} signals 待合并的取消信号列表。
 * @returns {AbortSignal|undefined} 合并后的信号；没有有效信号时返回 undefined。
 */
export const mergeAbortSignals = (signals = []) => {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];
  if (AbortSignal?.any) return AbortSignal.any(activeSignals);

  const controller = new AbortController();
  const abort = (signal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal?.reason);
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    // 这里必须监听每个上游信号，确保用户取消与超时取消都能穿透到同一个底层 fetch。
    signal.addEventListener("abort", () => abort(signal), { once: true });
  }

  return controller.signal;
};

/**
 * 创建带超时控制的 AbortSignal。
 *
 * @param {number} timeout 超时时间，单位毫秒。
 * @returns {AbortSignal|undefined} 支持 AbortSignal.timeout 时返回超时信号。
 */
export const createTimeoutSignal = (timeout) =>
  AbortSignal?.timeout && timeout ? AbortSignal.timeout(timeout) : undefined;

const parseResponseHeaders = (responseHeaders) => {
  const headers = {};
  try {
    responseHeaders &&
      responseHeaders.split(/\r?\n/).forEach((line) => {
        const [name, value] = line.split(":").map((item) => item.trim());
        if (name && value) {
          headers[name] = value;
        }
      });
  } catch (e) {
    kissLog("fetchGM parse headers error", e);
  }

  return headers;
};

const createGMResponse = ({
  response,
  responseHeaders,
  status,
  statusText,
} = {}) => ({
  body: response,
  headers: parseResponseHeaders(responseHeaders),
  status,
  statusText,
});

/**
 * 通过 GM.xmlHttpRequest 发起普通请求，并包装成接近 Fetch Response 的对象。
 *
 * @param {string} input 目标 URL。
 * @param {Object} [init] 请求初始化参数。
 * @param {string} [init.method="GET"] HTTP 方法。
 * @param {Object} [init.headers] 请求头。
 * @param {*} [init.body] 请求体。
 * @param {number} [init.timeout] 超时时间，单位毫秒。
 * @param {AbortSignal} [init.signal] 外部取消信号。
 * @returns {Promise<Object>} 包含 body、headers、status、statusText 的响应对象。
 */
export const fetchGM = async (
  input,
  { method = "GET", headers, body, timeout, signal } = {}
) =>
  new Promise((resolve, reject) => {
    let requestHandle = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.("abort", abortBySignal);
      fn(value);
    };

    const abortBySignal = () => {
      requestHandle?.abort?.();
      finish(
        reject,
        new DOMException("The operation was aborted.", "AbortError")
      );
    };

    if (signal?.aborted) {
      abortBySignal();
      return;
    }

    signal?.addEventListener?.("abort", abortBySignal, { once: true });

    requestHandle = GM.xmlHttpRequest({
      method,
      url: input,
      headers,
      data: body,
      anonymous: true,
      timeout,
      onload(responseEvent) {
        finish(resolve, createGMResponse(responseEvent || this));
      },
      onerror: (error) => finish(reject, error),
      onabort: () =>
        finish(
          reject,
          new DOMException("The operation was aborted.", "AbortError")
        ),
      ontimeout: () => finish(reject, new Error("GM request timeout.")),
    });
  });

const fetchKissGM = async (
  input,
  { method = "GET", headers, body, timeout, signal } = {}
) =>
  new Promise((resolve, reject) => {
    let requestHandle = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.("abort", abortBySignal);
      fn(value);
    };

    const abortBySignal = () => {
      requestHandle?.abort?.();
      finish(
        reject,
        new DOMException("The operation was aborted.", "AbortError")
      );
    };

    if (signal?.aborted) {
      abortBySignal();
      return;
    }

    signal?.addEventListener?.("abort", abortBySignal, { once: true });

    requestHandle = window.KISS_GM.xmlHttpRequest({
      method,
      url: input,
      headers,
      data: body,
      anonymous: true,
      timeout,
      onload: (responseEvent) =>
        finish(resolve, createGMResponse(responseEvent)),
      onerror: (error) => finish(reject, error),
      onabort: () =>
        finish(
          reject,
          new DOMException("The operation was aborted.", "AbortError")
        ),
      ontimeout: () => finish(reject, new Error("GM request timeout.")),
    });
  });

/**
 * 执行底层普通请求，自动选择 GM 或 native fetch。
 *
 * @param {string} input 请求 URL。
 * @param {Object} [init={}] Fetch 初始化参数。
 * @param {Object} [opts] 请求选项。
 * @param {number} [opts.httpTimeout] 超时时间。
 * @param {AbortSignal} [opts.signal] 外部取消信号。
 * @returns {Promise<Response>} 标准 Response 实例。
 */
export const fetchPatcher = async (input, init = {}, opts) => {
  const timeout = await resolveHttpTimeout(opts);
  const signal = mergeAbortSignals([
    init.signal,
    opts?.signal,
    createTimeoutSignal(timeout),
  ]);
  const requestInit = { ...init, signal };

  if (isGm) {
    const gmInit = { ...requestInit, timeout };

    const { body, headers, status, statusText } = window.KISS_GM
      ? await fetchKissGM(input, gmInit)
      : await fetchGM(input, gmInit);

    return new Response(body, {
      headers: new Headers(headers),
      status,
      statusText,
    });
  }

  return fetch(input, requestInit);
};

/**
 * 发起普通请求并解析响应。
 *
 * @param {Object} params 参数对象。
 * @param {string} params.input 请求 URL。
 * @param {Object} params.init Fetch 初始化参数。
 * @param {Object} params.opts 请求选项。
 * @returns {Promise<*>} 解析后的响应数据。
 */
export const fetchHandle = async ({ input, init, opts = {} }) => {
  const res = await fetchPatcher(input, init, opts);
  return parseResponse(res, opts.expect);
};

/**
 * 普通请求的跨上下文代理入口。
 *
 * @param {Object} params 参数对象。
 * @param {Function} params.fn 实际执行请求的函数。
 * @param {string} [params.msg=MSG_FETCH] background 消息类型。
 * @returns {Promise<*>} 请求结果。
 */
export const fnPolyfill = ({ fn, msg = MSG_FETCH, ...args }) => {
  if (isExt && !isBg()) {
    const signal = args.opts?.signal;
    const safeArgs = {
      ...args,
      opts: { ...args.opts, signal: undefined },
    };
    const requestPromise = sendBgMsg(msg, safeArgs);
    if (signal) {
      const abortPromise = new Promise((_, reject) => {
        if (signal.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }
        // sendMessage 是一次性请求，无法撤回 background 已发出的 fetch；这里至少让前台等待方立即结束。
        signal.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError")
            ),
          { once: true }
        );
      });
      return Promise.race([requestPromise, abortPromise]);
    }
    // Content Script 直接跨域能力受限，普通请求统一交给 Background 代发。
    return requestPromise;
  }

  return fn({ ...args });
};
