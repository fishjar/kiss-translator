import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import {
  URL_CACHE_TRAN,
  KV_SALT_SYNC,
  OPT_LANGS_BAIDU,
  OPT_LANGS_TENCENT,
  OPT_LANGS_SPECIAL,
  OPT_LANGS_MICROSOFT,
  OPT_TRANS_BATCH,
} from "../config";
import { sha256 } from "../libs/utils";
import { msAuth } from "../libs/auth";
import { kissLog } from "../libs/log";
import { handleTranslate } from "./trans";
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
  const [token] = await msAuth();
  const input =
    "https://api-edge.cognitive.microsofttranslator.com/detect?api-version=3.0";
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
    body: JSON.stringify([{ Text: text }]),
  };
  const res = await fetchData(input, init, {
    useCache: true,
  });

  if (res[0].language) {
    await putHttpCachePolyfill(input, init, res);
    return OPT_LANGS_MICROSOFT.get(res[0].language) ?? res[0].language;
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

  if (res.error === 0) {
    await putHttpCachePolyfill(input, init, res);
    return OPT_LANGS_BAIDU.get(res.lan) ?? res.lan;
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

  if (res.errno === 0) {
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
    },
    text,
  });
  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body,
  };
  const res = await fetchData(input, init, { useCache: true });

  if (res.language) {
    await putHttpCachePolyfill(input, init, res);
    return OPT_LANGS_TENCENT.get(res.language) ?? res.language;
  }

  return "";
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
  docInfo = {},
  useCache = true,
  usePool = true,
}) => {
  if (!text) {
    return ["", false];
  }

  const from =
    OPT_LANGS_SPECIAL[translator].get(fromLang) ??
    OPT_LANGS_SPECIAL[translator].get("auto");
  const to = OPT_LANGS_SPECIAL[translator].get(toLang);
  if (!to) {
    kissLog(`target lang: ${toLang} not support`, "translate");
    return ["", false];
  }

  // TODO: 优化缓存失效因素
  const [v1, v2] = process.env.REACT_APP_VERSION.split(".");
  const cacheOpts = {
    translator,
    text,
    fromLang,
    toLang,
    model: apiSetting.model, // model改变，缓存失效
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
  if (apiSetting.useBatchFetch && OPT_TRANS_BATCH.has(translator)) {
    const queue = getBatchQueue(
      {
        translator,
        from,
        to,
        docInfo,
        apiSetting,
        usePool,
        taskFn: handleTranslate,
      },
      apiSetting
    );
    const tranlation = await queue.addTask({ text });
    if (Array.isArray(tranlation)) {
      [trText, srLang = ""] = tranlation;
    }
  } else {
    const translations = await handleTranslate({
      translator,
      texts: [text],
      from,
      to,
      docInfo,
      apiSetting,
      usePool,
    });
    if (Array.isArray(translations?.[0])) {
      [trText, srLang = ""] = translations[0];
    }
  }

  const isSame = srLang && (to.includes(srLang) || srLang.includes(to));

  // 插入缓存
  if (useCache && trText) {
    await putHttpCachePolyfill(cacheInput, null, { trText, isSame, srLang });
  }

  return [trText, isSame];
};
