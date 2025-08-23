import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_NIUTRANS,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENAI_2,
  OPT_TRANS_OPENAI_3,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OLLAMA_2,
  OPT_TRANS_OLLAMA_3,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_CUSTOMIZE_2,
  OPT_TRANS_CUSTOMIZE_3,
  OPT_TRANS_CUSTOMIZE_4,
  OPT_TRANS_CUSTOMIZE_5,
  URL_CACHE_TRAN,
  KV_SALT_SYNC,
  URL_GOOGLE_TRAN,
  URL_MICROSOFT_LANGDETECT,
  URL_BAIDU_LANGDETECT,
  URL_BAIDU_SUGGEST,
  URL_BAIDU_TTS,
  OPT_LANGS_BAIDU,
  URL_TENCENT_TRANSMART,
  OPT_LANGS_TENCENT,
  OPT_LANGS_SPECIAL,
  OPT_LANGS_MICROSOFT,
} from "../config";
import { sha256 } from "../libs/utils";
import interpreter from "../libs/interpreter";
import { msAuth } from "../libs/auth";
import { kissLog } from "../libs/log";

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
  const input = `${URL_GOOGLE_TRAN}?${queryString.stringify(params)}`;
  const res = await fetchData(input, {
    headers: {
      "Content-type": "application/json",
    },
    useCache: true,
  });

  return res.src;
};

/**
 * Microsoft语言识别
 * @param {*} text
 * @returns
 */
export const apiMicrosoftLangdetect = async (text) => {
  const [token] = await msAuth();
  const res = await fetchData(URL_MICROSOFT_LANGDETECT, {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
    body: JSON.stringify([{ Text: text }]),
    useCache: true,
  });

  return OPT_LANGS_MICROSOFT.get(res[0].language) ?? res[0].language;
};

/**
 * 百度语言识别
 * @param {*} text
 * @returns
 */
export const apiBaiduLangdetect = async (text) => {
  const res = await fetchData(URL_BAIDU_LANGDETECT, {
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
 * 百度翻译建议
 * @param {*} text
 * @returns
 */
export const apiBaiduSuggest = async (text) => {
  const res = await fetchData(URL_BAIDU_SUGGEST, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      kw: text,
    }),
    useCache: true,
  });

  if (res.errno === 0) {
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
  const url = `${URL_BAIDU_TTS}?${queryString.stringify({ lan, text, spd })}`;
  return fetchData(url, {
    useCache: false, // 为避免缓存过快增长，禁用缓存语音数据
  });
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

  const res = await fetchData(URL_TENCENT_TRANSMART, {
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
    kissLog(`target lang: ${toLang} not support`, "translate");
    return [trText, isSame];
  }

  // 版本号一/二位升级，旧缓存失效
  const [v1, v2] = process.env.REACT_APP_VERSION.split(".");
  const cacheOpts = {
    translator,
    text,
    fromLang,
    toLang,
    version: [v1, v2].join("."),
  };

  const transOpts = {
    translator,
    text,
    from,
    to,
  };

  const res = await fetchData(
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
    case OPT_TRANS_GOOGLE_2:
      trText = res?.[0]?.[0] || "";
      isSame = to === res.src;
      break;
    case OPT_TRANS_MICROSOFT:
      trText = res
        .map((item) => item.translations.map((item) => item.text).join(" "))
        .join(" ");
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
    case OPT_TRANS_NIUTRANS:
      const json = JSON.parse(res);
      if (json.error_msg) {
        throw new Error(json.error_msg);
      }
      trText = json.tgt_text;
      isSame = to === json.from;
      break;
    case OPT_TRANS_BAIDU:
      // trText = res.trans_result?.data.map((item) => item.dst).join(" ");
      // isSame = res.trans_result?.to === res.trans_result?.from;
      if (res.type === 1) {
        trText = Object.keys(JSON.parse(res.result).content[0].mean[0].cont)[0];
        isSame = to === res.from;
      } else if (res.type === 2) {
        trText = res.data.map((item) => item.dst).join(" ");
        isSame = to === res.from;
      }
      break;
    case OPT_TRANS_TENCENT:
      trText = res?.auto_translation?.[0];
      isSame = text === trText;
      break;
    case OPT_TRANS_VOLCENGINE:
      trText = res?.translation || "";
      isSame = to === res?.detected_language;
      break;
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_OPENAI_2:
    case OPT_TRANS_OPENAI_3:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
      trText = res?.choices?.map((item) => item.message.content).join(" ");
      isSame = text === trText;
      break;
    case OPT_TRANS_GEMINI:
      trText = res?.candidates
        ?.map((item) => item.content?.parts.map((item) => item.text).join(" "))
        .join(" ");
      isSame = text === trText;
      break;
    case OPT_TRANS_CLAUDE:
      trText = res?.content?.map((item) => item.text).join(" ");
      isSame = text === trText;
      break;
    case OPT_TRANS_CLOUDFLAREAI:
      trText = res?.result?.translated_text;
      isSame = text === trText;
      break;
    case OPT_TRANS_OLLAMA:
    case OPT_TRANS_OLLAMA_2:
    case OPT_TRANS_OLLAMA_3:
      const { thinkIgnore = "" } = apiSetting;
      const deepModels = thinkIgnore.split(",").filter((model) => model.trim());
      if (deepModels.some((model) => res?.model?.startsWith(model))) {
        trText = res?.response.replace(/<think>[\s\S]*<\/think>/i, "");
      } else {
        trText = res?.response;
      }
      isSame = text === trText;
      break;
    case OPT_TRANS_CUSTOMIZE:
    case OPT_TRANS_CUSTOMIZE_2:
    case OPT_TRANS_CUSTOMIZE_3:
    case OPT_TRANS_CUSTOMIZE_4:
    case OPT_TRANS_CUSTOMIZE_5:
      const { resHook } = apiSetting;
      if (resHook?.trim()) {
        interpreter.run(`exports.resHook = ${resHook}`);
        [trText, isSame] = interpreter.exports.resHook(res, text, from, to);
      } else {
        trText = res.text;
        isSame = to === res.from;
      }
      break;
    default:
  }

  return [trText, isSame, res];
};
