import { CACHE_NAME } from "../config";
import { browser } from "./browser";

/**
 * 清除缓存数据
 */
export const tryClearCaches = async () => {
  try {
    caches.delete(CACHE_NAME);
  } catch (err) {
    console.log("[clean caches]", err.message);
  }
};

/**
 * 本地语言识别
 * @param {*} q
 * @returns
 */
export const detectLang = async (q) => {
  try {
    const res = await browser?.i18n?.detectLanguage(q);
    return res?.languages?.[0]?.language;
  } catch (err) {
    console.log("[detect lang]", err);
  }
};
