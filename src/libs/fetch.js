/**
 * @file fetch.js
 * @description 网络请求兼容入口。对外保留历史使用的 fetchData、fetchStream、fetchPatcher 等函数名，
 * 内部只负责组合缓存、并发池、普通请求适配和流式请求适配，避免调用方感知本次分层重构。
 */

import { getFetchPool } from "./pool";
import { getHttpCachePolyfill } from "./cache";
import { createAsyncQueue } from "./stream";
import {
  fetchGM,
  fetchPatcher,
  fetchHandle,
  fnPolyfill,
  mergeAbortSignals,
} from "./request";
import { fetchStreamNative, requestStream } from "./requestStream";

export { fetchGM, fetchPatcher, fetchHandle, fnPolyfill, fetchStreamNative };

/**
 * 发起普通网络请求，并按调用方配置应用缓存与并发池。
 *
 * @param {string} input 请求 URL。
 * @param {Object} init Fetch 初始化参数。
 * @param {Object} [options={}] 请求选项。
 * @param {boolean} [options.useCache] 是否读取本地 HTTP 缓存。
 * @param {boolean} [options.usePool] 是否进入全局请求池。
 * @param {number} [options.fetchInterval] 请求池启动间隔。
 * @param {number} [options.fetchLimit] 请求池并发限制。
 * @param {AbortSignal} [options.signal] 外部取消信号，会传递到底层 fetch。
 * @returns {Promise<*>} 解析后的完整响应数据。
 */
export const fetchData = async (
  input,
  init,
  { useCache, usePool, fetchInterval, fetchLimit, ...opts } = {}
) => {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  if (useCache) {
    const resCache = await getHttpCachePolyfill(input, init);
    if (resCache) {
      return resCache;
    }
  }

  if (usePool) {
    const fetchPool = getFetchPool(fetchInterval, fetchLimit);
    return fetchPool.push(fnPolyfill, { fn: fetchHandle, input, init, opts });
  }

  return fnPolyfill({ fn: fetchHandle, input, init, opts });
};

/**
 * 发起 SSE 流式网络请求，并按调用方配置应用缓存与并发池。
 *
 * @param {string} input 请求 URL。
 * @param {Object} init Fetch 初始化参数。
 * @param {Object} [options={}] 请求选项。
 * @param {boolean} [options.useCache] 是否读取本地 HTTP 缓存。
 * @param {boolean} [options.usePool] 是否进入全局请求池。
 * @param {number} [options.fetchInterval] 请求池启动间隔。
 * @param {number} [options.fetchLimit] 请求池并发限制。
 * @param {AbortSignal} [options.signal] 外部取消信号，会传递到流式读取链路。
 * @yields {string} SSE data 字段内容。
 */
export async function* fetchStream(
  input,
  init,
  { useCache, usePool, fetchInterval, fetchLimit, ...opts } = {}
) {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  if (useCache) {
    const resCache = await getHttpCachePolyfill(input, init);
    if (resCache) {
      yield resCache;
      return;
    }
  }

  if (usePool) {
    const fetchPool = getFetchPool(fetchInterval, fetchLimit);
    const asyncQueue = createAsyncQueue();
    const streamController = new AbortController();
    const streamOpts = {
      ...opts,
      signal: mergeAbortSignals([opts.signal, streamController.signal]),
    };

    const streamPromise = fetchPool.push(async () => {
      try {
        for await (const chunk of requestStream(input, init, streamOpts)) {
          asyncQueue.push(chunk);
        }
        asyncQueue.finish();
      } catch (e) {
        asyncQueue.error(e);
      }
      return null;
    });

    try {
      yield* asyncQueue.iterate();
    } finally {
      // 消费方提前停止读取时，主动中止池内任务，避免长连接继续占用请求额度。
      streamController.abort();
      await streamPromise.catch(() => {});
    }
    return;
  }

  yield* requestStream(input, init, opts);
}
