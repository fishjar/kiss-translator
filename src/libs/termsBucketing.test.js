// 首字符分桶 matcher 测试
//
// 核心契约：**输出必须与未分桶实现逐字节一致**。
// 优化可以牺牲速度，绝不能牺牲正确性——不一致的优化比不优化更危险。
import {
  parseTerms,
  buildTermsMatcher,
  buildTermsMatcherBucketed,
  buildTermsMatcherForLibrary,
  applyTermReplace,
} from "./terms";

const replacer = (term, fullMatch) => term.value || fullMatch;

/** 用两种 matcher 跑同一份语料，断言输出与 spans 完全一致 */
function expectEquivalent(text, termsString) {
  const { terms } = parseTerms(termsString, { fullDiagnostics: false });
  const plain = buildTermsMatcher(terms);
  const bucketed = buildTermsMatcherBucketed(terms);

  const a = applyTermReplace(text, terms, replacer, plain);
  const b = applyTermReplace(text, terms, replacer, bucketed);

  expect(b.output).toBe(a.output);
  expect(b.spans.length).toBe(a.spans.length);
  // span 集合应等价（顺序可能因分桶执行顺序不同）
  const key = (s) => `${s.start}:${s.end}:${s.termKey}:${s.replacement}`;
  expect(b.spans.map(key).sort()).toEqual(a.spans.map(key).sort());
  return a.output;
}

describe("分桶 matcher 与未分桶实现输出等价", () => {
  const corpus = [
    "The Cheeta ran. Two Cheetas. Cheetah Rock. MyCheetaX.",
    "API and APIKey and APIs",
    "GPTs and GPT and React and ReactNative",
    "Dr.whob said hello",
    "no matches at all here",
    "",
    "   ",
    "手机 and 手机壳",
    "zzz end",
    "Term at Cheetah",
    "a,b,c and a and b",
    "混合 mixed 内容 with 中文 and English",
  ];

  const termSets = [
    "Cheeta,齐塔",
    "Cheeta,齐塔;API,接口;APIKey,应用编程接口",
    "GPT;GPTs,智能体集合;React;ReactNative",
    "Dr\\.whob,神经病",
    "手机,手机;zzz,末尾",
    "a,b,值;c,三",
    "\\d+,数字;^start,开头;(a|b),括号",
  ];

  test.each(
    corpus.flatMap((text) => termSets.map((t) => [text, t]))
  )("text=%j terms=%j", (text, termSet) => {
    expectEquivalent(text, termSet);
  });
});

describe("分桶键提取的正确性", () => {
  test("转义字面量按其字面字符分桶（`\\.` 是真正的转义）", () => {
    const { terms } = parseTerms("Dr\\.whob,神经病", { fullDiagnostics: false });
    const m = buildTermsMatcherBucketed(terms);
    expect([...m.buckets.keys()]).toContain("D");
  });

  test("正则类/断言开头（\\d \\w \\s \\b）必须进兜底桶，不能被按字面分桶", () => {
    // 【实测 bug 回归锁】`\d+` 若按字面 'd' 分桶，文本中没有字母 d 时会被静默跳过。
    // 反例：applyTermReplace("abc 123 xyz", "\d+,数字") 未分桶能命中，分桶后漏掉。
    const { terms } = parseTerms("\\d+,数字;\\w+,词;\\bfoo\\b,边界", {
      fullDiagnostics: false,
    });
    const m = buildTermsMatcherBucketed(terms);
    expect(m.restMatcher).not.toBeNull();
    expect(m.restMatcher.termList).toHaveLength(3);
    // buckets 里不应出现 d / w / b 这些误导性键
    expect([...m.buckets.keys()]).toEqual([]);
  });

  test("回归：无字面 d 的文本中 \\d+ 仍能被替换", () => {
    const src = "\\d+,数字";
    const { terms } = parseTerms(src, { fullDiagnostics: false });
    const m = buildTermsMatcherBucketed(terms);
    const text = "abc 123 xyz"; // 注意：不含字母 d
    const plain = applyTermReplace(
      text,
      terms,
      replacer,
      buildTermsMatcher(terms)
    );
    const bucketed = applyTermReplace(text, terms, replacer, m);
    expect(bucketed.output).toBe(plain.output);
    expect(bucketed.output).toBe("abc 数字 xyz");
  });

  test("正则元字符开头的术语进兜底桶（不能被静默丢弃）", () => {
    const { terms } = parseTerms("^start,开头;\\d+,数字", {
      fullDiagnostics: false,
    });
    const m = buildTermsMatcherBucketed(terms);
    expect(m.restMatcher).not.toBeNull();
    expect(m.restMatcher.termList).toHaveLength(2);
    // 兜底桶必须无条件执行：数字与 ^start 都要能命中
    const out = applyTermReplace("123 start", terms, replacer, m);
    expect(out.output).toContain("数字");
  });

  test("CJK 首字符正确分桶", () => {
    const { terms } = parseTerms("手机,手机", { fullDiagnostics: false });
    const m = buildTermsMatcherBucketed(terms);
    expect([...m.buckets.keys()]).toContain("手");
  });

  test("空术语列表返回 null", () => {
    expect(buildTermsMatcherBucketed([])).toBeNull();
    expect(buildTermsMatcherBucketed(parseTerms("").terms)).toBeNull();
  });
});

describe("兜底桶无条件执行（保证不遗漏）", () => {
  test("首字符不在文本中时，仍能命中兜底桶中的正则术语", () => {
    const { terms } = parseTerms("\\d+,数字", { fullDiagnostics: false });
    const m = buildTermsMatcherBucketed(terms);
    // 文本里没有 "d"，但 \d+ 应该命中数字
    const r = applyTermReplace("abc 123 def", terms, replacer, m);
    expect(r.output).toBe("abc 数字 def");
  });

  test("首字符匹配但文本中无该桶实际命中时结果不变", () => {
    const { terms } = parseTerms("Zebra,斑马", { fullDiagnostics: false });
    const m = buildTermsMatcherBucketed(terms);
    const r = applyTermReplace("Zzz nothing here", terms, replacer, m);
    expect(r.output).toBe("Zzz nothing here");
  });
});

describe("buildTermsMatcherForLibrary 阈值行为", () => {
  test("小规模走未分桶实现", () => {
    const { terms } = parseTerms("API,接口", { fullDiagnostics: false });
    const m = buildTermsMatcherForLibrary(terms, { threshold: 64 });
    expect(m.bucketed).toBeUndefined();
  });

  test("大规模走分桶实现", () => {
    const src = Array.from({ length: 100 }, (_, i) => `key${i},值${i}`).join(";");
    const { terms } = parseTerms(src, { fullDiagnostics: false });
    const m = buildTermsMatcherForLibrary(terms, { threshold: 64 });
    expect(m.bucketed).toBe(true);
  });

  test("可强制关闭分桶", () => {
    const src = Array.from({ length: 100 }, (_, i) => `key${i},值${i}`).join(";");
    const { terms } = parseTerms(src, { fullDiagnostics: false });
    const m = buildTermsMatcherForLibrary(terms, { bucketed: false });
    expect(m.bucketed).toBeUndefined();
  });

  test("两种阈值下的输出一致", () => {
    const src = Array.from({ length: 100 }, (_, i) => `key${i},值${i}`).join(";");
    const { terms } = parseTerms(src, { fullDiagnostics: false });
    const text = "key0 and key50 and nothing";
    const a = applyTermReplace(
      text,
      terms,
      replacer,
      buildTermsMatcherForLibrary(terms, { bucketed: false })
    );
    const b = applyTermReplace(
      text,
      terms,
      replacer,
      buildTermsMatcherForLibrary(terms, { threshold: 8 })
    );
    expect(b.output).toBe(a.output);
  });
});

describe("matcher 身份契约（termList 不一致时自愈）", () => {
  test("传入不匹配的分桶 matcher 时按 terms 重建", () => {
    const a = parseTerms("API,接口", { fullDiagnostics: false }).terms;
    const b = parseTerms("ZZZ,值", { fullDiagnostics: false }).terms;
    const matcherA = buildTermsMatcherBucketed(a);
    // 用 b 的术语 + a 的 matcher
    const r = applyTermReplace("ZZZ here", b, replacer, matcherA);
    expect(r.output).toBe("值 here");
  });
});
