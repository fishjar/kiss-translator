import {
  CACHE_NAME,
  DEFAULT_CACHE_TIMEOUT,
  MSG_GET_HTTPCACHE,
  MSG_PUT_HTTPCACHE,
} from "../config";
import { kissLog } from "./log";
import { isExt } from "./client";
import { isBg } from "./browser";
import { sendBgMsg } from "./msg";
import { blobToBase64 } from "./utils";

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
 * 查询 caches
 * @param {*} input
 * @param {*} init
 * @returns
 */
export const getHttpCache = async (input, init) => {
  try {
    const req = await newCacheReq(input, init);
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(req);
    if (res) {
      return await parseResponse(res);
    }
  } catch (err) {
    kissLog(err, "get cache");
  }
  return null;
};

/**
 * 插入 caches
 * @param {*} input
 * @param {*} init
 * @param {*} data
 */
export const putHttpCache = async (input, init, data) => {
  try {
    const req = await newCacheReq(input, init);
    const cache = await caches.open(CACHE_NAME);
    const res = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${DEFAULT_CACHE_TIMEOUT}`,
      },
    });
    // res.headers.set("Cache-Control", `max-age=${DEFAULT_CACHE_TIMEOUT}`);
    await cache.put(req, res);
  } catch (err) {
    kissLog(err, "put cache");
  }
};

/**
 * 解析 response
 * @param {*} res
 * @returns
 */
export const parseResponse = async (res) => {
  if (!res) {
    throw new Error("Response object does not exist");
  }

  if (!res.ok) {
    const msg = {
      url: res.url,
      status: res.status,
    };
    if (res.headers.get("Content-Type")?.includes("json")) {
      msg.response = await res.json();
    }
    throw new Error(JSON.stringify(msg));
  }

  const contentType = res.headers.get("Content-Type");
  if (contentType?.includes("json")) {
    return res.json();
  } else if (contentType?.includes("audio")) {
    const blob = await res.blob();
    return blobToBase64(blob);
  }
  return res.text();
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
 * putHttpCache 兼容性封装
 * @param {*} input
 * @param {*} init
 * @param {*} data
 * @returns
 */
export const putHttpCachePolyfill = (input, init, data) => {
  // 插件
  if (isExt && !isBg()) {
    return sendBgMsg(MSG_PUT_HTTPCACHE, { input, init, data });
  }

  // 油猴/网页/BackgroundPage
  return putHttpCache(input, init, data);
};
