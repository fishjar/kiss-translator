/**
 * @file auth.js
 * @description 授权与凭证管理模块。专门处理微软 Edge 翻译接口等外部服务的授权 Token (JWT) 的解析、本地存储缓存与 Promise 级单例防抖获取逻辑。
 */

import { getMsauth, setMsauth } from "./storage";
import { kissLog } from "./log";
import { apiMsAuth } from "../apis";

/**
 * 解析微软翻译 JWT 格式 Token 的过期时间戳 (exp)
 * @param {string} token JWT 字符串
 * @returns {number} 过期秒级时间戳，解析失败返回 0
 */
const parseMSToken = (token) => {
  try {
    return JSON.parse(atob(token.split(".")[1])).exp;
  } catch (err) {
    kissLog("parseMSToken", err);
  }
  return 0;
};

/**
 * 闭包缓存 Token 异步方法，防止翻译大量段落时高并发请求重复拉取凭证
 * @returns {function(): Promise<string>} 异步获取可用 Token 的函数
 */
const _msAuth = () => {
  let tokenPromise = null;
  const EXPIRATION_MS = 1000; // 过期容差缓冲区 (1秒)

  // 异步获取最新 Token 的内部执行过程
  const fetchNewToken = async () => {
    try {
      const now = Date.now();

      // 1. 优先查询本地 storage 中的缓存
      const storageToken = await getMsauth();
      if (storageToken) {
        const storageExp = parseMSToken(storageToken);
        const storageExpiresAt = storageExp * 1000;
        // 若本地缓存尚未过期（且比缓冲区远），直接复用之
        if (storageExpiresAt > now + EXPIRATION_MS) {
          return { token: storageToken, expiresAt: storageExpiresAt };
        }
      }

      // 2. 本地无缓存或已过期，则调用远程接口获取新凭证
      const apiToken = await apiMsAuth();
      if (!apiToken) {
        throw new Error("Failed to fetch ms token");
      }

      const apiExp = parseMSToken(apiToken);
      const apiExpiresAt = apiExp * 1000;
      await setMsauth(apiToken); // 缓存到本地 storage
      return { token: apiToken, expiresAt: apiExpiresAt };
    } catch (error) {
      kissLog("get msauth failed", error);
      throw error;
    }
  };

  // REVIEW:
  // 当缓存的 `tokenPromise` 被 rejected (比如网络突然断开时) 后，
  // 第 55-63 行的 catch 虽然捕获了错误，但并没有把 `tokenPromise` 重新设为 `null`。
  // 这会导致在下一次调用此方法时，程序依然试图去 await 这个已经被 reject 的 Promise，而直接抛出异常，
  // 导致短期内无法重试。为了提高健壮性，若 `await tokenPromise` 异常，应主动执行 `tokenPromise = null` 清理无效的 Promise 缓存。
  return async () => {
    // 检查当前是否有正在执行中或已完成的 Promise 缓存
    if (tokenPromise) {
      try {
        const cachedResult = await tokenPromise;
        // 如果未过期，直接返回已解析出来的有效 Token
        if (cachedResult.expiresAt > Date.now() + EXPIRATION_MS) {
          return cachedResult.token;
        }
      } catch (error) {
        // 静默异常，随后落入下方逻辑重新发起请求
      }
    }

    tokenPromise = fetchNewToken();
    const result = await tokenPromise;
    return result.token;
  };
};

// 导出微软翻译的 Token 鉴权函数单例
export const msAuth = _msAuth();
