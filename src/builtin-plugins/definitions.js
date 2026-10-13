import { builtinSettingFields } from "./fields";

// Explicit compiled contracts, independent of legacy vendor classification sets.
// Reusing a text list here does not create a public capability hierarchy.
const textCapabilities = [
  "translate",
  "summarize",
  "dictionary",
  "segmentSubtitle",
  "chat",
];
const contracts = {
  BuiltinAI: {
    names: ["translate", "summarize", "detectLanguage"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  SystemTTS: {
    names: ["speak"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  LocalAI: {
    names: [
      "translate",
      "chat",
      "summarize",
      "dictionary",
      "segmentSubtitle",
      "transcribe",
      "recognizeText",
      "parseImage",
      "analyzeLayout",
      "evaluate",
      "synthesizeSpeech",
    ],
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Google: {
    names: ["translate", "detectLanguage"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  Google2: {
    names: ["translate"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  GoogleCloud: {
    names: ["translate"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  Microsoft: {
    names: ["translate"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  AzureAI: {
    names: ["translate"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  DeepSeek: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  OpenCodeGo: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  SiliconFlow: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  XiaomiMimo: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  AliyunBailian: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  QwenMT: {
    names: ["translate"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  Cerebras: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Zai: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Tencent: {
    names: ["translate", "detectLanguage"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  Volcengine: {
    names: ["translate"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  Yandex: {
    names: ["translate"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  YandexFree: {
    names: ["translate"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  DeepL: {
    names: ["translate"],
    batch: true,
    stream: false,
    usesMessages: false,
  },
  DeepLFree: {
    names: ["translate"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  DeepLX: {
    names: ["translate"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  ePhoneAI: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  APIMart: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  OpenAI: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Gemini: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Gemini2: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Claude: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  CloudflareAI: {
    names: ["translate"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
  Ollama: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  OpenRouter: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  OrcaRouter: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Requesty: {
    names: textCapabilities,
    batch: true,
    stream: true,
    usesMessages: true,
  },
  Custom: {
    names: ["translate", "summarize", "dictionary", "segmentSubtitle"],
    batch: true,
    stream: false,
    usesMessages: true,
  },
  Baidu: {
    names: ["translate", "detectLanguage", "suggest"],
    batch: false,
    stream: false,
    usesMessages: false,
  },
};

export const builtinServiceDefinitions = Object.fromEntries(
  Object.entries(contracts).map(([id, contract]) => [
    id,
    {
      id,
      name: id,
      implementation: { kind: "native", entry: id },
      configLocation: "root",
      settings: JSON.parse(JSON.stringify(builtinSettingFields)),
      usesMessages: contract.usesMessages,
      supportsContext: contract.usesMessages,
      supportsSubtitleCallbackStream: contract.stream,
      capabilities: Object.fromEntries(
        contract.names.map((name) => {
          const descriptor = { handler: name, outputModes: ["complete"] };
          if (name === "translate")
            descriptor.batch = { supported: contract.batch };
          // Only these native handlers emit the standard streaming event contract.
          // Subtitle callback streaming remains a legacy scene side channel.
          if (contract.stream && ["translate", "dictionary"].includes(name))
            descriptor.outputModes.push("stream");
          if (name === "parseImage") {
            descriptor.inputModalities = ["image"];
            descriptor.taskModes = ["doc", "table", "formula"];
          }
          if (name === "chat") descriptor.inputModalities = ["text"];
          return [name, descriptor];
        })
      ),
    },
  ])
);

export const getBuiltinServiceDefinition = (id) =>
  Object.prototype.hasOwnProperty.call(builtinServiceDefinitions, id)
    ? builtinServiceDefinitions[id]
    : undefined;
