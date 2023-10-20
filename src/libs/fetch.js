import queryString from "query-string";
import { isExt, isGm } from "./client";
import { sendBgMsg } from "./msg";
import { taskPool } from "./pool";
import {
  MSG_FETCH,
  MSG_FETCH_LIMIT,
  MSG_FETCH_CLEAR,
  CACHE_NAME,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_CUSTOMIZE,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT,
  OPT_LANGS_SPECIAL,
  URL_MICROSOFT_TRAN,
  URL_TENCENT_TRANSMART,
} from "../config";
import { msAuth } from "./auth";
import { isBg } from "./browser";

/**
 * 油猴脚本的请求封装
 * @param {*} input
 * @param {*} init
 * @returns
 */
export const fetchGM = async (input, { method = "GET", headers, body } = {}) =>
  new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method,
      url: input,
      headers,
      data: body,
      onload: ({ response, responseHeaders, status, statusText }) => {
        const headers = new Headers();
        responseHeaders.split("\n").forEach((line) => {
          const [name, value] = line.split(":").map((item) => item.trim());
          if (name && value) {
            headers.append(name, value);
          }
        });
        resolve(
          new Response(response, {
            headers,
            status,
            statusText,
          })
        );
      },
      onerror: reject,
    });
  });

/**
 * 构造缓存 request
 * @param {*} request
 * @returns
 */
const newCacheReq = async (input, init) => {
  let request = new Request(input, init);
  if (request.method !== "GET") {
    const body = await request.text();
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname += body;
    request = new Request(cacheUrl.toString(), { method: "GET" });
  }

  return request;
};

const newTransReq = (
  { translator, text, fromLang, toLang },
  { url, key } = {}
) => {
  // console.log({ translator, text, fromLang, toLang }, { url, key });
  let params;
  let data;
  let input;
  let init;

  const from = OPT_LANGS_SPECIAL[translator].get(fromLang) ?? "";
  const to = OPT_LANGS_SPECIAL[translator].get(toLang);
  if (!to) {
    throw new Error(`[trans] target lang: ${toLang} not support`);
  }

  switch (translator) {
    case OPT_TRANS_GOOGLE:
      break;
    case OPT_TRANS_MICROSOFT:
      params = {
        from,
        to,
        "api-version": "3.0",
      };
      input = `${URL_MICROSOFT_TRAN}?${queryString.stringify(params)}`;
      init = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        method: "POST",
        body: JSON.stringify([{ Text: text }]),
      };
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
      data = {
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
      input = URL_TENCENT_TRANSMART;
      init = {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify(data),
      };
      break;
    case OPT_TRANS_OPENAI:
      break;
    case OPT_TRANS_CUSTOMIZE:
      break;
    default:
      break;
  }

  if (!input) {
    throw new Error(`[trans] translator: ${translator} not support`);
  }

  return [input, init];
};

/**
 * 发起请求
 * @param {*} param0
 * @returns
 */
export const fetchApi = async ({
  input,
  init,
  transOpts,
  apiSetting,
  token,
}) => {
  if (token) {
    apiSetting.key = token;
  }
  if (transOpts?.translator) {
    [input, init] = newTransReq(transOpts, apiSetting);
  }
  // if (token) {
  //   if (translator === OPT_TRANS_DEEPL) {
  //     init.headers["Authorization"] = `DeepL-Auth-Key ${token}`; // DeepL
  //   } else if (translator === OPT_TRANS_OPENAI) {
  //     init.headers["Authorization"] = `Bearer ${token}`; // OpenAI
  //     init.headers["api-key"] = token; // Azure OpenAI
  //   } else {
  //     init.headers["Authorization"] = `Bearer ${token}`; // Microsoft & others
  //   }
  // }

  if (isGm) {
    let info;
    if (window.KISS_GM) {
      info = await window.KISS_GM.getInfo();
    } else {
      info = GM.info;
    }
    // Tampermonkey --> .connects
    // Violentmonkey --> .connect
    const connects = info?.script?.connects || info?.script?.connect || [];
    const url = new URL(input);
    const isSafe = connects.find((item) => url.hostname.endsWith(item));
    if (isSafe) {
      if (window.KISS_GM) {
        return window.KISS_GM.fetch(input, init);
      } else {
        return fetchGM(input, init);
      }
    }
  }
  return fetch(input, init);
};

/**
 * 请求池实例
 */
export const fetchPool = taskPool(
  fetchApi,
  async ({ transOpts }) => {
    if (transOpts?.translator === OPT_TRANS_MICROSOFT) {
      const [token] = await msAuth();
      return { token };
    }
    return {};
  },
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_FETCH_LIMIT
);

/**
 * 请求数据统一接口
 * @param {*} input
 * @param {*} opts
 * @returns
 */
export const fetchData = async (
  input,
  { useCache, usePool, transOpts, apiSetting, ...init } = {}
) => {
  const cacheReq = await newCacheReq(input, init);
  let res;

  // 查询缓存
  if (useCache) {
    try {
      const cache = await caches.open(CACHE_NAME);
      res = await cache.match(cacheReq);
    } catch (err) {
      console.log("[cache match]", err.message);
    }
  }

  if (!res) {
    // 发送请求
    if (usePool) {
      res = await fetchPool.push({ input, init, transOpts, apiSetting });
    } else {
      res = await fetchApi({ input, init, transOpts, apiSetting });
    }

    if (!res?.ok) {
      throw new Error(`response: ${res.statusText}`);
    }

    // 插入缓存
    if (useCache) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheReq, res.clone());
      } catch (err) {
        console.log("[cache put]", err.message);
      }
    }
  }

  const contentType = res.headers.get("Content-Type");
  if (contentType?.includes("json")) {
    return await res.json();
  }
  return await res.text();
};

/**
 * fetch 兼容性封装
 * @param {*} input
 * @param {*} opts
 * @returns
 */
export const fetchPolyfill = async (input, opts) => {
  if (!input?.trim()) {
    throw new Error("URL is empty");
  }

  // 插件
  if (isExt && !isBg()) {
    const res = await sendBgMsg(MSG_FETCH, { input, opts });
    if (res.error) {
      throw new Error(res.error);
    }
    return res.data;
  }

  // 油猴/网页/BackgroundPage
  return await fetchData(input, opts);
};

/**
 * 更新 fetch pool 参数
 * @param {*} interval
 * @param {*} limit
 */
export const updateFetchPool = async (interval, limit) => {
  if (isExt) {
    const res = await sendBgMsg(MSG_FETCH_LIMIT, { interval, limit });
    if (res.error) {
      throw new Error(res.error);
    }
  } else {
    fetchPool.update(interval, limit);
  }
};

/**
 * 清空任务池
 */
export const clearFetchPool = async () => {
  if (isExt) {
    const res = await sendBgMsg(MSG_FETCH_CLEAR);
    if (res.error) {
      throw new Error(res.error);
    }
  } else {
    fetchPool.clear();
  }
};
