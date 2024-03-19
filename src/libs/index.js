import { CACHE_NAME } from "../config";
import { browser } from "./browser";
import { apiBaiduLangdetect } from "../apis";
import { kissLog } from "./log";

/**
 * 清除缓存数据
 */
export const tryClearCaches = async () => {
  try {
    caches.delete(CACHE_NAME);
  } catch (err) {
    kissLog(err, "clean caches");
  }
};

/**
 * 语言识别
 * @param {*} q
 * @returns
 */
export const tryDetectLang = async (q, useRemote = false) => {
  let lang = "";

  if (useRemote) {
    try {
      lang = await apiBaiduLangdetect(q);
    } catch (err) {
      kissLog(err, "detect lang remote");
    }
  }

  if (!lang) {
    try {
      const res = await browser?.i18n?.detectLanguage(q);
      lang = res?.languages?.[0]?.language;
    } catch (err) {
      kissLog(err, "detect lang local");
    }
  }

  return lang;
};
