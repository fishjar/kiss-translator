import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import {
  URL_CACHE_TRAN,
  URL_CACHE_DELANG,
  URL_CACHE_BINGDICT,
  URL_CACHE_DICT,
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
  URL_CACHE_CONTEXT,
  OPT_LANGS_TO_CODE,
  defaultNobatchUserPrompt,
  defaultDictUserPrompt,
} from "../config";
import { sha256, withTimeout } from "../libs/utils";
import { getCacheDigest } from "../libs/cacheDigest";
import {
  handleTranslate,
  handleDict,
  handleSubtitle,
  handleSummarize,
  handleMicrosoftLangdetect,
} from "./trans";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import { getBatchQueue } from "../libs/batchQueue";
import { isBuiltinAIAvailable } from "../libs/browser";
import { chromeDetect, chromeTranslate } from "../libs/builtinAI";
import { fnPolyfill } from "../libs/fetch";
import { normalizeHttpTimeout } from "../libs/request";
import { getFetchPool } from "../libs/pool";
import { trustedTypesHelper } from "../libs/trustedTypes";
import { getDocInfo } from "../libs/docInfo";

const PROMPT_CACHE_SALT = "prompt-cache";
const PROMPT_CACHE_SCOPE_BATCH = "batch";
const PROMPT_CACHE_SCOPE_NOBATCH = "nobatch";
const PROMPT_CACHE_SCOPE_SUBTITLE = "subtitle";
const PROMPT_CACHE_SCOPE_DICT = "dict";
const PROMPT_CACHE_SCOPE_PLAIN = "plain";

function getTranslatePromptCacheScope(apiSetting = {}) {
  if (!API_SPE_TYPES.ai.has(apiSetting.apiType)) {
    return PROMPT_CACHE_SCOPE_PLAIN;
  }

  return apiSetting.useBatchFetch && API_SPE_TYPES.batch.has(apiSetting.apiType)
    ? PROMPT_CACHE_SCOPE_BATCH
    : PROMPT_CACHE_SCOPE_NOBATCH;
}

function getPromptCacheFields(apiSetting = {}, promptScope) {
  if (promptScope === PROMPT_CACHE_SCOPE_BATCH) {
    return [apiSetting.systemPrompt || ""];
  }

  if (promptScope === PROMPT_CACHE_SCOPE_NOBATCH) {
    return [
      apiSetting.nobatchPrompt || "",
      apiSetting.nobatchUserPrompt ?? defaultNobatchUserPrompt,
    ];
  }

  if (promptScope === PROMPT_CACHE_SCOPE_SUBTITLE) {
    return [apiSetting.subtitlePrompt || ""];
  }

  if (promptScope === PROMPT_CACHE_SCOPE_DICT) {
    return [
      apiSetting.dictPrompt || "",
      apiSetting.dictUserPrompt ?? defaultDictUserPrompt,
    ];
  }

  return [];
}

async function getPromptCacheSig(apiSetting = {}, promptScope) {
  const promptText = [
    promptScope,
    ...getPromptCacheFields(apiSetting, promptScope),
  ].join("\n");

  return (await getCacheDigest(promptText, PROMPT_CACHE_SALT)).slice(0, 16);
}

/**
 * 同步数据
 * @param {*} url
 * @param {*} key
 * @param {*} data
 * @return/**
 * 跨端/多终端规则与设置数据同步接口。
 * @param {string} url 同步接口的服务器 URL
 * @param {string} key 同步密钥
 * @param {Object} data 待同步的最新设置与规则数据
 * @returns {Promise<Object>} 接口返回的同步判定结果
 */
export const apiSyncData = async (url, key, data) =>
  fetchData(url, {
    headers: {
      "Content-type": "application/json",
      // 对密钥进行 sha256 签名，保障同步的鉴权安全
      Authorization: `Bearer ${await sha256(key, KV_SALT_SYNC)}`,
    },
    method: "POST",
    body: JSON.stringify(data),
  });

const GITHUB_GIST_API = "https://api.github.com/gists";

const getGistHeaders = (token) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

export const apiListGists = async (token) =>
  fetchData(`${GITHUB_GIST_API}?per_page=100`, {
    method: "GET",
    headers: getGistHeaders(token),
  });

export const apiCreateGist = async (token, file, description) =>
  fetchData(GITHUB_GIST_API, {
    method: "POST",
    headers: getGistHeaders(token),
    body: JSON.stringify({
      description,
      public: false,
      files: {
        [file.key]: {
          content: file.content,
        },
      },
    }),
  });

export const apiGetGist = async (gistId, token) =>
  fetchData(`${GITHUB_GIST_API}/${gistId}`, {
    method: "GET",
    headers: getGistHeaders(token),
  });

export const apiUpdateGistFile = async (gistId, token, key, content) =>
  fetchData(`${GITHUB_GIST_API}/${gistId}`, {
    method: "PATCH",
    headers: getGistHeaders(token),
    body: JSON.stringify({
      files: {
        [key]: {
          content,
        },
      },
    }),
  });

/**
 * 通用轻量数据拉取函数。
 * @param {string} url 目标 URL
 * @returns {Promise<*>} 拉取的数据内容
 */
export const apiFetch = (url) => fetchData(url);
export const apiFetchText = (url) =>
  fetchData(url, undefined, { expect: "text" });

/**
 * 获取微软 Edge 翻译服务的授权凭证 Token。
 * @returns {Promise<string>} 微软接口所需的 Bearer Token 凭证字符串
 */
export const apiMsAuth = async () =>
  fetchData("https://edge.microsoft.com/translate/auth");

/**
 * 谷歌语言识别 API。
 * @param {string} text 待识别的原文文本
 * @returns {Promise<string>} 识别出的 ISO 语言简写代码 (e.g. "en")
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
  // 语言识别通常调用频繁，此处开启 useCache: true 节省请求开销
  const res = await fetchData(input, init, { useCache: true });

  if (res?.src) {
    await putHttpCachePolyfill(input, init, res);
    return res.src;
  }

  return "";
};

/**
 * 微软 Edge 语言识别 API。
 * 支持在队列中进行高并发批处理合并（Batching）以及本地缓存。
 * @param {string} text 待识别的原文文本
 * @returns {Promise<string>} 语言简写代码
 */
export const apiMicrosoftLangdetect = async (text) => {
  const cacheOpts = { text, detector: OPT_TRANS_MICROSOFT };
  const cacheInput = `${URL_CACHE_DELANG}?${queryString.stringify(cacheOpts)}`;

  // 1. 优先读取本地网络缓存
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  // 2. 无缓存时，推入批量请求合并队列中（200ms 内的请求合并发送，每批最大 20 条）
  const key = `${URL_CACHE_DELANG}_${OPT_TRANS_MICROSOFT}`;
  const queue = getBatchQueue(key, handleMicrosoftLangdetect, {
    batchInterval: 200,
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
 * 微软 Edge 在线词典检索（Bing 词典 HTML 爬取解析）。
 * 支持对划词选中的单词进行拼音、音标（英/美）、词意、时态及双语例句等多维度的解析。
 * @param {string} text 待检索查询的单词
 * @returns {Promise<Object|null>} 结构化后的 Bing 词典卡片数据
 */
export const apiMicrosoftDict = async (text) => {
  const cacheOpts = { text };
  const cacheInput = `${URL_CACHE_BINGDICT}?${queryString.stringify(cacheOpts)}`;

  // 1. 读取词典缓存，避免高频划词重复爬取 Bing 网站
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  const host = "https://www.bing.com";
  const url = `${host}/dict/search?q=${text}&FORM=BDVSP6&cc=cn`;
  const str = await fetchData(
    url,
    { credentials: "include" }, // 携带 credentials 以免遭到网站人机拦截限制
    { useCache: false }
  );
  if (!str) {
    return null;
  }

  // 2. 利用客户端 DOMParser 提取 HTML 中高度复杂的页面数据
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    trustedTypesHelper.createHTML(str),
    "text/html"
  );

  const word = doc.querySelector("#headword > h1")?.textContent.trim();
  if (!word) {
    return null;
  }

  // 3. 提取基本释义列表 (trs)
  const trs = [];
  doc.querySelectorAll("div.qdef > ul > li").forEach(($li) => {
    const pos = $li.querySelector(".pos")?.textContent?.trim();
    const def = $li.querySelector(".def")?.textContent?.trim();
    trs.push({ pos, def });
  });

  // 4. 提取单词的时态变形 (presents)
  const presents = [];
  doc.querySelectorAll("div.hd_div1>.hd_if>.p1-5").forEach(($li) => {
    const present = $li.textContent?.trim();
    presents.push(present);
  });

  // 5. 提取英汉双解详细释义 (ecs)
  const ecs = [];
  doc.querySelectorAll(".each_seg>.li_pos").forEach(($li) => {
    const pos = $li.querySelector(".pos_lin>.pos")?.textContent?.trim();
    const lis = [];
    $li.querySelectorAll(".de_seg>.se_lis").forEach(($l) => {
      lis.push($l.querySelector(".de_co")?.textContent?.trim());
    });
    ecs.push({ pos, lis });
  });

  // 6. 提取双语例句信息 (sentences)
  const sentences = [];
  doc.querySelectorAll("#sentenceSeg .se_li").forEach(($li) => {
    const eng = $li.querySelector(".sen_en")?.textContent?.trim();
    const chs = $li.querySelector(".sen_cn")?.textContent?.trim();
    if (eng && chs) {
      sentences.push({ eng, chs });
    }
  });

  // 7. 提取英汉真人发音音频和国际音标 (aus)
  const aus = [];
  const $audioUK = doc.querySelector("#bigaud_uk");
  const $audioUS = doc.querySelector("#bigaud_us");

  // 提取英国音标与发音 mp3 路径
  if ($audioUK) {
    const audioUK = host + $audioUK?.dataset?.mp3link;
    const $phoneticUK = $audioUK.parentElement?.previousElementSibling;
    const phoneticUK = $phoneticUK?.textContent
      ?.trim()
      ?.match(/\[(.*?)\]/)?.[1];
    aus.push({ key: "英", audio: audioUK, phonetic: phoneticUK });
  }

  // 提取美国音标与发音 mp3 路径
  if ($audioUS) {
    const audioUS = host + $audioUS?.dataset?.mp3link;
    const $phoneticUS = $audioUS.parentElement?.previousElementSibling;
    const phoneticUS = $phoneticUS?.textContent
      ?.trim()
      ?.match(/\[(.*?)\]/)?.[1];
    aus.push({ key: "美", audio: audioUS, phonetic: phoneticUS });
  }

  // 若上述选择器失效，尝试用备选选择器提取纯文本音标
  if (aus.length === 0) {
    const $pronInfo = doc.querySelector(".hd_pr");
    const $pronInfoUS = doc.querySelector(".hd_prUS");

    if ($pronInfo) {
      const phoneticText = $pronInfo.textContent?.trim();
      const phoneticMatch = phoneticText?.match(/\[([^\]]+)\]/);
      if (phoneticMatch) {
        aus.push({ key: "英", phonetic: phoneticMatch[1] });
      }
    }

    if ($pronInfoUS) {
      const phoneticText = $pronInfoUS.textContent?.trim();
      const phoneticMatch = phoneticText?.match(/\[([^\]]+)\]/);
      if (phoneticMatch) {
        aus.push({ key: "美", phonetic: phoneticMatch[1] });
      }
    }
  }

  const res = { word, trs, aus, ecs, sentences, presents };
  // 存入词典本地缓存
  putHttpCachePolyfill(cacheInput, null, res);

  return res;
};

/**
 * 百度语言识别 API。
 * @param {string} text 待识别的原文文本
 * @returns {Promise<string>} 语言简写代码
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
 * 百度输入建议 API (用于输入翻译功能)。
 * @param {string} text 输入的关键词
 * @returns {Promise<Array<Object>>} 建议列表
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
 * 有道输入建议 API。
 * @param {string} text 关键词
 * @returns {Promise<Array<Object>>} 有道联想建议数据
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
 * 有道词典 API。
 * @param {string} text 查询单词
 * @returns {Promise<Object|null>} 有道词典的 JSON 响应数据
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
 * 百度文本转语音 (TTS) API，可用于单词发音朗读。
 * @param {string} text 朗读文本
 * @param {string} lan 语言代号，默认 "uk" (英音)
 * @param {number} spd 语速 (1-9)，默认 3
 * @returns {Promise<ArrayBuffer>} TTS 音频字节流
 */
export const apiBaiduTTS = (text, lan = "uk", spd = 3) => {
  const input = `https://fanyi.baidu.com/gettts?${queryString.stringify({ lan, text, spd })}`;
  return fetchData(input);
};

/**
 * 腾讯 Transmart 语言识别 API。
 * @param {string} text 原文文本
 * @returns {Promise<string>} 语言简写代号
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
 * 现代浏览器 (Chrome 127+) 内置 Gemini Nano AI 本地语言识别 API。
 * 依靠扩展 runtime/polyfill 桥接特权页面 API 实现。
 * @param {string} text 待测原文
 * @returns {Promise<string>} 检测出的语言
 */
export const apiBuiltinAIDetect = async (text) => {
  if (!isBuiltinAIAvailable) {
    return "";
  }

  // 跨运行环境调用 chrome.translation.canDetectLanguage() 垫片包装
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
 * 浏览器内置 Gemini Nano AI 翻译 API。
 * 整合了超时管理与内置并发频率池（FetchPool），保证前台调用不易发生死锁。
 */
const apiBuiltinAITranslate = async ({ text, from, to, apiSetting }) => {
  if (!isBuiltinAIAvailable) {
    return ["", true];
  }

  const { fetchInterval, fetchLimit, httpTimeout } = apiSetting;
  // 1. 获取限制并发的频率控制池，保障不频繁打爆本地 AI 进程
  const fetchPool = getFetchPool(fetchInterval, fetchLimit);

  // 2. 执行带有超时机制 (withTimeout) 的本地 AI 翻译
  const result = await withTimeout(
    fetchPool.push(fnPolyfill, {
      fn: chromeTranslate,
      msg: MSG_BUILTINAI_TRANSLATE,
      text,
      from,
      to,
    }),
    normalizeHttpTimeout(httpTimeout)
  );

  if (!result) {
    throw new Error("apiBuiltinAITranslate got null reault");
  }

  const [trText, srLang, error] = result;
  if (error) {
    throw new Error(`apiBuiltinAITranslate got error: ${error}`);
  }

  return [trText, srLang];
};

/**
 * 全局统一翻译分发控制网关。
 * 承载了翻译缓存命中判断、并发批量队列合并、流式文本输出处理等最核心的工程化细节。
 * @param {Object} params
 * @param {string} params.text 待翻译的原文字符串 (如果是网页翻译，为被分割出的 DOM 文本块)
 * @param {string} params.fromLang 源语言，默认为 "auto"
 * @param {string} params.toLang 目标翻译语言
 * @param {Object} params.apiSetting 翻译接口的配置参数项
 * @param {string} params.glossary 自定义词汇术语替换表
 * @param {Function} params.onStreamChunk 流式响应增量回调函数 (用于 SSE/LLM 翻译)
 * @param {Object} params.docInfo 视频/文档摘要等额外上下文环境数据
 * @param {boolean} params.useCache 是否应用本地请求缓存 (默认 true)
 * @param {boolean} params.usePool 是否应用限制连接池 (默认 true)
 * @param {AbortSignal} params.signal AbortController 传导的取消控制信号
 * @returns {Promise<Object>} 最终解析出的翻译响应数据 (trText, srLang, srCode, isSame)
 */
export const apiTranslate = async ({
  text,
  fromLang = "auto",
  toLang,
  apiSetting = DEFAULT_API_SETTING,
  glossary,
  onStreamChunk,
  docInfo,
  useCache = true,
  usePool = true,
  signal,
}) => {
  if (!text) {
    throw new Error("The text cannot be empty.");
  }
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const { apiType, apiSlug, useBatchFetch } = apiSetting;
  const langMap = OPT_LANGS_TO_SPEC[apiType] || OPT_LANGS_SPEC_DEFAULT;
  const from = langMap.get(fromLang);
  const to = langMap.get(toLang);
  if (!to) {
    throw new Error(`The target lang: ${toLang} not support`);
  }

  // REVIEW: 极其精妙的缓存 Key (cacheOpts) 构造。
  // 特别是将项目的 REACT_APP_VERSION 版本号（仅前两位小版本）加入了缓存 key。
  // 这可以确保用户在升级扩展插件后，旧版本的翻译缓存会被自动作废，防止旧的翻译 Prompt/规则影响新版效果。
  // 此外，如果当前是视频字幕翻译，还会缓存前 50 字符的上下文视频摘要信息，使上下文关联缓存更智能。
  const [v1, v2] = process.env.REACT_APP_VERSION.split(".");
  const promptSig = await getPromptCacheSig(
    apiSetting,
    getTranslatePromptCacheScope(apiSetting)
  );
  const cacheOpts = {
    apiSlug,
    text,
    fromLang,
    toLang,
    version: [v1, v2].join("."),
    promptSig,
    ...(docInfo?.summary && { ctx: docInfo.summary.slice(0, 50) }),
  };
  const cacheInput = `${URL_CACHE_TRAN}?${queryString.stringify(cacheOpts)}`;

  // 1. 查询本地 HTTP/CacheStorage 缓存
  if (useCache) {
    const cache = await getHttpCachePolyfill(cacheInput);
    if (cache?.trText) {
      return cache;
    }
  }
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  // 2. 缓存未命中，分发执行翻译请求
  let translation = [];
  if (apiType === OPT_TRANS_BUILTINAI) {
    // 2.1 浏览器本地 AI 翻译路径
    translation = await apiBuiltinAITranslate({
      text,
      from,
      to,
      apiSetting,
    });
  } else if (useBatchFetch && API_SPE_TYPES.batch.has(apiType)) {
    // 2.2 支持批量翻译的传统接口 (如 Google/Microsoft/DeepL 等)
    // 使用 BatchQueue 进行零散文本大合并，节省网络交互次数，大幅提升网页整页翻译的载入速度
    const { apiSlug, batchInterval, batchSize, batchLength, useStream } =
      apiSetting;
    const enableStream = useStream && API_SPE_TYPES.stream.has(apiType);
    const key = `${apiSlug}_${fromLang}_${toLang}_${enableStream ? "stream" : "batch"}_${promptSig}`;
    const queue = getBatchQueue(key, handleTranslate, {
      batchInterval,
      batchSize,
      batchLength,
    });

    translation = await queue.addTask(text, {
      from,
      to,
      fromLang,
      toLang,
      langMap,
      glossary,
      apiSetting,
      usePool,
      onStreamChunk,
      docInfo,
      signal,
    });
  } else {
    // 2.3 不支持批量翻译、需要单个请求执行的 API (如某些流式大模型 API)
    const generator = handleTranslate([text], {
      from,
      to,
      fromLang,
      toLang,
      langMap,
      glossary,
      apiSetting,
      usePool,
      docInfo,
      onStreamChunk,
      signal,
    });

    for await (const item of generator) {
      if (item.id !== 0) {
        continue;
      }

      const isComplete = item.isComplete !== false;
      if (!isComplete) {
        if (onStreamChunk) {
          onStreamChunk({
            id: item.id,
            text: item.partialText,
            isComplete: false,
          });
        }
        continue;
      }

      if (onStreamChunk) {
        onStreamChunk({
          id: item.id,
          text: item.result,
          isComplete: true,
        });
      }
      translation = item.result;
    }
  }

  // 3. 对翻译引擎返回的数据格式进行规范化处理
  let trText = "";
  let srLang = "";
  let srCode = "";
  if (Array.isArray(translation)) {
    [trText, srLang = ""] = translation;
    if (srLang) {
      srCode = OPT_LANGS_TO_CODE[apiType].get(srLang) || "";
    }
  } else if (typeof translation === "string") {
    trText = translation;
  }

  if (!trText) {
    throw new Error("tanslate api got empty trtext");
  }

  // 判断是否发生了“源语言与目标语言相同”的无效翻译情况 (如英文网页翻译为英文)
  const isSame = fromLang === "auto" && srLang === to;

  // 4. 将成功的结果写入本地网络缓存中
  if (useCache) {
    putHttpCachePolyfill(cacheInput, null, { trText, isSame, srLang, srCode });
  }

  return { trText, srLang, srCode, isSame };
};

/**
 * AI 词典查询入口。
 *
 * 该函数负责完成参数校验、语言名映射、缓存 Key 构造与上下文签名计算，
 * 真正的模型请求由 `handleDict` 处理，避免 UI 层直接接触不同 AI 接口差异。
 *
 * @param {Object} params 查询参数
 * @param {string} params.text 待解析的单词、短语或长文本
 * @param {string} [params.fromLang="auto"] 源语言代码
 * @param {string} params.toLang 目标语言代码
 * @param {Object} [params.apiSetting] 已解析出提示词的 API 配置
 * @param {Object} [params.docInfo] 外部传入的页面上下文信息
 * @param {string} [params.context] 当前选区所在段落上下文
 * @param {Function} [params.onStreamChunk] 流式增量 Markdown 回调
 * @param {boolean} [params.useCache=true] 是否读写本地缓存
 * @param {AbortSignal} [params.signal] 取消信号
 * @returns {Promise<string>} AI 词典返回的 Markdown 文本
 */
export const apiDict = async ({
  text,
  fromLang = "auto",
  toLang,
  apiSetting = DEFAULT_API_SETTING,
  docInfo,
  context = "",
  onStreamChunk,
  useCache = true,
  signal,
}) => {
  if (!text) {
    throw new Error("The text cannot be empty.");
  }
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const { apiType } = apiSetting;
  if (!API_SPE_TYPES.ai.has(apiType)) {
    throw new Error("AI dictionary only supports AI APIs.");
  }

  // 复用翻译接口的语言规格映射，确保词典提示词中 {{from}}/{{to}} 与该模型兼容。
  const langMap = OPT_LANGS_TO_SPEC[apiType] || OPT_LANGS_SPEC_DEFAULT;
  const from = langMap.get(fromLang);
  const to = langMap.get(toLang);
  if (!to) {
    throw new Error(`The target lang: ${toLang} not support`);
  }

  const [v1, v2] = process.env.REACT_APP_VERSION.split(".");
  const effectiveDocInfo = docInfo || getDocInfo();
  // 缓存需要区分页面信息和选区段落，否则同一个词在不同语境下会错误复用释义。
  const contextSig = await getCacheDigest(
    [
      effectiveDocInfo?.title || "",
      effectiveDocInfo?.description || "",
      effectiveDocInfo?.summary || "",
      context || "",
    ].join("\n"),
    PROMPT_CACHE_SALT
  );
  const cacheOpts = {
    apiSlug: apiSetting.apiSlug,
    text,
    fromLang,
    toLang,
    version: [v1, v2].join("."),
    promptSig: await getPromptCacheSig(apiSetting, PROMPT_CACHE_SCOPE_DICT),
    contextSig: contextSig.slice(0, 16),
  };
  const cacheInput = `${URL_CACHE_DICT}?${queryString.stringify(cacheOpts)}`;

  if (useCache) {
    const cache = await getHttpCachePolyfill(cacheInput);
    if (cache?.markdown) {
      return cache.markdown;
    }
  }
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const markdown = await handleDict({
    text,
    from,
    to,
    fromLang,
    toLang,
    apiSetting,
    docInfo: effectiveDocInfo,
    context,
    onStreamChunk,
    signal,
  });

  if (useCache) {
    putHttpCachePolyfill(cacheInput, null, { markdown });
  }

  return markdown;
};

/**
 * 专为视频外挂字幕 (Subtitle Segment) 订制的翻译处理函数。
 * 融合了视频上下文摘要，使得大模型字幕翻译语义更加贴合剧情，不会产生传统断句翻译的突兀感。
 * @param {Object} params 包含视频 ID、字幕块标识、当前切片字幕数组、上一句和下一句字幕上下文等。
 * @param {Function} [params.onSubtitleChunk] 字幕断句流式输出完整句子时触发的增量回调。
 * @param {AbortSignal} [params.signal] 当前字幕处理生命周期的取消信号，会下传到请求层。
 * @returns {Promise<Array<Object>>} 完整字幕断句与翻译结果。
 */
export const apiSubtitle = async ({
  videoId,
  chunkSign,
  fromLang = "auto",
  toLang,
  events = [],
  apiSetting,
  docInfo,
  prevContext = "",
  nextContext = "",
  onSubtitleChunk,
  signal,
}) => {
  if (!events?.length) return [];
  const cacheOpts = {
    apiSlug: apiSetting.apiSlug,
    videoId,
    chunkSign,
    fromLang,
    toLang,
    segVer: 2,
    promptSig: await getPromptCacheSig(apiSetting, PROMPT_CACHE_SCOPE_SUBTITLE),
    ctx: docInfo?.summary?.slice(0, 50) || "",
  };
  const cacheInput = `${URL_CACHE_SUBTITLE}?${queryString.stringify(cacheOpts)}`;

  // 1. 读取视频字幕缓存
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  // 2. 发起含有剧本前后文语义的字幕翻译请求
  const subtitles = await handleSubtitle({
    events,
    from: fromLang,
    to: toLang,
    apiSetting,
    docInfo,
    prevContext,
    nextContext,
    onSubtitleChunk,
    signal,
  });
  if (subtitles?.length) {
    putHttpCachePolyfill(cacheInput, null, subtitles);
    return subtitles;
  }

  return [];
};

/**
 * 对视频标题、简介和原始字幕轨进行长文本上下文的总结与归纳，提取视频核心大纲 (Video Context Summary)。
 * 归纳出的 summary 会反馈给字幕翻译 API，以便提供语义支撑。
 */
export const apiSummarizeContext = async ({
  videoId,
  title,
  description,
  transcript,
  apiSetting,
}) => {
  const cacheOpts = { apiSlug: apiSetting.apiSlug, videoId };
  const cacheInput = `${URL_CACHE_CONTEXT}?${queryString.stringify(cacheOpts)}`;

  // 1. 读取总结摘要缓存，避免每次打开同一视频重复对长文本请求总结
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  // 2. 调用大模型/特定接口生成视频提炼大纲
  const summary = await handleSummarize({
    title,
    description,
    transcript,
    apiSetting,
  });

  if (summary) {
    putHttpCachePolyfill(cacheInput, null, summary);
    return summary;
  }

  return "";
};
