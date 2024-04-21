import { isExt, isGm } from "./client";
import { sendBgMsg } from "./msg";
import { taskPool } from "./pool";
import {
  MSG_FETCH,
  MSG_GET_HTTPCACHE,
  CACHE_NAME,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT,
} from "../config";
import { isBg } from "./browser";
import { genTransReq } from "../apis/trans";
import { kissLog } from "./log";
import { blobToBase64 } from "./utils";

const TIMEOUT = 5000;

/**
 * 构造缓存 request
 * @param {*} input
 * @param {*} init
 * @returns
 */
const newCacheReq = async (input, init) => {
  let request = new Request(input, init);
  if (request.method !== "GET") {
    const body = await request.text();
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname += body;
    request = new Request(cacheUrl.toString(), { method: "GET" });
  }

  return request;
};

/**
 * 油猴脚本的请求封装
 * @param {*} input
 * @param {*} init
 * @returns
 */
export const fetchGM = async (input, { method = "GET", headers, body } = {}) =>
  new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method,
      url: input,
      headers,
      data: body,
      // withCredentials: true,
      timeout: TIMEOUT,
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
 * @param {*} param0
 * @returns
 */
export const fetchPatcher = async (input, init, transOpts, apiSetting) => {
  if (transOpts?.translator) {
    [input, init] = await genTransReq(transOpts, apiSetting);
  }

  if (!input) {
    throw new Error("url is empty");
  }

  if (isGm) {
    let info;
    if (window.KISS_GM) {
      info = await window.KISS_GM.getInfo();
    } else {
      info = GM.info;
    }

    // Tampermonkey --> .connects
    // Violentmonkey --> .connect
    const connects = info?.script?.connects || info?.script?.connect || [];
    const url = new URL(input);
    const isSafe = connects.find((item) => url.hostname.endsWith(item));

    if (isSafe) {
      const { body, headers, status, statusText } = window.KISS_GM
        ? await window.KISS_GM.fetch(input, init)
        : await fetchGM(input, init);

      return new Response(body, {
        headers: new Headers(headers),
        status,
        statusText,
      });
    }
  }

  if (AbortSignal?.timeout) {
    Object.assign(init, { signal: AbortSignal.timeout(TIMEOUT) });
  }

  return fetch(input, init);
};

/**
 * 解析 response
 * @param {*} res
 * @returns
 */
const parseResponse = async (res) => {
  if (!res) {
    return null;
  }

  const contentType = res.headers.get("Content-Type");
  if (contentType?.includes("json")) {
    return await res.json();
  } else if (contentType?.includes("audio")) {
    const blob = await res.blob();
    return await blobToBase64(blob);
  }
  return await res.text();
};

/**
 * 查询 caches
 * @param {*} input
 * @param {*} param1
 * @returns
 */
export const getHttpCache = async (input, { method, headers, body }) => {
  try {
    const req = await newCacheReq(input, { method, headers, body });
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(req);
    return parseResponse(res);
  } catch (err) {
    kissLog(err, "get cache");
  }
  return null;
};

/**
 * 插入 caches
 * @param {*} input
 * @param {*} param1
 * @param {*} res
 */
export const putHttpCache = async (input, { method, headers, body }, res) => {
  try {
    const req = await newCacheReq(input, { method, headers, body });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res);
  } catch (err) {
    kissLog(err, "put cache");
  }
};

/**
 * 处理请求
 * @param {*} param0
 * @returns
 */
export const fetchHandle = async ({
  input,
  useCache,
  transOpts,
  apiSetting,
  ...init
}) => {
  // 发送请求
  const res = await fetchPatcher(input, init, transOpts, apiSetting);
  if (!res) {
    throw new Error("Unknow error");
  } else if (!res.ok) {
    const msg = {
      url: res.url,
      status: res.status,
    };
    if (res.headers.get("Content-Type")?.includes("json")) {
      msg.response = await res.json();
    }
    throw new Error(JSON.stringify(msg));
  }

  // 插入缓存
  if (useCache) {
    await putHttpCache(input, init, res.clone());
  }

  return parseResponse(res);
};

/**
 * fetch 兼容性封装
 * @param {*} args
 * @returns
 */
export const fetchPolyfill = (args) => {
  // 插件
  if (isExt && !isBg()) {
    return sendBgMsg(MSG_FETCH, args);
  }

  // 油猴/网页/BackgroundPage
  return fetchHandle(args);
};

/**
 * getHttpCache 兼容性封装
 * @param {*} input
 * @param {*} init
 * @returns
 */
export const getHttpCachePolyfill = (input, init) => {
  // 插件
  if (isExt && !isBg()) {
    return sendBgMsg(MSG_GET_HTTPCACHE, { input, init });
  }

  // 油猴/网页/BackgroundPage
  return getHttpCache(input, init);
};

/**
 * 请求池实例
 */
export const fetchPool = taskPool(
  fetchPolyfill,
  null,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT
);

/**
 * 数据请求
 * @param {*} input
 * @param {*} param1
 * @returns
 */
export const fetchData = async (input, { useCache, usePool, ...args } = {}) => {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  // 查询缓存
  if (useCache) {
    const cache = await getHttpCachePolyfill(input, args);
    if (cache) {
      return cache;
    }
  }

  // 通过任务池发送请求
  if (usePool) {
    return fetchPool.push({ input, useCache, ...args });
  }

  // 直接请求
  return fetchPolyfill({ input, useCache, ...args });
};

/**
 * 更新 fetch pool 参数
 * @param {*} interval
 * @param {*} limit
 */
export const updateFetchPool = (interval, limit) => {
  fetchPool.update(interval, limit);
};

/**
 * 清空任务池
 */
export const clearFetchPool = () => {
  fetchPool.clear();
};
