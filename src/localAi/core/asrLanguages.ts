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

const ASR_LANGUAGE_ALIASES: Record<string, string> = {
  iw: "he",
  in: "id",
  ji: "yi",
  jv: "jw",
  fil: "tl",
  nb: "no",
  cmn: "zh",
  lao: "lo",
};

// 与当前 Transformers.js Whisper 语言代码表一致；未知音轨语言交给模型检测。
const WHISPER_LANGUAGE_CODES = new Set(
  ("en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro " +
    "da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br " +
    "eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am " +
    "yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su").split(" ")
);

export function normalizeAsrLanguage(value: string): string {
  const parts = value.trim().toLowerCase().replace(/_/g, "-").split("-");
  // YouTube 也可能使用带中文宏语言前缀的粤语 / 普通话标签。
  if (parts[0] === "zh" && ["cmn", "yue"].includes(parts[1])) parts.shift();
  parts[0] = ASR_LANGUAGE_ALIASES[parts[0]] || parts[0];
  return parts.join("-");
}

// UI 语言值 / 视频 BCP-47 语言标签 → whisper 语言码 + 简繁转换方向
// （whisper 只有 <|zh|>，简体靠 OpenCC 把偏繁体的输出转成简体 t2s，繁体靠 s2t 归一）
export function mapAsrLanguage(value: string): AsrLanguageMap {
  const language = normalizeAsrLanguage(value);
  const [base, ...tags] = language.split("-");
  if (!language || ["auto", "und", "mul", "zxx", "default"].includes(base))
    return { whisper: null };
  if (base === "zh") {
    // 显式书写系统优先于地区，如 zh-Hans-HK。
    const script = tags.find((tag) => tag === "hans" || tag === "hant");
    if (script || tags.some((tag) => ["cn", "sg", "tw", "hk", "mo"].includes(tag))) {
      const traditional = script
        ? script === "hant"
        : tags.some((tag) => ["tw", "hk", "mo"].includes(tag));
      return {
        whisper: "chinese",
        convert: traditional ? "s2t" : "t2s",
      };
    }
  }
  // 当前 Whisper 接口没有独立粤语语言码，不把粤语错误映射成普通话。
  if (["yue", "cantonese"].includes(base)) return { whisper: null };
  if (/^[a-z]{2,3}$/.test(base) && !WHISPER_LANGUAGE_CODES.has(base))
    return { whisper: null };
  return { whisper: base };
}
