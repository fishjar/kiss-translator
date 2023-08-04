import { browser } from "./browser";
import { sendMsg } from "./msg";
import {
  MSG_FETCH,
  CACHE_NAME,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
} from "../config";

/**
 * request 改造，因缓存必须是GET方法
 * @param {*} request
 * @returns
 */
const newCacheReq = async (request, translator) => {
  if (translator === OPT_TRANS_MICROSOFT) {
    request.headers.delete("Authorization");
  } else if (translator === OPT_TRANS_OPENAI) {
    request.headers.delete("Authorization");
    request.headers.delete("api-key");
  }

  if (request.method !== "GET") {
    const body = await request.text();
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname += body;
    request = new Request(cacheUrl.toString(), { method: "GET" });
  }

  return request;
};

/**
 * 兼容性封装
 * @param {*} input
 * @param {*} init
 * @param {*} opts
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
  return await fetch(input, init);
};

/**
 * 请求数据
 * @param {*} input
 * @param {*} init
 * @param {*} opts
 * @returns
 */
export const fetchData = async (input, init, { useCache, translator } = {}) => {
  const cacheReq = await newCacheReq(new Request(input, init), translator);
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
    res = await fetchPolyfill(input, init);
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
