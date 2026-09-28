import type { DecisionQuestions, DecisionState } from "./types";
import { serializeState } from "./sequence";

export interface ScriptStats {
  dominantScript: string;
  latinRatio: number;
  isEnglishLikely: boolean;
  reason: string;
}

const SCRIPT_RANGES: Array<[string, RegExp]> = [
  ["cjk", /[\u4e00-\u9fff\u3400-\u4dbf]/u],
  ["hiragana_katakana", /[\u3040-\u30ff]/u],
  ["hangul", /[\uac00-\ud7af\u1100-\u11ff]/u],
  ["cyrillic", /[\u0400-\u04ff]/u],
  ["arabic", /[\u0600-\u06ff\u0750-\u077f]/u],
  ["devanagari", /[\u0900-\u097f]/u],
  ["thai", /[\u0e00-\u0e7f]/u],
  ["greek", /[\u0370-\u03ff]/u],
  ["hebrew", /[\u0590-\u05ff]/u],
  ["latin", /[A-Za-z\u00c0-\u024f]/u],
];

const NON_EN_LATIN_STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "nicht",
  "wurde",
  "para",
  "como",
  "pero",
  "esta",
  "avec",
  "dans",
  "pour",
  "sont",
  "mais",
  "della",
  "nella",
  "sono",
  "niet",
  "voor",
]);

/**
 * 移植上游 `laya/lang.py` 的亚毫秒级脚本与语言特征检测。
 * 用于判断输入状态是否包含非拉丁文字或非英语拉丁语言，解释路由到 multilingual 模型的原因。
 */
export function detectScriptAndLanguage(
  state: DecisionState,
  questions?: DecisionQuestions
): ScriptStats {
  const text =
    serializeState(state) + (questions ? " " + JSON.stringify(questions) : "");
  const counts: Record<string, number> = {};
  let totalLetters = 0;

  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    totalLetters++;
    let matched = "other";
    for (const [name, re] of SCRIPT_RANGES) {
      if (re.test(ch)) {
        matched = name;
        break;
      }
    }
    counts[matched] = (counts[matched] ?? 0) + 1;
  }

  if (totalLetters === 0) {
    return {
      dominantScript: "latin",
      latinRatio: 1,
      isEnglishLikely: true,
      reason: "no letters detected; defaulting to multilingual checkpoint",
    };
  }

  let dominantScript = "latin";
  let maxCount = 0;
  for (const [script, c] of Object.entries(counts)) {
    if (c > maxCount) {
      maxCount = c;
      dominantScript = script;
    }
  }

  const latinCount = counts["latin"] ?? 0;
  const latinRatio = latinCount / totalLetters;

  if (latinRatio < 0.85) {
    const pct = Math.round(((totalLetters - latinCount) / totalLetters) * 100);
    return {
      dominantScript,
      latinRatio,
      isEnglishLikely: false,
      reason: `non-Latin script (${dominantScript}, ${pct}% of letters); routed to laya-multilingual`,
    };
  }

  const words = text.toLowerCase().match(/[a-z\u00c0-\u024f]+/g) ?? [];
  const nonEnHits = words.filter((w) => NON_EN_LATIN_STOPWORDS.has(w)).length;
  const hasAccents = /[\u00c0-\u024f]/.test(text);
  if (nonEnHits >= 2 || hasAccents) {
    return {
      dominantScript: "latin",
      latinRatio,
      isEnglishLikely: false,
      reason:
        "Latin script with non-English markers; routed to laya-multilingual",
    };
  }

  return {
    dominantScript: "latin",
    latinRatio,
    isEnglishLikely: true,
    reason: "English / Latin script compatible with laya-multilingual",
  };
}
