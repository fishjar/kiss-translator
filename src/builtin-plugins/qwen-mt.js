import { parseAITerms } from "../libs/utils";
import { BUILTIN_STONES } from "../config";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const getQwenMtDomains = (tone = "") => {
  const normalizedTone = String(tone).trim();
  if (!normalizedTone) return "";

  return BUILTIN_STONES.includes(normalizedTone)
    ? `Translate in a ${normalizedTone.toLowerCase()} style.`
    : normalizedTone;
};

const getQwenMtTerms = (glossary = {}, aiTerms = "") => {
  const mergedTerms = { ...parseAITerms(aiTerms), ...glossary };
  return Object.entries(mergedTerms)
    .filter(([source]) => String(source).trim())
    .map(([source, target]) => {
      const normalizedTarget = String(target ?? "");
      return {
        source,
        target: normalizedTarget.trim() ? normalizedTarget : source,
      };
    });
};

const genQwenMt = ({
  url,
  key,
  model,
  texts,
  from,
  to,
  glossary,
  aiTerms,
  tone,
}) => {
  const translationOptions = {
    source_lang: from,
    target_lang: to,
  };
  const terms = getQwenMtTerms(glossary, aiTerms);
  const domains = getQwenMtDomains(tone);

  if (terms.length) translationOptions.terms = terms;
  if (domains) translationOptions.domains = domains;

  const userMsg = {
    role: "user",
    content: texts[0],
  };
  const body = {
    model,
    messages: [userMsg],
    translation_options: translationOptions,
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers, userMsg };
};

export { genQwenMt, getQwenMtTerms, getQwenMtDomains };
