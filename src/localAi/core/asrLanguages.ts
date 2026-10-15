import type { ModelManifest } from "./types";

export interface AsrLanguageOption {
  value: string;
  label: string;
}

// 常用语言（value 即 whisper 语言码；zh 拆简繁以便 OpenCC 后处理，见 mapAsrLanguage）
export const ASR_LANGUAGES: AsrLanguageOption[] = [
  { value: "zh-hans", label: "简体中文" },
  { value: "zh-hant", label: "繁體中文" },
  { value: "cantonese", label: "粤语 (Cantonese)" },
  { value: "english", label: "英文" },
  { value: "japanese", label: "日本語" },
  { value: "korean", label: "한국어" },
  { value: "french", label: "Français" },
  { value: "german", label: "Deutsch" },
  { value: "spanish", label: "Español" },
  { value: "portuguese", label: "Português" },
  { value: "italian", label: "Italiano" },
  { value: "russian", label: "Русский" },
  { value: "arabic", label: "العربية" },
  { value: "hindi", label: "हिन्दी" },
];

const SENSEVOICE_SUPPORTED_VALUES = new Set([
  "zh-hans",
  "zh-hant",
  "cantonese",
  "english",
  "japanese",
  "korean",
]);

export function getSupportedAsrLanguages(
  manifest: Pick<ModelManifest, "runtime" | "languages" | "multilingual">
): AsrLanguageOption[] {
  if (manifest.multilingual === false) {
    return ASR_LANGUAGES.filter((l) => l.value === "english");
  }
  if (manifest.runtime === "onnx") {
    return ASR_LANGUAGES.filter((l) => SENSEVOICE_SUPPORTED_VALUES.has(l.value));
  }
  return ASR_LANGUAGES;
}

export interface AsrLanguageMap {
  whisper: string | null;
  convert?: "s2t" | "t2s";
}

// UI 语言值 → whisper 语言码 + 简繁转换方向
// （whisper 只有 <|zh|>，简体靠 OpenCC 把偏繁体的输出转成简体 t2s，繁体靠 s2t 归一）
export function mapAsrLanguage(value: string): AsrLanguageMap {
  if (value === "zh-hans") return { whisper: "chinese", convert: "t2s" };
  if (value === "zh-hant") return { whisper: "chinese", convert: "s2t" };
  if (value) return { whisper: value };
  return { whisper: null };
}
