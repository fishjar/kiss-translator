import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_LANGS_TO_CODE,
  OPT_LANGS_MAP,
  OPT_TRANS_BUILTINAI,
  OPT_LANGDETECTOR_MAP,
} from "../config";
import { browser } from "./browser";
import {
  apiGoogleLangdetect,
  apiMicrosoftLangdetect,
  apiBaiduLangdetect,
  apiTencentLangdetect,
  apiBuiltinAIDetect,
} from "../apis";
import { kissLog } from "./log";

const langdetectFns = {
  [OPT_TRANS_GOOGLE]: apiGoogleLangdetect,
  [OPT_TRANS_MICROSOFT]: apiMicrosoftLangdetect,
  [OPT_TRANS_BAIDU]: apiBaiduLangdetect,
  [OPT_TRANS_TENCENT]: apiTencentLangdetect,
  [OPT_TRANS_BUILTINAI]: apiBuiltinAIDetect,
};

/**
 * 语言识别
 * @param {*} text
 * @returns
 */
export const tryDetectLang = async (text, langDetector = "-") => {
  let deLang = "";

  // 内置AI/远程识别
  if (OPT_LANGDETECTOR_MAP.has(langDetector)) {
    try {
      const lang = await langdetectFns[langDetector](text);
      if (lang) {
        deLang = OPT_LANGS_TO_CODE[langDetector].get(lang) || "";
      }
    } catch (err) {
      kissLog("detect lang remote", err);
    }
  }

  // 本地识别
  if (!deLang) {
    try {
      const res = await browser?.i18n?.detectLanguage(text);
      const lang = res?.languages?.[0]?.language;
      if (lang && OPT_LANGS_MAP.has(lang)) {
        deLang = lang;
      } else if (lang?.startsWith("zh")) {
        deLang = "zh-CN";
      }
    } catch (err) {
      kissLog("detect lang local", err);
    }
  }

  return deLang;
};
