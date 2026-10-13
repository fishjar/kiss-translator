import {
  OPT_TRANS_LOCALAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_QWENMT,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
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
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_CUSTOMIZE,
} from "../config";
import { genGoogle, genGoogle2, genGoogleCloud } from "./google";
import { genYandex, genYandexFree } from "./yandex";
import { genMicrosoft, genAzureAI } from "./microsoft";
import { genDeepl, genDeeplX } from "./deepl";
import { genDeeplFree } from "./deepl-free";
import { genOpenAI } from "./openai-compat";
import { genQwenMt } from "./qwen-mt";
import { genBaidu } from "./baidu";
import { genTencent } from "./tencent";
import { genVolcengine } from "./volcengine";
import { genGemini, genGemini2 } from "./gemini";
import { genClaude } from "./claude";
import { genCloudflareAI } from "./cloudflare";
import { genOllama } from "./ollama";
import { genOpenRouter, genOrcaRouter, genRequesty } from "./routers";
import { buildSystemRoleMessages } from "./messages";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genCustom = ({ texts, fromLang, toLang, url, key, useBatchFetch }) => {
  const body = useBatchFetch
    ? { texts, from: fromLang, to: toLang }
    : { text: texts[0], from: fromLang, to: toLang };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers };
};

const genLocalAI = ({
  cacheMode,
  modelRef,
  device,
  systemPrompt,
  userPrompt,
  hisMsgs = [],
  temperature = 0,
  maxTokens = 20480,
}) => {
  const userMsg = { role: "user", content: userPrompt };
  return {
    url: "local-ai://chat",
    userMsg,
    body: {
      ...(cacheMode && { cacheMode }),
      modelRef,
      loadSpec: { device: device || "webgpu" },
      messages: [...buildSystemRoleMessages(systemPrompt), ...hisMsgs, userMsg],
      temperature,
      maxTokens,
    },
  };
};

const genReqFuncs = {
  [OPT_TRANS_LOCALAI]: genLocalAI,
  [OPT_TRANS_GOOGLE]: genGoogle,
  [OPT_TRANS_GOOGLE_2]: genGoogle2,
  [OPT_TRANS_GOOGLE_CLOUD]: genGoogleCloud,
  [OPT_TRANS_YANDEX]: genYandex,
  [OPT_TRANS_YANDEXFREE]: genYandexFree,
  [OPT_TRANS_MICROSOFT]: genMicrosoft,
  [OPT_TRANS_AZUREAI]: genAzureAI,
  [OPT_TRANS_DEEPL]: genDeepl,
  [OPT_TRANS_DEEPLFREE]: genDeeplFree,
  [OPT_TRANS_DEEPSEEK]: genOpenAI,
  [OPT_TRANS_OPENCODEGO]: genOpenAI,
  [OPT_TRANS_SILICONFLOW]: genOpenAI,
  [OPT_TRANS_XIAOMIMIMO]: genOpenAI,
  [OPT_TRANS_ALIYUNBAILIAN]: genOpenAI,
  [OPT_TRANS_QWENMT]: genQwenMt,
  [OPT_TRANS_CEREBRAS]: genOpenAI,
  [OPT_TRANS_ZAI]: genOpenAI,
  [OPT_TRANS_DEEPLX]: genDeeplX,
  [OPT_TRANS_EPHONEAI]: genOpenAI,
  [OPT_TRANS_APIMART]: genOpenAI,
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
  [OPT_TRANS_ORCAROUTER]: genOrcaRouter,
  [OPT_TRANS_REQUESTY]: genRequesty,
  [OPT_TRANS_CUSTOMIZE]: genCustom,
};

export { genReqFuncs as nativeRequestBuilders };
