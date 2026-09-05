import {
  parseTerms,
  buildTermsRegex,
  buildTermsMatcher,
  applyTermReplace,
  applyNaiveReplace,
  findUnescapedRegexMeta,
  formatDiagnosticMessage,
  isStrictLiteralPattern,
} from "./terms";
import { detectTermConflicts } from "./termTestUtils";

// 术语替换纯函数测试（Task 1）
// 覆盖：解析规格、排序、去重、非法正则、无单词边界匹配（上游语义）、冲突矩阵 4 类、空译文语义、旧引擎复现
describe("terms parseTerms", () => {
  test("parses key,value pairs separated by newline or semicolon", () => {
    const { terms, invalid, originalOrder } = parseTerms(
      "API,接口\nGPTs,智能体集合;React,React Native"
    );
    expect(invalid).toEqual([]);
    expect(terms.map((t) => t.key)).toEqual(["React", "GPTs", "API"]);
    expect(terms.map((t) => t.value)).toEqual([
      "React Native",
      "智能体集合",
      "接口",
    ]);
    // originalOrder 保持原始输入顺序，与排序后的 terms 独立
    expect(originalOrder.map((t) => t.key)).toEqual(["API", "GPTs", "React"]);
  });

  test("sorts overlapping keys by key.length descending", () => {
    const { terms } = parseTerms("API,接口;APIKey,应用编程接口");
    expect(terms.map((t) => t.key)).toEqual(["APIKey", "API"]);
    // 短词在前、长词在后时同样按长度降序
    const reversed = parseTerms("APIKey,应用编程接口;API,接口").terms;
    expect(reversed.map((t) => t.key)).toEqual(["APIKey", "API"]);
  });

  test("same key with a different value is a conflicting mapping (fatal), not silent override", () => {
    const { terms, diagnostics, hasErrors } =
      parseTerms("API,接口;API,另一个接口");
    // 首段仍保留在 terms，但输入整体标记为非法（冲突映射）
    expect(terms).toHaveLength(1);
    expect(terms[0].value).toBe("接口");
    expect(hasErrors).toBe(true);
    expect(diagnostics.some((d) => d.type === "conflicting-mapping")).toBe(
      true
    );
  });

  test("identical repeated mapping is a non-fatal duplicate mapping diagnostic", () => {
    const { terms, diagnostics, hasErrors } = parseTerms("API,接口;API,接口");
    expect(terms).toHaveLength(1);
    expect(hasErrors).toBe(false);
    expect(diagnostics.some((d) => d.type === "duplicate-mapping")).toBe(true);
    expect(diagnostics.some((d) => d.type === "conflicting-mapping")).toBe(
      false
    );
  });

  test("collects invalid regex keys into invalid array", () => {
    const { terms, invalid } = parseTerms("API,接口;bad[re");
    expect(terms.map((t) => t.key)).toEqual(["API"]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].key).toBe("bad[re");
    expect(invalid[0].error).toBeInstanceOf(Error);
  });

  test("marks isWord only for pure ASCII word keys", () => {
    const { terms } = parseTerms("API,接口;手机,手机;API\\.\\d+,x");
    const byKey = Object.fromEntries(terms.map((t) => [t.key, t]));
    expect(byKey["API"].isWord).toBe(true);
    expect(byKey["手机"].isWord).toBe(false);
    expect(byKey["API\\.\\d+"].isWord).toBe(false);
  });

  test("wraps all keys as (key) with no word boundaries (上游语义)", () => {
    const { terms } = parseTerms("API,接口;手机,手机;API\\.\\d+,x");
    const byKey = Object.fromEntries(terms.map((t) => [t.key, t]));
    expect(byKey["API"].pattern).toBe("(API)");
    expect(byKey["手机"].pattern).toBe("(手机)");
    expect(byKey["API\\.\\d+"].pattern).toBe("(API\\.\\d+)");
  });

  test("term entries expose exactly key, value, pattern, isWord", () => {
    const { terms } = parseTerms("API,接口");
    expect(Object.keys(terms[0]).sort()).toEqual([
      "isWord",
      "key",
      "pattern",
      "value",
    ]);
  });

  test("splits key and value at the last comma", () => {
    const { terms } = parseTerms("a,b,c");
    expect(terms[0].key).toBe("a,b");
    expect(terms[0].value).toBe("c");
  });

  test("line without comma yields an empty value", () => {
    const { terms } = parseTerms("APIKey");
    expect(terms[0].key).toBe("APIKey");
    expect(terms[0].value).toBe("");
  });

  test("handles empty input", () => {
    const empty = {
      terms: [],
      invalid: [],
      originalOrder: [],
      diagnostics: [],
      metaWarnings: [],
      hasErrors: false,
      diagnosticsMode: "full",
    };
    expect(parseTerms("")).toEqual(empty);
    expect(parseTerms(null)).toEqual(empty);
    expect(parseTerms(undefined)).toEqual(empty);
  });

  test("treats whitespace-only and non-string input as empty", () => {
    const empty = {
      terms: [],
      invalid: [],
      originalOrder: [],
      diagnostics: [],
      metaWarnings: [],
      hasErrors: false,
      diagnosticsMode: "full",
    };
    expect(parseTerms("   ")).toEqual(empty);
    expect(parseTerms(123)).toEqual(empty);
  });

  test("reports an empty source term for a comma at the start of a segment", () => {
    const { terms, invalid, diagnostics, hasErrors } = parseTerms(",;API,接口");
    expect(terms.map((t) => t.key)).toEqual(["API"]);
    expect(invalid).toEqual([]);
    // 「,」段：逗号前没有源术语 → 致命诊断
    expect(hasErrors).toBe(true);
    const emptySource = diagnostics.find((d) => d.type === "empty-source-term");
    expect(emptySource).toBeDefined();
    expect(emptySource.segmentIndex).toBe(1);
    expect(emptySource.segment).toBe(",");
  });
});

describe("terms buildTermsRegex", () => {
  test("builds a global regex from sorted parsed terms", () => {
    const { terms } = parseTerms("API,接口;APIKey,应用编程接口");
    const regex = buildTermsRegex(terms);
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.flags).toContain("g");
    expect(regex.source).toBe("(APIKey)|(API)");
  });

  test("returns null when there are no valid terms", () => {
    expect(buildTermsRegex([])).toBeNull();
    expect(buildTermsRegex(parseTerms("").terms)).toBeNull();
    expect(buildTermsRegex(parseTerms("bad[re").terms)).toBeNull();
    expect(buildTermsRegex(null)).toBeNull();
  });

  test("accepts the parseTerms result object as well", () => {
    const regex = buildTermsRegex(parseTerms("API,接口"));
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.source).toBe("(API)");
  });
});

describe("terms applyTermReplace", () => {
  const replacer = (term, fullMatch) => term.value || fullMatch;

  test("replaces matches and records spans", () => {
    const { terms } = parseTerms("API,接口;APIKey,应用编程接口");
    const { output, spans } = applyTermReplace(
      "APIKey and API",
      terms,
      replacer
    );
    expect(output).toBe("应用编程接口 and 接口");
    expect(spans).toEqual([
      {
        start: 0,
        end: 6,
        termKey: "APIKey",
        value: "应用编程接口",
        replacement: "应用编程接口",
      },
      {
        start: 11,
        end: 14,
        termKey: "API",
        value: "接口",
        replacement: "接口",
      },
    ]);
  });

  test("冲突矩阵 1：长短词均有译文时，长词整体替换、短词单独替换", () => {
    const { terms } = parseTerms("API,接口;APIKey,应用编程接口");
    const { output } = applyTermReplace("APIKey and API", terms, replacer);
    expect(output).toBe("应用编程接口 and 接口");
  });

  test("冲突矩阵 2：短词有译文、长词无译文时，长词保持原文不被切割", () => {
    const { terms } = parseTerms("API,接口;APIKey");
    const { output, spans } = applyTermReplace(
      "APIKey and API",
      terms,
      replacer
    );
    expect(output).toBe("APIKey and 接口");
    expect(spans.map((s) => s.termKey)).toEqual(["APIKey", "API"]);
    expect(output).not.toContain("接口Key");
  });

  test("冲突矩阵 3：短词无译文、长词有译文时，长词必须触发", () => {
    const { terms } = parseTerms("GPT;GPTs,智能体集合");
    const { output, spans } = applyTermReplace("GPTs and GPT", terms, replacer);
    expect(output).toBe("智能体集合 and GPT");
    expect(spans.map((s) => s.termKey)).toEqual(["GPTs", "GPT"]);
  });

  test("冲突矩阵 4：长短词均无译文时，长词整体保持原文、无切割残留", () => {
    const { terms } = parseTerms("React;ReactNative");
    const { output, spans } = applyTermReplace("ReactNative", terms, replacer);
    expect(output).toBe("ReactNative");
    expect(spans).toHaveLength(1);
    expect(spans[0].termKey).toBe("ReactNative");
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(11);
  });

  test("keeps original text when the term has no translation (空译文语义)", () => {
    const { terms } = parseTerms("APIKey");
    const { output } = applyTermReplace("APIKey", terms, replacer);
    expect(output).toBe("APIKey");
  });

  test("CJK keys match inside CJK strings (no word boundary)", () => {
    const { terms } = parseTerms("手机,phone");
    const { output } = applyTermReplace("新手机壳", terms, replacer);
    expect(output).toBe("新phone壳");
  });

  test("keys match inside longer ASCII words (上游无单词边界)", () => {
    const { terms } = parseTerms("API,接口");
    const { output, spans } = applyTermReplace("myAPIkey", terms, replacer);
    expect(output).toBe("my接口key");
    expect(spans).toHaveLength(1);
    expect(spans[0].termKey).toBe("API");
    expect(spans[0].start).toBe(2);
    expect(spans[0].end).toBe(5);
  });

  test("regex terms work by regex semantics", () => {
    const { terms } = parseTerms("API\\.\\d+,接口版本");
    const { output } = applyTermReplace("version API.42 ok", terms, replacer);
    expect(output).toBe("version 接口版本 ok");
  });

  test("resets lastIndex so the built regex stays reusable", () => {
    const { terms } = parseTerms("API,接口");
    applyTermReplace("API API", terms, replacer);
    const { output } = applyTermReplace("API", terms, replacer);
    expect(output).toBe("接口");
  });

  test("reuses a passed-in combined regex and resets its lastIndex", () => {
    const { terms } = parseTerms("API,接口;APIKey,应用编程接口");
    const regex = buildTermsRegex(terms);
    const first = applyTermReplace("API API", terms, replacer, regex);
    expect(first.output).toBe("接口 接口");
    expect(regex.lastIndex).toBe(0); // 函数返回后已重置
    const second = applyTermReplace("APIKey", terms, replacer, regex);
    expect(second.output).toBe("应用编程接口");
    expect(regex.lastIndex).toBe(0);
  });

  test("treats non-string text input as empty", () => {
    const { terms } = parseTerms("API,接口");
    expect(applyTermReplace(undefined, terms, replacer)).toEqual({
      output: "",
      spans: [],
    });
    expect(applyTermReplace(null, terms, replacer)).toEqual({
      output: "",
      spans: [],
    });
    expect(applyTermReplace(123, terms, replacer)).toEqual({
      output: "",
      spans: [],
    });
  });

  test("passes the term entry and full match to the replacer", () => {
    const { terms } = parseTerms("API,接口");
    const seen = [];
    applyTermReplace("API", terms, (term, fullMatch) => {
      seen.push({ key: term.key, value: term.value, fullMatch });
      return "X";
    });
    expect(seen).toEqual([{ key: "API", value: "接口", fullMatch: "API" }]);
  });

  test("returns text unchanged when there are no valid terms", () => {
    expect(applyTermReplace("API", [], replacer)).toEqual({
      output: "API",
      spans: [],
    });
    expect(
      applyTermReplace("API", parseTerms("bad[re").terms, replacer)
    ).toEqual({ output: "API", spans: [] });
  });
});

describe("terms applyNaiveReplace", () => {
  test("reproduces the old engine: input order, no boundaries, prefix-cut", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    // 原始顺序：API 在前，APIKey 在后 → alternation `(API)|(APIKey)` → API 抢占
    const naive = applyNaiveReplace("APIKey and API", parsed);
    expect(naive.output).toBe("接口Key and 接口");
    expect(naive.spans.map((s) => s.termKey)).toEqual(["API", "API"]);
    // 与修复后行为对比
    expect(
      applyTermReplace("APIKey and API", parsed.terms, (t, m) => t.value || m)
        .output
    ).toBe("应用编程接口 and 接口");
  });

  test("reproduces the prefix-cut bug for conflict case 2", () => {
    const parsed = parseTerms("API,接口;APIKey");
    expect(applyNaiveReplace("APIKey", parsed).output).toBe("接口Key");
    expect(
      applyTermReplace("APIKey", parsed.terms, (t, m) => t.value || m).output
    ).toBe("APIKey");
  });

  test("uses originalOrder metadata over sorted array order", () => {
    // 输入顺序：长词在前 → 无前缀切割
    const parsed = parseTerms("APIKey,应用编程接口;API,接口");
    expect(parsed.originalOrder.map((t) => t.key)).toEqual(["APIKey", "API"]);
    // 原始顺序：APIKey 先 → (APIKey)|(API) → APIKey 整体命中
    expect(applyNaiveReplace("APIKey", parsed).output).toBe("应用编程接口");
    // 若退化为数组（已排序短在前），效果相同（排序后 APIKey 仍在 API 前）
    expect(applyNaiveReplace("APIKey", parsed.terms).output).toBe(
      "应用编程接口"
    );
  });

  test("treats non-string text input as empty and returns spans shape", () => {
    expect(applyNaiveReplace(undefined, parseTerms("API,接口"))).toEqual({
      output: "",
      spans: [],
    });
    expect(applyNaiveReplace(null, parseTerms("API,接口"))).toEqual({
      output: "",
      spans: [],
    });
    expect(applyNaiveReplace(123, parseTerms("API,接口"))).toEqual({
      output: "",
      spans: [],
    });
  });
});

describe("terms applyTermReplace with capture groups in keys (分支映射)", () => {
  const replacer = (t, m) => t.value || m;

  test("嵌套捕获组 key 不破坏分支映射（后置术语仍能命中）", () => {
    const { terms } = parseTerms("(Foo|Bar),替换;Baz,巴兹");
    const { output, spans } = applyTermReplace("Baz and Foo", terms, replacer);
    expect(output).toBe("巴兹 and 替换");
    expect(spans.map((s) => s.termKey)).toEqual(["Baz", "(Foo|Bar)"]);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(3);
    expect(spans[1].start).toBe(8);
    expect(spans[1].end).toBe(11);
  });

  test("命名捕获组 key 不破坏分支映射与 span 偏移量", () => {
    const { terms } = parseTerms("(?<code>API)\\d+,带编号接口;API,接口");
    const { output, spans } = applyTermReplace(
      "API42 and API",
      terms,
      replacer
    );
    expect(output).toBe("带编号接口 and 接口");
    expect(spans.map((s) => s.termKey)).toEqual(["(?<code>API)\\d+", "API"]);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(5);
    expect(spans[1].start).toBe(10);
    expect(spans[1].end).toBe(13);
  });

  test("applyNaiveReplace 对命名捕获组 key 同样不崩溃且返回 spans", () => {
    const parsed = parseTerms("(?<code>API)\\d+,带编号接口;API,接口");
    const naive = applyNaiveReplace("API42 and API", parsed);
    expect(naive.output).toBe("带编号接口 and 接口");
    expect(naive.spans).toHaveLength(2);
    expect(naive.spans[1].termKey).toBe("API");
    expect(naive.spans[1].start).toBe(10);
  });
});

// ─── Task 14：点号字面量与正则语义 ──────────────────────────────────────────
// 术语 key 默认按正则源码处理（与既有规则语义一致，不改为字面量以免破坏已有正则规则）。
// 点号术语（如 Dr.whob）与其他 key 一样一律按 (key) 语义匹配（无单词边界）；
// 未转义的点号按正则通配符工作，界面需给出转义警告。
describe("terms 点号字面量与正则语义（Task 14）", () => {
  test("Dr.whob 按正则语义解析（isWord 仅诊断元数据）", () => {
    const parsed = parseTerms("Dr.whob,神经病");
    const entry = parsed.terms[0];
    expect(entry.isWord).toBe(false);
    expect(entry.pattern).toBe("(Dr.whob)");
    expect(entry.pattern).not.toMatch(/^\\b/);
    // 点号未转义 → 产生元字符警告（非致命）
    expect(parsed.hasErrors).toBe(false);
    expect(parsed.metaWarnings).toHaveLength(1);
    expect(parsed.metaWarnings[0].key).toBe("Dr.whob");
    expect(parsed.metaWarnings[0].metas).toContain(".");
  });

  test("Dr\\.whob 字面点号不产生元字符警告", () => {
    const parsed = parseTerms("Dr\\.whob,神经病");
    expect(parsed.terms[0].pattern).toBe("(Dr\\.whob)");
    expect(parsed.terms[0].isWord).toBe(false);
    expect(parsed.metaWarnings).toEqual([]);
  });

  test("foo.bar（未转义点号）按通配符匹配 fooXbar", () => {
    const { terms } = parseTerms("foo.bar,甲");
    const { output, spans } = applyTermReplace(
      "fooXbar",
      terms,
      (t, m) => t.value || m
    );
    expect(output).toBe("甲");
    expect(spans).toHaveLength(1);
    expect(spans[0].termKey).toBe("foo.bar");
  });

  test("foo\\.bar（转义点号）不匹配 fooXbar", () => {
    const { terms } = parseTerms("foo\\.bar,甲");
    const { output } = applyTermReplace(
      "fooXbar",
      terms,
      (t, m) => t.value || m
    );
    expect(output).toBe("fooXbar");
    // 字面点号文本仍能精确命中
    const literal = applyTermReplace("foo.bar", terms, (t, m) => t.value || m);
    expect(literal.output).toBe("甲");
  });

  test("API\\.\\d+ 按正则语义工作", () => {
    const { terms } = parseTerms("API\\.\\d+,接口版本");
    const { output } = applyTermReplace(
      "version API.42 ok",
      terms,
      (t, m) => t.value || m
    );
    expect(output).toBe("version 接口版本 ok");
  });

  test("含点号术语的索引与译文映射不错位（Dr.whob 在自然句中整体命中）", () => {
    const parsed = parseTerms("Dr.whob,神经病");
    const { output, spans } = applyTermReplace(
      "The Dr.whob feature will ship in the next release.",
      parsed.terms,
      (t, m) => t.value || m
    );
    expect(output).toContain("神经病");
    expect(spans).toHaveLength(1);
    expect(spans[0].termKey).toBe("Dr.whob");
    expect(spans[0].value).toBe("神经病");
    expect(spans[0].replacement).toBe("神经病");
    expect(output).not.toContain("Dr.whob");
  });

  test("findUnescapedRegexMeta 仅收集未转义元字符", () => {
    expect(findUnescapedRegexMeta("Dr.whob")).toEqual(["."]);
    expect(findUnescapedRegexMeta("Dr\\.whob")).toEqual([]);
    expect(findUnescapedRegexMeta("API\\.\\d+")).toEqual(["+"]);
    expect(findUnescapedRegexMeta("API")).toEqual([]);
    expect(findUnescapedRegexMeta(null)).toEqual([]);
  });
});

// ─── P1：分支识别上下文丢失导致的正文丢失 ────────────────────────────────────
// 术语 key 可含 lookbehind/lookahead（依赖匹配位置之前的上下文），且第一个术语的
// 嵌套捕获组会把组合正则的捕获槽位往后推。旧实现先对孤立 fullMatch 单独执行用户正则
// （丢上下文），再按捕获组下标兜底（槽位偏移），两者叠加返回 -1，只推进 cursor 不写回
// 正文，最终整个文本被吞掉。修复必须：
//   1. 分支身份不依赖"对孤立 fullMatch 重新执行用户正则"，也不依赖用户捕获组数量；
//   2. 无法映射时保留原文区间，绝不吞正文。
describe("terms P1 分支识别修复（lookbehind / 嵌套捕获组 / 零宽边界）", () => {
  const replacer = (t, m) => t.value || m;

  test("P1 最小复现：嵌套捕获组 + lookbehind 术语在原文上下文命中后不再吞文本", () => {
    // 真实生产链路：parseTerms -> buildTermsRegex -> applyTermReplace
    const parsed = parseTerms("((ABCDEFG)),long;(?<=x)y,look");
    const regex = buildTermsRegex(parsed);
    expect(regex).toBeInstanceOf(RegExp);

    // 组合正则在原始正文 "xy" 中命中 "y"（lookbehind 上下文在前置 x）。
    const mainMatch = regex.exec("xy");
    expect(mainMatch[0]).toBe("y");
    expect(mainMatch.index).toBe(1);
    // 但独立的 (?<=x)y 在孤立的 "y" 上无法反查（丢前置 x）——旧 resolveTermIndex 返回 -1。
    const isolated = new RegExp("(?<=x)y").exec("y");
    expect(isolated).toBeNull();

    const { output, spans } = applyTermReplace("xy", parsed, replacer, regex);
    expect(output).toBe("xlook");
    expect(spans).toEqual([
      {
        start: 1,
        end: 2,
        termKey: "(?<=x)y",
        value: "look",
        replacement: "look",
      },
    ]);
  });

  test("P1 兜底守卫：无法映射分支身份时必须保留区间，绝不吞正文", () => {
    // 用与 parsed terms 不一致的手工正则（组合正则里多出一个用户分支），
    // 该分支在 termList 中不存在——映射必然失败，必须走原文保留兜底。
    const parsed = parseTerms("API,接口;Baz,巴兹");
    const regex = new RegExp("(API)|(Baz)|(ghost)", "g");
    const { output, spans } = applyTermReplace("API Baz", parsed, replacer, regex);
    // 能映射的 API/Baz 正常替换；ghost 不会命中文本；不得丢任何字符。
    expect(output).toBe("接口 巴兹");
    expect(spans.map((s) => s.termKey)).toEqual(["API", "Baz"]);
  });

  test("捕获组回归矩阵：普通嵌套、命名、非捕获、lookahead/lookbehind、多个命名组共存", () => {
    // 普通嵌套捕获组（既有回归）。
    expect(
      applyTermReplace("Baz and Foo", parseTerms("(Foo|Bar),替换;Baz,巴兹").terms, replacer).output
    ).toBe("巴兹 and 替换");

    // 命名捕获组（既有回归）。
    expect(
      applyTermReplace(
        "API42 and API",
        parseTerms("(?<code>API)\\d+,带编号接口;API,接口").terms,
        replacer
      ).output
    ).toBe("带编号接口 and 接口");

    // 非捕获组 + lookbehind 组合：非捕获组不占槽位，前后术语都不错位。
    const noncap = parseTerms("(?:Foo)bar,组合;Api,甲;(?<=x)y,乙");
    const noncapOut = applyTermReplace("xy and Foobar and Api", noncap, replacer);
    expect(noncapOut.output).toBe("x乙 and 组合 and 甲");

    // lookahead 术语与其后置术语：lookahead 不消费字符，槽位照常映射。
    const lookahead = parseTerms("Foo(?=Bar),先;Baz,后");
    const lookaheadOut = applyTermReplace("FooBar Baz", lookahead, replacer);
    expect(lookaheadOut.output).toBe("先Bar 后");

    // 多个用户命名组 + 普通组混合：所有分支都保持正确映射。
    const multiNamed = parseTerms(
      "(?<a>X)(?<b>Y)\\d+,xy编号;(?<c>Q)R,qr"
    );
    const multiNamedOut = applyTermReplace("XY42 and QR", multiNamed, replacer);
    expect(multiNamedOut.output).toBe("xy编号 and qr");

    // 消费型上下文环视：lookbehind 命中消费真实字符 y，命名组消费 n——
    // 二者均非纯零宽模式。纯/混合零宽的防护由下方「零宽防护与 flags 继承」用例组覆盖。
    const boundary = parseTerms("(?<=x)y,已选;(?<n>n),字母n");
    const boundaryOut = applyTermReplace("xy n", boundary, replacer);
    expect(boundaryOut.output).toBe("x已选 字母n");
  });

  test("P1 修复作用于 applyNaiveReplace 同一条扫描链路", () => {
    const parsed = parseTerms("((ABCDEFG)),long;(?<=x)y,look");
    const naive = applyNaiveReplace("xy", parsed);
    expect(naive.output).toBe("xlook");
    expect(naive.spans).toHaveLength(1);
    expect(naive.spans[0].termKey).toBe("(?<=x)y");
  });
});

// ─── 零宽防护与 flags 继承（统一计划 20260829 Task 2）────────────────────────
// 纯零宽模式（整个 pattern 无任何可消费原子，如 (?=x)、(?<=x)、\b）在非空文本上
// 也能零宽命中并逐位置注入译文（"xx" → "YxYx"）。防护分两层：
//   静态层：isZeroWidthOnlyPattern 在 parseTerms 中判定，产出致命诊断
//           zero-width-matching-pattern（置于既有 empty-matching 门闸之后，
//           a*/x?/^ 等空匹配模式仍归 empty-matching，不重复归类）；
//   运行时层：混合臂（如 a|(?=x)）合法保留，scanWithTerms 对零宽命中跳过
//           replacer 与 span，仅手动前进，杜绝 start===end 的 span。
// flags 继承（F6）：phaseRegex 必须继承外部组合正则的全部 flags（i/m/s），
//   否则大小写不敏感等场景下分支反查失败，术语被兜底路径静默放弃。
describe("terms 零宽防护与 flags 继承（统一计划 20260829 Task 2）", () => {
  const replacer = (t, m) => t.value || m;

  test("混合臂运行时零宽守卫：a|(?=x) 消费臂照常替换，零宽臂不产 span 不调 replacer", () => {
    const parsed = parseTerms("a|(?=x),Y");
    let replacerCalls = 0;
    const countingReplacer = (t, m) => {
      replacerCalls += 1;
      return t.value || m;
    };
    const out = applyTermReplace("ax", parsed.terms, countingReplacer);
    expect(out.output).toBe("Yx");
    expect(out.spans).toHaveLength(1);
    expect(out.spans[0]).toMatchObject({
      start: 0,
      end: 1,
      termKey: "a|(?=x)",
    });
    expect(replacerCalls).toBe(1);
  });

  test("混合臂 (?=x)|b：零宽臂跳过后消费臂仍命中", () => {
    const out = applyTermReplace("xb", parseTerms("(?=x)|b,Y").terms, replacer);
    expect(out.output).toBe("xY");
    expect(out.spans).toHaveLength(1);
    expect(out.spans[0].start).toBe(1);
  });

  test("零宽守卫作用于 applyNaiveReplace 同一条扫描链路", () => {
    // 纯零宽术语在静态层即被排除，naive 无术语可用，输出原样。
    const pure = parseTerms("(?=x),Y");
    expect(pure.terms).toHaveLength(0);
    const pureOut = applyNaiveReplace("xx", pure);
    expect(pureOut.output).toBe("xx");
    expect(pureOut.spans).toHaveLength(0);

    // 混合臂：naive 下零宽臂同样不产 span。
    const mixed = parseTerms("a|(?=x),Y");
    const mixedOut = applyNaiveReplace("ax", mixed);
    expect(mixedOut.output).toBe("Yx");
    expect(mixedOut.spans).toHaveLength(1);
  });

  test("静态矩阵：纯零宽模式 fatal 且不进 terms，合法术语仍保留", () => {
    for (const key of ["(?=x)", "(?<=x)", "\\b"]) {
      const parsed = parseTerms(`${key},Y;API,接口`);
      expect(parsed.hasErrors).toBe(true);
      const d = parsed.diagnostics.find(
        (diag) => diag.type === "zero-width-matching-pattern"
      );
      expect(d).toBeDefined();
      expect(d.key).toBe(key);
      expect(parsed.terms.map((t) => t.key)).toEqual(["API"]);
    }
  });

  test("负向环视与 \\B 在空串上匹配空串，先被既有 empty-matching 门闸拦截", () => {
    // 计划预测修订（Task 1 取证实测）：(?<!y)/(?!x)/\B 的 test("") 为 true，
    // 先被既有 empty-matching 门闸拒绝（类型为 empty-matching-pattern 而非新
    // 类型），零宽防护目标一致。
    for (const key of ["(?<!y)", "(?!x)", "\\B"]) {
      const parsed = parseTerms(`${key},Y`);
      expect(parsed.hasErrors).toBe(true);
      expect(parsed.terms).toHaveLength(0);
    }
  });

  test("静态矩阵不误报：消费型 lookaround 与混合臂合法保留", () => {
    for (const key of ["(?<=x)y", "a(?=x)", "x\\b", "a|(?=x)"]) {
      const parsed = parseTerms(`${key},Y`);
      expect(parsed.hasErrors).toBe(false);
      expect(parsed.terms).toHaveLength(1);
      expect(parsed.terms[0].key).toBe(key);
    }
  });

  test("静态矩阵不误报：字符类为可消费原子，纯类术语不得判零宽（P1 回归锁定）", () => {
    // isZeroWidthOnlyPattern 的 [ 分支越过 ] 后必须判定可消费；
    // [A-Z][a-z]+ / [0-9]+ / [^abc] 是术语库常规写法，误判 fatal 会被生产路径静默丢弃。
    for (const key of [
      "[A-Z][a-z]+",
      "[0-9]+",
      "[^abc]",
      "[a-z]",
      "[abc]+",
      "\\b[0-9]+\\b",
      "(?<=[a-z])x",
    ]) {
      const parsed = parseTerms(`${key},Y`);
      expect(parsed.hasErrors).toBe(false);
      expect(parsed.terms).toHaveLength(1);
      expect(parsed.terms[0].key).toBe(key);
    }
  });

  test("字符类术语真实应用闭环：[A-Z][a-z]+ 命中专名并完成替换（防平凡通过）", () => {
    const parsed = parseTerms("[A-Z][a-z]+,人名");
    expect(parsed.terms).toHaveLength(1);
    const out = applyTermReplace("John met Mary", parsed.terms, replacer);
    expect(out.output).toBe("人名 met 人名");
    expect(out.spans).toHaveLength(2);
    expect(out.spans[0]).toMatchObject({ start: 0, end: 4, termKey: "[A-Z][a-z]+" });
  });

  test("静态矩阵不重复归类：a*/x?/^ 仍由 empty-matching 门闸负责", () => {
    for (const key of ["a*", "x?", "^"]) {
      const parsed = parseTerms(`${key},Y`);
      expect(parsed.hasErrors).toBe(true);
      expect(
        parsed.diagnostics.some((d) => d.type === "empty-matching-pattern")
      ).toBe(true);
      expect(
        parsed.diagnostics.some(
          (d) => d.type === "zero-width-matching-pattern"
        )
      ).toBe(false);
    }
  });

  test("flags 继承（F6）：外部 /gi 组合正则下 phaseRegex 不丢 i，术语照常替换", () => {
    const parsed = parseTerms("abc,译");
    // 外部组合正则必须与 buildTermsRegex 同 source（分支基座包裹由 pattern 提供，
    // 槽位反查契约），此处仅附加 i 标志模拟调用方扩展 flags 的场景。
    const external = new RegExp(buildTermsRegex(parsed).source, "gi");
    const out = applyTermReplace("xABCx", parsed.terms, replacer, external);
    expect(out.output).toBe("x译x");
    expect(out.spans).toHaveLength(1);
    expect(out.spans[0]).toMatchObject({
      start: 1,
      end: 4,
      termKey: "abc",
      value: "译",
    });
  });
});

// ─── matcher 缓存与 naive 缓存（统一计划 20260829 Task 3）────────────────────
// 生产 Translator 对每个文本节点调用一次 applyTermReplace；逐节点重建分支槽位表
// （每术语 1 次 new RegExp 探针）与 phaseRegex 是页面级卡顿根因。matcher 把
// 组合正则、phaseRegex、槽位表一次物化，热路径零编译。naive 引擎同链路，
// 按 originalOrder 引用做 WeakMap 记忆化。
// 计数手段：临时把 global.RegExp 替换为计数子类（finally 还原），断言增量编译数。
describe("terms matcher 缓存与 naive 缓存（统一计划 20260829 Task 3）", () => {
  const replacer = (t, m) => t.value || m;

  /** 临时替换 global.RegExp 为计数子类；返回还原函数，调用后取回计数。 */
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

  test("matcher 快路径：物化后连续两次 applyTermReplace 增量编译均为 0", () => {
    const parsed = parseTerms(
      "API,接口;APIKey,应用编程接口;GPTs,智能体集合"
    );
    const matcher = buildTermsMatcher(parsed);
    expect(matcher).not.toBeNull();
    const text = "The APIKey and GPTs and API here";

    const restore1 = installCountingRegExp();
    try {
      applyTermReplace(text, parsed.terms, replacer, matcher);
    } finally {
      expect(restore1()).toBe(0);
    }
    const restore2 = installCountingRegExp();
    try {
      const out = applyTermReplace(text, parsed.terms, replacer, matcher);
      expect(out.output).toBe("The 应用编程接口 and 智能体集合 and 接口 here");
    } finally {
      expect(restore2()).toBe(0);
    }
  });

  test("matcher 物化形状：regex/phaseRegex/槽位表/flags 齐备且与 buildTermsRegex 同 source", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const matcher = buildTermsMatcher(parsed);
    expect(matcher.regex).toBeInstanceOf(RegExp);
    expect(matcher.regex.global).toBe(true);
    expect(matcher.regex.source).toBe(buildTermsRegex(parsed).source);
    expect(matcher.phaseRegex).toBeInstanceOf(RegExp);
    expect(matcher.phaseRegex.flags).toBe(matcher.regex.flags);
    expect(matcher.termList).toBe(parsed.terms);
    expect(matcher.mappingAligned).toBe(true);
    expect(matcher.branchBaseGroups).toEqual([1, 2]);
    expect(matcher.branchTermIndex).toEqual([0, 1]);
  });

  test("空术语与全非法输入下 buildTermsMatcher 返回 null", () => {
    expect(buildTermsMatcher(parseTerms(""))).toBeNull();
    expect(buildTermsMatcher(parseTerms("a*,x"))).toBeNull();
    expect(buildTermsMatcher([])).toBeNull();
    expect(buildTermsMatcher(null)).toBeNull();
  });

  test("A/B matcher 交错扫描与单用结果一致（lastIndex 与 phase 状态互不污染）", () => {
    const parsedA = parseTerms("API,接口;APIKey,应用编程接口");
    const parsedB = parseTerms("GPT;GPTs,智能体集合");
    const matcherA = buildTermsMatcher(parsedA);
    const matcherB = buildTermsMatcher(parsedB);
    const textA = "Use APIKey and API today";
    const textB = "GPTs and GPT differ";
    const textB2 = "GPTs and GPT differ";

    const soloA = applyTermReplace(textA, parsedA.terms, replacer, matcherA).output;
    const soloB = applyTermReplace(textB, parsedB.terms, replacer, matcherB).output;
    const soloB2 = applyNaiveReplace(textB2, parsedB).output;

    // 交错：A → B → A → naive(B)，各自结果必须与单用完全一致
    const i1 = applyTermReplace(textA, parsedA.terms, replacer, matcherA).output;
    const i2 = applyTermReplace(textB, parsedB.terms, replacer, matcherB).output;
    const i3 = applyTermReplace(textA, parsedA.terms, replacer, matcherA).output;
    const i4 = applyNaiveReplace(textB2, parsedB).output;
    expect(i1).toBe(soloA);
    expect(i2).toBe(soloB);
    expect(i3).toBe(soloA);
    expect(i4).toBe(soloB2);
  });

  test("matcher 与传入 terms 不一致时丢弃 matcher 重建，输出仍正确", () => {
    const parsedA = parseTerms("API,接口");
    const parsedB = parseTerms("GPTs,智能体集合");
    const matcherA = buildTermsMatcher(parsedA);
    // 用 A 的 matcher 配 B 的 terms：身份校验不通过，必须丢弃 matcher 按 B 重建，
    // 保证任意契约破坏下输出仍正确（自愈）。
    const out = applyTermReplace("Talk to GPTs", parsedB.terms, replacer, matcherA);
    expect(out.output).toBe("Talk to 智能体集合");
    expect(out.spans).toHaveLength(1);
  });

  test("naive 缓存：同 parsed 第二次 applyNaiveReplace 增量编译 0", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    const text = "APIKey and API";
    applyNaiveReplace(text, parsed); // 预热并写入 WeakMap 缓存

    const restore = installCountingRegExp();
    let delta;
    try {
      const out = applyNaiveReplace(text, parsed);
      // naive 引擎按 originalOrder（API 在前）复现旧引擎前缀切割：接口Key
      expect(out.output).toBe("接口Key and 接口");
    } finally {
      delta = restore();
    }
    expect(delta).toBe(0);
  });

  test("2000 字面量术语 × 单文本：matcher 路径零编译，慢路径不异常", () => {
    const keys = [];
    for (let i = 0; i < 2000; i++) keys.push(`TermNo${i}x,词${i}`);
    const parsed = parseTerms(keys.join(";"));
    const matcher = buildTermsMatcher(parsed);
    const text = "plain text without any term here";

    const restore = installCountingRegExp();
    let delta;
    try {
      const out = applyTermReplace(text, parsed.terms, replacer, matcher);
      expect(out.output).toBe(text);
      expect(out.spans).toHaveLength(0);
    } finally {
      delta = restore();
    }
    expect(delta).toBe(0);
  });

  test("多术语 × 多文本节点无命中：matcher 快路径零编译、输出恒等（审查者第二轮显式回归锁定）", () => {
    const keys = [];
    for (let i = 0; i < 100; i++) keys.push(`TermNo${i}x,词${i}`);
    const parsed = parseTerms(keys.join(";"));
    const matcher = buildTermsMatcher(parsed);
    expect(matcher).not.toBeNull();

    const restore = installCountingRegExp();
    let delta;
    try {
      for (let j = 0; j < 50; j++) {
        const text = `plain text node ${j} without any matching term`;
        const out = applyTermReplace(text, parsed.terms, replacer, matcher);
        expect(out.output).toBe(text);
        expect(out.spans).toHaveLength(0);
      }
    } finally {
      delta = restore();
    }
    expect(delta).toBe(0);
  });
});

// ─── Task 2：fast/full 解析契约与生产热路径性能解耦 ──────────────────────────
// parseTerms 默认（full）保留跨术语 conflicting-pattern 两两分析，用于 Playground / CLI
// 诊断；生产 Translator 用 fast 模式省略该 O(n²) 分析。两种模式必须共享同一套基础解析
// 结果，仅 full 额外产生 conflicting-pattern 及派生诊断状态。
describe("terms fast/full 解析契约（Task 2）", () => {
  test("fast 模式产出 diagnosticsMode=fast，且不含 conflicting-pattern 完整分析", () => {
    const input = "Dr\\.who;Dr.who,神经病患者";
    const full = parseTerms(input); // 默认 full
    expect(full.diagnosticsMode).toBe("full");
    expect(full.hasErrors).toBe(true);
    expect(
      full.diagnostics.some((d) => d.type === "conflicting-pattern")
    ).toBe(true);

    const fast = parseTerms(input, { fullDiagnostics: false });
    expect(fast.diagnosticsMode).toBe("fast");
    // fast 跳过跨术语重叠分析：同一输入不产生 conflicting-pattern（不等于通过完整校验）。
    expect(
      fast.diagnostics.some((d) => d.type === "conflicting-pattern")
    ).toBe(false);
  });

  test("同一输入 fast/full 除 conflicting-pattern 外基础契约完全一致", () => {
    const inputs = [
      "API,接口;APIKey,应用编程接口",
      "Dr\\.who;Dr.who,神经病患者;API,接口",
      "a*,x;([,坏规则;Dr.who,;API,接口;API,接口;手机,phone",
      "",
    ];
    for (const input of inputs) {
      const fast = parseTerms(input, { fullDiagnostics: false });
      const full = parseTerms(input, { fullDiagnostics: true });
      // 基础解析结果必须一致：terms（排序）、invalid、originalOrder、metaWarnings。
      expect(fast.terms).toEqual(full.terms);
      expect(fast.invalid).toEqual(full.invalid);
      expect(fast.originalOrder).toEqual(full.originalOrder);
      expect(fast.metaWarnings).toEqual(full.metaWarnings);
      // 基础诊断一致；full 可能比 fast 多出 conflicting-pattern（及其派生的 hasErrors=true）。
      const fastBase = fast.diagnostics.filter(
        (d) => d.type !== "conflicting-pattern"
      );
      const fullBase = full.diagnostics.filter(
        (d) => d.type !== "conflicting-pattern"
      );
      expect(fullBase).toEqual(fastBase);
      for (const d of fast.diagnostics) {
        expect(d.type).not.toBe("conflicting-pattern");
      }
      // conflicting-pattern 在 full 模式继续是致命诊断；fast 省略它不代表少报故障。
      if (fast.hasErrors) expect(full.hasErrors).toBe(true);
      if (full.hasErrors && !fast.hasErrors) {
        expect(
          full.diagnostics.some((d) => d.type === "conflicting-pattern")
        ).toBe(true);
      }
    }
  });

  test("fast 模式不调用 O(n²) 跨术语冲突分析（结构证据 + 宽松耗时对比）", () => {
    const N = 300;
    const keys = [];
    for (let i = 0; i < N; i++) keys.push(`A\\d\\dK${i}`);
    // 锚点字面量与 A\ d\dK0 类正则互相完整命中 → full 模式必然产生大量 conflicting-pattern。
    const input = [...keys, "A09K0,锚点"].join(";");

    const fastStart = Date.now();
    const fast = parseTerms(input, { fullDiagnostics: false });
    const fastElapsed = Date.now() - fastStart;

    const fullStart = Date.now();
    const full = parseTerms(input, { fullDiagnostics: true });
    const fullElapsed = Date.now() - fullStart;

    // 结构断言是主证据：fast 结果中不存在任何 overlapping 诊断，full 存在。
    expect(
      fast.diagnostics.some((d) => d.type === "conflicting-pattern")
    ).toBe(false);
    expect(
      full.diagnostics.some((d) => d.type === "conflicting-pattern")
    ).toBe(true);
    // 术语列表一致，证明 fast 只是跳过诊断分析、不是丢了合法条目。
    expect(fast.terms).toEqual(full.terms);
    // 宽松耗时对比，不锁窄毫秒阈值（CI 抖动免疫）。
    expect(fastElapsed).toBeLessThan(Math.max(100, fullElapsed));
  });
});

// ─── Task 10：严格非法输入诊断 ──────────────────────────────────────────────
// 解析结果区分：有效映射 / 有效保留规则 / 空源术语 / 空译文(多余逗号) /
// 重复映射 / 冲突映射（同源不同译文）/ 冲突映射（正则重叠）。
// 只要存在致命非法段，hasErrors=true，消费方不得生成"替换测试成功"摘要。
describe("terms 严格非法输入诊断（Task 10）", () => {
  test("固定输入 1：Dr.who, 尾巴逗号按保留原文处理（非致命提醒）", () => {
    const parsed = parseTerms("Dr.who,");
    expect(parsed.hasErrors).toBe(false);
    const extra = parsed.diagnostics.find((d) => d.type === "extra-comma");
    expect(extra).toBeDefined();
    // 对提醒给出段号与原始内容
    expect(extra.segmentIndex).toBe(1);
    expect(extra.segment).toBe("Dr.who,");
    // UI 不再直出 message（i18n 归属 UI）；格式化函数为 CLI/测试提供可读文本
    expect(extra.message).toBeUndefined();
    const formatted = formatDiagnosticMessage(extra);
    expect(formatted).toContain("第 1 段");
    expect(formatted).toContain("Dr.who,");
    // 产生一个保留原文的可执行术语（value 为空）
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0].key).toBe("Dr.who");
    expect(parsed.terms[0].value).toBe("");
  });

  test("尾巴逗号 API, 应用为保留原文 + <i> 高亮，hasErrors=false", () => {
    const parsed = parseTerms("API,");
    expect(parsed.hasErrors).toBe(false);
    const term = parsed.terms.find((t) => t.key === "API");
    expect(term).toBeDefined();
    expect(term.value).toBe("");
    // 运行时按上游 value || fullMatch 保留原文并包裹 <i> 高亮
    const { output } = applyTermReplace(
      "call the API now",
      parsed,
      (termEntry, fullMatch) => `<i>${termEntry.value || fullMatch}</i>`
    );
    expect(output).toContain("<i>API</i>");
  });

  test("固定输入 2：Dr\\.who;Dr.who,神经病患者 被拒绝（正则重叠冲突映射）", () => {
    const parsed = parseTerms("Dr\\.who;Dr.who,神经病患者");
    expect(parsed.hasErrors).toBe(true);
    const conflict = parsed.diagnostics.find(
      (d) => d.type === "conflicting-pattern"
    );
    expect(conflict).toBeDefined();
    // 诊断同时指出两个 key 与同一原文（detail 结构化字段；可读文本由格式化函数产生）
    expect(conflict.message).toBeUndefined();
    expect(formatDiagnosticMessage(conflict)).toContain("Dr\\.who");
    expect(formatDiagnosticMessage(conflict)).toContain("Dr.who");
    expect(conflict.detail.literal).toBe("Dr.who");
  });

  test("固定输入 3：Dr.who;,abc;入门, （空源术语致命 + 尾巴逗号保留）", () => {
    // 分割后各段：Dr.who（合法保留规则）、,abc（逗号前无源术语，致命）、入门,（尾巴逗号，保留原文）
    const parsed = parseTerms("Dr.who;,abc;入门,");
    expect(parsed.hasErrors).toBe(true);
    const extras = parsed.diagnostics.filter((d) => d.type === "extra-comma");
    expect(extras).toHaveLength(1);
    expect(extras[0].segment).toBe("入门,");
    expect(parsed.diagnostics.some((d) => d.type === "empty-source-term")).toBe(
      true
    );
    // 合法 keep rule（Dr.who）与尾巴逗号保留规则（入门）都被解析出来；空源（abc）被跳过
    expect(parsed.terms.some((t) => t.key === "Dr.who")).toBe(true);
    expect(parsed.terms.some((t) => t.key === "入门")).toBe(true);
    expect(parsed.terms.some((t) => t.key === "abc")).toBe(false);
  });

  test("空源术语（逗号前无 key）是致命错误", () => {
    const parsed = parseTerms(",接口;API,接口");
    expect(parsed.hasErrors).toBe(true);
    expect(parsed.diagnostics.some((d) => d.type === "empty-source-term")).toBe(
      true
    );
  });

  test("非法正则是致命错误且仍收集进 invalid（向后兼容）", () => {
    const parsed = parseTerms("API,接口;bad[re");
    expect(parsed.hasErrors).toBe(true);
    expect(parsed.invalid).toHaveLength(1);
    expect(parsed.invalid[0].key).toBe("bad[re");
    expect(parsed.diagnostics.some((d) => d.type === "invalid-regex")).toBe(
      true
    );
    // 合法术语仍被解析并保留在 terms 中，供消费方继续应用
    expect(parsed.terms.map((t) => t.key)).toEqual(["API"]);
  });

  test("重复术语/重复映射/同源不同译文产生三种不同诊断", () => {
    const dupKey = parseTerms("API;API");
    expect(dupKey.diagnostics.some((d) => d.type === "duplicate-mapping")).toBe(
      true
    );
    expect(dupKey.hasErrors).toBe(false);

    const dupMap = parseTerms("API,接口;API,接口");
    expect(dupMap.diagnostics.some((d) => d.type === "duplicate-mapping")).toBe(
      true
    );
    expect(dupMap.hasErrors).toBe(false);

    const conflictMap = parseTerms("API,接口;API,应用编程接口");
    expect(
      conflictMap.diagnostics.some((d) => d.type === "conflicting-mapping")
    ).toBe(true);
    expect(conflictMap.hasErrors).toBe(true);
  });

  test("合法长短词冲突（API/APIKey）不产生冲突映射诊断", () => {
    const parsed = parseTerms("API,接口;APIKey,应用编程接口");
    expect(parsed.hasErrors).toBe(false);
    expect(
      parsed.diagnostics.some((d) => d.type === "conflicting-pattern")
    ).toBe(false);
    expect(
      parsed.diagnostics.some((d) => d.type === "conflicting-mapping")
    ).toBe(false);
  });

  test("空匹配正则（a*、()）是致命诊断且被跳过，合法术语仍生效", () => {
    const parsed = parseTerms("a*,x;API,接口");
    expect(parsed.hasErrors).toBe(true);
    expect(
      parsed.diagnostics.some((d) => d.type === "empty-matching-pattern")
    ).toBe(true);
    // 空匹配段被跳过，合法术语仍保留
    expect(parsed.terms.map((t) => t.key)).toEqual(["API"]);
    // 空匹配正则不再注入译文破坏文本
    expect(
      applyTermReplace("hello", parsed.terms, (t, m) => t.value || m).output
    ).toBe("hello");
  });

  test("空匹配正则 () 与 x? 同样被拒绝", () => {
    for (const key of ["()", "x?", "a*"]) {
      const parsed = parseTerms(`${key},v`);
      expect(parsed.hasErrors).toBe(true);
      const d = parsed.diagnostics.find(
        (diag) => diag.type === "empty-matching-pattern"
      );
      expect(d).toBeDefined();
      expect(d.key).toBe(key);
      expect(parsed.terms).toHaveLength(0);
    }
  });

  test("每条诊断携带结构化 type/segmentIndex/segment/detail；格式化函数产物为单行", () => {
    const parsed = parseTerms("Dr.who,;Dr\\.who;Dr.who,神经病患者");
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    for (const d of parsed.diagnostics) {
      expect(typeof d.type).toBe("string");
      expect(typeof d.segmentIndex).toBe("number");
      expect(typeof d.segment).toBe("string");
      // 用户可见文案归属 UI（i18n）/ CLI（格式化函数），核心不输出硬编码中文 message
      expect(d.message).toBeUndefined();
      expect(d).toHaveProperty("detail");
      // CLI 格式化函数产物保持单行上限，与旧 message 契约一致
      const formatted = formatDiagnosticMessage(d);
      expect(typeof formatted).toBe("string");
      expect(formatted).not.toContain("\n");
      expect(formatted.length).toBeLessThanOrEqual(200);
    }
  });

  // ─── v4：hasErrors 不等于 terms 为空，合法条目逐条保留 ─────────────────────
  test("hasErrors === true 时合法条目仍保留在 terms 中（不因单条坏数据清空整份）", () => {
    const parsed = parseTerms("API,接口;([,坏规则");
    expect(parsed.hasErrors).toBe(true);
    expect(parsed.invalid.map((i) => i.key)).toEqual(["(["]);
    expect(parsed.diagnostics.some((d) => d.type === "invalid-regex")).toBe(
      true
    );
    // 合法条目未被非法段牵连：仍可应用
    expect(parsed.terms.map((t) => t.key)).toEqual(["API"]);
    expect(parsed.terms[0].value).toBe("接口");
  });

  test("合法条目与空 source、多余逗号、重复/冲突条目共存时仍逐条保留", () => {
    // 段 1 合法映射；段 2 空源；段 3 多余逗号（保留原文）；段 4 重复映射；段 5 合法；段 6 冲突映射
    const parsed = parseTerms("API,接口;,empty;Key,;API,接口;X,接口;X,另一个");
    expect(parsed.hasErrors).toBe(true);
    const types = new Set(parsed.diagnostics.map((d) => d.type));
    expect(types.has("empty-source-term")).toBe(true);
    expect(types.has("extra-comma")).toBe(true);
    expect(types.has("duplicate-mapping")).toBe(true);
    expect(types.has("conflicting-mapping")).toBe(true);
    // 合法条目（API、X 的首个映射）与尾巴逗号保留条目（Key）仍在 terms 中
    expect(parsed.terms.some((t) => t.key === "API")).toBe(true);
    expect(parsed.terms.some((t) => t.key === "X" && t.value === "接口")).toBe(
      true
    );
    expect(parsed.terms.some((t) => t.key === "Key" && t.value === "")).toBe(
      true
    );
    // 空源段被跳过，未进入 terms
    expect(parsed.terms.some((t) => t.key === "empty")).toBe(false);
  });

  test("diagnostics 精确指向被拒绝条目，合法条目不产生任何诊断", () => {
    const parsed = parseTerms("API,接口;bad[re");
    // 唯一诊断指向非法段 bad[re
    expect(parsed.diagnostics).toHaveLength(1);
    expect(parsed.diagnostics[0].type).toBe("invalid-regex");
    expect(parsed.diagnostics[0].key).toBe("bad[re");
    // 合法条目 API 未被标记为失败
    expect(parsed.invalid.some((i) => i.key === "API")).toBe(false);
    const apiDiag = parsed.diagnostics.filter((d) => d.key === "API");
    expect(apiDiag).toHaveLength(0);
  });
});

// ─── 术语冲突分析引擎加固（统一计划 20260829 Task 4）─────────────────────────
// analyzeCrossTermPatternConflicts 是 O(n²) 两两交叉分析：原实现对每个有序对
// 编译 2 次正则（fullRegexMatches），40 条术语即 3120 次编译。加固手段：
//   ① isStrictLiteralPattern 白名单短路：双方均为严格字面量（未转义元字符为空，
//     且每个转义序列的被转义字符 ∈ REGEX_META_CHARS）时，字面量正则只可能完整
//     命中自身去转义文本，双 key 不同则必然无冲突——零编译跳过；
//   ② 按 key 预编译：非白名单对的正则每个 key 只编译一次。
// 白名单文法反例锁定：\d 的被转义字符 d 不是元字符，不得判为字面量，
// 否则 \d × 5 的 conflicting-pattern 检出会被漏掉（B3）。
describe("terms 冲突分析引擎加固（统一计划 20260829 Task 4）", () => {
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

  test("isStrictLiteralPattern 白名单文法：\\d 不得判为字面量，转义元字符序列可以", () => {
    // 纯字面量
    expect(isStrictLiteralPattern("API")).toBe(true);
    expect(isStrictLiteralPattern("TermNo0x")).toBe(true);
    // 转义元字符序列（被转义字符 ∈ REGEX_META_CHARS）
    expect(isStrictLiteralPattern("Dr\\.whob")).toBe(true);
    expect(isStrictLiteralPattern("a\\.b\\+c")).toBe(true);
    expect(isStrictLiteralPattern("\\$\\^")).toBe(true);
    // 反例：被转义字符不是元字符（\d \w \s 等）→ 不算字面量
    expect(isStrictLiteralPattern("\\d")).toBe(false);
    expect(isStrictLiteralPattern("\\w")).toBe(false);
    // 反例：存在未转义元字符
    expect(isStrictLiteralPattern("a.b")).toBe(false);
    expect(isStrictLiteralPattern("(unclosed")).toBe(false);
    expect(isStrictLiteralPattern("")).toBe(false);
  });

  test("40 条互不为子串的严格字面量术语：跨术语冲突分析零编译（full − fast 差值）", () => {
    const keys = [];
    for (let i = 0; i < 40; i++) keys.push(`TermNo${i}x,词${i}`);
    const input = keys.join(";");
    // fast 模式跳过冲突分析：其编译数 = 逐段 keyRegex 校验的基线
    const restoreFast = installCountingRegExp();
    let fastDelta;
    try {
      parseTerms(input, { fullDiagnostics: false });
    } finally {
      fastDelta = restoreFast();
    }
    const restoreFull = installCountingRegExp();
    let fullDelta;
    try {
      parseTerms(input);
    } finally {
      fullDelta = restoreFull();
    }
    // full 与 fast 的编译差值应恰为 0（冲突分析贡献零编译）；加固前为 3120。
    expect(fullDelta - fastDelta).toBe(0);
  });

  test("B3 锁定：\\d × 5 与 \\w × A 的 conflicting-pattern 必须检出", () => {
    for (const input of ["\\d,数字;5,five", "\\w,词;A,甲"]) {
      const parsed = parseTerms(input);
      expect(parsed.hasErrors).toBe(true);
      const d = parsed.diagnostics.find(
        (diag) => diag.type === "conflicting-pattern"
      );
      expect(d).toBeDefined();
      expect(parsed.terms).toHaveLength(2);
    }
  });

  test("字面量子串对走 literalOverlap 路径：parseTerms 不报 conflicting-pattern，detectTermConflicts 检出", () => {
    const parsed = parseTerms("abc,甲;abcde,乙");
    expect(
      parsed.diagnostics.some((d) => d.type === "conflicting-pattern")
    ).toBe(false);
    expect(parsed.terms).toHaveLength(2);
    const conflicts = detectTermConflicts(parsed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].short.key).toBe("abc");
    expect(conflicts[0].long.key).toBe("abcde");
  });
});

// ─── 字符级不变量对抗矩阵（统一计划 20260829 Task 1 语料裁剪落库，Task 6）────
// 「无新问题」的字符级不变量：每个字符要么原样保留，要么在真实命中的 span 内被
// 显式替换（output 可由 text + spans 精确重建）。四道防线对应四不变量：
//   ① spans 重建 === output；
//   ② span start<end 有序不重叠（零宽 span 是注入事故的直接证据）；
//   ③ 同输入两次调用全等（lastIndex 卫生 / 幂等）；
//   ④ 非法正则语料不抛异常。
// Task 1 取证阶段的对抗扫描（54 组 × 21 文本）在修复前恰好产生 80 项零宽 span
// 违例、其余不变量全绿；此处以确定性固定语料把"修复后行为"永久落库。
describe("terms 字符级不变量对抗矩阵（统一计划 20260829 Task 6）", () => {
  const MATRIX_TERMS = [
    // 常规字面量 / 正则 / 捕获组 / 消费型环视
    "API,接口", "APIKey,应用编程接口", "UI,界面", "UIView", "GPT;GPTs,智能体集合",
    "foo.bar,点", "Dr\\.whob,医生", "API\\d+,编号", "colou?r,颜色", "[abc]+,集合", "[A-Z][a-z]+,专名",
    "(?:ab)+,重复", "a|b,或者", "\\w+,词", "x", "xx,双x", "Foo(?=Bar),先;Baz,后",
    "(?<=x)y,已选", "(?<!y)x,非y前x", "x\\b,词尾x", "(?<a>X)(?<b>Y)\\d+,xy编号",
    "(?<c>Q)R,qr", "((ABCDEFG)),long", "手机,phone",
    // 混合零宽臂（合法保留，运行期守卫兜底）
    "a|(?=x),Y", "zz|(?=x),Y", "(?=x)y,z",
    // 非法正则语料（⑤不抛异常覆盖）
    "bad[re,坏", "(unclosed,括", "*x,星", "[z,方括", "?y,问号",
    // 空匹配 / 纯零宽（现状即被门闸 fatal 排除，不进 terms）
    "a*,星", "(),空组", "^,尖", "(?=x),Y", "(?<=x),Y", "\\b,Y", "(?!x),Y", "\\B,Z",
  ];

  const MATRIX_TEXTS = [
    "xx", "ab", "x", "ax", "xb", "FooBar Baz", "xy n", "APIKeys and APIs",
    "myAPI", "The ReactNative app", "GPTs 与 GPT", "colours and color",
    "XY42 and QR", "Dr.whob here", "API123编号", "中文与English混排",
    "QR code for QR", "aXbXc", "  ",
  ];

  // 防平凡通过（greenwash）守卫：以下组必须物化为合法术语并在矩阵文本上至少命中一次。
  // 字符类术语曾被 isZeroWidthOnlyPattern 误判 fatal → terms=[] → 四不变量在空数组上
  // "平凡全绿"，正是该守卫要堵死的盲区；术语若再被静默丢弃，本断言必红。
  const assertConsumingTerms = new Map([
    ["[abc]+,集合", { terms: 1, minHits: 1 }],
    ["[A-Z][a-z]+,专名", { terms: 1, minHits: 1 }],
  ]);

  const matrixReplacer = (t, m) => t.value || m;

  function rebuildFromSpans(text, spans) {
    const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
    let out = "";
    let cursor = 0;
    for (const s of sorted) {
      out += text.slice(cursor, s.start) + s.replacement;
      cursor = s.end;
    }
    return out + text.slice(cursor);
  }

  for (const engine of ["fixed", "naive"]) {
    test(`不变量矩阵：${engine} 引擎在 ${MATRIX_TERMS.length} 组 × ${MATRIX_TEXTS.length} 文本上四不变量全绿`, () => {
      const violations = [];
      for (const termsString of MATRIX_TERMS) {
        const parsed = parseTerms(termsString);
        for (const text of MATRIX_TEXTS) {
          const run = () =>
            engine === "fixed"
              ? applyTermReplace(text, parsed.terms, matrixReplacer)
              : applyNaiveReplace(text, parsed);
          let result;
          try {
            result = run();
          } catch (e) {
            violations.push({ termsString, text, inv: "no-throw", error: String(e) });
            continue;
          }
          // ① spans 重建 === output
          const rebuilt = rebuildFromSpans(text, result.spans);
          if (rebuilt !== result.output) {
            violations.push({ termsString, text, inv: "rebuild", rebuilt, output: result.output });
          }
          // ② span start<end 有序不重叠（零宽 span = 修复前事故形态，修复后必须绝迹）
          const sorted = [...result.spans].sort(
            (a, b) => a.start - b.start || a.end - b.end
          );
          for (const s of sorted) {
            if (!(s.start < s.end)) {
              violations.push({ termsString, text, inv: "non-zero-width", span: s });
              break;
            }
          }
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].start < sorted[i - 1].end) {
              violations.push({ termsString, text, inv: "non-overlap", a: sorted[i - 1], b: sorted[i] });
              break;
            }
          }
          // ③ 同输入两次调用全等
          const second = run();
          if (JSON.stringify(result) !== JSON.stringify(second)) {
            violations.push({ termsString, text, inv: "idempotent" });
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }

  test("防平凡通过守卫：字符类术语必须物化合法术语并在矩阵文本上真实命中", () => {
    // 曾经的 P1 回归形态：isZeroWidthOnlyPattern 把顶层字符类当零宽 → parseTerms
    // 判 fatal → terms=[] → 四不变量在空术语集上平凡全绿，缺陷被矩阵掩盖。
    // 本守卫直接要求：术语数符合预期 + 在固定语料上至少产生 minHits 个 span。
    for (const [termsString, expected] of assertConsumingTerms) {
      const parsed = parseTerms(termsString);
      expect({ termsString, termCount: parsed.terms.length }).toEqual({
        termsString,
        termCount: expected.terms,
      });
      let hits = 0;
      for (const text of MATRIX_TEXTS) {
        hits += applyTermReplace(text, parsed.terms, matrixReplacer).spans.length;
      }
      // 术语被误杀时 terms=[] → hits 恒为 0，本断言立即转红。
      expect(hits).toBeGreaterThanOrEqual(expected.minHits);
    }
  });

  test("不变量矩阵：fast/full 基础解析逐字段一致（除 conflicting-pattern）", () => {
    for (const termsString of MATRIX_TERMS) {
      const fast = parseTerms(termsString, { fullDiagnostics: false });
      const full = parseTerms(termsString);
      const fields = (p) => ({
        terms: p.terms,
        invalid: p.invalid,
        originalOrder: p.originalOrder,
        metaWarnings: p.metaWarnings,
        baseDiags: p.diagnostics.filter((d) => d.type !== "conflicting-pattern"),
      });
      expect(JSON.stringify(fields(fast))).toBe(JSON.stringify(fields(full)));
    }
  });

  test("不变量矩阵：纯零宽术语修复后行为——fatal 排除且混合臂零宽分支不产 span", () => {
    // 静态层：纯零宽模式在两种模式下都被排除（合法术语仍保留）
    for (const key of ["(?=x)", "(?<=x)", "\\b"]) {
      for (const mode of [{}, { fullDiagnostics: false }]) {
        const parsed = parseTerms(`${key},Y;API,接口`, mode);
        expect(parsed.terms.map((t) => t.key)).toEqual(["API"]);
      }
    }
    // 运行时层：混合臂 a|(?=x) 在只有零宽分支可命中的文本上零产出
    //（语料不含字母 a：消费臂无从命中；含 x：零宽分支可命中）
    const mixed = parseTerms("a|(?=x),Y");
    const out = applyTermReplace("xX finish line", mixed.terms, matrixReplacer);
    expect(out.output).toBe("xX finish line");
    expect(out.spans).toEqual([]);
  });
});
