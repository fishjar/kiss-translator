import queryString from "query-string";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_CUSTOMIZE_2,
  OPT_TRANS_CUSTOMIZE_3,
  OPT_TRANS_CUSTOMIZE_4,
  OPT_TRANS_CUSTOMIZE_5,
  URL_MICROSOFT_TRAN,
  URL_TENCENT_TRANSMART,
  PROMPT_PLACE_FROM,
  PROMPT_PLACE_TO,
  PROMPT_PLACE_TEXT,
} from "../config";
import { msAuth } from "./auth";
import { genDeeplFree } from "../apis/deepl";
import { genBaidu } from "../apis/baidu";

const keyMap = new Map();

// 轮询key
const keyPick = (translator, key = "") => {
  const keys = key
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return "";
  }

  const preIndex = keyMap.get(translator) ?? -1;
  const curIndex = (preIndex + 1) % keys.length;
  keyMap.set(translator, curIndex);

  return keys[curIndex];
};

/**
 * 构造缓存 request
 * @param {*} request
 * @returns
 */
export const newCacheReq = async (input, init) => {
  let request = new Request(input, init);
  if (request.method !== "GET") {
    const body = await request.text();
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname += body;
    request = new Request(cacheUrl.toString(), { method: "GET" });
  }

  return request;
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

const genTencent = ({ text, from, to }) => {
  const data = {
    header: {
      fn: "auto_translation_block",
    },
    source: {
      text_block: text,
      lang: from,
    },
    target: {
      lang: to,
    },
  };

  const init = {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [URL_TENCENT_TRANSMART, init];
};

const genOpenAI = ({ text, from, to, url, key, prompt, model }) => {
  prompt = prompt
    .replaceAll(PROMPT_PLACE_FROM, from)
    .replaceAll(PROMPT_PLACE_TO, to);

  const data = {
    model,
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
  };

  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${key}`, // OpenAI
      "api-key": key, // Azure OpenAI
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [url, init];
};

const genGemini = ({ text, from, to, url, key, prompt, model }) => {
  prompt = prompt
    .replaceAll(PROMPT_PLACE_FROM, from)
    .replaceAll(PROMPT_PLACE_TO, to)
    .replaceAll(PROMPT_PLACE_TEXT, text);

  const data = {
    contents: [
      {
        // role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  const input = `${url}/${model}:generateContent?key=${key}`;
  const init = {
    headers: {
      "Content-type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(data),
  };

  return [input, init];
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

const genCustom = ({ text, from, to, url, key }) => {
  const data = {
    text,
    from,
    to,
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

/**
 * 构造翻译接口 request
 * @param {*}
 * @returns
 */
export const newTransReq = ({ translator, text, from, to }, apiSetting) => {
  const args = { text, from, to, ...apiSetting };

  switch (translator) {
    case OPT_TRANS_DEEPL:
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_GEMINI:
    case OPT_TRANS_CLOUDFLAREAI:
      args.key = keyPick(translator, args.key);
      break;
    default:
  }

  switch (translator) {
    case OPT_TRANS_GOOGLE:
      return genGoogle(args);
    case OPT_TRANS_MICROSOFT:
      return genMicrosoft(args);
    case OPT_TRANS_DEEPL:
      return genDeepl(args);
    case OPT_TRANS_DEEPLFREE:
      return genDeeplFree(args);
    case OPT_TRANS_DEEPLX:
      return genDeeplX(args);
    case OPT_TRANS_BAIDU:
      return genBaidu(args);
    case OPT_TRANS_TENCENT:
      return genTencent(args);
    case OPT_TRANS_OPENAI:
      return genOpenAI(args);
    case OPT_TRANS_GEMINI:
      return genGemini(args);
    case OPT_TRANS_CLOUDFLAREAI:
      return genCloudflareAI(args);
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
