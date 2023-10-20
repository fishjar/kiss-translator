import { URL_TENCENT_TRANSMART, OPT_LANGS_TENCENT } from "../config";
import { fetchPolyfill } from "../libs/fetch";

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
 * 腾讯翻译
 * @param {*} text
 * @param {*} to
 * @param {*} from
 * @returns
 */
export const apiTencentTranslate = async (
  translator,
  text,
  to,
  from,
  { useCache = true }
) => {
  const data = {
    header: {
      fn: "auto_translation_block",
    },
    source: {
      text_block: text,
    },
    target: {
      lang: to,
    },
  };

  if (from) {
    data.source.lang = from;
  }

  const res = await fetchPolyfill(URL_TENCENT_TRANSMART, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
    useCache,
    usePool: true,
    translator,
  });
  const trText = res.auto_translation;
  const isSame = text === trText;

  return [trText, isSame];
};
