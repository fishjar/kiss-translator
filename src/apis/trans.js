import queryString from "query-string";
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
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO,
  INPUT_PLACE_TEXT,
  INPUT_PLACE_KEY,
  INPUT_PLACE_MODEL,
} from "../config";
import { msAuth } from "../libs/auth";
import { genDeeplFree } from "./deepl";
import { genBaidu } from "./baidu";
import interpreter from "../libs/interpreter";
import { parseJsonObj, extractJson } from "../libs/utils";
import { kissLog } from "../libs/log";
import { fetchData } from "../libs/fetch";

const keyMap = new Map();
const urlMap = new Map();

// 轮询key/url
const keyPick = (translator, key = "", cacheMap) => {
  const keys = key
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return "";
  }

  const preIndex = cacheMap.get(translator) ?? -1;
  const curIndex = (preIndex + 1) % keys.length;
  cacheMap.set(translator, curIndex);

  return keys[curIndex];
};

const genSystemPrompt = ({ systemPrompt, from, to }) =>
  systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to);

const genUserPrompt = ({ userPrompt, from, to, texts, docInfo }) => {
  const prompt = JSON.stringify({
    targetLanguage: to,
    title: docInfo.title,
    description: docInfo.description,
    segments: texts.map((text, i) => ({ id: i, text })),
  });

  if (userPrompt.includes(INPUT_PLACE_TEXT)) {
    return userPrompt
      .replaceAll(INPUT_PLACE_FROM, from)
      .replaceAll(INPUT_PLACE_TO, to)
      .replaceAll(INPUT_PLACE_TEXT, prompt);
  }

  return prompt;
};

const parseAIRes = (raw) => {
  let data;

  try {
    const jsonString = extractJson(raw);
    data = JSON.parse(jsonString);
  } catch (err) {
    kissLog(err, "parseAIRes");
    data = { translations: [] };
  }

  if (!Array.isArray(data.translations)) {
    data.translations = [];
  }

  return data.translations.map((item) => [item.text]);
};

const genGoogle = ({ texts, from, to, url, key }) => {
  const params = {
    client: "gtx",
    dt: "t",
    dj: 1,
    ie: "UTF-8",
    sl: from,
    tl: to,
    q: texts.join(" "),
  };
  const input = `${url}?${queryString.stringify(params)}`;
  const init = {
    headers: {
      "Content-type": "application/json",
    },
  };
  if (key) {
    init.headers.Authorization = `Bearer ${key}`;
  }

  return [input, init];
};

const genGoogle2 = ({ texts, from, to, url, key }) => {
  const body = JSON.stringify([[texts, from, to], "wt_lib"]);
  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json+protobuf",
      "X-Goog-API-Key": key,
    },
    body,
  };

  return [url, init];
};

const genMicrosoft = async ({ texts, from, to }) => {
  const [token] = await msAuth();
  const params = {
    from,
    to,
    "api-version": "3.0",
  };
  const input = `https://api-edge.cognitive.microsofttranslator.com/translate?${queryString.stringify(params)}`;
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
    body: JSON.stringify(texts.map((text) => ({ Text: text }))),
  };

  return [input, init];
};

const genDeepl = ({ texts, from, to, url, key }) => {
  const data = {
    text: texts,
    target_lang: to,
    source_lang: from,
    // split_sentences: "0",
  };
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `DeepL-Auth-Key ${key}`,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genDeeplX = ({ texts, from, to, url, key }) => {
  const data = {
    text: texts.join(" "),
    target_lang: to,
    source_lang: from,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
  };
  if (key) {
    init.headers.Authorization = `Bearer ${key}`;
  }

  return [url, init];
};

const genNiuTrans = ({ texts, from, to, url, key, dictNo, memoryNo }) => {
  const data = {
    from,
    to,
    apikey: key,
    src_text: texts.join(" "),
    dictNo,
    memoryNo,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genTencent = ({ texts, from, to }) => {
  const data = {
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

  const input = "https://transmart.qq.com/api/imt";
  const init = {
    headers: {
      "Content-Type": "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
      referer: "https://transmart.qq.com/zh-CN/index",
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [input, init];
};

const genVolcengine = ({ texts, from, to }) => {
  const data = {
    source_language: from,
    target_language: to,
    text: texts.join(" "),
  };

  const input = "https://translate.volcengine.com/crx/translate/v1";
  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [input, init];
};

const genOpenAI = ({
  texts,
  from,
  to,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  customHeader,
  customBody,
  docInfo,
}) => {
  systemPrompt = genSystemPrompt({ systemPrompt, from, to });
  userPrompt = genUserPrompt({ userPrompt, from, to, texts, docInfo });
  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature,
    max_completion_tokens: maxTokens,
    ...customBody,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${key}`, // OpenAI
      "api-key": key, // Azure OpenAI
      ...customHeader,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genGemini = ({
  texts,
  from,
  to,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  customHeader,
  customBody,
  docInfo,
}) => {
  url = url
    .replaceAll(INPUT_PLACE_MODEL, model)
    .replaceAll(INPUT_PLACE_KEY, key);
  systemPrompt = genSystemPrompt({ systemPrompt, from, to });
  userPrompt = genUserPrompt({ userPrompt, from, to, texts, docInfo });
  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    system_instruction: {
      parts: {
        text: systemPrompt,
      },
    },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
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
    ...customBody,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      ...customHeader,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genGemini2 = ({
  texts,
  from,
  to,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  customHeader,
  customBody,
  docInfo,
}) => {
  systemPrompt = genSystemPrompt({ systemPrompt, from, to });
  userPrompt = genUserPrompt({ userPrompt, from, to, texts, docInfo });
  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature,
    max_tokens: maxTokens,
    ...customBody,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${key}`,
      ...customHeader,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genClaude = ({
  texts,
  from,
  to,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  customHeader,
  customBody,
  docInfo,
}) => {
  systemPrompt = genSystemPrompt({ systemPrompt, from, to });
  userPrompt = genUserPrompt({ userPrompt, from, to, texts, docInfo });
  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    model,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature,
    max_tokens: maxTokens,
    ...customBody,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": key,
      ...customHeader,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genOpenRouter = ({
  texts,
  from,
  to,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  customHeader,
  customBody,
  docInfo,
}) => {
  systemPrompt = genSystemPrompt({ systemPrompt, from, to });
  userPrompt = genUserPrompt({ userPrompt, from, to, texts, docInfo });
  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature,
    max_tokens: maxTokens,
    ...customBody,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${key}`,
      ...customHeader,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genOllama = ({
  texts,
  from,
  to,
  think,
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  customHeader,
  customBody,
  docInfo,
}) => {
  systemPrompt = genSystemPrompt({ systemPrompt, from, to });
  userPrompt = genUserPrompt({ userPrompt, from, to, texts, docInfo });
  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    model,
    system: systemPrompt,
    prompt: userPrompt,
    think: think,
    stream: false,
    ...customBody,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      ...customHeader,
    },
    method: "POST",
    body: JSON.stringify(data),
  };
  if (key) {
    init.headers.Authorization = `Bearer ${key}`;
  }

  return [url, init];
};

const genCloudflareAI = ({ texts, from, to, url, key }) => {
  const data = {
    text: texts.join(" "),
    source_lang: from,
    target_lang: to,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genCustom = ({ texts, from, to, url, key, reqHook, docInfo }) => {
  if (reqHook?.trim()) {
    interpreter.run(`exports.reqHook = ${reqHook}`);
    return interpreter.exports.reqHook({ texts, from, to, url, key, docInfo });
  }

  const data = { texts, from, to };
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

/**
 * 构造翻译接口请求参数
 * @param {*}
 * @returns
 */
export const genTransReq = (translator, args) => {
  switch (translator) {
    case OPT_TRANS_DEEPL:
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_OPENAI_2:
    case OPT_TRANS_OPENAI_3:
    case OPT_TRANS_GEMINI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_CLAUDE:
    case OPT_TRANS_CLOUDFLAREAI:
    case OPT_TRANS_OLLAMA:
    case OPT_TRANS_OLLAMA_2:
    case OPT_TRANS_OLLAMA_3:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_NIUTRANS:
    case OPT_TRANS_CUSTOMIZE:
    case OPT_TRANS_CUSTOMIZE_2:
    case OPT_TRANS_CUSTOMIZE_3:
    case OPT_TRANS_CUSTOMIZE_4:
    case OPT_TRANS_CUSTOMIZE_5:
      args.key = keyPick(translator, args.key, keyMap);
      break;
    case OPT_TRANS_DEEPLX:
      args.url = keyPick(translator, args.url, urlMap);
      break;
    default:
  }

  switch (translator) {
    case OPT_TRANS_GOOGLE:
      return genGoogle(args);
    case OPT_TRANS_GOOGLE_2:
      return genGoogle2(args);
    case OPT_TRANS_MICROSOFT:
      return genMicrosoft(args);
    case OPT_TRANS_DEEPL:
      return genDeepl(args);
    case OPT_TRANS_DEEPLFREE:
      return genDeeplFree(args);
    case OPT_TRANS_DEEPLX:
      return genDeeplX(args);
    case OPT_TRANS_NIUTRANS:
      return genNiuTrans(args);
    case OPT_TRANS_BAIDU:
      return genBaidu(args);
    case OPT_TRANS_TENCENT:
      return genTencent(args);
    case OPT_TRANS_VOLCENGINE:
      return genVolcengine(args);
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_OPENAI_2:
    case OPT_TRANS_OPENAI_3:
      return genOpenAI(args);
    case OPT_TRANS_GEMINI:
      return genGemini(args);
    case OPT_TRANS_GEMINI_2:
      return genGemini2(args);
    case OPT_TRANS_CLAUDE:
      return genClaude(args);
    case OPT_TRANS_CLOUDFLAREAI:
      return genCloudflareAI(args);
    case OPT_TRANS_OLLAMA:
    case OPT_TRANS_OLLAMA_2:
    case OPT_TRANS_OLLAMA_3:
      return genOllama(args);
    case OPT_TRANS_OPENROUTER:
      return genOpenRouter(args);
    case OPT_TRANS_CUSTOMIZE:
    case OPT_TRANS_CUSTOMIZE_2:
    case OPT_TRANS_CUSTOMIZE_3:
    case OPT_TRANS_CUSTOMIZE_4:
    case OPT_TRANS_CUSTOMIZE_5:
      return genCustom(args);
    default:
      throw new Error(`[trans] translator: ${translator} not support`);
  }
};

/**
 * 解析翻译接口返回数据
 * @param {*} translator
 * @param {*} res
 * @param {*} param3
 * @returns
 */
export const parseTransRes = (
  translator,
  res,
  { texts, from, to, resHook, thinkIgnore }
) => {
  switch (translator) {
    case OPT_TRANS_GOOGLE:
      return [[res?.sentences?.map((item) => item.trans).join(" "), res?.src]];
    case OPT_TRANS_GOOGLE_2:
      return res?.[0]?.map((_, i) => [res?.[0]?.[i], res?.[1]?.[i]]);
    case OPT_TRANS_MICROSOFT:
      return res?.map((item) => [
        item.translations.map((item) => item.text).join(" "),
        item.detectedLanguage.language,
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
      return new Map([[0, [res?.translation, res?.detected_language]]]);
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_OPENAI_2:
    case OPT_TRANS_OPENAI_3:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
      return parseAIRes(res?.choices?.[0]?.message?.content ?? "");
    case OPT_TRANS_GEMINI:
      return parseAIRes(res?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    case OPT_TRANS_CLAUDE:
      return parseAIRes(res?.content?.[0]?.text ?? "");
    case OPT_TRANS_CLOUDFLAREAI:
      return [[res?.result?.translated_text]];
    case OPT_TRANS_OLLAMA:
    case OPT_TRANS_OLLAMA_2:
    case OPT_TRANS_OLLAMA_3:
      let resText = res?.response ?? "";
      const deepModels = thinkIgnore.split(",").filter((model) => model.trim());
      if (deepModels.some((model) => res?.model?.startsWith(model))) {
        resText = res?.response.replace(/<think>[\s\S]*<\/think>/i, "");
      }
      return parseAIRes(resText);
    case OPT_TRANS_CUSTOMIZE:
    case OPT_TRANS_CUSTOMIZE_2:
    case OPT_TRANS_CUSTOMIZE_3:
    case OPT_TRANS_CUSTOMIZE_4:
    case OPT_TRANS_CUSTOMIZE_5:
      if (resHook?.trim()) {
        interpreter.run(`exports.resHook = ${resHook}`);
        return interpreter.exports.resHook({ res, texts, from, to });
      } else {
        return res?.map((item) => [item.text, item.src]);
      }
    default:
  }

  return [];
};

/**
 * 发送翻译请求并解析
 * @param {*} param0
 * @returns
 */
export const handleTranslate = async ({
  translator,
  texts,
  from,
  to,
  docInfo,
  apiSetting,
  usePool,
}) => {
  const [input, init] = await genTransReq(translator, {
    texts,
    from,
    to,
    docInfo,
    ...apiSetting,
  });

  const res = await fetchData(input, init, {
    useCache: false,
    usePool,
    fetchInterval: apiSetting.fetchInterval,
    fetchLimit: apiSetting.fetchLimit,
    httpTimeout: apiSetting.httpTimeout,
  });
  if (!res) {
    throw new Error("tranlate got empty response");
  }

  return parseTransRes(translator, res, {
    texts,
    from,
    to,
    ...apiSetting,
  });
};
