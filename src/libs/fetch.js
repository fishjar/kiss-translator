import { isExt, isGm } from "./client";
import { sendBgMsg } from "./msg";
import { getSettingWithDefault } from "./storage";
import { MSG_FETCH, DEFAULT_HTTP_TIMEOUT } from "../config";
import { isBg } from "./browser";
import { kissLog } from "./log";
import { getFetchPool } from "./pool";
import { getHttpCachePolyfill, parseResponse } from "./cache";

/**
 * 油猴脚本的请求封装
 * @param {*} input
 * @param {*} init
 * @returns
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
        responseHeaders.split("\n").forEach((line) => {
          const [name, value] = line.split(":").map((item) => item.trim());
          if (name && value) {
            headers[name] = value;
          }
        });
        resolve({
          body: response,
          headers,
          status,
          statusText,
        });
      },
      onerror: reject,
    });
  });

/**
 * 发起请求
 * @param {*} input
 * @param {*} init
 * @param {*} opts
 * @returns
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

  if (AbortSignal?.timeout && !init.signal) {
    Object.assign(init, { signal: AbortSignal.timeout(timeout) });
  }

  return fetch(input, init);
};

/**
 * 处理请求
 * @param {*} param0
 * @returns
 */
export const fetchHandle = async ({ input, init, opts }) => {
  const res = await fetchPatcher(input, init, opts);
  return parseResponse(res);
};

/**
 * fetch 兼容性封装
 * @param {*} args
 * @returns
 */
export const fnPolyfill = ({ fn, msg = MSG_FETCH, ...args }) => {
  // 插件
  if (isExt && !isBg()) {
    return sendBgMsg(msg, { ...args });
  }

  // 油猴/网页/BackgroundPage
  return fn({ ...args });
};

/**
 * 数据请求
 * @param {*} input
 * @param {*} init
 * @param {*} param1
 * @returns
 */
export const fetchData = async (
  input,
  init,
  { useCache, usePool, fetchInterval, fetchLimit, ...opts } = {}
) => {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  // 使用缓存数据
  if (useCache) {
    const resCache = await getHttpCachePolyfill(input, init);
    if (resCache) {
      return resCache;
    }
  }

  // 通过任务池发送请求
  if (usePool) {
    const fetchPool = getFetchPool(fetchInterval, fetchLimit);
    return fetchPool.push(fnPolyfill, { fn: fetchHandle, input, init, opts });
  }

  // 直接请求
  return fnPolyfill({ fn: fetchHandle, input, init, opts });
};
