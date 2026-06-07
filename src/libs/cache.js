/**
 * @file cache.js
 * @description 本地缓存管理模块。使用浏览器的 CacheStorage 缓存翻译接口响应结果，提供高效的 POST 请求虚拟化 GET 转换技术，以及 Content 到 Background 的中转 Polyfill。
 */

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
import { parseResponse } from "./response";

/**
 * 清除翻译网络请求的本地缓存
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
 * 构造缓存所用的 Request 对象。
 * 由于浏览器原生 CacheStorage (caches) 仅支持拦截/匹配 GET 类型的网络请求，而网页翻译接口大多使用 POST 方法。
 * 本函数通过将 POST 请求的 Body (包含待翻译原文的 JSON 字符串) 拼接在 URL 路径末尾，
 * 并将方法重置为 GET，从而巧妙实现了对 POST 翻译请求的本地缓存与命中。
 *
 * REVIEW:
 * 该转换方案在处理段落切分翻译（通常文本较短，限制在数千字符内）时工作极其良好，是一个非常有想象力的方案。
 * 但需注意：当单次发送的原文极长时，拼接了 Body 后的 URL 长度可能会超出浏览器或 Web 服务器对 URL 长度的限制（如 IE/Chrome 的 2083 字符上限），
 * 导致 Request 对象初始化抛错或匹配失效。
 * 后期若要支持不限制长度的自定义接口，建议将 Body 字符串进行 MD5 或 SHA-256 散列哈希处理，把哈希值拼在 URL 后面作为缓存 Key，
 * 这既能缩短 URL 规避限制，又能保障缓存安全性。
 * @param {string} input
 * @param {Object} init
 * @returns {Promise<Request>} 虚拟转换后的 GET 缓存 Request 对象
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
 * 查询本地 CacheStorage 中是否缓存了该请求的翻译结果
 * @param {string} input
 * @param {Object} init
 * @param {string} [expect] 预期的解析格式 (如 json/text 等)
 * @returns {Promise<*>} 缓存的数据，若无缓存返回 null
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
 * 将成功请求回来的翻译数据及语种缓存写入 CacheStorage 中
 * @param {string} input
 * @param {Object} init
 * @param {Object} data 待缓存的数据
 * @param {number} [maxAge=DEFAULT_CACHE_TIMEOUT] 缓存有效期 (秒)
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
 * getHttpCache 的跨环境包装层，若是 Content Script 会交由 Background 查询
 * @param {string} input
 * @param {Object} init
 * @returns {Promise<*>}
 */
export const getHttpCachePolyfill = (input, init) => {
  // 插件前端：发送消息查询
  if (isExt && !isBg()) {
    return sendBgMsg(msgGetCacheName(), { input, init });
  }

  // 油猴/网页/后台端点：直接本地查询
  return getHttpCache({ input, init });
};

/**
 * 辅助获取消息键名函数，防止常量导入死锁
 */
function msgGetCacheName() {
  return MSG_GET_HTTPCACHE;
}

/**
 * putHttpCache 的跨环境包装层，若是 Content Script 会交由 Background 写入
 * @param {string} input
 * @param {Object} init
 * @param {Object} data
 * @returns {Promise<void>}
 */
export const putHttpCachePolyfill = (input, init, data) => {
  // 插件前端：发送消息写入
  if (isExt && !isBg()) {
    return sendBgMsg(MSG_PUT_HTTPCACHE, { input, init, data });
  }

  // 油猴/网页/后台端点：直接本地写入
  return putHttpCache({ input, init, data });
};
