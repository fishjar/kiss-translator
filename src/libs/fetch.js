import browser from "./browser";
import { sendMsg } from "./msg";
import {
  MSG_FETCH,
  DEFAULT_FETCH_LIMIT,
  DEFAULT_FETCH_INTERVAL,
  CACHE_NAME,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
} from "../config";
import { msAuth } from "./auth";
import { getSetting } from ".";

/**
 * request 改造，因缓存必须是GET方法
 * @param {*} request
 * @returns
 */
const newCacheReq = async (request) => {
  if (request.method === "GET") {
    return request;
  }

  const body = await request.clone().text();
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname += body;

  return new Request(cacheUrl.toString(), { method: "GET" });
};

/**
 * request 改造，根据不同翻译服务
 * @param {*} request
 * @returns
 */
const newReq = async (request) => {
  const translator = request.headers.get("X-Translator");
  if (translator === OPT_TRANS_MICROSOFT) {
    const [token] = await msAuth();
    request.headers.set("Authorization", `Bearer ${token}`);
  } else if (translator === OPT_TRANS_OPENAI) {
    const { openaiKey } = await getSetting();
    request.headers.set("Authorization", `Bearer ${openaiKey}`); // OpenAI
    request.headers.set("api-key", openaiKey); // Azure OpenAI
  }
  request.headers.delete("X-Translator");
  return request;
};

/**
 * 请求池
 * @param {*} l
 * @param {*} t
 * @returns
 */
const _fetchPool = (l = 1, t = 1000) => {
  let limitCount = l; // 限制并发数量
  const intervalTime = t; // 请求间隔时间
  const pool = []; // 请求池
  const maxRetry = 2; // 最大重试次数
  let currentCount = 0; // 当前请求数量

  setInterval(async () => {
    const count = limitCount - currentCount;

    if (pool.length === 0 || count <= 0) {
      return;
    }

    for (let i = 0; i < count; i++) {
      const item = pool.shift();
      if (item) {
        const { request, resolve, reject, retry } = item;
        currentCount++;
        try {
          const req = await request();
          const res = await fetch(req);
          resolve(res);
        } catch (err) {
          if (retry < maxRetry) {
            pool.push({ request, resolve, reject, retry: retry + 1 });
          } else {
            reject(err);
          }
        } finally {
          currentCount--;
        }
      }
    }
  }, intervalTime);

  return [
    async (req, usePool) => {
      const request = () => newReq(req.clone());
      if (usePool) {
        return new Promise((resolve, reject) => {
          pool.push({ request, resolve, reject, retry: 0 });
        });
      } else {
        return fetch(await request());
      }
    },
    (limit = -1) => {
      if (limit >= 1 && limit <= 10 && limitCount !== limit) {
        limitCount = limit;
      }
    },
  ];
};

export const [_fetch, setFetchLimit] = _fetchPool(
  DEFAULT_FETCH_LIMIT,
  DEFAULT_FETCH_INTERVAL
);

/**
 * 调用fetch接口
 * @param {*} input
 * @param {*} init
 * @returns
 */
export const fetchData = async (
  input,
  { useCache = false, usePool = false, ...init } = {}
) => {
  const req = new Request(input, init);
  const cacheReq = await newCacheReq(req);
  const cache = await caches.open(CACHE_NAME);
  let res;

  // 查询缓存
  if (useCache) {
    try {
      res = await cache.match(cacheReq);
    } catch (err) {
      console.log("[cache match]", err);
    }
  }

  // 发送请求
  if (!res) {
    res = await _fetch(req, usePool);
  }

  if (!res?.ok) {
    throw new Error(`response: ${res.statusText}`);
  }

  // 插入缓存
  if (useCache) {
    try {
      await cache.put(cacheReq, res.clone());
    } catch (err) {
      console.log("[cache put]", err);
    }
  }

  const contentType = res.headers.get("Content-Type");
  if (contentType?.includes("json")) {
    return await res.json();
  }
  return await res.text();
};

/**
 * 兼容性封装
 * @param {*} input
 * @param {*} init
 * @returns
 */
export const fetchPolyfill = async (input, init) => {
  if (browser?.runtime) {
    // 插件调用
    const res = await sendMsg(MSG_FETCH, { input, init });
    if (res.error) {
      throw new Error(res.error);
    }
    return res.data;
  }

  // 网页直接调用
  return await fetchData(input, init);
};
