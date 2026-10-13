import {
  API_SPE_TYPES,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_QWENMT,
  OPT_TRANS_YANDEX,
  THINKING_API_REGISTRY,
  getThinkingCapability,
} from "../../config";

export function supportsApiSearchTarget(api, target) {
  if (!api) return false;
  const type = api.apiType;
  if (["use_stream", "stream_render_mode"].includes(target))
    return API_SPE_TYPES.stream.has(type);
  if (["use_context", "context_size"].includes(target))
    return API_SPE_TYPES.context.has(type);
  if (target.startsWith("batch_") || target === "use_batch_fetch") {
    return (
      API_SPE_TYPES.batch.has(type) &&
      (target !== "use_batch_fetch" || !API_SPE_TYPES.ai.has(type))
    );
  }
  if (
    ["translation_prompt", "subtitle_prompt", "ai_dict_prompt"].includes(target)
  )
    return API_SPE_TYPES.ai.has(type);
  if (["api_model", "translation_style", "ai_terms"].includes(target))
    return API_SPE_TYPES.ai.has(type) || type === OPT_TRANS_QWENMT;
  if (["model_list_url", "api_max_tokens"].includes(target))
    return API_SPE_TYPES.ai.has(type);
  if (target === "api_temperature")
    return (
      API_SPE_TYPES.ai.has(type) &&
      ![OPT_TRANS_GEMINI, OPT_TRANS_GEMINI_2].includes(type)
    );
  if (["api_url", "api_key"].includes(target))
    return (
      (!API_SPE_TYPES.machine.has(type) || type === OPT_TRANS_QWENMT) &&
      type !== OPT_TRANS_BUILTINAI
    );
  if (target === "api_region") return type === OPT_TRANS_AZUREAI;
  if (target === "api_folder_id") return type === OPT_TRANS_YANDEX;
  if (
    [
      "custom_header",
      "custom_body",
      "api_request_hook",
      "api_response_hook",
    ].includes(target)
  )
    return type !== OPT_TRANS_BUILTINAI;
  if (target === "thinking_mode") return Boolean(THINKING_API_REGISTRY[type]);
  if (target === "thinking_effort")
    return Boolean(getThinkingCapability(api)?.efforts);
  return true;
}
