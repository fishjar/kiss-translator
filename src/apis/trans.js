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
  URL_MICROSOFT_TRAN,
  URL_TENCENT_TRANSMART,
  URL_VOLCENGINE_TRAN,
  INPUT_PLACE_URL,
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
import { parseJsonObj } from "../libs/utils";

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

const genGoogle = ({ text, from, to, url, key }) => {
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

const genGoogle2 = ({ text, from, to, url, key }) => {
  const body = JSON.stringify([[[text], from, to], "wt_lib"]);
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

const genMicrosoft = async ({ text, from, to }) => {
  const [token] = await msAuth();
  const params = {
    from,
    to,
    "api-version": "3.0",
  };
  const input = `${URL_MICROSOFT_TRAN}?${queryString.stringify(params)}`;
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
    body: JSON.stringify([{ Text: text }]),
  };

  return [input, init];
};

const genDeepl = ({ text, from, to, url, key }) => {
  const data = {
    text: [text],
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

const genDeeplX = ({ text, from, to, url, key }) => {
  const data = {
    text,
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

const genNiuTrans = ({ text, from, to, url, key, dictNo, memoryNo }) => {
  const data = {
    from,
    to,
    apikey: key,
    src_text: text,
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

const genTencent = ({ text, from, to }) => {
  const data = {
    header: {
      fn: "auto_translation",
      client_key:
        "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487",
    },
    type: "plain",
    model_category: "normal",
    source: {
      text_list: [text],
      lang: from,
    },
    target: {
      lang: to,
    },
  };

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

  return [URL_TENCENT_TRANSMART, init];
};

const genVolcengine = ({ text, from, to }) => {
  const data = {
    source_language: from,
    target_language: to,
    text: text,
  };

  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [URL_VOLCENGINE_TRAN, init];
};

const genOpenAI = ({
  text,
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
}) => {
  // 兼容历史上作为systemPrompt的prompt，如果prompt中不包含带翻译文本，则添加文本到prompt末尾
  // if (!prompt.includes(INPUT_PLACE_TEXT)) {
  //   prompt += `\nSource Text: ${INPUT_PLACE_TEXT}`;
  // }
  systemPrompt = systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);
  userPrompt = userPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);

  // TODO: 同时支持json对象和hook函数
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
  text,
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
}) => {
  url = url
    .replaceAll(INPUT_PLACE_MODEL, model)
    .replaceAll(INPUT_PLACE_KEY, key);
  systemPrompt = systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);
  userPrompt = userPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);

  customHeader = parseJsonObj(customHeader);
  customBody = parseJsonObj(customBody);

  const data = {
    system_instruction: {
      parts: {
        text: systemPrompt,
      },
    },
    contents: {
      role: "user",
      parts: {
        text: userPrompt,
      },
    },
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      // topP: 0.8,
      // topK: 10,
    },
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
  text,
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
}) => {
  systemPrompt = systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);
  userPrompt = userPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);

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
  text,
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
}) => {
  systemPrompt = systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);
  userPrompt = userPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);

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
  text,
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
}) => {
  systemPrompt = systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);
  userPrompt = userPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);

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
  text,
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
}) => {
  systemPrompt = systemPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);
  userPrompt = userPrompt
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text);

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

const genCloudflareAI = ({ text, from, to, url, key }) => {
  const data = {
    text,
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

const genCustom = ({ text, from, to, url, key, reqHook }) => {
  url = url
    .replaceAll(INPUT_PLACE_URL, url)
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_TEXT, text)
    .replaceAll(INPUT_PLACE_KEY, key);
  let init = {};

  if (reqHook?.trim()) {
    interpreter.run(`exports.reqHook = ${reqHook}`);
    [url, init] = interpreter.exports.reqHook(text, from, to, url, key);
    return [url, init];
  }

  const data = {
    text,
    from,
    to,
  };
  init = {
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

/**
 * 构造翻译接口请求参数
 * @param {*}
 * @returns
 */
export const genTransReq = ({ translator, text, from, to }, apiSetting) => {
  const args = { text, from, to, ...apiSetting };

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
