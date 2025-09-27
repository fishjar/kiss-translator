import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import {
  URL_CACHE_TRAN,
  URL_CACHE_DELANG,
  KV_SALT_SYNC,
  OPT_LANGS_TO_SPEC,
  OPT_LANGS_SPEC_DEFAULT,
  API_SPE_TYPES,
  DEFAULT_API_SETTING,
  OPT_TRANS_MICROSOFT,
} from "../config";
import { sha256 } from "../libs/utils";
import { kissLog } from "../libs/log";
import { handleTranslate, handleMicrosoftLangdetect } from "./trans";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import { getBatchQueue } from "../libs/batchQueue";

/**
 * 同步数据
 * @param {*} url
 * @param {*} key
 * @param {*} data
 * @returns
 */
export const apiSyncData = async (url, key, data) =>
  fetchData(url, {
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
export const apiFetch = (url) => fetchData(url);

/**
 * Microsoft token
 * @returns
 */
export const apiMsAuth = async () =>
  fetchData("https://edge.microsoft.com/translate/auth");

/**
 * Google语言识别
 * @param {*} text
 * @returns
 */
export const apiGoogleLangdetect = async (text) => {
  const params = {
    client: "gtx",
    dt: "t",
    dj: 1,
    ie: "UTF-8",
    sl: "auto",
    tl: "zh-CN",
    q: text,
  };
  const input = `https://translate.googleapis.com/translate_a/single?${queryString.stringify(params)}`;
  const init = {
    headers: {
      "Content-type": "application/json",
    },
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res?.src) {
    await putHttpCachePolyfill(input, init, res);
    return res.src;
  }

  return "";
};

/**
 * Microsoft语言识别
 * @param {*} text
 * @returns
 */
export const apiMicrosoftLangdetect = async (text) => {
  const cacheOpts = { text, detector: OPT_TRANS_MICROSOFT };
  const cacheInput = `${URL_CACHE_DELANG}?${queryString.stringify(cacheOpts)}`;
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  const key = `${URL_CACHE_DELANG}_${OPT_TRANS_MICROSOFT}`;
  const queue = getBatchQueue(key, handleMicrosoftLangdetect, {
    batchInterval: 500,
    batchSize: 20,
    batchLength: 100000,
  });
  const lang = await queue.addTask(text);

  if (lang) {
    putHttpCachePolyfill(cacheInput, null, lang);
    return lang;
  }

  return "";
};

/**
 * 百度语言识别
 * @param {*} text
 * @returns
 */
export const apiBaiduLangdetect = async (text) => {
  const input = "https://fanyi.baidu.com/langdetect";
  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      query: text,
    }),
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res?.error === 0) {
    await putHttpCachePolyfill(input, init, res);
    return res.lan;
  }

  return "";
};

/**
 * 百度翻译建议
 * @param {*} text
 * @returns
 */
export const apiBaiduSuggest = async (text) => {
  const input = "https://fanyi.baidu.com/sug";
  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      kw: text,
    }),
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res?.errno === 0) {
    await putHttpCachePolyfill(input, init, res);
    return res.data;
  }

  return [];
};

/**
 * 百度语音
 * @param {*} text
 * @param {*} lan
 * @param {*} spd
 * @returns
 */
export const apiBaiduTTS = (text, lan = "uk", spd = 3) => {
  const input = `https://fanyi.baidu.com/gettts?${queryString.stringify({ lan, text, spd })}`;
  return fetchData(input);
};

/**
 * 腾讯语言识别
 * @param {*} text
 * @returns
 */
export const apiTencentLangdetect = async (text) => {
  const input = "https://transmart.qq.com/api/imt";
  const body = JSON.stringify({
    header: {
      fn: "text_analysis",
      client_key:
        "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487",
    },
    text,
  });
  const init = {
    headers: {
      "Content-type": "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
      referer: "https://transmart.qq.com/zh-CN/index",
    },
    method: "POST",
    body,
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res?.language) {
    await putHttpCachePolyfill(input, init, res);
    return res.language;
  }

  return "";
};

/**
 * 统一翻译接口
 * @param {*} param0
 * @returns
 */
export const apiTranslate = async ({
  text,
  fromLang = "auto",
  toLang,
  apiSetting = DEFAULT_API_SETTING,
  docInfo = {},
  useCache = true,
  usePool = true,
}) => {
  if (!text) {
    return ["", false];
  }

  const { apiType, apiSlug, useBatchFetch } = apiSetting;
  const langMap = OPT_LANGS_TO_SPEC[apiType] || OPT_LANGS_SPEC_DEFAULT;
  const from = langMap.get(fromLang);
  const to = langMap.get(toLang);
  if (!to) {
    kissLog(`target lang: ${toLang} not support`);
    return ["", false];
  }

  // todo: 优化缓存失效因素
  const [v1, v2] = process.env.REACT_APP_VERSION.split(".");
  const cacheOpts = {
    apiSlug,
    text,
    fromLang,
    toLang,
    version: [v1, v2].join("."),
  };
  const cacheInput = `${URL_CACHE_TRAN}?${queryString.stringify(cacheOpts)}`;

  // 查询缓存数据
  if (useCache) {
    const cache = (await getHttpCachePolyfill(cacheInput)) || {};
    if (cache.trText) {
      return [cache.trText, cache.isSame];
    }
  }

  // 请求接口数据
  let trText = "";
  let srLang = "";
  if (useBatchFetch && API_SPE_TYPES.batch.has(apiType)) {
    const { apiSlug, batchInterval, batchSize, batchLength } = apiSetting;
    const key = `${apiSlug}_${fromLang}_${toLang}`;
    const queue = getBatchQueue(key, handleTranslate, {
      from,
      to,
      fromLang,
      toLang,
      langMap,
      docInfo,
      apiSetting,
      usePool,
      batchInterval,
      batchSize,
      batchLength,
    });
    const tranlation = await queue.addTask(text);
    if (Array.isArray(tranlation)) {
      [trText, srLang = ""] = tranlation;
    } else if (typeof tranlation === "string") {
      trText = tranlation;
    }
  } else {
    const translations = await handleTranslate([text], {
      from,
      to,
      fromLang,
      toLang,
      langMap,
      docInfo,
      apiSetting,
      usePool,
    });
    if (Array.isArray(translations)) {
      if (Array.isArray(translations[0])) {
        [trText, srLang = ""] = translations[0];
      } else {
        [trText, srLang = ""] = translations;
      }
    }
  }

  const isSame = fromLang !== "auto" && srLang === to;

  // 插入缓存
  if (useCache && trText) {
    putHttpCachePolyfill(cacheInput, null, { trText, isSame, srLang });
  }

  return [trText, isSame];
};
