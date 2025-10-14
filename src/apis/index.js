import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import {
  URL_CACHE_TRAN,
  URL_CACHE_DELANG,
  URL_CACHE_BINGDICT,
  KV_SALT_SYNC,
  OPT_LANGS_TO_SPEC,
  OPT_LANGS_SPEC_DEFAULT,
  API_SPE_TYPES,
  DEFAULT_API_SETTING,
  OPT_TRANS_MICROSOFT,
  MSG_BUILTINAI_DETECT,
  MSG_BUILTINAI_TRANSLATE,
  OPT_TRANS_BUILTINAI,
  URL_CACHE_SUBTITLE,
} from "../config";
import { sha256, withTimeout } from "../libs/utils";
import { kissLog } from "../libs/log";
import {
  handleTranslate,
  handleSubtitle,
  handleMicrosoftLangdetect,
} from "./trans";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import { getBatchQueue } from "../libs/batchQueue";
import { isBuiltinAIAvailable } from "../libs/browser";
import { chromeDetect, chromeTranslate } from "../libs/builtinAI";
import { fnPolyfill } from "../libs/fetch";
import { getFetchPool } from "../libs/pool";

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
 * Microsoft词典
 * @param {*} text
 * @returns
 */
export const apiMicrosoftDict = async (text) => {
  const cacheOpts = { text };
  const cacheInput = `${URL_CACHE_BINGDICT}?${queryString.stringify(cacheOpts)}`;
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  const host = "https://www.bing.com";
  const url = `${host}/dict/search?q=${text}&FORM=BDVSP6&cc=cn`;
  const str = await fetchData(
    url,
    { credentials: "include" },
    { useCache: false }
  );
  if (!str) {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(str, "text/html");

  const word = doc.querySelector("#headword > h1")?.textContent.trim();
  if (!word) {
    return null;
  }

  const trs = [];
  doc.querySelectorAll("div.qdef > ul > li").forEach(($li) => {
    const pos = $li.querySelector(".pos")?.textContent?.trim();
    const def = $li.querySelector(".def")?.textContent?.trim();
    trs.push({ pos, def });
  });

  const aus = [];
  const $audioUK = doc.querySelector("#bigaud_uk");
  const $audioUS = doc.querySelector("#bigaud_us");
  if ($audioUK) {
    const audioUK = host + $audioUK?.dataset?.mp3link;
    const $phoneticUK = $audioUK.parentElement?.previousElementSibling;
    const phoneticUK = $phoneticUK?.textContent?.trim();
    aus.push({ key: "UK", audio: audioUK, phonetic: phoneticUK });
  }
  if ($audioUS) {
    const audioUS = host + $audioUS?.dataset?.mp3link;
    const $phoneticUS = $audioUS.parentElement?.previousElementSibling;
    const phoneticUS = $phoneticUS?.textContent?.trim();
    aus.push({ key: "US", audio: audioUS, phonetic: phoneticUS });
  }

  const res = { word, trs, aus };
  putHttpCachePolyfill(cacheInput, null, res);

  return res;
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
 * 有道翻译建议
 * @param {*} text
 * @returns
 */
export const apiYoudaoSuggest = async (text) => {
  const params = {
    num: 5,
    ver: 3.0,
    doctype: "json",
    cache: false,
    le: "en",
    q: text,
  };
  const input = `https://dict.youdao.com/suggest?${queryString.stringify(params)}`;
  const init = {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "GET",
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res?.result?.code === 200) {
    await putHttpCachePolyfill(input, init, res);
    return res.data.entries;
  }

  return [];
};

/**
 * 有道词典
 * @param {*} text
 * @returns
 */
export const apiYoudaoDict = async (text) => {
  const params = {
    doctype: "json",
    jsonversion: 4,
  };
  const input = `https://dict.youdao.com/jsonapi_s?${queryString.stringify(params)}`;
  const body = queryString.stringify({
    q: text,
    le: "en",
    t: 3,
    client: "web",
    // sign: "",
    keyfrom: "webdict",
  });
  const init = {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    body,
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res) {
    await putHttpCachePolyfill(input, init, res);
    return res;
  }

  return null;
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
 * 浏览器内置AI语言识别
 * @param {*} text
 * @returns
 */
export const apiBuiltinAIDetect = async (text) => {
  if (!isBuiltinAIAvailable) {
    return "";
  }

  const [lang, error] = await fnPolyfill({
    fn: chromeDetect,
    msg: MSG_BUILTINAI_DETECT,
    text,
  });
  if (!error) {
    return lang;
  }

  return "";
};

/**
 * 浏览器内置AI翻译
 * @param {*} param0
 * @returns
 */
const apiBuiltinAITranslate = async ({ text, from, to, apiSetting }) => {
  if (!isBuiltinAIAvailable) {
    return ["", true];
  }

  const { fetchInterval, fetchLimit, httpTimeout } = apiSetting;
  const fetchPool = getFetchPool(fetchInterval, fetchLimit);
  const result = await withTimeout(
    fetchPool.push(fnPolyfill, {
      fn: chromeTranslate,
      msg: MSG_BUILTINAI_TRANSLATE,
      text,
      from,
      to,
    }),
    httpTimeout
  );

  if (!result) {
    throw new Error("apiBuiltinAITranslate got null reault");
  }

  const [trText, srLang, error] = result;
  if (error) {
    throw new Error("apiBuiltinAITranslate got error", error);
  }

  return [trText, srLang];
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
  glossary = {},
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
    const cache = await getHttpCachePolyfill(cacheInput);
    if (cache?.trText) {
      return [cache.trText, cache.isSame];
    }
  }

  // 请求接口数据
  let tranlation = [];
  if (apiType === OPT_TRANS_BUILTINAI) {
    tranlation = await apiBuiltinAITranslate({
      text,
      from,
      to,
      apiSetting,
    });
  } else if (useBatchFetch && API_SPE_TYPES.batch.has(apiType)) {
    const { apiSlug, batchInterval, batchSize, batchLength } = apiSetting;
    const key = `${apiSlug}_${fromLang}_${toLang}`;
    const queue = getBatchQueue(key, handleTranslate, {
      batchInterval,
      batchSize,
      batchLength,
    });
    tranlation = await queue.addTask(text, {
      from,
      to,
      fromLang,
      toLang,
      langMap,
      docInfo,
      glossary,
      apiSetting,
      usePool,
    });
  } else {
    [tranlation] = await handleTranslate([text], {
      from,
      to,
      fromLang,
      toLang,
      langMap,
      docInfo,
      glossary,
      apiSetting,
      usePool,
    });
  }

  let trText = "";
  let srLang = "";
  if (Array.isArray(tranlation)) {
    [trText, srLang = ""] = tranlation;
  } else if (typeof tranlation === "string") {
    trText = tranlation;
  }

  if (!trText) {
    throw new Error("tanslate api got empty trtext");
  }

  const isSame = fromLang === "auto" && srLang === to;

  // 插入缓存
  if (useCache) {
    putHttpCachePolyfill(cacheInput, null, { trText, isSame, srLang });
  }

  return [trText, isSame];
};

// 字幕处理/翻译
export const apiSubtitle = async ({
  videoId,
  chunkSign,
  fromLang = "auto",
  toLang,
  events = [],
  apiSetting,
}) => {
  const cacheOpts = {
    apiSlug: apiSetting.apiSlug,
    videoId,
    chunkSign,
    fromLang,
    toLang,
  };
  const cacheInput = `${URL_CACHE_SUBTITLE}?${queryString.stringify(cacheOpts)}`;
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  const subtitles = await handleSubtitle({
    events,
    from: fromLang,
    to: toLang,
    apiSetting,
  });
  if (subtitles?.length) {
    putHttpCachePolyfill(cacheInput, null, subtitles);
    return subtitles;
  }

  return [];
};
