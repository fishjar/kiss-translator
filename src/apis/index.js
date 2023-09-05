import queryString from "query-string";
import { fetchPolyfill } from "../libs/fetch";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_OPENAI,
  OPT_TRANS_CUSTOMIZE,
  URL_MICROSOFT_TRANS,
  OPT_LANGS_SPECIAL,
  PROMPT_PLACE_FROM,
  PROMPT_PLACE_TO,
  KV_SALT_SYNC,
} from "../config";
import { tryDetectLang } from "../libs";
import { sha256 } from "../libs/utils";

/**
 * 同步数据
 * @param {*} url
 * @param {*} key
 * @param {*} data
 * @returns
 */
export const apiSyncData = async (url, key, data, isBg = false) =>
  fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${await sha256(key, KV_SALT_SYNC)}`,
    },
    method: "POST",
    body: JSON.stringify(data),
    isBg,
  });

/**
 * 下载订阅规则
 * @param {*} url
 * @param {*} isBg
 * @returns
 */
export const apiFetchRules = (url, isBg = false) =>
  fetchPolyfill(url, { isBg });

/**
 * 谷歌翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiGoogleTranslate = async (translator, text, to, from, setting) => {
  const { url, key } = setting;
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
  return fetchPolyfill(input, {
    headers: {
      "Content-type": "application/json",
    },
    useCache: true,
    usePool: true,
    translator,
    token: key,
  });
};

/**
 * 微软翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiMicrosoftTranslate = (translator, text, to, from) => {
  const params = {
    from,
    to,
    "api-version": "3.0",
  };
  const input = `${URL_MICROSOFT_TRANS}?${queryString.stringify(params)}`;
  return fetchPolyfill(input, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify([{ Text: text }]),
    useCache: true,
    usePool: true,
    translator,
  });
};

/**
 * DeepL翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiDeepLTranslate = (translator, text, to, from, setting) => {
  const { url, key } = setting;
  const data = {
    text: [text],
    target_lang: to,
    split_sentences: "0",
  };
  if (from) {
    data.source_lang = from;
  }
  return fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
    useCache: true,
    usePool: true,
    translator,
    token: key,
  });
};

/**
 * OpenAI 翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiOpenaiTranslate = async (translator, text, to, from, setting) => {
  let { url, key, model, prompt } = setting;
  prompt = prompt
    .replaceAll(PROMPT_PLACE_FROM, from)
    .replaceAll(PROMPT_PLACE_TO, to);
  return fetchPolyfill(url, {
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
    useCache: true,
    usePool: true,
    translator,
    token: key,
  });
};

/**
 * 自定义接口 翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
const apiCustomizeTranslate = async (translator, text, to, from, setting) => {
  let { url, key, headers } = setting;
  return fetchPolyfill(url, {
    headers: {
      "Content-type": "application/json",
      ...JSON.parse(headers),
    },
    method: "POST",
    body: JSON.stringify({
      text,
      from,
      to,
    }),
    useCache: true,
    usePool: true,
    translator,
    token: key,
  });
};

/**
 * 统一翻译接口
 * @param {*} param0
 * @returns
 */
export const apiTranslate = async ({
  translator,
  q,
  fromLang,
  toLang,
  setting,
}) => {
  let trText = "";
  let isSame = false;

  let from = OPT_LANGS_SPECIAL?.[translator]?.get(fromLang) ?? fromLang;
  let to = OPT_LANGS_SPECIAL?.[translator]?.get(toLang) ?? toLang;

  if (translator === OPT_TRANS_GOOGLE) {
    const res = await apiGoogleTranslate(translator, q, to, from, setting);
    trText = res.sentences.map((item) => item.trans).join(" ");
    isSame = to === res.src;
  } else if (translator === OPT_TRANS_MICROSOFT) {
    const res = await apiMicrosoftTranslate(translator, q, to, from);
    trText = res[0].translations[0].text;
    isSame = to === res[0].detectedLanguage?.language;
  } else if (translator === OPT_TRANS_DEEPL) {
    const res = await apiDeepLTranslate(translator, q, to, from, setting);
    trText = res.translations.map((item) => item.text).join(" ");
    isSame = to === (from || res.translations[0].detected_source_language);
  } else if (translator === OPT_TRANS_OPENAI) {
    const res = await apiOpenaiTranslate(translator, q, to, from, setting);
    trText = res?.choices?.[0].message.content;
    const sLang = await tryDetectLang(q);
    const tLang = await tryDetectLang(trText);
    isSame = q === trText || (sLang && tLang && sLang === tLang);
  } else if (translator === OPT_TRANS_CUSTOMIZE) {
    // todo
  }

  return [trText, isSame];
};
