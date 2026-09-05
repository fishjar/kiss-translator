// 专业术语冲突检测、自然语境测试文本生成与结构化断言模块
// 纯本地、零网络、确定性 hash，无随机数。
// 供 Playground UI / CLI 脚本 / 单元测试三方复用。
//
// 依赖：terms.js（parseTerms / applyTermReplace / applyNaiveReplace）

import {
  applyTermReplace,
  applyNaiveReplace,
  parseTerms,
  isStrictLiteralPattern,
} from "./terms";

// ─── 确定性字符串 hash（djb2）───────────────────────────────────────────────
// 同一术语每次生成同一 hash，保证可复现为 fixture。
export function hashKey(key) {
  if (typeof key !== "string") return 0;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) + hash + key.charCodeAt(i);
    hash |= 0; // 32-bit integer
  }
  return Math.abs(hash);
}

// ─── 内置自然语境模板库 ──────────────────────────────────────────────────────
// 纯英文，覆盖多种句式/场景，读起来像人写的文档/对话。
// {term} / {short} / {long} 为插入位。

// 单术语模板（覆盖句首/句中/句末）
const SINGLE_TERM_TEMPLATES = [
  "Please make sure the {term} is configured correctly before deploying.",
  "This section explains how {term} works in practice.",
  "Could you check whether {term} needs to be updated?",
  "We ran into an issue with {term} during testing.",
  "The team discussed the {term} at yesterday's meeting.",
  "Our documentation covers {term} in detail.",
  "In this project, {term} is used for handling requests.",
  "The {term} feature will ship in the next release.",
];

// 冲突对模板：同句同现 {short} 与 {long}。
// 两条方向各一组，覆盖短词→长词（short-first）与长词→短词（long-first）
// 两种自然语序；两组模板措辞不同，防止用机械交换词序冒充方向覆盖。
// short-first 模板（{short} 在前）
const CONFLICT_TEMPLATES = [
  "Please check the {short} and {long} configuration in this document.",
  "We support both standard {short} and custom {long} in our product.",
  "Make sure to compare the {short} and {long} settings before applying them.",
  "Could you explain the difference between {short} and {long}?",
];

// long-first 模板（{long} 在前）
const LONG_FIRST_CONFLICT_TEMPLATES = [
  "The {long} configuration, as well as the {short} one, must be reviewed.",
  "Our guidance document covers {long} before the {short} section.",
  "To configure {long} correctly, the {short} setting needs to align first.",
  "Please note that {long} depends on the {short} parameter below.",
];

// 固定诊断样例：4 组独立冲突对（8 个术语），每组对应一类冲突矩阵。
// 冲突对数量与冲突类别覆盖分开统计：这里的 4 对 = 四类各一对的真矩阵覆盖，
// 不等于任意输入的用例数量保证。
const DIAGNOSTIC_SAMPLE_TERMS = [
  "API,接口",
  "APIKey,应用编程接口",
  "UI,界面",
  "UIView",
  "GPT",
  "GPTs,智能体集合",
  "React",
  "ReactNative",
].join(";");

// ─── 冲突检测 ────────────────────────────────────────────────────────────────
// 检测长短词冲突：两个 key 不同且短词文本能命中长词 key。
// 先检查字面子串，再尝试用正则 pattern 匹配。

// 冲突结果记忆化：按 terms 数组引用做 WeakMap 记忆化（GC 友好）。
// Playground runCompute 与 generateTermTestText 多次读取同一 parsed 的冲突结果时
// 只分析一次。契约：缓存命中期间不得就地变异 terms 条目的 key 字段。
const termConflictsCache = new WeakMap();

/**
 * 检测 parsedTerms 中的长短词冲突对
 * @param {Array|object} parsedTerms - parseTerms 输出的 terms 数组或 { terms } 对象
 * @returns {Array<{ short: object, long: object, shortHasValue: boolean, longHasValue: boolean }>}
 */
export function detectTermConflicts(parsedTerms) {
  const terms = Array.isArray(parsedTerms)
    ? parsedTerms
    : parsedTerms?.terms || [];
  if (terms.length < 2) return [];

  const cached = termConflictsCache.get(terms);
  if (cached) return cached;

  const conflicts = [];
  const seen = new Set(); // 去重："shortKey:longKey"

  for (let i = 0; i < terms.length; i++) {
    for (let j = 0; j < terms.length; j++) {
      if (i === j) continue;

      const a = terms[i];
      const b = terms[j];

      // 确定短词和长词（按 key.length 判断）
      const [short, long] = a.key.length <= b.key.length ? [a, b] : [b, a];

      // 相同长度但不是同一个 key → 跳过（非严格子串关系）
      if (short.key.length === long.key.length && short.key !== long.key) {
        continue;
      }

      // 检查短词文本是否能命中长词 key
      const hits = termHitsKey(short, long.key);
      if (!hits) continue;

      const pairKey = `${short.key}:${long.key}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      conflicts.push({
        short,
        long,
        shortHasValue: short.value !== "",
        longHasValue: long.value !== "",
      });
    }
  }

  termConflictsCache.set(terms, conflicts);
  return conflicts;
}

/**
 * 检查一个术语的 key 是否能命中另一个 key 文本
 * 先检查纯子串，再检查正则匹配（双向检查，确保 regex 术语也能被检测）。
 * 白名单短路（统一计划 20260829 Task 4）：双方均为严格字面量时，正则命中与
 * 子串检查语义等价（严格字面量正则只匹配其去转义文本；对方源码中元字符必带
 * 前置反斜杠，去转义文本不可能跨界出现），直接返回子串检查结果，零编译。
 */
function termHitsKey(term, targetKey) {
  // 纯子串检查
  if (targetKey.includes(term.key)) return true;

  // 白名单短路：双方严格字面量 → 不可能再通过正则路径命中
  if (isStrictLiteralPattern(term.key) && isStrictLiteralPattern(targetKey)) {
    return false;
  }

  // 正则匹配检查：term.key 作为正则匹配 targetKey
  try {
    const regex = new RegExp(term.key);
    if (regex.test(targetKey)) return true;
  } catch (e) {
    // parseTerms 已校验过，不会走到这里
  }

  // 反向检查：targetKey 作为正则匹配 term.key
  // 处理 targetKey 是 regex pattern 而 term.key 是文本的情况
  try {
    const reverseRegex = new RegExp(targetKey);
    if (reverseRegex.test(term.key)) return true;
  } catch (e) {
    // 非正则文本作为 regex 不安全时跳过
  }

  return false;
}

// ─── 测试文本生成 ────────────────────────────────────────────────────────────
// 确定性生成，同一术语每次生成同一句子。

/**
 * 从 parsedTerms 生成测试用例数组
 * 每个冲突对生成两条用例：short-first（短词在前）与 long-first（长词在前），
 * 分别用两组措辞不同的自然模板，覆盖同句内两种出现方向。
 * 模板选择由"术语/冲突对 + 方向 + seed"的确定性 hash 决定：
 * - seed 缺省（空字符串）时与旧行为完全一致（可复现既有 fixture）；
 * - 传入不同 seed 可在有限模板集合内轮换出不同的自然例句（UI"换一个例句"能力）。
 * @param {Array|object} parsedTerms - parseTerms 输出的 terms 数组或 { terms } 对象
 * @param {string|number} [seed=""] - 显式轮换种子（同一 seed 必产生相同结果）
 * @param {object} [options]
 * @param {Array} [options.conflicts] - 预计算的 detectTermConflicts 结果（调用方
 *   已算过时传入以复用，如 Playground runCompute 只分析一次）；不传则内部自算
 *   （向后兼容，CLI / 测试不受影响）
 * @returns {Array<{
 *   type: "conflict" | "single",
 *   text: string,
 *   short?: object,
 *   long?: object,
 *   shortHasValue?: boolean,
 *   longHasValue?: boolean,
 *   conflictType?: number,
 *   direction?: "short-first" | "long-first",
 *   term?: object,
 * }>}
 */
export function generateTermTestText(parsedTerms, seed = "", options = {}) {
  const seedSuffix = String(seed === undefined || seed === null ? "" : seed);
  const withSeed = (base) => (seedSuffix ? `${base}#${seedSuffix}` : base);

  const terms = Array.isArray(parsedTerms)
    ? parsedTerms
    : parsedTerms?.terms || [];
  if (terms.length === 0) return [];

  const cases = [];

  // 1. 冲突对用例：每对冲突按两个方向各生成一条自然语境用例。
  //    冲突分析只算一次：调用方传入预计算结果则直接复用，否则内部自算。
  const conflicts = options?.conflicts ?? detectTermConflicts(parsedTerms);
  for (const conflict of conflicts) {
    const { short, long, shortHasValue, longHasValue } = conflict;
    const conflictType = getConflictType(shortHasValue, longHasValue);

    // 选模板：用"冲突对组合 key + 方向 + seed"做 hash，保证同一对方向各自稳定
    const pairKey = `${short.key}:${long.key}`;
    for (const direction of ["short-first", "long-first"]) {
      const pool =
        direction === "short-first"
          ? CONFLICT_TEMPLATES
          : LONG_FIRST_CONFLICT_TEMPLATES;
      const templateIndex =
        hashKey(withSeed(`${pairKey}#${direction}`)) % pool.length;
      const template = pool[templateIndex];

      const text = template
        .replace(/\{short\}/g, short.key)
        .replace(/\{long\}/g, long.key);

      cases.push({
        type: "conflict",
        text,
        short,
        long,
        shortHasValue,
        longHasValue,
        conflictType,
        direction,
      });
    }
  }

  // 2. 无冲突术语的单术语用例
  const conflictKeys = new Set();
  for (const c of conflicts) {
    conflictKeys.add(c.short.key);
    conflictKeys.add(c.long.key);
  }

  for (const term of terms) {
    if (conflictKeys.has(term.key)) continue;

    // 选模板
    const templateIndex =
      hashKey(withSeed(term.key)) % SINGLE_TERM_TEMPLATES.length;
    const template = SINGLE_TERM_TEMPLATES[templateIndex];
    const text = template.replace(/\{term\}/g, term.key);

    cases.push({
      type: "single",
      text,
      term,
    });
  }

  return cases;
}

/**
 * 根据短词和长词是否有译文，判定冲突类型（1-4）
 */
function getConflictType(shortHasValue, longHasValue) {
  if (shortHasValue && longHasValue) return 1;
  if (shortHasValue && !longHasValue) return 2;
  if (!shortHasValue && longHasValue) return 3;
  return 4; // !shortHasValue && !longHasValue
}

/**
 * 将多个测试用例的文本按序拼接为段落
 * @param {Array} cases - generateTermTestText 的返回值
 * @returns {string}
 */
export function joinIntoParagraph(cases) {
  if (!Array.isArray(cases) || cases.length === 0) return "";
  return cases.map((c) => c.text).join(" ");
}

// ─── 结构化断言 ──────────────────────────────────────────────────────────────
// 每个断言失败输出 { type, message, detail }
// message 为一行精简文案（UI 与 CLI 摘要直接展示）
// detail 为完整上下文（含 spans、涉及术语、修复前文本等）

/**
 * 对单个测试用例执行断言
 * @param {Array|object} parsedTerms - 完整 parsedTerms
 * @param {object} testCase - generateTermTestText 返回的单个用例
 * @param {object} [options]
 * @param {"fixed"|"naive"} [options.engine="fixed"] - 断言目标引擎：
 *   "fixed" 断言修复后引擎（默认，ok 反映修复后行为），并额外产出 evidence（旧引擎的误伤演示，不影响 ok）；
 *   "naive" 断言旧引擎复现输出（错误引擎输出会产生对应 issue，供负向用例/演示使用）。
 * @returns {{
 *   ok: boolean,
 *   issues: Array<{ type: string, message: string, detail: object }>,
 *   evidence: Array<{ type: string, message: string, detail: object }>,
 * }}
 */
export function assertTermReplacements(parsedTerms, testCase, options = {}) {
  const issues = [];
  const evidence = [];
  const engine = options.engine === "naive" ? "naive" : "fixed";

  // 确保 parsedTerms 是数组
  const terms = Array.isArray(parsedTerms)
    ? parsedTerms
    : parsedTerms?.terms || [];
  if (terms.length === 0) {
    return {
      ok: false,
      issues: [
        {
          type: "no-terms",
          message: "无有效术语，无法断言",
          detail: { reason: "parsedTerms is empty" },
        },
      ],
      evidence,
    };
  }

  const text = testCase.text;
  if (typeof text !== "string" || text.trim() === "") {
    return {
      ok: false,
      issues: [
        {
          type: "empty-text",
          message: "测试文本为空，无法断言",
          detail: { reason: "testCase.text is empty" },
        },
      ],
      evidence,
    };
  }

  // 标准替换器：有译文用译文，无译文保留原文
  const replacer = (term, fullMatch) => term.value || fullMatch;

  // 修复后引擎输出 + 旧引擎复现输出（使用 parseTerms 的真实 originalOrder，
  // 否则排序后的 terms 会让旧引擎"意外正确"，修复前/后对比证据失效）
  const fixed = applyTermReplace(text, terms, replacer);
  const naive = applyNaiveReplace(text, parsedTerms);
  const result = engine === "naive" ? naive : fixed;
  const { spans } = result;

  // 单术语用例：检查替换正确性
  if (testCase.type === "single") {
    const term = testCase.term;
    if (!term) {
      return {
        ok: false,
        issues: [
          {
            type: "invalid-testcase",
            message: "单术语用例缺少 term 信息",
            detail: { testCase },
          },
        ],
        evidence,
      };
    }

    // 检查术语是否被命中
    const termSpans = spans.filter((s) => s.termKey === term.key);
    if (termSpans.length === 0) {
      issues.push({
        type: "single-term-not-found",
        message: `术语 ${term.key} 未被命中`,
        detail: {
          term,
          text,
          spans,
          fixedOutput: fixed.output,
          naiveOutput: naive.output,
        },
      });
    } else {
      // 检查替换正确性
      for (const span of termSpans) {
        const expectedReplacement = term.value || span.termKey; // 无译文时保持原文
        if (span.replacement !== expectedReplacement) {
          issues.push({
            type: "single-term-wrong-replacement",
            message: `术语 ${term.key} 替换结果不正确`,
            detail: {
              term,
              span,
              expectedReplacement,
              text,
              fixedOutput: fixed.output,
              naiveOutput: naive.output,
            },
          });
        }
      }
    }

    // 修复前/后差异对比（演示证据，不影响 ok）
    if (engine === "fixed" && naive.output !== fixed.output) {
      evidence.push({
        type: "naive-vs-fixed-diff",
        message: `术语 ${term.key} 修复前后结果不同（旧引擎 ${naive.output !== text ? "有误伤" : "无影响"}）`,
        detail: {
          termKey: term.key,
          text,
          naiveOutput: naive.output,
          fixedOutput: fixed.output,
          naiveSpans: naive.spans,
          fixedSpans: spans,
        },
      });
    }

    return { ok: issues.length === 0, issues, evidence };
  }

  // 冲突类型用例
  if (testCase.type === "conflict") {
    const { short, long, shortHasValue, longHasValue, conflictType } = testCase;

    // 查找长词和短词的 spans
    const longSpans = spans.filter((s) => s.termKey === long.key);
    const shortSpans = spans.filter((s) => s.termKey === short.key);

    // 断言 1: 长词必须被命中
    if (longSpans.length === 0) {
      issues.push({
        type: `conflict-type-${conflictType}`,
        message: `长词 ${long.key} 未被命中（短词 ${short.key} 可能抢占）`,
        detail: {
          conflictType,
          short: { key: short.key, value: short.value },
          long: { key: long.key, value: long.value },
          text,
          spans,
          fixedOutput: fixed.output,
          naiveOutput: naive.output,
        },
      });
    } else {
      // 断言 2: 长词区间内不能有短词残留
      for (const ls of longSpans) {
        for (const ss of shortSpans) {
          if (ss.start >= ls.start && ss.end <= ls.end) {
            // 短词在长词区间内 → 前缀误伤
            issues.push({
              type: `conflict-type-${conflictType}`,
              message: `长词 ${long.key} 被短词 ${short.key} 切割（检测到前缀误伤）`,
              detail: {
                conflictType,
                short: { key: short.key, value: short.value },
                long: { key: long.key, value: long.value },
                longSpan: ls,
                shortSpan: ss,
                text,
                spans,
                fixedOutput: fixed.output,
                naiveOutput: naive.output,
              },
            });
          }
        }
      }

      // 断言 3: 长词有译文时应替换为译文，无译文时应保持原文
      for (const ls of longSpans) {
        if (longHasValue) {
          // 类型 1/3: 长词应有译文
          if (ls.replacement === ls.termKey) {
            issues.push({
              type: `conflict-type-${conflictType}`,
              message: `长词 ${long.key} 有译文但未被替换（仍为原文）`,
              detail: {
                conflictType,
                long: { key: long.key, value: long.value },
                longSpan: ls,
                text,
                spans,
                fixedOutput: fixed.output,
                naiveOutput: naive.output,
              },
            });
          }
        } else {
          // 类型 2/4: 长词无译文，应保持原文
          if (ls.replacement !== ls.termKey) {
            issues.push({
              type: `conflict-type-${conflictType}`,
              message: `长词 ${long.key} 无译文但被替换为 "${ls.replacement}"`,
              detail: {
                conflictType,
                long: { key: long.key, value: long.value },
                longSpan: ls,
                text,
                spans,
                fixedOutput: fixed.output,
                naiveOutput: naive.output,
              },
            });
          }
        }
      }
    }

    // 断言 4: 短词单独出现时应正确替换
    for (const ss of shortSpans) {
      // 检查这个短词 span 是否在长词 span 内部（已在断言 2 中检查，跳过）
      const insideLong = longSpans.some(
        (ls) => ss.start >= ls.start && ss.end <= ls.end
      );
      if (insideLong) continue; // 已在断言 2 中处理

      if (shortHasValue) {
        if (ss.replacement === ss.termKey) {
          issues.push({
            type: `conflict-type-${conflictType}`,
            message: `短词 ${short.key} 有译文但未被替换（单独出现时）`,
            detail: {
              conflictType,
              short: { key: short.key, value: short.value },
              shortSpan: ss,
              text,
              spans,
              fixedOutput: fixed.output,
              naiveOutput: naive.output,
            },
          });
        }
      }
    }

    // 旧引擎专属切割证据（naive 引擎下才有意义：旧引擎的短词命中会落在长词出现区间内）
    if (engine === "naive") {
      const shortInsideLong = naive.spans.some(
        (s) => s.termKey === short.key && spanInsideKey(text, s, long.key)
      );
      if (shortInsideLong) {
        if (shortHasValue) {
          // 类型 1/2：短词有译文 → 长词被切出 "短词译文 + 残段"（如 接口Key）
          issues.push({
            type: "naive-prefix-cut",
            message: `长词 ${long.key} 被短词 ${short.key} 切割（检测到前缀误伤）`,
            detail: {
              conflictType,
              short: { key: short.key, value: short.value },
              long: { key: long.key, value: long.value },
              text,
              naiveSpans: naive.spans,
              naiveOutput: naive.output,
              fixedOutput: fixed.output,
            },
          });
        } else if (!longHasValue) {
          // 类型 4：都无译文 → 文本不变但长词被切出高亮残留（必须看 spans 才能发现）
          issues.push({
            type: "naive-cut-residue",
            message: `不翻译长词 ${long.key} 被切割出高亮残留（短词 ${short.key} 内部命中）`,
            detail: {
              conflictType,
              short: { key: short.key, value: short.value },
              long: { key: long.key, value: long.value },
              text,
              naiveSpans: naive.spans,
              naiveOutput: naive.output,
              fixedOutput: fixed.output,
            },
          });
        }
        // 类型 3：短词无译文且长词有译文 → 断言 1（长词未被命中）已覆盖"短词抢占"
      }
    }

    // 修复前/后差异对比（演示证据，不影响 ok；基于 spans 判断，
    // 类型 4 的切割在文本层面不可见，必须看旧引擎的命中区间）
    if (engine === "fixed") {
      const cutEvidence = findNaiveCutEvidence({
        naive,
        text,
        short,
        long,
        longHasValue,
      });
      if (cutEvidence) {
        evidence.push({
          type: "naive-vs-fixed-diff",
          message: `修复前旧引擎 ${cutEvidence}，修复后已纠正`,
          detail: {
            conflictType,
            short: { key: short.key, value: short.value },
            long: { key: long.key, value: long.value },
            text,
            naiveOutput: naive.output,
            fixedOutput: fixed.output,
            naiveSpans: naive.spans,
            fixedSpans: spans,
          },
        });
      }
    }

    return { ok: issues.length === 0, issues, evidence };
  }

  // 未知类型
  return {
    ok: false,
    issues: [
      {
        type: "unknown-testcase-type",
        message: `未知的测试用例类型: ${testCase.type}`,
        detail: { testCase },
      },
    ],
    evidence,
  };
}

/**
 * 命中区间是否落在 key 文本的某个出现区间内
 * @param {string} text - 完整文本
 * @param {{ start: number, end: number }} span - 命中区间
 * @param {string} key - 要检查的术语 key
 */
function spanInsideKey(text, span, key) {
  let index = text.indexOf(key);
  while (index !== -1) {
    if (span.start >= index && span.end <= index + key.length) return true;
    index = text.indexOf(key, index + 1);
  }
  return false;
}

/**
 * 分析旧引擎（naive）输出中是否存在对长词的切割证据。
 * 基于 spans 判断（类型 4 的切割在文本层面不可见，必须看命中区间）。
 * @param {{
 *   naive: { output: string, spans: Array<object> },
 *   text: string,
 *   short: object,
 *   long: object,
 *   longHasValue: boolean,
 * }} params
 * @returns {string|null} 描述证据的描述串，无问题返回 null
 */
function findNaiveCutEvidence({ naive, text, short, long, longHasValue }) {
  const naiveLongHit = naive.spans.some((s) => s.termKey === long.key);
  const shortInsideLong = naive.spans.some(
    (s) => s.termKey === short.key && spanInsideKey(text, s, long.key)
  );

  // 旧引擎下短词命中落在长词区间内、且长词整体从未命中 → 存在切割
  if (shortInsideLong && !naiveLongHit) {
    if (short.value) {
      // 类型 1/2：短词有译文 → 长词被切出 "短词译文 + 残段"（如 接口Key）
      const residue =
        long.key.slice(0, long.key.indexOf(short.key)) +
        short.value +
        long.key.slice(long.key.indexOf(short.key) + short.key.length);
      return `将 ${long.key} 切割为 ${residue}`;
    }
    if (longHasValue) {
      // 类型 3：短词无译文、长词有译文 → 长词永不触发（短词抢占）
      return `长词 ${long.key} 未被触发（短词 ${short.key} 抢占）`;
    }
    // 类型 4：都无译文 → 文本不变但长词被切出高亮残留
    return `长词 ${long.key} 被切割出高亮残留（短词 ${short.key} 内部命中）`;
  }
  return null;
}

// ─── 固定诊断样例 ────────────────────────────────────────────────────────────
// 四组独立冲突对（8 个术语），分别对应四类冲突矩阵，不使用任意用户的术语数推导。
// 冲突对数量 = 4（唯一冲突对数），冲突类别覆盖 = 4（四类各一），
// 用例数量 = 8（每对两类方向 × 2）。
//
// 与任意用户输入的区别：用户输入中的冲突对数量由实际子串关系决定，
// 四类矩阵覆盖由专门构造的 4 对 fixture 保证，不承诺对任意输入都有四类齐全。

/**
 * 返回四组独立冲突对（8 个术语）的术语字符串，覆盖全部 4 类冲突矩阵。
 * 冲突对与类别覆盖一对一：类型 1 (API/APIKey)、类型 2 (UI/UIView)、
 * 类型 3 (GPT/GPTs)、类型 4 (React/ReactNative)。
 * @returns {string} 用 ; 连接的术语字符串，可直接传给 parseTerms。
 */
export function getDiagnosticSampleTerms() {
  return DIAGNOSTIC_SAMPLE_TERMS;
}

// ─── 开发态故意失败样例 ──────────────────────────────────────────────────────
// 旧引擎(naive)复现诊断 fixture。每项在 engine="naive" 下必然失败，
// 用于验证"错误状态本身能被正确识别并呈现"。错误状态类型包括：
// - 前缀误伤（naive-prefix-cut）：短词有译文把长词切成"短词译文+残段"
// - 短词抢占（conflict-type-3）：短词无译文导致长词永不触发
// - 高亮残留（naive-cut-residue）：都无译文但长词被切出高亮标记
// 所有 fixture 都标注 engine="naive"，不得伪装成当前引擎失败。

/**
 * 返回确定性构造的旧引擎失败诊断 fixture。
 * 每个 fixture 包含 parsedTerms、testCase、assertion(naive)、expectedIssueType
 * 和 description 标签，供 UI 展示"旧引擎复现"诊断区域。
 * @returns {Array<{
 *   parsed: object,
 *   testCase: object,
 *   assertion: { ok: boolean, issues: Array, evidence: Array },
 *   expectedIssueType: string,
 *   description: string,
 *   engine: "naive",
 * }>}
 */
export function getDeliberateFailureFixtures() {
  const fixtures = [];

  const addFixture = (
    termsString,
    { conflictType, direction, expectedIssueType, description }
  ) => {
    const parsed = parseTerms(termsString);
    const cases = generateTermTestText(parsed);
    // 找到匹配方向与冲突类型的冲突用例
    const testCase = cases.find(
      (c) =>
        c.type === "conflict" &&
        c.direction === direction &&
        c.conflictType === conflictType
    );
    if (!testCase) return;
    const assertion = assertTermReplacements(parsed, testCase, {
      engine: "naive",
    });
    fixtures.push({
      parsed,
      testCase,
      assertion,
      expectedIssueType,
      description,
      engine: "naive",
    });
  };

  // 类型 2：短词有译文、长词无译文 → 旧引擎把 APIKey 切成 接口Key（前缀误伤）
  addFixture("API,接口;APIKey", {
    conflictType: 2,
    direction: "short-first",
    expectedIssueType: "naive-prefix-cut",
    description: "前缀误伤复现：旧引擎把 APIKey 切成 接口Key（短词有译文）",
  });

  // 类型 3：短词无译文、长词有译文 → 旧引擎 GPTs 永不触发（短词抢占）
  addFixture("GPT;GPTs,智能体集合", {
    conflictType: 3,
    direction: "short-first",
    expectedIssueType: "conflict-type-3",
    description: "短词抢占复现：旧引擎 GPTs 永不触发（短词无译文）",
  });

  // 类型 4：都无译文 → 旧引擎 ReactNative 切出高亮残留
  addFixture("React;ReactNative", {
    conflictType: 4,
    direction: "short-first",
    expectedIssueType: "naive-cut-residue",
    description: "无译文长词高亮残留复现：旧引擎 ReactNative 被切割出高亮标记",
  });

  return fixtures;
}

// ─── UI 展示规模控制 ─────────────────────────────────────────────────────────
// 完整计算结果与 UI 展示结果分离。完整结果用于统计和控制台诊断，
// 但 UI 默认只展示有限数量（上限 4），筛选优先级：失败项优先。

const DISPLAY_LIMIT_DEFAULT = 4;

/**
 * 从完整结果中筛选出 UI 展示条目，失败优先，数量不超过 limit。
 * @param {Array<{ assertion: { ok: boolean } }>} results - 完整计算结果数组
 * @param {{ limit?: number }} [options]
 * @returns {{
 *   displayed: Array,
 *   hiddenFailCount: number,
 *   hiddenPassCount: number,
 * }}
 */
export function selectDisplayedResults(results, options = {}) {
  const limit = options.limit ?? DISPLAY_LIMIT_DEFAULT;
  if (!Array.isArray(results) || results.length === 0) {
    return { displayed: [], hiddenFailCount: 0, hiddenPassCount: 0 };
  }

  // 分离失败与通过，各自保持原始顺序使确定性稳定
  const failures = results.filter((r) => !r.assertion.ok);
  const passes = results.filter((r) => r.assertion.ok);

  // 先排失败（保持原始顺序），再排通过
  const sorted = [...failures, ...passes];

  // 取前 limit 条
  const displayed = sorted.slice(0, limit);

  // 计算隐藏数量
  const totalFail = failures.length;
  const totalPass = passes.length;
  const displayedFail = displayed.filter((r) => !r.assertion.ok).length;
  const displayedPass = displayed.filter((r) => r.assertion.ok).length;

  return {
    displayed,
    hiddenFailCount: totalFail - displayedFail,
    hiddenPassCount: totalPass - displayedPass,
  };
}
