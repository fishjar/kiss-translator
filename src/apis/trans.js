import queryString from "query-string";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_NIUTRANS,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_CUSTOMIZE,
  API_SPE_TYPES,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO,
  // INPUT_PLACE_TEXT,
  INPUT_PLACE_KEY,
  INPUT_PLACE_MODEL,
  DEFAULT_USER_AGENT,
  defaultSystemPrompt,
  defaultSubtitlePrompt,
} from "../config";
import { msAuth } from "../libs/auth";
import { genDeeplFree } from "./deepl";
import { genBaidu } from "./baidu";
import interpreter from "../libs/interpreter";
import { parseJsonObj, extractJson } from "../libs/utils";
import { kissLog } from "../libs/log";
import { fetchData } from "../libs/fetch";
import { getMsgHistory } from "./history";
import { parseBilingualVtt } from "../subtitle/vtt";

const keyMap = new Map();
const urlMap = new Map();

// 轮询key/url
const keyPick = (apiSlug, key = "", cacheMap) => {
  const keys = key
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return "";
  }

  const preIndex = cacheMap.get(apiSlug) ?? -1;
  const curIndex = (preIndex + 1) % keys.length;
  cacheMap.set(apiSlug, curIndex);

  return keys[curIndex];
};

const genSystemPrompt = ({ systemPrompt, from, to }) =>
  systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to);

const genUserPrompt = ({
  // userPrompt,
  tone,
  glossary = {},
  // from,
  to,
  texts,
  docInfo,
}) => {
  const prompt = JSON.stringify({
    targetLanguage: to,
    title: docInfo.title,
    description: docInfo.description,
    segments: texts.map((text, i) => ({ id: i, text })),
    glossary,
    tone,
  });

  // if (userPrompt.includes(INPUT_PLACE_TEXT)) {
  //   return userPrompt
  //     .replaceAll(INPUT_PLACE_FROM, from)
  //     .replaceAll(INPUT_PLACE_TO, to)
  //     .replaceAll(INPUT_PLACE_TEXT, prompt);
  // }

  return prompt;
};

const parseAIRes = (raw) => {
  if (!raw) {
    return [];
  }

  try {
    const jsonString = extractJson(raw);
    if (!jsonString) return [];

    const data = JSON.parse(jsonString);
    if (Array.isArray(data.translations)) {
      // todo: 考虑序号id可能会打乱
      return data.translations.map((item) => [
        item?.text ?? "",
        item?.sourceLanguage ?? "",
      ]);
    }
  } catch (err) {
    kissLog("parseAIRes", err);
  }

  return [];
};

const parseSTRes = (raw) => {
  if (!raw) {
    return [];
  }

  try {
    // const jsonString = extractJson(raw);
    // const data = JSON.parse(jsonString);
    const data = parseBilingualVtt(raw);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    kissLog("parseAIRes: subtitle", err);
  }

  return [];
};

const genGoogle = ({ texts, from, to, url, key }) => {
  const params = queryString.stringify({
    client: "gtx",
    dt: "t",
    dj: 1,
    ie: "UTF-8",
    sl: from,
    tl: to,
    q: texts.join(" "),
  });
  url = `${url}?${params}`;
  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, headers, method: "GET" };
};

const genGoogle2 = ({ texts, from, to, url, key }) => {
  const body = [[texts, from, to], "wt_lib"];
  const headers = {
    "Content-Type": "application/json+protobuf",
    "X-Goog-API-Key": key,
  };

  return { url, body, headers };
};

const genMicrosoft = ({ texts, from, to, token }) => {
  const params = queryString.stringify({
    from,
    to,
    "api-version": "3.0",
  });
  const url = `https://api-edge.cognitive.microsofttranslator.com/translate?${params}`;
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const body = texts.map((text) => ({ Text: text }));

  return { url, body, headers };
};

const genAzureAI = ({ texts, from, to, url, key, region }) => {
  const params = queryString.stringify({
    from,
    to,
  });
  url = url.endsWith("&") ? `${url}${params}` : `${url}&${params}`;
  const headers = {
    "Content-type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
    "Ocp-Apim-Subscription-Region": region,
  };
  const body = texts.map((text) => ({ Text: text }));

  return { url, body, headers };
};

const genDeepl = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts,
    target_lang: to,
    source_lang: from,
    // split_sentences: "0",
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `DeepL-Auth-Key ${key}`,
  };

  return { url, body, headers };
};

const genDeeplX = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts.join(" "),
    target_lang: to,
    source_lang: from,
  };

  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, body, headers };
};

const genNiuTrans = ({ texts, from, to, url, key, dictNo, memoryNo }) => {
  const body = {
    from,
    to,
    apikey: key,
    src_text: texts.join(" "),
    dictNo,
    memoryNo,
  };

  const headers = {
    "Content-type": "application/json",
  };

  return { url, body, headers };
};

const genTencent = ({ texts, from, to }) => {
  const body = {
    header: {
      fn: "auto_translation",
      client_key:
        "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487",
    },
    type: "plain",
    model_category: "normal",
    source: {
      text_list: texts,
      lang: from,
    },
    target: {
      lang: to,
    },
  };

  const url = "https://transmart.qq.com/api/imt";
  const headers = {
    "Content-Type": "application/json",
    "user-agent": DEFAULT_USER_AGENT,
    referer: "https://transmart.qq.com/zh-CN/index",
  };

  return { url, body, headers };
};

const genVolcengine = ({ texts, from, to }) => {
  const body = {
    source_language: from,
    target_language: to,
    text: texts.join(" "),
  };

  const url = "https://translate.volcengine.com/crx/translate/v1";
  const headers = {
    "Content-type": "application/json",
  };

  return { url, body, headers };
};

const genOpenAI = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_completion_tokens: maxTokens,
  };

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`, // OpenAI
    // "api-key": key, // Azure OpenAI
  };

  return { url, body, headers, userMsg };
};

const genGemini = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
}) => {
  url = url
    .replaceAll(INPUT_PLACE_MODEL, model)
    .replaceAll(INPUT_PLACE_KEY, key);

  const userMsg = { role: "user", parts: [{ text: userPrompt }] };
  const body = {
    // system_instruction: {
    //   parts: {
    //     text: systemPrompt,
    //   },
    // },
    contents: [
      {
        role: "model",
        parts: [{ text: systemPrompt }],
      },
      ...hisMsgs,
      userMsg,
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      // topP: 0.8,
      // topK: 10,
    },
    // thinkingConfig: {
    //   thinkingBudget: 0,
    // },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
    ],
  };
  const headers = {
    "Content-type": "application/json",
  };

  return { url, body, headers, userMsg };
};

const genGemini2 = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers, userMsg };
};

const genClaude = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    system: systemPrompt,
    messages: [...hisMsgs, userMsg],
    temperature,
    max_tokens: maxTokens,
  };

  const headers = {
    "Content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "x-api-key": key,
  };

  return { url, body, headers, userMsg };
};

const genOpenRouter = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers, userMsg };
};

const genOllama = ({
  think,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_tokens: maxTokens,
    think,
    stream: false,
  };

  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, body, headers, userMsg };
};

const genCloudflareAI = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts.join(" "),
    source_lang: from,
    target_lang: to,
  };

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers };
};

const genCustom = ({ texts, from, to, url, key }) => {
  const body = { texts, from, to };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers };
};

const genReqFuncs = {
  [OPT_TRANS_GOOGLE]: genGoogle,
  [OPT_TRANS_GOOGLE_2]: genGoogle2,
  [OPT_TRANS_MICROSOFT]: genMicrosoft,
  [OPT_TRANS_AZUREAI]: genAzureAI,
  [OPT_TRANS_DEEPL]: genDeepl,
  [OPT_TRANS_DEEPLFREE]: genDeeplFree,
  [OPT_TRANS_DEEPLX]: genDeeplX,
  [OPT_TRANS_NIUTRANS]: genNiuTrans,
  [OPT_TRANS_BAIDU]: genBaidu,
  [OPT_TRANS_TENCENT]: genTencent,
  [OPT_TRANS_VOLCENGINE]: genVolcengine,
  [OPT_TRANS_OPENAI]: genOpenAI,
  [OPT_TRANS_GEMINI]: genGemini,
  [OPT_TRANS_GEMINI_2]: genGemini2,
  [OPT_TRANS_CLAUDE]: genClaude,
  [OPT_TRANS_CLOUDFLAREAI]: genCloudflareAI,
  [OPT_TRANS_OLLAMA]: genOllama,
  [OPT_TRANS_OPENROUTER]: genOpenRouter,
  [OPT_TRANS_CUSTOMIZE]: genCustom,
};

const genInit = ({
  url = "",
  body = null,
  headers = {},
  userMsg = null,
  method = "POST",
}) => {
  if (!url) {
    throw new Error("genInit: url is empty");
  }

  const init = {
    method,
    headers,
  };
  if (method !== "GET" && method !== "HEAD" && body) {
    let payload = JSON.stringify(body);
    const id = body?.params?.id;
    if (id) {
      payload = payload.replace(
        'method":"',
        (id + 3) % 13 === 0 || (id + 5) % 29 === 0
          ? 'method" : "'
          : 'method": "'
      );
    }
    Object.assign(init, { body: payload });
  }

  return [url, init, userMsg];
};

/**
 * 构造翻译接口请求参数
 * @param {*}
 * @returns
 */
export const genTransReq = async ({ reqHook, ...args }) => {
  const {
    apiType,
    apiSlug,
    key,
    systemPrompt,
    userPrompt,
    from,
    to,
    texts,
    docInfo,
    glossary,
    customHeader,
    customBody,
    events,
  } = args;

  if (API_SPE_TYPES.mulkeys.has(apiType)) {
    args.key = keyPick(apiSlug, key, keyMap);
  }

  if (apiType === OPT_TRANS_DEEPLX) {
    args.url = keyPick(apiSlug, args.url, urlMap);
  }

  if (API_SPE_TYPES.ai.has(apiType)) {
    args.systemPrompt = genSystemPrompt({ systemPrompt, from, to });
    args.userPrompt = !!events
      ? JSON.stringify(events)
      : genUserPrompt({
          userPrompt,
          from,
          to,
          texts,
          docInfo,
          glossary,
        });
  }

  const {
    url = "",
    body = null,
    headers = {},
    userMsg = null,
    method = "POST",
  } = genReqFuncs[apiType](args);

  // 合并用户自定义headers和body
  if (customHeader?.trim()) {
    Object.assign(headers, parseJsonObj(customHeader));
  }
  if (customBody?.trim()) {
    Object.assign(body, parseJsonObj(customBody));
  }

  // 执行 request hook
  if (reqHook?.trim() && !events) {
    try {
      interpreter.run(`exports.reqHook = ${reqHook}`);
      const hookResult = await interpreter.exports.reqHook(
        { ...args, defaultSystemPrompt, defaultSubtitlePrompt },
        {
          url,
          body,
          headers,
          userMsg,
          method,
        }
      );
      if (hookResult && hookResult.url) {
        return genInit(hookResult);
      }
    } catch (err) {
      kissLog("run req hook", err);
    }
  }

  return genInit({ url, body, headers, userMsg, method });
};

/**
 * 解析翻译接口返回数据
 * @param {*} res
 * @param {*} param3
 * @returns
 */
export const parseTransRes = async (
  res,
  {
    texts,
    from,
    to,
    fromLang,
    toLang,
    langMap,
    resHook,
    thinkIgnore,
    history,
    userMsg,
    apiType,
  }
) => {
  // 执行 response hook
  if (resHook?.trim()) {
    try {
      interpreter.run(`exports.resHook = ${resHook}`);
      const hookResult = await interpreter.exports.resHook({
        apiType,
        userMsg,
        res,
        texts,
        from,
        to,
        fromLang,
        toLang,
        langMap,
        extractJson,
        parseAIRes,
      });
      if (hookResult && Array.isArray(hookResult.translations)) {
        if (history && userMsg && hookResult.modelMsg) {
          history.add(userMsg, hookResult.modelMsg);
        }
        return hookResult.translations;
      }
    } catch (err) {
      kissLog("run res hook", err);
    }
  }

  let modelMsg = "";

  // todo: 根据结果抛出实际异常信息
  switch (apiType) {
    case OPT_TRANS_GOOGLE:
      return [[res?.sentences?.map((item) => item.trans).join(" "), res?.src]];
    case OPT_TRANS_GOOGLE_2:
      return res?.[0]?.map((_, i) => [res?.[0]?.[i], res?.[1]?.[i]]);
    case OPT_TRANS_MICROSOFT:
    case OPT_TRANS_AZUREAI:
      return res?.map((item) => [
        item.translations.map((item) => item.text).join(" "),
        item.detectedLanguage?.language,
      ]);
    case OPT_TRANS_DEEPL:
      return res?.translations?.map((item) => [
        item.text,
        item.detected_source_language,
      ]);
    case OPT_TRANS_DEEPLFREE:
      return [
        [
          res?.result?.texts?.map((item) => item.text).join(" "),
          res?.result?.lang,
        ],
      ];
    case OPT_TRANS_DEEPLX:
      return [[res?.data, res?.source_lang]];
    case OPT_TRANS_NIUTRANS:
      const json = JSON.parse(res);
      if (json.error_msg) {
        throw new Error(json.error_msg);
      }
      return [[json.tgt_text, json.from]];
    case OPT_TRANS_BAIDU:
      if (res.type === 1) {
        return [
          [
            Object.keys(JSON.parse(res.result).content[0].mean[0].cont)[0],
            res.from,
          ],
        ];
      } else if (res.type === 2) {
        return [[res.data.map((item) => item.dst).join(" "), res.from]];
      }
      break;
    case OPT_TRANS_TENCENT:
      return res?.auto_translation?.map((text) => [text, res?.src_lang]);
    case OPT_TRANS_VOLCENGINE:
      return [[res?.translation, res?.detected_language]];
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
      modelMsg = res?.choices?.[0]?.message;
      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(res?.choices?.[0]?.message?.content ?? "");
    case OPT_TRANS_GEMINI:
      modelMsg = res?.candidates?.[0]?.content;
      if (history && userMsg && modelMsg) {
        history.add(userMsg, modelMsg);
      }
      return parseAIRes(res?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    case OPT_TRANS_CLAUDE:
      modelMsg = { role: res?.role, content: res?.content?.text };
      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(res?.content?.[0]?.text ?? "");
    case OPT_TRANS_CLOUDFLAREAI:
      return [[res?.result?.translated_text]];
    case OPT_TRANS_OLLAMA:
      modelMsg = res?.choices?.[0]?.message;

      const deepModels = thinkIgnore
        .split(",")
        .filter((model) => model?.trim());
      if (deepModels.some((model) => res?.model?.startsWith(model))) {
        modelMsg?.content.replace(/<think>[\s\S]*<\/think>/i, "");
      }

      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(modelMsg?.content);
    case OPT_TRANS_CUSTOMIZE:
      return (res?.translations ?? res)?.map((item) => [item.text, item.src]);
    default:
  }

  throw new Error("parse translate result: apiType not matched", apiType);
};

/**
 * 发送翻译请求并解析
 * @param {*} param0
 * @returns
 */
export const handleTranslate = async (
  texts = [],
  {
    from,
    to,
    fromLang,
    toLang,
    langMap,
    docInfo,
    glossary,
    apiSetting,
    usePool,
  }
) => {
  let history = null;
  let hisMsgs = [];
  const {
    apiType,
    apiSlug,
    contextSize,
    useContext,
    fetchInterval,
    fetchLimit,
    httpTimeout,
  } = apiSetting;
  if (useContext && API_SPE_TYPES.context.has(apiType)) {
    history = getMsgHistory(apiSlug, contextSize);
    hisMsgs = history.getAll();
  }

  let token = "";
  if (apiType === OPT_TRANS_MICROSOFT) {
    token = await msAuth();
    if (!token) {
      throw new Error("got msauth error");
    }
  }

  const [input, init, userMsg] = await genTransReq({
    texts,
    from,
    to,
    fromLang,
    toLang,
    langMap,
    docInfo,
    glossary,
    hisMsgs,
    token,
    ...apiSetting,
  });

  const response = await fetchData(input, init, {
    useCache: false,
    usePool,
    fetchInterval,
    fetchLimit,
    httpTimeout,
  });
  if (!response) {
    throw new Error("translate got empty response");
  }

  const result = await parseTransRes(response, {
    texts,
    from,
    to,
    fromLang,
    toLang,
    langMap,
    history,
    userMsg,
    ...apiSetting,
  });
  if (!result?.length) {
    throw new Error("translate got an unexpected result");
  }

  return result;
};

/**
 * Microsoft语言识别聚合及解析
 * @param {*} texts
 * @returns
 */
export const handleMicrosoftLangdetect = async (texts = []) => {
  const token = await msAuth();
  const input =
    "https://api-edge.cognitive.microsofttranslator.com/detect?api-version=3.0";
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
    body: JSON.stringify(texts.map((text) => ({ Text: text }))),
  };

  const res = await fetchData(input, init, {
    useCache: false,
  });

  if (Array.isArray(res)) {
    return res.map((r) => r.language);
  }

  return [];
};

/**
 * 字幕翻译
 * @param {*} param0
 * @returns
 */
export const handleSubtitle = async ({ events, from, to, apiSetting }) => {
  const { apiType, fetchInterval, fetchLimit, httpTimeout } = apiSetting;

  const [input, init] = await genTransReq({
    ...apiSetting,
    events,
    from,
    to,
    systemPrompt: apiSetting.subtitlePrompt,
  });

  const res = await fetchData(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval,
    fetchLimit,
    httpTimeout,
  });
  if (!res) {
    kissLog("subtitle got empty response");
    return [];
  }

  switch (apiType) {
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_OLLAMA:
      return parseSTRes(res?.choices?.[0]?.message?.content ?? "");
    case OPT_TRANS_GEMINI:
      return parseSTRes(res?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    case OPT_TRANS_CLAUDE:
      return parseSTRes(res?.content?.[0]?.text ?? "");
    case OPT_TRANS_CUSTOMIZE:
      return res;
    default:
  }

  return [];
};
