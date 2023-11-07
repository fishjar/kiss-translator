import queryString from "query-string";
import { fetchPolyfill } from "../libs/fetch";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_CUSTOMIZE,
  URL_CACHE_TRAN,
  KV_SALT_SYNC,
  URL_BAIDU_LANGDETECT,
  OPT_LANGS_BAIDU,
  URL_TENCENT_TRANSMART,
  OPT_LANGS_TENCENT,
  OPT_LANGS_SPECIAL,
} from "../config";
import { sha256 } from "../libs/utils";

/**
 * 同步数据
 * @param {*} url
 * @param {*} key
 * @param {*} data
 * @returns
 */
export const apiSyncData = async (url, key, data) =>
  fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${await sha256(key, KV_SALT_SYNC)}`,
    },
    method: "POST",
    body: JSON.stringify(data),
  });

/**
 * 下载数据
 * @param {*} url
 * @returns
 */
export const apiFetch = (url) => fetchPolyfill(url);

/**
 * 百度语言识别
 * @param {*} text
 * @returns
 */
export const apiBaiduLangdetect = async (text) => {
  const res = await fetchPolyfill(URL_BAIDU_LANGDETECT, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      query: text,
    }),
    useCache: true,
  });

  if (res.error === 0) {
    return OPT_LANGS_BAIDU.get(res.lan) ?? res.lan;
  }

  return "";
};

/**
 * 腾讯语言识别
 * @param {*} text
 * @returns
 */
export const apiTencentLangdetect = async (text) => {
  const body = JSON.stringify({
    header: {
      fn: "text_analysis",
    },
    text,
  });

  const res = await fetchPolyfill(URL_TENCENT_TRANSMART, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body,
    useCache: true,
  });

  return OPT_LANGS_TENCENT.get(res.language) ?? res.language;
};

/**
 * 统一翻译接口
 * @param {*} param0
 * @returns
 */
export const apiTranslate = async ({
  translator,
  text,
  fromLang,
  toLang,
  apiSetting = {},
  useCache = true,
  usePool = true,
}) => {
  let trText = "";
  let isSame = false;

  if (!text) {
    return [trText, true];
  }

  const from =
    OPT_LANGS_SPECIAL[translator].get(fromLang) ??
    OPT_LANGS_SPECIAL[translator].get("auto");
  const to = OPT_LANGS_SPECIAL[translator].get(toLang);
  if (!to) {
    console.log(`[trans] target lang: ${toLang} not support`);
    return [trText, isSame];
  }

  const cacheOpts = {
    translator,
    text,
    fromLang,
    toLang,
  };

  const transOpts = {
    translator,
    text,
    from,
    to,
  };

  const res = await fetchPolyfill(
    `${URL_CACHE_TRAN}?${queryString.stringify(cacheOpts)}`,
    {
      useCache,
      usePool,
      transOpts,
      apiSetting,
    }
  );

  switch (translator) {
    case OPT_TRANS_GOOGLE:
      trText = res.sentences.map((item) => item.trans).join(" ");
      isSame = to === res.src;
      break;
    case OPT_TRANS_MICROSOFT:
      trText = res[0].translations.map((item) => item.text).join(" ");
      isSame = text === trText;
      break;
    case OPT_TRANS_DEEPL:
      trText = res.translations.map((item) => item.text).join(" ");
      isSame = to === res.translations[0].detected_source_language;
      break;
    case OPT_TRANS_DEEPLFREE:
      trText = res.result?.texts.map((item) => item.text).join(" ");
      isSame = to === res.result?.lang;
      break;
    case OPT_TRANS_DEEPLX:
      trText = res.data;
      isSame = to === res.source_lang;
      break;
    case OPT_TRANS_BAIDU:
      trText = res.trans_result?.data.map((item) => item.dst).join(" ");
      isSame = res.trans_result?.to === res.trans_result?.from;
      break;
    case OPT_TRANS_TENCENT:
      trText = res.auto_translation;
      isSame = text === trText;
      break;
    case OPT_TRANS_OPENAI:
      trText = res?.choices?.[0].message.content;
      isSame = text === trText;
      break;
    case OPT_TRANS_CLOUDFLAREAI:
      trText = res?.result?.translated_text;
      isSame = text === trText;
      break;
    case OPT_TRANS_CUSTOMIZE:
      trText = res.text;
      isSame = to === res.from;
      break;
    default:
  }

  return [trText, isSame, res];
};
