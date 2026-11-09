import { describe, expect, it } from "vitest";
import {
  pyJson,
  toInternal,
  renderOptions,
  serializeState,
  buildPrefix,
  buildSequence,
  collate,
  tempBucket,
  entropyConfidence,
  formatAnswers,
  detectScriptAndLanguage,
  JEV_PRESETS,
  type TokenizerLike,
  type InternalQuestion,
} from "../jev";
import parityFixture from "./fixtures/parity-multilingual.json";

describe("jev / pyjson", () => {
  it("与 Python json.dumps 规则（含 ensureAscii 开关）完全一致", () => {
    expect(pyJson({ a: 1, b: [2, "三"] })).toBe('{"a": 1, "b": [2, "\\u4e09"]}');
    expect(pyJson({ a: 1, b: [2, "三"] }, { ensureAscii: false })).toBe(
      '{"a": 1, "b": [2, "三"]}',
    );
    expect(pyJson(true)).toBe("true");
    expect(pyJson(null)).toBe("null");
    expect(pyJson("hello")).toBe('"hello"');
  });
});

describe("jev / questions & sequence", () => {
  const mockTokenizer: TokenizerLike = {
    clsToken: "<bos>",
    sepToken: "<eos>",
    padToken: "<pad>",
    maskToken: "<mask>",
    clsTokenId: 2,
    sepTokenId: 1,
    padTokenId: 0,
    maskTokenId: 4,
    encode(text: string): number[] {
      return Array.from(text).map((c) => c.charCodeAt(0));
    },
  };

  it("toInternal 与 renderOptions 正确转换 choice / score / noul", () => {
    const qChoice = toInternal({
      type: "choice",
      instructions: "What action?",
      criteria: {
        translate: "Translate region",
        skip: "Do not translate",
      },
    });
    expect(qChoice.t).toBe("choice");
    expect(renderOptions(qChoice)).toEqual([
      "translate: Translate region",
      "skip: Do not translate",
    ]);

    const qScore = toInternal({
      type: "score",
      instructions: "How urgent?",
      criteria: ["low", "medium", "high"],
    });
    expect(qScore.t).toBe("score");
    expect(renderOptions(qScore)).toEqual([
      "level 0: low",
      "level 1: medium",
      "level 2: high",
    ]);

    const qNoul = toInternal({
      type: "noul",
      instructions: "Is refund requested?",
    });
    expect(qNoul.t).toBe("noul");
    expect(renderOptions(qNoul)).toEqual([
      "false: no, the statement does not hold",
      "true: yes, the statement holds",
    ]);
  });

  it("serializeState、buildPrefix、buildSequence 与 collate 正确组装张量", () => {
    const state = { domain: "example.com", text: "你好" };
    expect(serializeState(state)).toBe('{"domain": "example.com", "text": "你好"}');

    const q = toInternal({
      type: "choice",
      instructions: "Translate?",
      criteria: ["yes", "no"],
    });
    const prefix = buildPrefix(mockTokenizer, q, 256);
    expect(prefix.ids[0]).toBe(2); // CLS
    expect(prefix.markers.length).toBe(2);

    const item = buildSequence(mockTokenizer, state, q, 1024, 256);
    expect(item.ids[item.ids.length - 1]).toBe(1); // SEP
    expect(item.qtype).toBe(0);

    const batch = collate([item], 0);
    expect(batch.rows).toBe(1);
    expect(batch.length).toBe(item.ids.length);
    expect(batch.markers).toBe(2);
  });
});

describe("jev / calibration & 63-question multilingual golden parity", () => {
  it("tempBucket 与 entropyConfidence 基础性质验证", () => {
    expect(tempBucket(0, 2)).toBe("choice:2");
    expect(tempBucket(0, 4)).toBe("choice:3-5");
    expect(tempBucket(1, 8)).toBe("score:6-10");
    expect(tempBucket(2, 2)).toBe("noul:2");
    expect(entropyConfidence([1, 0, 0])).toBeCloseTo(1, 5);
    expect(entropyConfidence([0.5, 0.5])).toBeCloseTo(0, 5);
  });

  it("与 @laya-mlx/web parity-multilingual.json 全部 21 个多语言案例（63 道问题）100% 数值对齐", () => {
    let totalQuestions = 0;
    for (const c of parityFixture.cases) {
      const qEntries = Object.entries(c.questions);
      const questionIds = qEntries.map(([qid]) => qid);
      const internalQs: InternalQuestion[] = qEntries.map(([, q]) =>
        toInternal(q),
      );

      // 校验 toInternal 与 renderOptions 与黄金夹具 100% 对齐
      expect(internalQs).toEqual(c.internal);
      expect(internalQs.map((q) => renderOptions(q))).toEqual(c.options);

      // 校验 collate 与参考 batch 完全一致
      const batch = collate(c.items, parityFixture.special_tokens.pad);
      expect(batch.rows).toBe(c.items.length);
      expect(batch.length).toBe(c.batch.input_ids[0]!.length);
      expect(Array.from(batch.qtype, Number)).toEqual(c.batch.qtype);

      const markers = c.logits[0]!.length;
      const actions = c.act_logits[0]!.length;
      const flatLogits = Float32Array.from(c.logits.flat());
      const flatActLogits = Float32Array.from(c.act_logits.flat());

      // 校验 formatAnswers 校准输出与参考 result 100% 深度对齐
      const result = formatAnswers({
        config: parityFixture.config,
        questionIds,
        internal: internalQs,
        items: c.items,
        logits: flatLogits,
        actLogits: flatActLogits,
        markers,
        actions,
      });

      expect(result).toEqual(c.result);
      totalQuestions += questionIds.length;
    }
    expect(totalQuestions).toBe(63);
  });
});

describe("jev / lang & presets", () => {
  it("detectScriptAndLanguage 识别非拉丁脚本与拉丁语系", () => {
    const zh = detectScriptAndLanguage({ text: "这是一段中文测试文本。" });
    expect(zh.dominantScript).toBe("cjk");
    expect(zh.isEnglishLikely).toBe(false);

    const ja = detectScriptAndLanguage({ text: "これはひらがなのテストです。" });
    expect(ja.dominantScript).toBe("hiragana_katakana");
    expect(ja.isEnglishLikely).toBe(false);

    const en = detectScriptAndLanguage({ text: "This is an English sentence." });
    expect(en.dominantScript).toBe("latin");
    expect(en.isEnglishLikely).toBe(true);
  });

  it("JEV_PRESETS 包含完整预设场景且问题结构合法", () => {
    expect(JEV_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const p of JEV_PRESETS) {
      const qKeys = Object.keys(p.questions);
      expect(qKeys.length).toBeGreaterThan(0);
      for (const q of Object.values(p.questions)) {
        expect(() => toInternal(q)).not.toThrow();
      }
    }
  });
});
