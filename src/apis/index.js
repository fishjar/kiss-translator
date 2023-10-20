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
  OPT_TRANS_CUSTOMIZE,
  URL_CACHE_TRAN,
  OPT_LANGS_SPECIAL,
  PROMPT_PLACE_FROM,
  PROMPT_PLACE_TO,
  KV_SALT_SYNC,
  URL_BAIDU_LANGDETECT,
  URL_MICROSOFT_TRAN,
  OPT_LANGS_BAIDU,
} from "../config";
import { tryDetectLang } from "../libs";
import { sha256 } from "../libs/utils";
import { apiDeepLFreeTranslate } from "./deepl";
import { apiBaiduTranslate } from "./baidu";
import { apiTencentTranslate } from "./tencent";

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
 * 谷歌翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiGoogleTranslate = async (
  translator,
  text,
  to,
  from,
  { url, key, useCache = true }
) => {
  const params = {
    client: "gtx",
    dt: "t",
    dj: 1,
    ie: "UTF-8",
    sl: from,
    tl: to,
    q: text,
  };
  const input = `${url}?${queryString.stringify(params)}`;
  const res = await fetchPolyfill(input, {
    headers: {
      "Content-type": "application/json",
    },
    useCache,
    usePool: true,
    translator,
    token: key,
  });
  const trText = res.sentences.map((item) => item.trans).join(" ");
  const isSame = to === res.src;

  return [trText, isSame];
};

/**
 * 微软翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiMicrosoftTranslate = async (
  translator,
  text,
  to,
  from,
  { useCache = true }
) => {
  const params = {
    from,
    to,
    "api-version": "3.0",
  };
  const input = `${URL_MICROSOFT_TRAN}?${queryString.stringify(params)}`;
  const res = await fetchPolyfill(input, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify([{ Text: text }]),
    useCache,
    usePool: true,
    translator,
  });
  const trText = res[0].translations[0].text;
  const isSame = to === res[0].detectedLanguage?.language;

  return [trText, isSame];
};

/**
 * DeepL翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiDeepLTranslate = async (
  translator,
  text,
  to,
  from,
  { url, key, useCache = true }
) => {
  const data = {
    text: [text],
    target_lang: to,
    // split_sentences: "0",
  };
  if (from) {
    data.source_lang = from;
  }
  const res = await fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
    useCache,
    usePool: true,
    translator,
    token: key,
  });
  const trText = res.translations.map((item) => item.text).join(" ");
  const isSame = to === res.translations[0].detected_source_language;

  return [trText, isSame];
};

/**
 * DeepLX翻译
 * https://github.com/OwO-Network/DeepLX
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiDeepLXTranslate = async (
  translator,
  text,
  to,
  from,
  { url, key, useCache = true }
) => {
  const data = {
    text,
    target_lang: to,
  };
  if (from) {
    data.source_lang = from;
  }
  const res = await fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
    useCache,
    usePool: true,
    translator,
    token: key,
  });
  const trText = res.data;
  const isSame = to === res.source_lang;

  return [trText, isSame];
};

/**
 * OpenAI 翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiOpenaiTranslate = async (
  translator,
  text,
  to,
  from,
  { url, key, model, prompt, useCache = true }
) => {
  prompt = prompt
    .replaceAll(PROMPT_PLACE_FROM, from)
    .replaceAll(PROMPT_PLACE_TO, to);
  const res = await fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0,
      max_tokens: 256,
    }),
    useCache,
    usePool: true,
    translator,
    token: key,
  });
  const trText = res?.choices?.[0].message.content;
  const sLang = await tryDetectLang(text);
  const tLang = await tryDetectLang(trText);
  const isSame = text === trText || (sLang && tLang && sLang === tLang);

  return [trText, isSame];
};

/**
 * 自定义接口 翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiCustomTranslate = async (
  translator,
  text,
  to,
  from,
  { url, key, useCache = true }
) => {
  const res = await fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      text,
      from,
      to,
    }),
    useCache,
    usePool: true,
    translator,
    token: key,
  });
  const trText = res.text;
  const isSame = to === res.from;

  return [trText, isSame];
};

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

  const transOpts = {
    translator,
    text,
    fromLang,
    toLang,
  };

  const res = await fetchPolyfill(
    `${URL_CACHE_TRAN}?${queryString.stringify(transOpts)}`,
    {
      useCache,
      usePool,
      transOpts,
      apiSetting,
    }
  );

  switch (translator) {
    case OPT_TRANS_GOOGLE:
      break;
    case OPT_TRANS_MICROSOFT:
      trText = res[0].translations[0].text;
      isSame = toLang === res[0].detectedLanguage?.language;
      break;
    case OPT_TRANS_DEEPL:
      break;
    case OPT_TRANS_DEEPLFREE:
      break;
    case OPT_TRANS_DEEPLX:
      break;
    case OPT_TRANS_BAIDU:
      break;
    case OPT_TRANS_TENCENT:
      trText = res.auto_translation;
      isSame = text === trText;
      break;
    case OPT_TRANS_OPENAI:
      break;
    case OPT_TRANS_CUSTOMIZE:
      break;
    default:
      break;
  }

  return [trText, isSame];
};
