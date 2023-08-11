import { isExt, isGm } from "./browser";
import { sendMsg } from "./msg";
import { taskPool } from "./pool";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  MSG_FETCH_CLEAR,
  CACHE_NAME,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT,
} from "../config";
import { msAuth } from "./auth";

/**
 * 油猴脚本的请求封装
 * @param {*} input
 * @param {*} init
 * @returns
 */
const fetchGM = async (input, { method = "GET", headers, body } = {}) =>
  new Promise((resolve, reject) => {
    try {
      (window.GM_xmlhttpRequest || window.GM.xmlhttpRequest)({
        method,
        url: input,
        headers,
        data: body,
        onload: (response) => {
          if (response.status === 200) {
            const headers = new Headers();
            response.responseHeaders.split("\n").forEach((line) => {
              let [name, value] = line.split(":").map((item) => item.trim());
              if (name && value) {
                headers.append(name, value);
              }
            });
            resolve(new Response(response.response, { headers }));
          } else {
            reject(new Error(`[${response.status}] ${response.responseText}`));
          }
        },
        onerror: reject,
      });
    } catch (error) {
      reject(error);
    }
  });

/**
 * 构造缓存 request
 * @param {*} request
 * @returns
 */
const newCacheReq = async (request) => {
  if (request.method !== "GET") {
    const body = await request.text();
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname += body;
    request = new Request(cacheUrl.toString(), { method: "GET" });
  }

  return request;
};

/**
 * 发起请求
 * @param {*} param0
 * @returns
 */
const fetchApi = async ({ input, init, useUnsafe, translator, token }) => {
  if (translator === OPT_TRANS_MICROSOFT) {
    init.headers["Authorization"] = `Bearer ${token}`;
  } else if (translator === OPT_TRANS_OPENAI) {
    init.headers["Authorization"] = `Bearer ${token}`; // // OpenAI
    init.headers["api-key"] = token; // Azure OpenAI
  }

  if (isGm && !useUnsafe) {
    return fetchGM(input, init);
  }
  return fetch(input, init);
};

/**
 * 请求池实例
 */
export const fetchPool = taskPool(
  fetchApi,
  async ({ translator }) => {
    if (translator === OPT_TRANS_MICROSOFT) {
      const [token] = await msAuth();
      return { token };
    }
    return {};
  },
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT
);

/**
 * 请求数据统一接口
 * @param {*} input
 * @param {*} init
 * @param {*} opts
 * @returns
 */
export const fetchData = async (
  input,
  init,
  { useCache, usePool, translator, useUnsafe, token } = {}
) => {
  const cacheReq = await newCacheReq(new Request(input, init));
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

  if (!res) {
    // 发送请求
    if (usePool) {
      res = await fetchPool.push({ input, init, useUnsafe, translator, token });
    } else {
      res = await fetchApi({ input, init, useUnsafe, translator, token });
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
 * @param {*} init
 * @param {*} opts
 * @returns
 */
export const fetchPolyfill = async (input, init, opts) => {
  // 插件
  if (isExt) {
    const res = await sendMsg(MSG_FETCH, { input, init, opts });
    if (res.error) {
      throw new Error(res.error);
    }
    return res.data;
  }

  // 油猴/网页
  return await fetchData(input, init, opts);
};

/**
 * 更新 fetch pool 参数
 * @param {*} interval
 * @param {*} limit
 */
export const fetchUpdate = async (interval, limit) => {
  if (isExt) {
    const res = await sendMsg(MSG_FETCH_LIMIT, { interval, limit });
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
export const fetchClear = async () => {
  if (isExt) {
    const res = await sendMsg(MSG_FETCH_CLEAR);
    if (res.error) {
      throw new Error(res.error);
    }
  } else {
    fetchPool.clear();
  }
};
