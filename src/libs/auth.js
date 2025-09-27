import { getMsauth, setMsauth } from "./storage";
import { kissLog } from "./log";
import { apiMsAuth } from "../apis";

const parseMSToken = (token) => {
  try {
    return JSON.parse(atob(token.split(".")[1])).exp;
  } catch (err) {
    kissLog("parseMSToken", err);
  }
  return 0;
};

/**
 * 闭包缓存token，减少对storage查询
 * @returns
 */
const _msAuth = () => {
  let tokenPromise = null;
  const EXPIRATION_MS = 1000;

  const fetchNewToken = async () => {
    try {
      const now = Date.now();

      // 1. 查询storage缓存
      const storageToken = await getMsauth();
      if (storageToken) {
        const storageExp = parseMSToken(storageToken);
        const storageExpiresAt = storageExp * 1000;
        if (storageExpiresAt > now + EXPIRATION_MS) {
          return { token: storageToken, expiresAt: storageExpiresAt };
        }
      }

      // 2. 缓存没有或失效，查询接口
      const apiToken = await apiMsAuth();
      if (!apiToken) {
        throw new Error("Failed to fetch ms token");
      }

      const apiExp = parseMSToken(apiToken);
      const apiExpiresAt = apiExp * 1000;
      await setMsauth(apiToken);
      return { token: apiToken, expiresAt: apiExpiresAt };
    } catch (error) {
      kissLog("get msauth failed", error);
      throw error;
    }
  };

  return async () => {
    // 检查是否有缓存的 Promise
    if (tokenPromise) {
      try {
        const cachedResult = await tokenPromise;
        if (cachedResult.expiresAt > Date.now() + EXPIRATION_MS) {
          return cachedResult.token;
        }
      } catch (error) {
        //
      }
    }

    tokenPromise = fetchNewToken();
    const result = await tokenPromise;
    return result.token;
  };
};

export const msAuth = _msAuth();
