import {
  CACHE_NAME,
  DEFAULT_CACHE_TIMEOUT,
  MSG_CLEAR_CACHES,
  MSG_GET_HTTPCACHE,
  MSG_PUT_HTTPCACHE,
} from "../config";
import { kissLog } from "./log";
import { isExt } from "./client";
import { isBg } from "./browser";
import { sendBgMsg } from "./msg";
import { blobToBase64 } from "./utils";

/**
 * 清除缓存数据
 */
export const tryClearCaches = async () => {
  try {
    if (isExt && !isBg()) {
      await sendBgMsg(MSG_CLEAR_CACHES);
    } else {
      await caches.delete(CACHE_NAME);
    }
  } catch (err) {
    kissLog("clean caches", err);
  }
};

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
export const getHttpCache = async ({ input, init, expect }) => {
  try {
    const request = await newCacheReq(input, init);
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(request);
    if (response) {
      const res = await parseResponse(response, expect);
      return res;
    }
  } catch (err) {
    kissLog("get cache", err);
  }
  return null;
};

/**
 * 插入 caches
 * @param {*} input
 * @param {*} init
 * @param {*} data
 */
export const putHttpCache = async ({
  input,
  init,
  data,
  maxAge = DEFAULT_CACHE_TIMEOUT, // todo: 从设置里面读取最大缓存时间
}) => {
  try {
    const req = await newCacheReq(input, init);
    const cache = await caches.open(CACHE_NAME);
    const res = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${maxAge}`,
      },
    });
    // res.headers.set("Cache-Control", `max-age=${maxAge}`);
    await cache.put(req, res);
  } catch (err) {
    kissLog("put cache", err);
  }
};

/**
 * 解析 response
 * @param {*} res
 * @returns
 */
export const parseResponse = async (res, expect = null) => {
  if (!res) {
    throw new Error("Response object does not exist");
  }

  if (!res.ok) {
    const msg = {
      url: res.url,
      status: res.status,
      statusText: res.statusText,
    };

    try {
      const errorText = await res.clone().text();
      try {
        msg.response = JSON.parse(errorText);
      } catch {
        msg.response = errorText;
      }
    } catch (e) {
      msg.response = "Unable to read error body";
    }

    throw new Error(JSON.stringify(msg));
  }

  const contentType = res.headers.get("Content-Type") || "";
  if (expect === "blob") return res.blob();
  if (expect === "text") return res.text();
  if (expect === "json") return res.json();
  if (
    expect === "audio" ||
    contentType.includes("audio") ||
    contentType.includes("image") ||
    contentType.includes("video")
  ) {
    const blob = await res.blob();
    return blobToBase64(blob);
  }

  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
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
  return getHttpCache({ input, init });
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
  return putHttpCache({ input, init, data });
};
