import { isExt, isGm } from "./client";
import { sendBgMsg } from "./msg";
import { taskPool } from "./pool";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  MSG_FETCH_CLEAR,
  CACHE_NAME,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT,
} from "../config";
import { isBg } from "./browser";
import { newCacheReq, newTransReq } from "./req";

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
      onload: ({ response, responseHeaders, status, statusText, ...opts }) => {
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
export const fetchApi = async ({ input, init, transOpts, apiSetting }) => {
  if (transOpts?.translator) {
    [input, init] = await newTransReq(transOpts, apiSetting);
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

  return fetch(input, init);
};

/**
 * 请求池实例
 */
export const fetchPool = taskPool(
  fetchApi,
  null,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT
);

/**
 * 请求数据统一接口
 * @param {*} input
 * @param {*} opts
 * @returns
 */
export const fetchData = async (
  input,
  { useCache, usePool, transOpts, apiSetting, ...init } = {}
) => {
  const cacheReq = await newCacheReq(input, init);
  let res;

  // 查询缓存
  if (useCache) {
    try {
      const cache = await caches.open(CACHE_NAME);
      res = await cache.match(cacheReq);
    } catch (err) {
      console.log("[cache match]", err.message);
    }
  }

  if (!res) {
    // 发送请求
    if (usePool) {
      res = await fetchPool.push({ input, init, transOpts, apiSetting });
    } else {
      res = await fetchApi({ input, init, transOpts, apiSetting });
    }

    if (!res?.ok) {
      const cause = {
        status: res.status,
      };
      if (res.headers.get("Content-Type")?.includes("json")) {
        cause.body = await res.json();
      }
      throw new Error(`response: [${res.status}] ${res.statusText}`, { cause });
    }

    // 插入缓存
    if (useCache) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheReq, res.clone());
      } catch (err) {
        console.log("[cache put]", err.message);
      }
    }
  }

  const contentType = res.headers.get("Content-Type");
  if (contentType?.includes("json")) {
    return await res.json();
  }
  return await res.text();
};

/**
 * fetch 兼容性封装
 * @param {*} input
 * @param {*} opts
 * @returns
 */
export const fetchPolyfill = async (input, opts) => {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  // 插件
  if (isExt && !isBg()) {
    const res = await sendBgMsg(MSG_FETCH, { input, opts });
    if (res.error) {
      throw new Error(res.error, { cause: res.cause });
    }
    return res.data;
  }

  // 油猴/网页/BackgroundPage
  return await fetchData(input, opts);
};

/**
 * 更新 fetch pool 参数
 * @param {*} interval
 * @param {*} limit
 */
export const updateFetchPool = async (interval, limit) => {
  if (isExt) {
    const res = await sendBgMsg(MSG_FETCH_LIMIT, { interval, limit });
    if (res.error) {
      throw new Error(res.error);
    }
  } else {
    fetchPool.update(interval, limit);
  }
};

/**
 * 清空任务池
 */
export const clearFetchPool = async () => {
  if (isExt) {
    const res = await sendBgMsg(MSG_FETCH_CLEAR);
    if (res.error) {
      throw new Error(res.error);
    }
  } else {
    fetchPool.clear();
  }
};
