export const providerTextKeys = {
  "SDK v1 的多接口、多能力、JSON/JS 混合示例。":
    "plugin_example_openai_description",
  "DeepSeek Chat Completions：聊天、批量翻译、流式输出与思考模式。":
    "plugin_example_deepseek_description",
  "OpenAI 兼容协议示例": "plugin_example_openai",
  "DeepSeek 示例": "plugin_example_deepseek",
  文本生成与翻译: "plugin_text_generation",
  "DeepSeek 文本生成与翻译": "plugin_deepseek_text_generation",
  "API 基础地址（包含 /v1）": "plugin_base_url_v1",
  "API 基础地址": "plugin_base_url",
  "支持 Chat Completions 的文本模型": "plugin_chat_model",
  翻译采样温度: "plugin_translation_temperature",
  音频模型: "plugin_audio_model",
  音色: "plugin_voice",
  音频合成: "plugin_audio_synthesis",
  "语音合成（TTS）": "plugin_audio_synthesis",
  "翻译采样温度（推理模式 none 时生效）":
    "plugin_translation_temperature_reasoning",
  音频转写: "plugin_audio_transcription",
  "语音识别（ASR）": "plugin_audio_transcription",
  语音识别: "plugin_audio_transcription",
  转写模型: "plugin_transcription_model",
  语音识别模型: "plugin_transcription_model",
  图片文字识别: "plugin_image_recognition",
  "支持图片的 Chat Completions 模型": "plugin_vision_chat_model",
  "签名词典（mock/自定义服务）": "plugin_signed_dictionary",
  "DeepSeek 模型": "plugin_deepseek_model",
  思考模式: "thinking_mode",
  接口默认: "thinking_mode_default",
  开启思考: "thinking_mode_enabled",
  关闭思考: "thinking_mode_disabled",
  思考强度: "thinking_effort",
  低: "plugin_effort_low",
  高: "plugin_effort_high",
  最高: "plugin_effort_max",
};

/** Localize display metadata without changing snapshots or user configuration. */
export function localizeProviderText(i18n, text, translations, language) {
  const translated = translations?.[language] ?? translations?.en;
  return typeof translated === "string"
    ? translated
    : providerTextKeys[text]
      ? i18n(providerTextKeys[text], text)
      : text;
}

export function localizeServiceName(api, providerText) {
  const name = api.apiName || api.apiType || api.apiSlug;
  return api.provider && name === api.provider.name
    ? providerText(name, api.provider.nameI18n)
    : name;
}
