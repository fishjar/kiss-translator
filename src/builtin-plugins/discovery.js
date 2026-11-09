import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import { putHttpCachePolyfill } from "../libs/cache";

// Native discovery protocols retain legacy display data; Provider handlers normalize only their public contract.
/**
 * 谷歌语言识别 API。
 * @param {string} text 待识别的原文文本
 * @returns {Promise<string>} 识别出的 ISO 语言简写代码 (e.g. "en")
 */
export const apiGoogleLangdetect = async (text, { signal } = {}) => {
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
  // 语言识别通常调用频繁，此处开启 useCache: true 节省请求开销
  const res = await fetchData(input, init, { useCache: true, signal });

  if (res?.src) {
    await putHttpCachePolyfill(input, init, res);
    return res.src;
  }

  return "";
};

/**
 * 百度语言识别 API。
 * @param {string} text 待识别的原文文本
 * @returns {Promise<string>} 语言简写代码
 */
export const apiBaiduLangdetect = async (text, { signal } = {}) => {
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
  const res = await fetchData(input, init, { useCache: true, signal });

  if (res?.error === 0) {
    await putHttpCachePolyfill(input, init, res);
    return res.lan;
  }

  return "";
};

/**
 * 百度输入建议 API (用于输入翻译功能)。
 * @param {string} text 输入的关键词
 * @returns {Promise<Array<Object>>} 建议列表
 */
export const apiBaiduSuggest = async (text, { signal } = {}) => {
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
  const res = await fetchData(input, init, { useCache: true, signal });

  if (res?.errno === 0) {
    await putHttpCachePolyfill(input, init, res);
    return res.data;
  }

  return [];
};

/**
 * 有道输入建议 API。
 * @param {string} text 关键词
 * @returns {Promise<Array<Object>>} 有道联想建议数据
 */
export const apiYoudaoSuggest = async (text, { signal } = {}) => {
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
  const res = await fetchData(input, init, { useCache: true, signal });

  if (res?.result?.code === 200) {
    await putHttpCachePolyfill(input, init, res);
    return res.data.entries;
  }

  return [];
};

/**
 * 腾讯 Transmart 语言识别 API。
 * @param {string} text 原文文本
 * @returns {Promise<string>} 语言简写代号
 */
export const apiTencentLangdetect = async (text, { signal } = {}) => {
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
  const res = await fetchData(input, init, { useCache: true, signal });

  if (res?.language) {
    await putHttpCachePolyfill(input, init, res);
    return res.language;
  }

  return "";
};
