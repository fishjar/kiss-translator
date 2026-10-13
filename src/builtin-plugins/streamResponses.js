import {
  OPT_TRANS_OPENAI,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
} from "../config/apiConstants";

// Legacy vendor SSE extraction stays compiled; common framing/translation IDs remain in the host SDK.
export function getStreamDelta(json, apiType) {
  switch (apiType) {
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
    case OPT_TRANS_EPHONEAI:
    case OPT_TRANS_APIMART:
      // OpenAI 兼容协议的大模型 delta 提取逻辑
      return json.choices?.[0]?.delta?.content || "";
    case OPT_TRANS_GEMINI: {
      // 两套 Gemini 协议共用同一接口类型：Interactions 带事件类型，generateContent 返回 candidates。
      const eventType = json.event_type || json.type;
      if (eventType === "error") {
        const error = new Error(
          json.error?.message || "Gemini interaction stream failed"
        );
        error.isAIStreamTerminal = true;
        throw error;
      }
      if (
        eventType === "interaction.status_update" &&
        ["failed", "cancelled", "incomplete", "budget_exceeded"].includes(
          json.status
        )
      ) {
        const error = new Error(
          `Gemini interaction stream ended with status: ${json.status}`
        );
        error.isAIStreamTerminal = true;
        throw error;
      }
      if (eventType) {
        return eventType === "step.delta" && json.delta?.type === "text"
          ? json.delta.text || ""
          : "";
      }

      // 谷歌原生 Gemini API 的 delta 提取逻辑 (排除思维链思考过程)
      const parts = json.candidates?.[0]?.content?.parts;
      return (
        (Array.isArray(parts) ? parts.find((p) => !p.thought) : undefined)
          ?.text || ""
      );
    }
    case OPT_TRANS_CLAUDE:
      // Anthropic Claude 格式 delta 提取逻辑
      if (json.type === "content_block_delta") {
        return json.delta?.text || "";
      }
      return "";
    default:
      return "";
  }
}
