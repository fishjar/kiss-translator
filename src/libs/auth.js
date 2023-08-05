import storage from "./storage";
import { STOKEY_MSAUTH, URL_MICROSOFT_AUTH } from "../config";
import { fetchPolyfill } from "./fetch";

const parseMSToken = (token) => JSON.parse(atob(token.split(".")[1])).exp;

/**
 * 闭包缓存token，减少对storage查询
 * @returns
 */
const _msAuth = () => {
  let { token, exp } = {};

  return async () => {
    // 查询内存缓存
    const now = Date.now();
    if (token && exp * 1000 > now + 1000) {
      return [token, exp];
    }

    // 查询storage缓存
    const res = (await storage.getObj(STOKEY_MSAUTH)) || {};
    token = res.token;
    exp = res.exp;
    if (token && exp * 1000 > now + 1000) {
      return [token, exp];
    }

    // 缓存没有或失效，查询接口
    token = await fetchPolyfill(URL_MICROSOFT_AUTH);
    exp = parseMSToken(token);
    await storage.setObj(STOKEY_MSAUTH, { token, exp });
    return [token, exp];
  };
};

export const msAuth = _msAuth();
