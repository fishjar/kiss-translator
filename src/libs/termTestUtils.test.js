import { parseTerms } from "./terms";
import {
  hashKey,
  detectTermConflicts,
  generateTermTestText,
  joinIntoParagraph,
  assertTermReplacements,
  getDiagnosticSampleTerms,
  getDeliberateFailureFixtures,
  selectDisplayedResults,
} from "./termTestUtils";

// ─── hashKey ─────────────────────────────────────────────────────────────────
describe("termTestUtils hashKey", () => {
  test("returns a deterministic number for the same key", () => {
    expect(hashKey("API")).toBe(hashKey("API"));
    expect(hashKey("APIKey")).toBe(hashKey("APIKey"));
  });

  test("returns different values for different keys", () => {
    // 极低概率冲突，但不同 key 大概率不同
    const api = hashKey("API");
    const gpt = hashKey("GPT");
    expect(api).not.toBe(gpt);
  });

  test("returns a non-negative integer", () => {
    const h = hashKey("API");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
  });

  test("handles empty string", () => {
    // djb2 初始值 5381，空字符串不进入循环，返回 5381
    expect(hashKey("")).toBe(5381);
  });

  test("handles non-string input", () => {
    expect(hashKey(null)).toBe(0);
    expect(hashKey(undefined)).toBe(0);
    expect(hashKey(123)).toBe(0);
  });
});

// ─── detectTermConflicts ─────────────────────────────────────────────────────
describe("termTestUtils detectTermConflicts", () => {
  test("conflict type 1: short has value, long has value (API / APIKey)", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].short.key).toBe("API");
    expect(conflicts[0].long.key).toBe("APIKey");
    expect(conflicts[0].shortHasValue).toBe(true);
    expect(conflicts[0].longHasValue).toBe(true);
  });

  test("conflict type 2: short has value, long has no value (API / APIKey)", () => {
    const parsed = parseTerms("API,接口;APIKey");
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].short.key).toBe("API");
    expect(conflicts[0].long.key).toBe("APIKey");
    expect(conflicts[0].shortHasValue).toBe(true);
    expect(conflicts[0].longHasValue).toBe(false);
  });

  test("conflict type 3: short has no value, long has value (GPT / GPTs)", () => {
    const parsed = parseTerms("GPT;GPTs,智能体集合");
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].short.key).toBe("GPT");
    expect(conflicts[0].long.key).toBe("GPTs");
    expect(conflicts[0].shortHasValue).toBe(false);
    expect(conflicts[0].longHasValue).toBe(true);
  });

  test("conflict type 4: neither has value (React / ReactNative)", () => {
    const parsed = parseTerms("React;ReactNative");
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].short.key).toBe("React");
    expect(conflicts[0].long.key).toBe("ReactNative");
    expect(conflicts[0].shortHasValue).toBe(false);
    expect(conflicts[0].longHasValue).toBe(false);
  });

  test("no conflicts between unrelated terms", () => {
    const parsed = parseTerms("API,接口;GPT,生成式预训练;SQL,结构化查询");
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(0);
  });

  test("multiple conflicts detected", () => {
    const parsed = parseTerms(
      "API,接口;APIKey,应用编程接口;GPT;GPTs,智能体集合"
    );
    const conflicts = detectTermConflicts(parsed);
    // 预期：API↔APIKey, GPT↔GPTs
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    const pairKeys = conflicts.map((c) => `${c.short.key}:${c.long.key}`);
    expect(pairKeys).toContain("API:APIKey");
    expect(pairKeys).toContain("GPT:GPTs");
  });

  test("no conflicts with single term", () => {
    const parsed = parseTerms("API,接口");
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(0);
  });

  test("no conflicts with empty terms", () => {
    expect(detectTermConflicts([])).toEqual([]);
    expect(detectTermConflicts({ terms: [] })).toEqual([]);
    expect(detectTermConflicts(null)).toEqual([]);
    expect(detectTermConflicts(undefined)).toEqual([]);
  });

  test("detects conflicts with regex pattern terms", () => {
    const parsed = parseTerms("API\\.\\d+,版本;API.42,具体版本");
    const conflicts = detectTermConflicts(parsed);
    // API\\.\\d+ 作为正则能匹配 API.42，应检测为冲突
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── generateTermTestText ────────────────────────────────────────────────────
describe("termTestUtils generateTermTestText", () => {
  test("generates conflict test cases for all 4 types with direction expansion", () => {
    // 4 类冲突组合（8 个术语，4 个独立冲突对）
    // 类型 1：API,接口;APIKey,应用编程接口
    // 类型 2：UI,界面;UIView
    // 类型 3：GPT;GPTs,智能体集合
    // 类型 4：React;ReactNative
    const parsed = parseTerms(
      "API,接口;APIKey,应用编程接口;UI,界面;UIView;GPT;GPTs,智能体集合;React;ReactNative"
    );
    const cases = generateTermTestText(parsed);
    const conflicts = cases.filter((c) => c.type === "conflict");
    // 4 对冲突 × 2 个方向（short-first + long-first）= 8 个冲突用例
    expect(conflicts.length).toBe(8);

    // 验证冲突类型覆盖：每类至少出现一次
    const typesPresent = new Set(conflicts.map((c) => c.conflictType));
    expect(typesPresent.has(1)).toBe(true);
    expect(typesPresent.has(2)).toBe(true);
    expect(typesPresent.has(3)).toBe(true);
    expect(typesPresent.has(4)).toBe(true);

    // 验证方向覆盖：每个冲突对同时包含 short-first 和 long-first
    const directionMap = {};
    for (const c of conflicts) {
      const key = `${c.short.key}:${c.long.key}`;
      if (!directionMap[key]) directionMap[key] = new Set();
      directionMap[key].add(c.direction);
    }
    for (const pairKey of Object.keys(directionMap)) {
      expect(directionMap[pairKey].has("short-first")).toBe(true);
      expect(directionMap[pairKey].has("long-first")).toBe(true);
    }
  });

  test("generates single term test cases for non-conflict terms", () => {
    const parsed = parseTerms("API,接口;GPT,生成式预训练");
    const cases = generateTermTestText(parsed);
    const singles = cases.filter((c) => c.type === "single");
    expect(singles.length).toBe(2);
    const termKeys = singles.map((c) => c.term.key);
    expect(termKeys).toContain("API");
    expect(termKeys).toContain("GPT");
  });

  test("generated text contains the term key", () => {
    const parsed = parseTerms("API,接口");
    const cases = generateTermTestText(parsed);
    expect(cases.length).toBe(1);
    expect(cases[0].text).toContain("API");
  });

  test("generated conflict text contains both short and long keys", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");
    expect(conflictCase).toBeDefined();
    expect(conflictCase.text).toContain("API");
    expect(conflictCase.text).toContain("APIKey");
  });

  test("generated text is a complete natural sentence", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口;GPT,生成式预训练");
    const cases = generateTermTestText(parsed);
    for (const c of cases) {
      // 句子应以大写字母开头
      expect(c.text[0]).toBe(c.text[0].toUpperCase());
      // 句子应以标点结尾
      expect(c.text).toMatch(/[.?!]$/);
      // 句子长度合理（完整自然句）
      expect(c.text.length).toBeGreaterThan(20);
    }
  });

  test("deterministic: same input produces same output", () => {
    const input = "API,接口;APIKey,应用编程接口;GPT,生成式预训练";
    const parsed1 = parseTerms(input);
    const parsed2 = parseTerms(input);
    const cases1 = generateTermTestText(parsed1);
    const cases2 = generateTermTestText(parsed2);
    expect(cases1.length).toBe(cases2.length);
    for (let i = 0; i < cases1.length; i++) {
      expect(cases1[i].text).toBe(cases2[i].text);
    }
  });

  test("template selection is stable per term key", () => {
    // 两次调用 hashKey 相同，所以模板选择相同
    const parsed = parseTerms("API,接口;GPT,生成式预训练");
    const cases = generateTermTestText(parsed);
    // 再次生成
    const cases2 = generateTermTestText(parsed);
    expect(cases[0].text).toBe(cases2[0].text);
    expect(cases[1].text).toBe(cases2[1].text);
  });

  test("returns empty array for empty input", () => {
    expect(generateTermTestText([])).toEqual([]);
    expect(generateTermTestText({ terms: [] })).toEqual([]);
    expect(generateTermTestText(null)).toEqual([]);
    expect(generateTermTestText(undefined)).toEqual([]);
  });

  test("direction field is present on all conflict cases", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const conflicts = cases.filter((c) => c.type === "conflict");
    for (const c of conflicts) {
      expect(c.direction).toBeDefined();
      expect(["short-first", "long-first"]).toContain(c.direction);
    }
  });

  test("long-first template places long key before short key in the sentence", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const longFirst = cases.find(
      (c) => c.type === "conflict" && c.direction === "long-first"
    );
    expect(longFirst).toBeDefined();
    // 长词在短词之前出现（long-first 模板中 {long} 在 {short} 前）。
    // 注意：短词 key 可能作为长词 key 的子串（如 API 在 APIKey 中），
    // 因此查找短词时要从长词之后开始搜索。
    const longIdx = longFirst.text.indexOf(longFirst.long.key);
    const shortIdx = longFirst.text.indexOf(
      longFirst.short.key,
      longIdx + longFirst.long.key.length
    );
    expect(shortIdx).toBeGreaterThan(longIdx);
  });

  test("short-first template places short key before long key in the sentence", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const shortFirst = cases.find(
      (c) => c.type === "conflict" && c.direction === "short-first"
    );
    expect(shortFirst).toBeDefined();
    const shortIdx = shortFirst.text.indexOf(shortFirst.short.key);
    const longIdx = shortFirst.text.indexOf(shortFirst.long.key);
    expect(shortIdx).toBeLessThan(longIdx);
  });
});

// ─── generateTermTestText 显式 seed 轮换（Task 11） ──────────────────────────
describe("termTestUtils generateTermTestText seed rotation", () => {
  const parsed = parseTerms("API,接口;APIKey,应用编程接口;GPT,生成式预训练");

  test("缺省 seed 与旧行为一致", () => {
    const before = generateTermTestText(parsed);
    expect(before.map((c) => c.text)).toEqual(
      generateTermTestText(parsed, "").map((c) => c.text)
    );
    expect(before.map((c) => c.text)).toEqual(
      generateTermTestText(parsed, undefined).map((c) => c.text)
    );
    expect(before.map((c) => c.text)).toEqual(
      generateTermTestText(parsed, null).map((c) => c.text)
    );
    // 显式 seed "0" 是真实轮换种子（不同于缺省），应在有限模板内换句。
    const seedZero = generateTermTestText(parsed, 0).map((c) => c.text);
    expect(seedZero).toHaveLength(before.length);
  });

  test("同一输入 + 同一 seed 产生完全相同的例句", () => {
    const a = generateTermTestText(parsed, "seed-7");
    const b = generateTermTestText(parsed, "seed-7");
    expect(a.map((c) => c.text)).toEqual(b.map((c) => c.text));
    expect(a.map((c) => c.text)).toEqual(b.map((c) => c.text));
  });

  test("同一输入切换 seed 后，在有限模板集合内换出不同的自然例句", () => {
    const base = generateTermTestText(parsed, "").map((c) => c.text);
    // 轮换若干 seed，至少一个 seed 使某个用例的例句发生变化
    let sawDifference = false;
    for (let seed = 1; seed <= 16 && !sawDifference; seed++) {
      const rotated = generateTermTestText(parsed, String(seed)).map(
        (c) => c.text
      );
      sawDifference = rotated.some(
        (text, index) => text !== base[index] && parsed.terms.length > 0
      );
    }
    expect(sawDifference).toBe(true);
  });

  test("轮换后的例句仍是完整自然句（不破坏方向与结构）", () => {
    for (const seed of ["1", "2", "3"]) {
      const cases = generateTermTestText(parsed, seed);
      for (const c of cases) {
        expect(c.text[0]).toBe(c.text[0].toUpperCase());
        expect(c.text).toMatch(/[.?!]$/);
      }
    }
  });

  test("连续重复生成不会因内部状态相互污染", () => {
    const one = generateTermTestText(parsed, "rot");
    const two = generateTermTestText(parsed, "rot");
    const three = generateTermTestText(parsed, "");
    expect(one).toEqual(two);
    // 第三次（不同 seed）与首次结果不同集合大小一致、结构一致
    expect(three).toHaveLength(one.length);
  });
});

// ─── joinIntoParagraph ───────────────────────────────────────────────────────
describe("termTestUtils joinIntoParagraph", () => {
  test("joins texts in order with spaces", () => {
    const cases = [
      { text: "First sentence about API." },
      { text: "Second sentence about GPT." },
    ];
    const paragraph = joinIntoParagraph(cases);
    expect(paragraph).toBe(
      "First sentence about API. Second sentence about GPT."
    );
  });

  test("returns empty string for empty array", () => {
    expect(joinIntoParagraph([])).toBe("");
    expect(joinIntoParagraph(null)).toBe("");
    expect(joinIntoParagraph(undefined)).toBe("");
  });
});

// ─── assertTermReplacements ──────────────────────────────────────────────────
describe("termTestUtils assertTermReplacements", () => {
  // 标准替换器
  const replacer = (t, m) => t.value || m;

  // 冲突矩阵 4 类固定用例

  test("类型 1: S有/L有 — API,接口;APIKey,应用编程接口 全部通过", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");
    expect(conflictCase).toBeDefined();

    const result = assertTermReplacements(parsed, conflictCase);
    // 修复后应全部通过
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    // 修复前后对比证据必须存活：旧引擎会产生 "接口 + 残段" 的切割
    expect(result.evidence.length).toBeGreaterThan(0);
    const diff = result.evidence.find((e) => e.type === "naive-vs-fixed-diff");
    expect(diff).toBeDefined();
    expect(diff.message).toContain("APIKey");
  });

  test("类型 2: S有/L无 — API,接口;APIKey 全部通过", () => {
    const parsed = parseTerms("API,接口;APIKey");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");
    expect(conflictCase).toBeDefined();

    const result = assertTermReplacements(parsed, conflictCase);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    // 旧引擎会把 APIKey 切成 接口Key → 证据必须产出
    expect(result.evidence.some((e) => e.type === "naive-vs-fixed-diff")).toBe(
      true
    );
  });

  test("类型 3: S无/L有 — GPT;GPTs,智能体集合 全部通过", () => {
    const parsed = parseTerms("GPT;GPTs,智能体集合");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");
    expect(conflictCase).toBeDefined();

    const result = assertTermReplacements(parsed, conflictCase);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    // 旧引擎中 GPTs 永远不会整体触发（GPT 抢占）→ 证据必须产出
    expect(result.evidence.some((e) => e.type === "naive-vs-fixed-diff")).toBe(
      true
    );
  });

  test("类型 4: S无/L无 — React;ReactNative 全部通过", () => {
    const parsed = parseTerms("React;ReactNative");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");
    expect(conflictCase).toBeDefined();

    const result = assertTermReplacements(parsed, conflictCase);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    // 类型 4 文本层面新旧引擎输出完全相同，证据必须基于 spans 产出（高亮残留）
    expect(result.evidence.length).toBeGreaterThan(0);
    const diff = result.evidence.find((e) => e.type === "naive-vs-fixed-diff");
    expect(diff).toBeDefined();
    expect(diff.message).toContain("高亮残留");
  });

  test("单术语用例全部通过", () => {
    const parsed = parseTerms("API,接口;GPT,生成式预训练;SQL,结构化查询");
    const cases = generateTermTestText(parsed);
    const singles = cases.filter((c) => c.type === "single");
    expect(singles.length).toBeGreaterThan(0);

    for (const singleCase of singles) {
      const result = assertTermReplacements(parsed, singleCase);
      expect(result.ok).toBe(true);
    }
  });

  test("混合 4 类冲突 + 单术语全部通过", () => {
    const parsed = parseTerms(
      "API,接口;APIKey,应用编程接口;GPT;GPTs,智能体集合;React;ReactNative;SQL,结构化查询"
    );
    const cases = generateTermTestText(parsed);
    expect(cases.length).toBeGreaterThan(0);

    for (const testCase of cases) {
      const result = assertTermReplacements(parsed, testCase);
      expect(result.ok).toBe(true);
    }
  });

  // ─── 构造错误场景：验证断言能正确检测问题 ─────────────────────────────

  test("错误引擎输出会产出对应 issue：类型 1/2 前缀误伤（接口Key）", () => {
    // 用 engine: "naive" 断言旧引擎输出 —— 旧引擎把 APIKey 切成 接口Key
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");

    const result = assertTermReplacements(parsed, conflictCase, {
      engine: "naive",
    });
    // 旧引擎输出确实错误 → ok=false 且产生对应 issue
    expect(result.ok).toBe(false);
    const prefixCut = result.issues.find((i) => i.type === "naive-prefix-cut");
    expect(prefixCut).toBeDefined();
    expect(prefixCut.message).toContain("前缀误伤");
    // 长词整体未被命中（被短词抢占）也要报出
    expect(result.issues.some((i) => i.type === "conflict-type-1")).toBe(true);
  });

  test("错误引擎输出会产出对应 issue：类型 2 长词被切出短词译文", () => {
    const parsed = parseTerms("API,接口;APIKey");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");

    const result = assertTermReplacements(parsed, conflictCase, {
      engine: "naive",
    });
    expect(result.ok).toBe(false);
    // naive 输出中必然出现 接口Key 形态
    const detail = result.issues[0]?.detail || {};
    expect(detail.naiveOutput).toContain("接口Key");
    expect(result.issues.some((i) => i.type === "naive-prefix-cut")).toBe(true);
  });

  test("错误引擎输出会产出对应 issue：类型 3 长词永不被触发（短词抢占）", () => {
    const parsed = parseTerms("GPT;GPTs,智能体集合");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");

    const result = assertTermReplacements(parsed, conflictCase, {
      engine: "naive",
    });
    expect(result.ok).toBe(false);
    const longNotHit = result.issues.find((i) => i.type === "conflict-type-3");
    expect(longNotHit).toBeDefined();
    expect(longNotHit.message).toContain("GPTs");
  });

  test("错误引擎输出会产出对应 issue：类型 4 不翻译长词被切割出高亮残留", () => {
    const parsed = parseTerms("React;ReactNative");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");

    const result = assertTermReplacements(parsed, conflictCase, {
      engine: "naive",
    });
    expect(result.ok).toBe(false);
    const residue = result.issues.find((i) => i.type === "naive-cut-residue");
    expect(residue).toBeDefined();
    expect(residue.message).toContain("高亮残留");
    // 类型 4 文本层面新旧引擎输出相同（都是原文），切割只能从 spans 看出
    const detail = residue.detail;
    expect(detail.naiveOutput).toBe(conflictCase.text);
    expect(detail.naiveSpans.some((s) => s.termKey === "React")).toBe(true);
  });

  test("修复后引擎对同一文本不会产生任何 issue（与旧引擎负向对照）", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    const conflictCase = cases.find((c) => c.type === "conflict");

    const naiveResult = assertTermReplacements(parsed, conflictCase, {
      engine: "naive",
    });
    const fixedResult = assertTermReplacements(parsed, conflictCase);
    expect(naiveResult.ok).toBe(false);
    expect(fixedResult.ok).toBe(true);
  });

  test("断言输出结构正确：{ ok, issues, evidence }，issue/evidence 有 type/message/detail", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);
    // 用 naive 引擎保证 issues 真实非空
    const result = assertTermReplacements(parsed, cases[0], {
      engine: "naive",
    });

    // 结构验证
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("evidence");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);

    // 如果存在 issues，验证结构
    for (const issue of result.issues) {
      expect(issue).toHaveProperty("type");
      expect(issue).toHaveProperty("message");
      expect(issue).toHaveProperty("detail");
      expect(typeof issue.type).toBe("string");
      expect(typeof issue.message).toBe("string");
      expect(typeof issue.detail).toBe("object");
    }

    // 修复后引擎的证据结构同样合规（evidence 非空才能真正演示修复前误伤）
    const fixedResult = assertTermReplacements(parsed, cases[0]);
    if (fixedResult.evidence.length > 0) {
      for (const item of fixedResult.evidence) {
        expect(item).toHaveProperty("type");
        expect(item).toHaveProperty("message");
        expect(item).toHaveProperty("detail");
      }
    }
  });

  test("message 为单行精简文案（在真实产生的 issues 上执行）", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const cases = generateTermTestText(parsed);

    // 用 naive 引擎构造真实失败的用例，确保 issues 非空、断言真实执行
    const naivelyFailed = assertTermReplacements(parsed, cases[0], {
      engine: "naive",
    });
    const withEvidence = assertTermReplacements(parsed, cases[0]);
    expect(naivelyFailed.issues.length).toBeGreaterThan(0);
    expect(withEvidence.evidence.length).toBeGreaterThan(0);

    const allMessages = [
      ...naivelyFailed.issues,
      ...naivelyFailed.evidence,
      ...withEvidence.evidence,
    ].map((i) => i.message);
    for (const message of allMessages) {
      // message 应为一行的长度（约 120 字符内）
      expect(message.length).toBeLessThanOrEqual(120);
      // 不应包含换行符
      expect(message).not.toContain("\n");
      // 不应为空文案
      expect(String(message).trim().length).toBeGreaterThan(0);
    }
  });

  test("单术语用例：术语未被命中时产出 issue", () => {
    const parsed = parseTerms("API,接口");
    // 构造一个包含 API 但 API 在文本中不存在的 case
    const singleCase = {
      type: "single",
      text: "Hello world, this is a test sentence.",
      term: parsed.terms[0],
    };

    const result = assertTermReplacements(parsed, singleCase);
    // 应能检测到术语未被命中并报告 issue
    expect(result.ok).toBe(false);
    const notFound = result.issues.find(
      (i) => i.type === "single-term-not-found"
    );
    expect(notFound).toBeDefined();
    expect(notFound.message).toContain("API");
  });

  test("空 parsedTerms 时产出 issue", () => {
    const result = assertTermReplacements([], { type: "single", text: "test" });
    expect(result.ok).toBe(false);
    expect(result.issues[0].type).toBe("no-terms");
  });

  test("空文本时产出 issue", () => {
    const parsed = parseTerms("API,接口");
    const result = assertTermReplacements(parsed, {
      type: "single",
      text: "",
      term: parsed.terms[0],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0].type).toBe("empty-text");
  });
});

// ─── getDiagnosticSampleTerms ────────────────────────────────────────────────
describe("termTestUtils getDiagnosticSampleTerms", () => {
  test("returns 8 terms forming 4 independent conflict pairs covering all 4 types", () => {
    const termsString = getDiagnosticSampleTerms();
    const parsed = parseTerms(termsString);

    // 8 个有效术语，无非法项
    expect(parsed.invalid).toEqual([]);
    expect(parsed.terms).toHaveLength(8);

    // 4 个唯一冲突对
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(4);

    // 每类冲突类型恰好出现一次（独立冲突对的"类别覆盖"不等于"用例条数"）
    const typesCovered = conflicts.map(
      (c) =>
        (c.shortHasValue && c.longHasValue ? 1 : 0) +
        (c.shortHasValue && !c.longHasValue ? 2 : 0) +
        (!c.shortHasValue && c.longHasValue ? 3 : 0) +
        (!c.shortHasValue && !c.longHasValue ? 4 : 0)
    );
    expect(new Set(typesCovered)).toEqual(new Set([1, 2, 3, 4]));

    // 无冲突术语（所有术语都参与冲突）
    const conflictKeys = new Set();
    for (const c of conflicts) {
      conflictKeys.add(c.short.key);
      conflictKeys.add(c.long.key);
    }
    expect(conflictKeys.size).toBe(8);
  });

  test("generated cases from the diagnostic sample are deterministic and both directions per pair", () => {
    const parsed = parseTerms(getDiagnosticSampleTerms());
    const cases = generateTermTestText(parsed);
    const conflicts = cases.filter((c) => c.type === "conflict");
    // 4 对 × 2 方向 = 8 个冲突用例
    expect(conflicts).toHaveLength(8);
    // 每个方向都频率一致且模式稳定
    const directions = conflicts.map((c) => c.direction).sort();
    expect(directions.filter((d) => d === "short-first")).toHaveLength(4);
    expect(directions.filter((d) => d === "long-first")).toHaveLength(4);

    const again = generateTermTestText(parsed);
    expect(again.map((c) => c.text)).toEqual(cases.map((c) => c.text));
  });
});

// ─── getDeliberateFailureFixtures ────────────────────────────────────────────
describe("termTestUtils getDeliberateFailureFixtures", () => {
  test("returns naive-engine fixtures that reliably fail for old-stream bugs", () => {
    const fixtures = getDeliberateFailureFixtures();
    // 至少三个独立失败样式（前缀误伤、短词抢占、高亮残留）。
    expect(fixtures.length).toBeGreaterThanOrEqual(3);

    for (const fixture of fixtures) {
      // 每个 fixture 是"旧引擎复现"诊断：engine 必须标注为 naive。
      expect(fixture.engine).toBe("naive");
      // 断言必须失败（故意展示错误，而非伪装当前引擎通过）。
      expect(fixture.assertion.ok).toBe(false);
      expect(fixture.assertion.issues.length).toBeGreaterThan(0);
      // 每个 issue 带 message 且为单行。
      for (const issue of fixture.assertion.issues) {
        expect(issue.message).not.toContain("\n");
        expect(issue.message.length).toBeGreaterThan(0);
      }
      // 附带说明性标签（否则用户无法区分"故意失败"与"当前引擎失败"）。
      expect(typeof fixture.description).toBe("string");
      expect(fixture.description.length).toBeGreaterThan(0);
      // 汇总覆盖计划要求的三种旧引擎错误形态。
      expect(fixture.description).toMatch(
        /前缀误伤|短词抢占|高亮残留|切割|抢占/
      );
    }

    // 三种旧引擎错误形态都被覆盖。
    const joined = fixtures.map((f) => f.description).join(" ");
    expect(joined).toMatch(/前缀误伤|切割/);
    expect(joined).toMatch(/短词抢占|抢占/);
    expect(joined).toMatch(/高亮残留/);
  });

  test("fixtures expose readable natural text and expected issue types", () => {
    const fixtures = getDeliberateFailureFixtures();
    for (const fixture of fixtures) {
      expect(fixture.parsed.terms.length).toBeGreaterThan(0);
      expect(typeof fixture.testCase.text).toBe("string");
      expect(fixture.testCase.text.trim().length).toBeGreaterThan(0);
      // 预期必读错误类型必须是单个字符串。
      expect(typeof fixture.expectedIssueType).toBe("string");
      expect(
        fixture.assertion.issues.some(
          (issue) => issue.type === fixture.expectedIssueType
        )
      ).toBe(true);
    }
  });
});

// ─── selectDisplayedResults ──────────────────────────────────────────────────
describe("termTestUtils selectDisplayedResults", () => {
  // 按注意：传入的 results 元素约定为 { assertion: { ok } }，displayed 复用同一数组元素。

  function makeResults(okFlags) {
    return okFlags.map((ok, index) => ({
      index,
      assertion: { ok },
      testCase: { text: `case ${index}` },
    }));
  }

  test("shows failures first, then passes up to the limit", () => {
    const results = makeResults([true, false, true, false, true]);
    const { displayed, hiddenFailCount, hiddenPassCount } =
      selectDisplayedResults(results, { limit: 4 });

    expect(displayed.map((r) => r.index)).toEqual([1, 3, 0, 2]);
    // 失败 2 条全部展示、通过 2 条展示、1 条通过隐藏。
    expect(hiddenFailCount).toBe(0);
    expect(hiddenPassCount).toBe(1);
  });

  test("when failures exceed the limit, shows only failures and reports the rest", () => {
    const results = makeResults([false, false, false, true, false]);
    const { displayed, hiddenFailCount, hiddenPassCount } =
      selectDisplayedResults(results, { limit: 3 });

    // 3 个失败展示（取前 3 个失败），1 个失败隐藏、1 个通过隐藏。
    expect(displayed.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(displayed.every((r) => !r.assertion.ok)).toBe(true);
    expect(hiddenFailCount).toBe(1);
    expect(hiddenPassCount).toBe(1);
  });

  test("when all pass, shows only the first limit items and counts the hidden passes", () => {
    const results = makeResults([true, true, true, true, true, true]);
    const { displayed, hiddenFailCount, hiddenPassCount } =
      selectDisplayedResults(results, { limit: 4 });

    expect(displayed.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(hiddenFailCount).toBe(0);
    expect(hiddenPassCount).toBe(2);
  });

  test("default limit is 4 and a larger limit can be requested", () => {
    const results = makeResults([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    const defaultSel = selectDisplayedResults(results);
    expect(defaultSel.displayed).toHaveLength(4);
    const larger = selectDisplayedResults(results, { limit: 40 });
    expect(larger.displayed).toHaveLength(10);
  });

  test("empty results produce no displayed items and zero hidden counts", () => {
    const { displayed, hiddenFailCount, hiddenPassCount } =
      selectDisplayedResults([], { limit: 4 });
    expect(displayed).toEqual([]);
    expect(hiddenFailCount).toBe(0);
    expect(hiddenPassCount).toBe(0);
  });

  test("stable deterministic order for ties within pass/fail groups", () => {
    const results = makeResults([false, false, true, false, true]);
    const a = selectDisplayedResults(results, { limit: 2 });
    const b = selectDisplayedResults(results, { limit: 2 });
    expect(a.displayed.map((r) => r.index)).toEqual([0, 1]);
    expect(b.displayed.map((r) => r.index)).toEqual([0, 1]);
  });
});

// ─── 冲突分析记忆化与 conflicts 复用（统一计划 20260829 Task 4）──────────────
describe("termTestUtils 冲突分析记忆化（统一计划 20260829 Task 4）", () => {
  function installCountingRegExp() {
    const RealRegExp = RegExp;
    let count = 0;
    class CountingRegExp extends RealRegExp {
      constructor(...args) {
        super(...args);
        count += 1;
      }
    }
    global.RegExp = CountingRegExp;
    return () => {
      global.RegExp = RealRegExp;
      return count;
    };
  }

  test("同 parsed 两次 detectTermConflicts：第二次零编译且结果深相等", () => {
    const keys = [];
    for (let i = 0; i < 40; i++) keys.push(`TermNo${i}x,词${i}`);
    const parsed = parseTerms(keys.join(";"));
    const first = detectTermConflicts(parsed); // 预热并写入 WeakMap

    const restore = installCountingRegExp();
    let delta;
    try {
      var second = detectTermConflicts(parsed);
    } finally {
      delta = restore();
    }
    expect(second).toEqual(first);
    // 加固前每次调用对 40×39 有序对各编译 2 次（3120）；记忆化后第二次为 0。
    expect(delta).toBe(0);
  });

  test("detectTermConflicts 结果对正则术语保持既有语义（互不误伤）", () => {
    const parsed = parseTerms("API\\d+,带编号;API,接口");
    const conflicts = detectTermConflicts(parsed);
    // API\d+ 与 API：API 是 API\d+ 的字面子串 → 检出长短词对
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].short.key).toBe("API");
    expect(conflicts[0].long.key).toBe("API\\d+");
  });

  test("generateTermTestText 接受 { conflicts } 预计算结果并跳过内部自算", () => {
    const parsed = parseTerms("API,接口;APIKey");
    const synthetic = [
      {
        short: { key: "XX", value: "叉叉", isWord: true },
        long: { key: "XXYY", value: "", isWord: false },
        shortHasValue: true,
        longHasValue: false,
      },
    ];
    const cases = generateTermTestText(parsed, "", { conflicts: synthetic });
    // 用例全部来自注入的 synthetic 冲突对，不含 API/APIKey 对
    const conflictCases = cases.filter((c) => c.type === "conflict");
    expect(conflictCases).toHaveLength(2); // short-first + long-first
    for (const c of conflictCases) {
      expect(c.short.key).toBe("XX");
      expect(c.long.key).toBe("XXYY");
    }
    expect(
      cases.some(
        (c) => c.type === "conflict" && (c.short.key === "API" || c.long.key === "APIKey")
      )
    ).toBe(false);
    // 无冲突术语走单术语用例
    const singleCases = cases.filter((c) => c.type === "single");
    expect(singleCases.map((c) => c.term.key).sort()).toEqual(["API", "APIKey"]);
  });

  test("generateTermTestText 不传 conflicts 时保持向后兼容（内部自算）", () => {
    const parsed = parseTerms("API,接口;APIKey");
    const cases = generateTermTestText(parsed);
    const conflictCases = cases.filter((c) => c.type === "conflict");
    expect(conflictCases).toHaveLength(2);
  });
});
