import {
  OPT_TRANS_APIMART,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_LOCALAI,
} from "../config/apiConstants";
import { geminiResponseText, geminiText } from "./gemini";
import { normalizeThinkingSettings } from "./thinkingCapabilities";

// Vendor text shapes are compiled adapters; the scene receives Markdown/text/cues.
export function parseNativeDictionaryResponse(res, apiType) {
  switch (apiType) {
    case OPT_TRANS_EPHONEAI:
    case OPT_TRANS_APIMART:
    case OPT_TRANS_LOCALAI:
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_DEEPSEEK:
    case OPT_TRANS_OPENCODEGO:
    case OPT_TRANS_SILICONFLOW:
    case OPT_TRANS_XIAOMIMIMO:
    case OPT_TRANS_ALIYUNBAILIAN:
    case OPT_TRANS_CEREBRAS:
    case OPT_TRANS_ZAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_ORCAROUTER:
    case OPT_TRANS_REQUESTY:
    case OPT_TRANS_OLLAMA:
      return res?.choices?.[0]?.message?.content || "";
    case OPT_TRANS_GEMINI:
      return geminiResponseText(res);
    case OPT_TRANS_CLAUDE:
      return res?.content?.[0]?.text || "";
    case OPT_TRANS_CUSTOMIZE:
      if (typeof res === "string") return res;
      return res?.text || res?.result || "";
    default:
  }

  throw new Error("parse dictionary result: apiType not matched", apiType);
}

export function parseNativeSummaryResponse(res, apiType) {
  switch (apiType) {
    case OPT_TRANS_EPHONEAI:
    case OPT_TRANS_APIMART:
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_DEEPSEEK:
    case OPT_TRANS_OPENCODEGO:
    case OPT_TRANS_SILICONFLOW:
    case OPT_TRANS_XIAOMIMIMO:
    case OPT_TRANS_ALIYUNBAILIAN:
    case OPT_TRANS_CEREBRAS:
    case OPT_TRANS_ZAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_ORCAROUTER:
    case OPT_TRANS_REQUESTY:
    case OPT_TRANS_OLLAMA:
      return res?.choices?.[0]?.message?.content?.trim() || "";
    case OPT_TRANS_GEMINI:
      return geminiResponseText(res).trim() || "";
    case OPT_TRANS_CLAUDE:
      return res?.content?.[0]?.text?.trim() || "";
    case OPT_TRANS_CUSTOMIZE:
      if (typeof res === "string") return res.trim();
      return (
        res?.choices?.[0]?.message?.content?.trim() ||
        geminiText(res?.candidates?.[0]?.content?.parts).trim() ||
        res?.content?.[0]?.text?.trim() ||
        ""
      );
    default:
      return "";
  }
}

// Gemini truncation retry belongs to its compiled response adapter; keep the caller
// signal across the second HTTP request as well as the first.
export async function parseNativeSubtitleResponse(
  res,
  { apiSetting, events, from, to, docInfo, signal },
  { parseSTRes, genTransReq, fetchData }
) {
  const { apiType, fetchInterval, fetchLimit, httpTimeout } = apiSetting;
  switch (apiType) {
    case OPT_TRANS_EPHONEAI:
    case OPT_TRANS_APIMART:
    case OPT_TRANS_LOCALAI:
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_DEEPSEEK:
    case OPT_TRANS_OPENCODEGO:
    case OPT_TRANS_SILICONFLOW:
    case OPT_TRANS_XIAOMIMIMO:
    case OPT_TRANS_ALIYUNBAILIAN:
    case OPT_TRANS_CEREBRAS:
    case OPT_TRANS_ZAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_ORCAROUTER:
    case OPT_TRANS_REQUESTY:
    case OPT_TRANS_OLLAMA:
      return parseSTRes(
        res?.choices?.[0]?.message?.content ?? "",
        events,
        from
      );
    case OPT_TRANS_GEMINI: {
      const { thinkingMode } = apiSetting;
      const thinkingWasOn =
        thinkingMode && thinkingMode !== "auto" && thinkingMode !== "disabled";

      // REVIEW: 本地 AI (Gemini Nano) 强大的降级容灾容错逻辑！
      // 字幕翻译时，如果开启了推理链 (Thinking)，可能会因推理产生大量额外 Token，
      // 触发 Gemini 发生 finishReason === "MAX_TOKENS" 的阶段性提前截断中止。
      // 遇到该截断限制时，此处自动将推理降到当前模型支持的最低等级并重新发送重试，
      // 尽量保留输出 token 以取得完整字幕。
      const outputWasTruncated = Array.isArray(res?.steps)
        ? res?.status === "incomplete" || res?.status === "budget_exceeded"
        : res?.candidates?.[0]?.finishReason === "MAX_TOKENS";
      if (outputWasTruncated && thinkingWasOn) {
        // 运行时只在实际发生截断重试时归一化一次关闭状态，普通请求不再解析模型能力。
        const retryThinkingSettings = normalizeThinkingSettings({
          ...apiSetting,
          thinkingMode: "disabled",
          thinkingEffort: "_default",
        });
        const [retryInput, retryInit] = await genTransReq({
          ...apiSetting,
          // Gemini 字幕重试同样需要完整 JSON/VTT 结果，避免把 SSE 当普通响应解析。
          useStream: false,
          ...retryThinkingSettings,
          events,
          from,
          to,
          fromLang: from,
          toLang: to,
          docInfo,
        });
        const retryRes = await fetchData(retryInput, retryInit, {
          useCache: false,
          usePool: true,
          fetchInterval,
          fetchLimit,
          httpTimeout,
          signal,
        });
        const retryText = geminiResponseText(retryRes);
        if (retryText) {
          return parseSTRes(retryText, events, from);
        }
      }
      return parseSTRes(geminiResponseText(res), events, from);
    }
    case OPT_TRANS_CLAUDE:
      return parseSTRes(res?.content?.[0]?.text ?? "", events, from);
    case OPT_TRANS_CUSTOMIZE:
      return res;
    default:
  }

  return [];
}
