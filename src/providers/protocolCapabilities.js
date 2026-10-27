// Standard protocol support. Native speak intentionally has no external runner.
export const protocolCapabilities = Object.freeze({
  chat: {
    protocol: "openai-chat-completions",
    stream: true,
    modalities: ["text", "image", "audio"],
  },
  translate: {
    protocol: "openai-chat-completions",
    stream: true,
    modalities: ["text"],
    batch: true,
  },
  summarize: {
    protocol: "openai-chat-completions",
    stream: true,
    modalities: ["text"],
  },
  dictionary: {
    protocol: "openai-chat-completions",
    stream: true,
    modalities: ["text"],
  },
  detectLanguage: { protocol: "openai-chat-completions", modalities: ["text"] },
  suggest: { protocol: "openai-chat-completions", modalities: ["text"] },
  segmentSubtitle: {
    protocol: "openai-chat-completions",
    modalities: ["text"],
  },
  evaluate: { protocol: "openai-chat-completions", modalities: ["text"] },
  recognizeText: {
    protocol: "openai-chat-completions",
    modalities: ["image"],
    coordinates: true,
  },
  parseImage: {
    protocol: "openai-chat-completions",
    modalities: ["image"],
    coordinates: true,
  },
  analyzeLayout: {
    protocol: "openai-chat-completions",
    modalities: ["image"],
    coordinates: true,
  },
  transcribe: {
    protocol: "openai-audio-transcriptions",
    modalities: ["audio"],
    timestamps: true,
  },
  synthesizeSpeech: { protocol: "openai-audio-speech", modalities: ["text"] },
});
