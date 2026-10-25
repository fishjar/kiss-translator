import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_QWENMT,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
  OPT_TRANS_OPENAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_RUNCRATE,
  OPT_TRANS_GEMINI,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_CUSTOMIZE,
} from "../config";
import { decodeHTMLTranslationText, decodeHTMLEntities } from "../libs/html";
import { geminiResponseText } from "../builtin-plugins/gemini";

// 厂家结果和历史写入在原生适配器内处理；场景只接收统一译文。
function parseGoogleResponse(res) {
  return [[res?.sentences?.map((item) => item.trans).join(" "), res?.src]];
}

function parseGoogle2Response(res, { textFormat }) {
  return res?.[0]?.map((_, i) => [
    textFormat === "text"
      ? decodeHTMLTranslationText(res?.[0]?.[i])
      : res?.[0]?.[i],
    res?.[1]?.[i],
  ]);
}

function parseGoogleCloudResponse(res, { textFormat }) {
  return res?.data?.translations?.map((item) => [
    textFormat === "text"
      ? decodeHTMLEntities(item.translatedText)
      : item.translatedText,
    item.detectedSourceLanguage,
  ]);
}

function parseYandexResponse(res) {
  return res?.translations?.map((item) => [
    item.text,
    item.detectedLanguageCode,
  ]);
}

function parseYandexfreeResponse(res) {
  return [[res?.text?.[0], res?.lang?.split("-")?.[0]]];
}

function parseMicrosoftResponse(res) {
  return res?.map((item) => [
    item.translations.map((item) => item.text).join(" "),
    item.detectedLanguage?.language,
  ]);
}

function parseDeeplResponse(res) {
  return res?.translations?.map((item) => [
    item.text,
    item.detected_source_language,
  ]);
}

function parseDeeplfreeResponse(res) {
  return [
    [res?.result?.texts?.map((item) => item.text).join(" "), res?.result?.lang],
  ];
}

function parseDeeplxResponse(res) {
  return [[res?.data, res?.source_lang]];
}

function parseBaiduResponse(res) {
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
}

function parseTencentResponse(res) {
  return res?.auto_translation?.map((text) => [text, res?.src_lang]);
}

function parseVolcengineResponse(res) {
  return [[res?.translation, res?.detected_language]];
}

function parseQwenmtResponse(res) {
  const content = res?.choices?.[0]?.message?.content;
  return typeof content === "string" ? [[content]] : [];
}

function parseLocalaiResponse(
  res,
  { texts, history, userMsg, useBatchFetch, batchProtocol, textFormat },
  { parseAIRes, alignBatchTranslations }
) {
  const message = res?.choices?.[0]?.message;
  const parsed = parseAIRes(
    message?.content,
    useBatchFetch,
    batchProtocol,
    textFormat
  );
  if (alignBatchTranslations(parsed, texts.length).length !== texts.length)
    throw new Error("Local translation returned incomplete segments");
  if (history && userMsg) history.addPair(userMsg, message);
  return parsed;
}

function parseEphoneaiResponse(
  res,
  { history, userMsg, useBatchFetch, batchProtocol, textFormat },
  { parseAIRes }
) {
  let modelMsg = "";
  modelMsg = res?.choices?.[0]?.message;
  if (history && userMsg) {
    // 成对写入与轮次截断守卫统一内聚在 addPair：空正文/非 assistant role 整对不写
    history.addPair(userMsg, modelMsg);
  }
  return parseAIRes(
    modelMsg?.content,
    useBatchFetch,
    batchProtocol,
    textFormat
  );
}

function parseGeminiResponse(
  res,
  { history, userMsg, useBatchFetch, batchProtocol, textFormat },
  { parseAIRes }
) {
  let modelMsg = "";
  if (history && Array.isArray(res?.steps)) {
    history.clear();
    history.add(...res.steps);
  } else {
    // Gemini generateContent 路径行为未变更：modelMsg 可为 undefined，由既有守卫拦截。
    modelMsg = res?.candidates?.[0]?.content;
    if (history && userMsg && modelMsg) {
      history.add(userMsg, modelMsg);
    }
  }
  return parseAIRes(
    geminiResponseText(res),
    useBatchFetch,
    batchProtocol,
    textFormat
  );
}

function parseClaudeResponse(
  res,
  { history, userMsg, useBatchFetch, batchProtocol, textFormat },
  { parseAIRes }
) {
  let modelMsg = "";

  // 历史上下文取值必须做形态归一化，原因有三：
  // 1. 形态防御：响应 content 存在多种形态 —— Anthropic 标准的块数组
  //    [{type:"text",text:"…"}]、第三方实现可能返回的纯字符串、以及单对象
  //    {type:"text",text:"…"}。只写 .map(...) 会在字符串形态上抛 TypeError
  //    让整页翻译崩溃，只写 content?.text 又取不到块数组里的文本，故三分支全覆盖。
  // 2. 网关现实：Claude 模型价格昂贵且平台随意封号，实际拿来翻译的机会很少；
  //    现实中这个 /messages 接口多由第三方开源网关模拟 Claude Message 协议提供，
  //    并不能真实代表 Anthropic 原装 Claude 的体验，响应形态更需要宽容。
  // 3. 历史教训：本行旧写法是 res?.content?.text —— 块数组没有 .text 属性，
  //    于是开启「智能上下文」时写进历史的 assistant 条目全是空壳 {role:"assistant"}，
  //    上下文功能对 Claude 实际失效。2026-08 由用户抓包发现并修复。
  // 取全部文本块拼接而非只取 [0]：历史上下文应完整保留模型输出，
  // 与下方解析译文只取首块（最小变更）是两种用途。
  // 是否写入历史由 addPair 的统一守卫裁决：role 缺失或无可用文本的响应
  // 整对不写，与其它协议分支语义一致；多块拼接/thinking-first 的统一语义
  // 不在本修复范围内。
  const pickClaudeText = (c) =>
    Array.isArray(c)
      ? c
          .map((b) => b?.text)
          .filter(Boolean)
          .join("")
      : typeof c === "string"
        ? c
        : (c?.text ?? "");
  modelMsg = { role: res?.role, content: pickClaudeText(res?.content) };
  if (history && userMsg) {
    history.addPair(userMsg, modelMsg);
  }
  return parseAIRes(
    res?.content?.[0]?.text ?? "",
    useBatchFetch,
    batchProtocol,
    textFormat
  );
}

function parseCloudflareaiResponse(res) {
  return [[res?.result?.translated_text]];
}

function parseOllamaResponse(
  res,
  { history, userMsg, useBatchFetch, batchProtocol, textFormat },
  { parseAIRes }
) {
  let modelMsg = "";
  modelMsg = res?.choices?.[0]?.message;
  if (history && userMsg) {
    history.addPair(userMsg, modelMsg);
  }
  return parseAIRes(
    modelMsg?.content,
    useBatchFetch,
    batchProtocol,
    textFormat
  );
}

function parseCustomizeResponse(res, { useBatchFetch }) {
  if (useBatchFetch) {
    return (res?.translations ?? res)?.map((item) => [item.text, item.src]);
  }
  return [[res.text, res.src || res.from]];
}

export const nativeResponseParsers = {
  [OPT_TRANS_GOOGLE]: parseGoogleResponse,
  [OPT_TRANS_GOOGLE_2]: parseGoogle2Response,
  [OPT_TRANS_GOOGLE_CLOUD]: parseGoogleCloudResponse,
  [OPT_TRANS_YANDEX]: parseYandexResponse,
  [OPT_TRANS_YANDEXFREE]: parseYandexfreeResponse,
  [OPT_TRANS_MICROSOFT]: parseMicrosoftResponse,
  [OPT_TRANS_AZUREAI]: parseMicrosoftResponse,
  [OPT_TRANS_DEEPL]: parseDeeplResponse,
  [OPT_TRANS_DEEPLFREE]: parseDeeplfreeResponse,
  [OPT_TRANS_DEEPLX]: parseDeeplxResponse,
  [OPT_TRANS_BAIDU]: parseBaiduResponse,
  [OPT_TRANS_TENCENT]: parseTencentResponse,
  [OPT_TRANS_VOLCENGINE]: parseVolcengineResponse,
  [OPT_TRANS_QWENMT]: parseQwenmtResponse,
  [OPT_TRANS_LOCALAI]: parseLocalaiResponse,
  [OPT_TRANS_EPHONEAI]: parseEphoneaiResponse,
  [OPT_TRANS_APIMART]: parseEphoneaiResponse,
  [OPT_TRANS_OPENAI]: parseEphoneaiResponse,
  [OPT_TRANS_DEEPSEEK]: parseEphoneaiResponse,
  [OPT_TRANS_OPENCODEGO]: parseEphoneaiResponse,
  [OPT_TRANS_SILICONFLOW]: parseEphoneaiResponse,
  [OPT_TRANS_XIAOMIMIMO]: parseEphoneaiResponse,
  [OPT_TRANS_ALIYUNBAILIAN]: parseEphoneaiResponse,
  [OPT_TRANS_CEREBRAS]: parseEphoneaiResponse,
  [OPT_TRANS_ZAI]: parseEphoneaiResponse,
  [OPT_TRANS_GEMINI_2]: parseEphoneaiResponse,
  [OPT_TRANS_OPENROUTER]: parseEphoneaiResponse,
  [OPT_TRANS_ORCAROUTER]: parseEphoneaiResponse,
  [OPT_TRANS_REQUESTY]: parseEphoneaiResponse,
  [OPT_TRANS_RUNCRATE]: parseEphoneaiResponse,
  [OPT_TRANS_GEMINI]: parseGeminiResponse,
  [OPT_TRANS_CLAUDE]: parseClaudeResponse,
  [OPT_TRANS_CLOUDFLAREAI]: parseCloudflareaiResponse,
  [OPT_TRANS_OLLAMA]: parseOllamaResponse,
  [OPT_TRANS_CUSTOMIZE]: parseCustomizeResponse,
};
