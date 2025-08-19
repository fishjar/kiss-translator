import {
  CACHE_NAME,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
} from "../config";
import { browser } from "./browser";
import {
  apiGoogleLangdetect,
  apiMicrosoftLangdetect,
  apiBaiduLangdetect,
  apiTencentLangdetect,
} from "../apis";
import { kissLog } from "./log";

const langdetectMap = {
  [OPT_TRANS_GOOGLE]: apiGoogleLangdetect,
  [OPT_TRANS_MICROSOFT]: apiMicrosoftLangdetect,
  [OPT_TRANS_BAIDU]: apiBaiduLangdetect,
  [OPT_TRANS_TENCENT]: apiTencentLangdetect,
};

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
export const tryDetectLang = async (
  q,
  useRemote = false,
  langDetector = OPT_TRANS_MICROSOFT
) => {
  let lang = "";

  if (useRemote) {
    try {
      lang = await langdetectMap[langDetector](q);
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
