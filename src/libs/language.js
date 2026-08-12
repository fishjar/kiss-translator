import { OPT_LANGS_LIST } from "../config/api";

const INTERNAL_LANGUAGE_CODES = new Map(
  OPT_LANGS_LIST.map((code) => [code.toLowerCase(), code])
);

const CHINESE_SIMPLIFIED_TAGS = new Set(["cn", "sg", "hans"]);
const CHINESE_TRADITIONAL_TAGS = new Set(["tw", "hk", "mo", "hant"]);

/**
 * 将浏览器或翻译服务返回的语言代码转换为项目内部语言代码。
 * 项目内部使用 Google 风格的 zh-CN / zh-TW，并将不支持的地区变体
 * 回落到已支持的基础语言。
 *
 * @param {string} code 外部语言代码
 * @returns {string} 项目内部语言代码，无法识别时返回空字符串
 */
export function normalizeLanguageCode(code) {
  if (typeof code !== "string") return "";

  const normalized = code.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized || normalized === "und") return "";

  const parts = normalized.split("-").filter(Boolean);
  const base = parts[0];

  if (base === "zh") {
    if (parts.length === 1) return "zh-CN";
    if (parts.some((part) => CHINESE_TRADITIONAL_TAGS.has(part))) {
      return "zh-TW";
    }
    if (parts.some((part) => CHINESE_SIMPLIFIED_TAGS.has(part))) {
      return "zh-CN";
    }
    return "";
  }

  if (base === "no") return "nb";

  return (
    INTERNAL_LANGUAGE_CODES.get(normalized) ||
    INTERNAL_LANGUAGE_CODES.get(base) ||
    ""
  );
}

/**
 * 判断两个语言代码规范化后是否表示无需翻译的同一目标语言。
 * 中文简体与繁体规范化为不同内部代码，因此不会互相跳过。
 *
 * @param {string} sourceLanguage 源语言代码
 * @param {string} targetLanguage 目标语言代码
 * @param {boolean} translateVariants 是否翻译同一语言的不同变体
 * @returns {boolean} 两者是否等价
 */
export function isSameTranslationLanguage(
  sourceLanguage,
  targetLanguage,
  translateVariants = true
) {
  const source = normalizeLanguageCode(sourceLanguage);
  const target = normalizeLanguageCode(targetLanguage);
  if (!source || !target) return false;
  if (source === target) return true;

  return !translateVariants && source.split("-")[0] === target.split("-")[0];
}
