import {
  parseTxtImport,
  parseJsonImport,
  parseCsvImport,
  detectFormat,
  parseImport,
} from "./termsImport";
import { parseTerms } from "./terms";

// 术语导入纯函数测试（spec: .anchorlaw/specs/terminology-library-v0.md §3）
// 覆盖：BOM/换行归一化、CSV（引号/转义/表头/多余列/未闭合）、JSON（两形态/未知字段/非法）、
//       TXT 透传、lineMap 反查、分号拒绝、空输入安全、端到端 parseTerms 契约。

describe("termsImport 通用归一化", () => {
  test("剥离 UTF-8 BOM（Excel 导出的 CSV 必带）", () => {
    const result = parseTxtImport("\uFEFFAPI,接口\ntoken,令牌");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口\ntoken,令牌");
    expect(result.entries).toBe(2);
  });

  test("CSV 路径同样剥离 BOM", () => {
    const result = parseCsvImport("\uFEFFkey,value\nAPI,接口");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口");
    expect(result.entries).toBe(1);
  });

  test("CRLF 与 CR 都归一化为 LF", () => {
    expect(parseTxtImport("API,接口\r\ntoken,令牌").text).toBe(
      "API,接口\ntoken,令牌"
    );
    expect(parseTxtImport("API,接口\rtoken,令牌").text).toBe(
      "API,接口\ntoken,令牌"
    );
    // 混合换行同样收敛
    expect(parseTxtImport("a,1\r\nb,2\rc,3\nd,4").text).toBe("a,1\nb,2\nc,3\nd,4");
  });

  test("空 / null / undefined / 非字符串输入安全返回空结果，不抛错", () => {
    for (const input of ["", "   ", null, undefined, 42, {}, []]) {
      for (const parse of [parseTxtImport, parseCsvImport, parseJsonImport]) {
        const result = parse(input);
        expect(result.ok).toBe(true);
        expect(result.text).toBe("");
        expect(result.entries).toBe(0);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.lineMap).toEqual([]);
      }
    }
  });
});

describe("termsImport TXT", () => {
  test("透传：内容即 terms 原生格式", () => {
    const raw = "API,接口\nGPTs,智能体集合;React,React Native";
    const result = parseTxtImport(raw);
    expect(result.ok).toBe(true);
    expect(result.text).toBe(raw);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("不支持 # 注释：原样保留（# 是合法正则字符）", () => {
    const result = parseTxtImport("# 这是注释\nAPI,接口");
    expect(result.text).toBe("# 这是注释\nAPI,接口");
    expect(result.entries).toBe(2);
    // # 后无逗号 → 整行是 key、value 为空；交给 parseTerms 后成为一条 key 含 # 的**合法**
    // 术语（# 是合法正则字符），既不会被丢弃也不会报 invalid-regex。
    // 这正是「不能在导入层剥注释」的证据：剥了就会与直接粘贴文本的结果分裂。
    const parsed = parseTerms(result.text);
    expect(parsed.hasErrors).toBe(false);
    expect(parsed.terms.map((t) => t.key)).toContain("# 这是注释");
    expect(parsed.terms.map((t) => t.key)).toContain("API");
  });

  test("尾部换行不产生额外的空段（不虚增 entries）", () => {
    const result = parseTxtImport("API,接口\n");
    expect(result.entries).toBe(1);
    expect(result.lineMap).toEqual([1]);
  });

  test("中段空行被跳过，但源行号仍正确保留在 lineMap", () => {
    const result = parseTxtImport("API,接口\n\ntoken,令牌");
    expect(result.entries).toBe(2);
    expect(result.lineMap).toEqual([1, 3]);
  });

  test("TXT 不做 key 含逗号 / 分号的拦截（透传通道语义）", () => {
    const result = parseTxtImport("a,b,c");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("a,b,c");
  });
});

describe("termsImport CSV 基础解析", () => {
  test("基本两列", () => {
    const result = parseCsvImport("API,接口\ntoken,令牌");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口\ntoken,令牌");
    expect(result.entries).toBe(2);
    expect(result.lineMap).toEqual([1, 2]);
  });

  test("字段两侧空白被 trim", () => {
    const result = parseCsvImport("  API  ,  接口  ");
    expect(result.text).toBe("API,接口");
  });

  test("缺 value 列（只有一列）按 value=\"\" 处理，输出只写 key 不带逗号", () => {
    const result = parseCsvImport("API\nToken,令牌");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API\nToken,令牌");
    expect(result.entries).toBe(2);
  });

  test("空行跳过且不占 lineMap 条目", () => {
    const result = parseCsvImport("API,接口\n\n\ntoken,令牌\n");
    expect(result.entries).toBe(2);
    expect(result.lineMap).toEqual([1, 4]);
  });

  test("仅空白的行被跳过；仅逗号的行（字段全为空）同样按空行跳过", () => {
    const result = parseCsvImport("API,接口\n   \n,");
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(1);
    expect(result.text).toBe("API,接口");
    expect(result.lineMap).toEqual([1]);
    expect(result.errors).toEqual([]);
    // 与 parseTerms 语义一致：`,` 行是空源术语（empty-source-term），不是合法术语；
    // 导入层按空行跳过，既不产出条目也不误报格式错误。
    expect(parseTerms(result.text).hasErrors).toBe(false);
  });

  test("字段为空的单列行（key 为空）不产出条目", () => {
    const result = parseCsvImport('API,接口\n""\ntoken,令牌');
    expect(result.entries).toBe(2);
    expect(result.lineMap).toEqual([1, 3]);
  });

  test("value 为空的裸 key 行原样输出", () => {
    const result = parseCsvImport("API,");
    expect(result.text).toBe("API");
  });
});

describe("termsImport CSV 引号与转义（RFC 4180）", () => {
  test("引号包裹的 value 含逗号 → 拒绝（terms 文本层无法表达带逗号的 value）", () => {
    // 【judge 修正 2026-10-01】原测试假设"value 里的逗号在最后一个逗号之后，会被并入 value"。
    // 该假设经真引擎实测**证伪**：
    //   parseTerms("API,接口, 应用程序接口") -> key="API,接口"  value="应用程序接口"
    // 即 parseTerms 用 lastIndexOf(",") 切分，多余逗号**一律被 key 吃掉**。
    // 若在此放行，`API,"接口, 应用程序接口"` 会静默产出 key 被污染的术语库且不报错，
    // 比明确拒绝危险得多。故 value 含逗号必须拒绝。
    const result = parseCsvImport('API,"接口, 应用程序接口"');
    expect(result.ok).toBe(false);
    expect(result.text).toBe("");
    expect(result.entries).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("value-contains-comma");
  });

  test("未引号包裹的 value 含逗号 → 被切成 3 列，第 3 列忽略 + extra-columns 警告", () => {
    // CSV 结构层把 `API,接口, 应用程序接口` 视为 3 列（第 2 列的逗号没有引号保护），
    // 第 3 列按规格忽略并计数。产出的 value（"接口"）本身不含逗号，故可安全落地。
    const result = parseCsvImport("API,接口, 应用程序接口");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe("csv-extra-columns");
  });

  test("引号内的字面双引号由 \"\" 转义", () => {
    const result = parseCsvImport('API,"说""接口"""');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('API,说"接口"');
    const parsed = parseTerms(result.text);
    expect(parsed.terms[0].value).toBe('说"接口"');
  });

  test("整字段被引号包裹时 value 内的分号也被拒绝（分号是段分隔符）", () => {
    const result = parseCsvImport('API,"接口;应用"');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("contains-semicolon");
    expect(result.text).toBe("");
  });

  test("引号未闭合 → 报错 csv-quote-unterminated，且该行不产出条目", () => {
    const result = parseCsvImport('API,接口\ntoken,"令牌');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("csv-quote-unterminated");
    expect(result.errors[0].line).toBe(2);
    expect(result.text).toBe("API,接口"); // 合法行仍保留
    expect(result.entries).toBe(1);
  });

  test("引号内含换行 → 替换为空格 + warning csv-newline-in-quoted", () => {
    const result = parseCsvImport('API,"接口\n应用程序接口"');
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe("csv-newline-in-quoted");
    expect(result.warnings[0].line).toBe(1);
    expect(result.text).toBe("API,接口 应用程序接口");
    expect(result.text).not.toContain("\n");
    // 端到端：不被 parseTerms 拦腰切断
    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0].value).toBe("接口 应用程序接口");
    expect(parsed.hasErrors).toBe(false);
  });

  test("引号内换行跨行后，后续行的 lineMap 仍指向真实源行号", () => {
    const result = parseCsvImport('API,"接口\n应用程序接口"\ntoken,令牌');
    expect(result.text).toBe("API,接口 应用程序接口\ntoken,令牌");
    expect(result.lineMap).toEqual([1, 3]);
  });

  test("引号内的逗号不会触发多余列 warning（是 value 内容，但随后因含逗号被拒绝）", () => {
    // 【judge 修正 2026-10-01】CSV 结构层确实不把那两个逗号当列分隔（无 extra-columns 警告），
    // 但字段内容含逗号无法在 terms 文本层表达，故最终以 value-contains-comma 拒绝。
    const result = parseCsvImport('API,"a,b,c"');
    expect(result.ok).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe("");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("value-contains-comma");
  });

  test("字段中间出现的引号按字面字符处理（只在字段开头开启引号语义）", () => {
    const result = parseCsvImport('API,说"接口"');
    expect(result.text).toBe('API,说"接口"');
    expect(result.ok).toBe(true);
  });
});

describe("termsImport CSV 列与表头", () => {
  test("第 3 列及以后忽略并计数 warning csv-extra-columns", () => {
    const result = parseCsvImport("API,接口,备注,多余");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe("csv-extra-columns");
    expect(result.warnings[0].line).toBe(1);
  });

  test("表头检测：英文表头 key,value 被跳过", () => {
    const result = parseCsvImport("key,value\nAPI,接口\ntoken,令牌");
    expect(result.text).toBe("API,接口\ntoken,令牌");
    expect(result.entries).toBe(2);
    expect(result.lineMap).toEqual([2, 3]); // 跳过表头行 1
    expect(result.errors).toEqual([]);
  });

  test("表头检测：term,translation / source,target 两种英文别名", () => {
    expect(parseCsvImport("term,translation\nAPI,接口").text).toBe("API,接口");
    expect(parseCsvImport("source,target\nAPI,接口").text).toBe("API,接口");
  });

  test("表头检测：中文表头 源术语,译文", () => {
    const result = parseCsvImport("源术语,译文\nAPI,接口");
    expect(result.text).toBe("API,接口");
    expect(result.lineMap).toEqual([2]);
  });

  test("表头检测：术语/原文 × 译文/目标 全部命中", () => {
    expect(parseCsvImport("术语,译文\nAPI,接口").entries).toBe(1);
    expect(parseCsvImport("原文,目标\nAPI,接口").entries).toBe(1);
  });

  test("表头检测：大小写与空白不敏感，引号包裹也算", () => {
    expect(parseCsvImport('"KEY" , "Value"\nAPI,接口').text).toBe("API,接口");
    expect(parseCsvImport("  Term  ,  Target  \nAPI,接口").text).toBe("API,接口");
  });

  test("表头检测：BOM + 中文表头同样识别", () => {
    const result = parseCsvImport("\uFEFF源术语,译文\nAPI,接口");
    expect(result.text).toBe("API,接口");
    expect(result.lineMap).toEqual([2]);
  });

  test("表头检测：只有一列匹配时不跳过，按数据行处理", () => {
    const result = parseCsvImport("key,something\nAPI,接口");
    expect(result.entries).toBe(2);
    expect(result.text).toBe("key,something\nAPI,接口");
    expect(result.lineMap).toEqual([1, 2]);
  });

  test("表头检测：只有两列都命中才跳过；key 数据行首行不误判", () => {
    const result = parseCsvImport("API,接口\nkey,value");
    expect(result.entries).toBe(2);
    expect(result.text).toBe("API,接口\nkey,value");
  });

  test("表头检测：空行先于表头时，表头检测落在首条非空记录上", () => {
    const result = parseCsvImport("\n\nkey,value\nAPI,接口");
    expect(result.text).toBe("API,接口");
    expect(result.lineMap).toEqual([4]);
  });

  test("表头检测：带多余列的表头行同样跳过", () => {
    const result = parseCsvImport("key,value,comment\nAPI,接口,x");
    expect(result.text).toBe("API,接口");
    expect(result.lineMap).toEqual([2]);
  });
});

describe("termsImport CSV key 含逗号与分号（拒绝而非错切）", () => {
  test('引号包裹的 key 含逗号 → error key-contains-comma', () => {
    // 【judge 修正 2026-10-01】原测试用 `a,b,c`，但那是**三列**行：
    // key="a"、value="b"、第 3 列 "c" 被忽略（csv-extra-columns），key 本身不含逗号。
    // 真正的"key 含逗号"必须由引号保护，`"a,b",c` 才是 key="a,b" 的情形。
    const result = parseCsvImport('"a,b",c');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("key-contains-comma");
    expect(result.errors[0].line).toBe(1);
    expect(result.errors[0].raw).toBe('"a,b",c');
    expect(result.text).toBe("");
  });

  test("未引号包裹的三列行按规格处理（第 3 列忽略，不是 key 含逗号）", () => {
    // 这是与上一条的关键区分：无引号时逗号是**列分隔符**，不是字段内容。
    const result = parseCsvImport("a,b,c");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("a,b");
    expect(result.entries).toBe(1);
    expect(result.warnings.map((w) => w.reason)).toEqual(["csv-extra-columns"]);
  });

  test("引号包裹的 key 含逗号同样被拒绝（terms 文本层无转义机制）", () => {
    const result = parseCsvImport('"a,b",接口');
    expect(result.ok).toBe(false);
    expect(result.errors[0].reason).toBe("key-contains-comma");
  });

  test("坏行被拒绝但其余行仍正常产出", () => {
    const result = parseCsvImport('API,接口\n"a,b",x\ntoken,令牌');
    expect(result.ok).toBe(false);
    expect(result.text).toBe("API,接口\ntoken,令牌");
    expect(result.lineMap).toEqual([1, 3]);
    expect(result.entries).toBe(2);
    expect(result.errors).toHaveLength(1);
  });

  test("key 或 value 含分号 → error contains-semicolon（parseTerms 按 ; 切段）", () => {
    expect(parseCsvImport("a;b,接口").errors[0].reason).toBe(
      "contains-semicolon"
    );
    expect(parseCsvImport("API,接口;应用").errors[0].reason).toBe(
      "contains-semicolon"
    );
  });
});

describe("termsImport JSON", () => {
  test("形态 1：数组 [{key,value}]", () => {
    const result = parseJsonImport(
      JSON.stringify([
        { key: "API", value: "接口" },
        { key: "token", value: "令牌" },
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口\ntoken,令牌");
    expect(result.entries).toBe(2);
    expect(result.lineMap).toEqual([1, 2]);
  });

  test("形态 2：对象映射 { key: value }", () => {
    const result = parseJsonImport(
      JSON.stringify({ API: "接口", token: "令牌" })
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口\ntoken,令牌");
    expect(result.entries).toBe(2);
  });

  test("缺 value → 缺省为 \"\"，输出只写 key", () => {
    const result = parseJsonImport(JSON.stringify([{ key: "API" }]));
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API");
    expect(result.entries).toBe(1);
  });

  test("未知字段忽略但计数 warning json-unknown-field", () => {
    const result = parseJsonImport(
      JSON.stringify([{ key: "API", value: "接口", flags: "i", note: "x" }])
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("API,接口");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe("json-unknown-field");
    expect(result.warnings[0].line).toBe(1);
  });

  test("非法 JSON → 抛错且信息包含 JSON.parse 原始 message", () => {
    expect(() => parseJsonImport("{ bad json")).toThrow(/JSON\.parse/);
    expect(() => parseJsonImport("{ bad json")).toThrow(/JSON.parse failed:/);
  });

  test("key 含逗号 → error key-contains-comma", () => {
    const result = parseJsonImport(
      JSON.stringify([{ key: "a,b", value: "x" }])
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0].reason).toBe("key-contains-comma");
    expect(result.text).toBe("");
  });

  test("key 或 value 含分号 → error contains-semicolon", () => {
    expect(
      parseJsonImport(JSON.stringify([{ key: "a;b", value: "x" }])).errors[0]
        .reason
    ).toBe("contains-semicolon");
    expect(
      parseJsonImport(JSON.stringify([{ key: "a", value: "x;y" }])).errors[0]
        .reason
    ).toBe("contains-semicolon");
  });

  test("数组元素非对象 → json-invalid-field（逐个报错，不整体失败）", () => {
    const result = parseJsonImport(
      JSON.stringify(["API", 42, null, { key: "token", value: "令牌" }])
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((e) => e.reason === "json-invalid-field")).toBe(
      true
    );
    expect(result.text).toBe("token,令牌");
    expect(result.lineMap).toEqual([4]);
  });

  test("key 非字符串 / 空 → json-invalid-field", () => {
    expect(
      parseJsonImport(JSON.stringify([{ key: 42, value: "x" }])).errors[0]
        .reason
    ).toBe("json-invalid-field");
    expect(
      parseJsonImport(JSON.stringify([{ key: "", value: "x" }])).errors[0]
        .reason
    ).toBe("json-invalid-field");
    expect(
      parseJsonImport(JSON.stringify([{ value: "x" }])).errors[0].reason
    ).toBe("json-invalid-field");
  });

  test("value 非字符串 → json-invalid-field", () => {
    expect(
      parseJsonImport(JSON.stringify([{ key: "API", value: 42 }])).errors[0]
        .reason
    ).toBe("json-invalid-field");
  });

  test("对象映射的 value 非字符串 → json-invalid-field", () => {
    const result = parseJsonImport(
      JSON.stringify({ API: "接口", broken: 42, nested: { a: 1 } })
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.text).toBe("API,接口");
    expect(result.lineMap).toEqual([1]);
  });

  test("BOM + CRLF 的 JSON 文件同样可解析", () => {
    const result = parseJsonImport('\uFEFF[\r\n{"key":"API","value":"接口"}\r\n]');
    expect(result.text).toBe("API,接口");
  });

  test("顶层是标量 → json-invalid-field", () => {
    expect(parseJsonImport("42").errors[0].reason).toBe("json-invalid-field");
    expect(parseJsonImport("null").errors[0].reason).toBe("json-invalid-field");
  });

  test("空数组合法但无条目", () => {
    const result = parseJsonImport("[]");
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(0);
    expect(result.text).toBe("");
  });
});

describe("termsImport lineMap 端到端反查", () => {
  test("跳过表头与空行后，lineMap 能把 parseTerms 的 segmentIndex 反查回源行号", () => {
    // 源文件：1 表头 / 2 空行 / 3 合法 / 4 非法正则 / 5 合法
    const raw = "key,value\n\nAPI,接口\n(,[\ntoken,令牌";
    const result = parseCsvImport(raw);
    expect(result.lineMap).toEqual([3, 4, 5]);

    const parsed = parseTerms(result.text);
    const bad = parsed.diagnostics.find((d) => d.type === "invalid-regex");
    expect(bad).toBeDefined();
    // segmentIndex 是 1 起的段号，用 lineMap[segmentIndex - 1] 反查源文件行号
    expect(result.lineMap[bad.segmentIndex - 1]).toBe(4);
  });

  test("CSV 引号内换行占用了源行号，后续条目映射仍然正确", () => {
    const raw = 'key,value\nAPI,"接口\n应用"\ntoken,令牌';
    const result = parseCsvImport(raw);
    expect(result.lineMap).toEqual([2, 4]);
    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(2);
    expect(result.lineMap[0]).toBe(2); // API 条目来自源第 2 行
    expect(result.lineMap[1]).toBe(4); // token 条目来自源第 4 行
  });

  test("TXT 通道：空行跳过不占用段号，lineMap 保持严格对应", () => {
    const raw = "API,接口\n\ntoken,令牌\n\nGPT,生成式预训练";
    const result = parseTxtImport(raw);
    expect(result.lineMap).toEqual([1, 3, 5]);
    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(3);
    parsed.terms.forEach((term) => {
      const sourceLine = result.lineMap[parsed.originalOrder.indexOf(term)];
      expect(sourceLine).toBeGreaterThan(0);
    });
  });

  test("entries 恒等于 lineMap 长度；text 行数恒等于 entries", () => {
    const raw = "key,value\n\nAPI,接口\n\n\ntoken,令牌";
    const result = parseCsvImport(raw);
    expect(result.entries).toBe(result.lineMap.length);
    expect(result.text.split("\n")).toHaveLength(result.entries);
  });
});

describe("termsImport detectFormat 与 parseImport", () => {
  test("后缀优先", () => {
    expect(detectFormat("terms.csv", "API,接口")).toBe("csv");
    expect(detectFormat("terms.json", "API,接口")).toBe("json");
    expect(detectFormat("terms.txt", "API,接口")).toBe("txt");
    expect(detectFormat("terms.text", "API,接口")).toBe("txt");
    expect(detectFormat("C:\\path\\MY.CSV", "")).toBe("csv");
  });

  test("内容嗅探：无后缀时按内容判断", () => {
    expect(detectFormat("", '[{"key":"API","value":"接口"}]')).toBe("json");
    expect(detectFormat("", '{ "API": "接口" }')).toBe("json");
    expect(detectFormat("", "API,接口\ntoken,令牌")).toBe("txt");
    expect(detectFormat("", "API,接口")).toBe("txt");
  });

  test("内容嗅探：含逗号的 JSON 对象误判为 txt 时，parseImport 仍按 txt 透传不抛错", () => {
    // 已知边界：`{"a":"x,y"}` 含逗号会被嗅探为 txt；调用方可用后缀或显式 format 规避
    const format = detectFormat("", '{"a":"x,y"}');
    expect(format).toBe("txt");
    expect(() => parseImport('{"a":"x,y"}', format)).not.toThrow();
  });

  test("非字符串 filename / content 安全", () => {
    expect(detectFormat(null, null)).toBe("txt");
    expect(detectFormat(undefined)).toBe("txt");
    expect(detectFormat(42, 42)).toBe("txt");
  });

  test("parseImport 按格式分派", () => {
    expect(parseImport("API,接口", "csv").text).toBe("API,接口");
    expect(parseImport('{"API":"接口"}', "json").text).toBe("API,接口");
    expect(parseImport("API,接口", "txt").text).toBe("API,接口");
    // 未知格式按 txt 透传
    expect(parseImport("API,接口", undefined).text).toBe("API,接口");
  });
});

describe("termsImport → parseTerms 端到端契约", () => {
  test("CSV 全流程：解析结果交给 parseTerms 得到预期条目数与值", () => {
    const raw =
      "term,translation\n" +
      "API,接口\n" +
      "GPTs,智能体集合\n" +
      "token,\n" +
      "React,React Native";
    const result = parseCsvImport(raw);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(4);

    const parsed = parseTerms(result.text);
    expect(parsed.hasErrors).toBe(false);
    expect(parsed.terms).toHaveLength(4);
    const byKey = Object.fromEntries(parsed.terms.map((t) => [t.key, t.value]));
    expect(byKey.API).toBe("接口");
    expect(byKey.GPTs).toBe("智能体集合");
    expect(byKey.token).toBe("");
    expect(byKey.React).toBe("React Native");
  });

  test("CSV 全流程：含逗号的 value 被拒绝，绝不产出 key 被污染的文本", () => {
    // 【judge 修正 2026-10-01】原测试期望 `GPTs,"智能体, 集合"` 能往返成
    // key=GPTs / value="智能体, 集合"。经真引擎实测该期望**不可实现**：
    //   parseTerms("GPTs,智能体, 集合") -> key="GPTs,智能体"  value="集合"
    // 即 key 被污染。放行等于静默损坏用户的术语库，故改为断言"必须拒绝"。
    const result = parseCsvImport('term,translation\nAPI,接口\nGPTs,"智能体, 集合"');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("value-contains-comma");
    expect(result.errors[0].line).toBe(3);
    // 坏行被拒绝，但其余合法行仍正常产出，且 key 未被污染
    expect(result.text).toBe("API,接口");
    const parsed = parseTerms(result.text);
    const byKey = Object.fromEntries(parsed.terms.map((t) => [t.key, t.value]));
    expect(byKey.API).toBe("接口");
    expect(byKey.GPTs).toBeUndefined();
    expect(parsed.hasErrors).toBe(false);
  });

  test("JSON 全流程：数组与对象映射两种形态产出等价的 terms", () => {
    const fromArray = parseJsonImport(
      JSON.stringify([
        { key: "API", value: "接口" },
        { key: "token", value: "令牌" },
      ])
    );
    const fromObject = parseJsonImport(
      JSON.stringify({ API: "接口", token: "令牌" })
    );
    expect(fromArray.text).toBe(fromObject.text);
    expect(parseTerms(fromArray.text).terms).toHaveLength(2);
    expect(parseTerms(fromObject.text).terms).toHaveLength(2);
  });

  test("输出文本不含 \\n / ; 造成的错切：每条术语在 parseTerms 中恰好占一个段", () => {
    const result = parseCsvImport('API,"接口\n应用"\ntoken,令牌');
    const parsed = parseTerms(result.text);
    // 段数 = 输出行数（引号内换行已降级为空格，未被拦腰切断）
    expect(result.text.split("\n")).toHaveLength(2);
    expect(parsed.terms).toHaveLength(2);
    expect(parsed.diagnostics.filter((d) => d.type === "empty-source-term")).toEqual(
      []
    );
  });

  test("value 为空的条目在 parseTerms 中保留原文而不产生 extra-comma 提醒", () => {
    const result = parseCsvImport("API\nToken,令牌");
    const parsed = parseTerms(result.text);
    expect(parsed.diagnostics.filter((d) => d.type === "extra-comma")).toEqual(
      []
    );
    expect(parsed.terms.find((t) => t.key === "API").value).toBe("");
  });

  test("含正则元字符的 key 仍能往返（导入层不做转义决策）", () => {
    const result = parseJsonImport(
      JSON.stringify([{ key: "a.b", value: "点" }])
    );
    const parsed = parseTerms(result.text);
    expect(parsed.terms[0].key).toBe("a.b");
    expect(parsed.metaWarnings.length).toBeGreaterThan(0);
  });
});

// --- 术语库描述文件（带元信息）不得被当成 key-value 映射 ---
describe("termsImport 库描述文件解包", () => {
  test("顶层含 terms 时只取 terms，元信息不产生假术语（缺陷回归锁）", () => {
    // 【实测缺陷回归锁】多库模型引入后发现：
    // parseJsonImport 把任意顶层对象当 key-value 映射，于是
    //   {name:"游戏术语", description:"…", author:"…", terms:[{key,value}]}
    // 被解析成 name→游戏术语 / description→… / author→… 三条假术语
    //（实测 1 条真术语被解析成 3 条），术语库页面会显示垃圾条目。
    const result = parseJsonImport(
      JSON.stringify({
        _v: 1,
        name: "游戏术语",
        description: "某游戏专有名词",
        author: "@someone",
        homepage: "https://example.com",
        terms: [{ key: "Cheeta", value: "齐塔" }],
      })
    );

    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0].key).toBe("Cheeta");
    expect(parsed.terms[0].value).toBe("齐塔");
    // 元信息的键绝不能出现在术语里
    expect(parsed.terms.some((t) => ["name", "description", "author", "homepage", "_v"].includes(t.key))).toBe(false);
  });

  test("terms 为对象映射形态时同样正确解包", () => {
    const result = parseJsonImport(
      JSON.stringify({ name: "映射库", terms: { Cheeta: "齐塔", API: "接口" } })
    );
    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(2);
    expect(parsed.terms.find((t) => t.key === "API").value).toBe("接口");
  });

  test("terms 为纯文本形态时同样正确解包", () => {
    const result = parseJsonImport(
      JSON.stringify({ name: "文本库", terms: "Cheeta,齐塔\nAPI,接口" })
    );
    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(2);
  });

  test("不带 terms 的对象仍按 key-value 映射处理（既有行为不变）", () => {
    const result = parseJsonImport(JSON.stringify({ Cheeta: "齐塔", API: "接口" }));
    const parsed = parseTerms(result.text);
    expect(parsed.terms).toHaveLength(2);
    expect(parsed.terms.find((t) => t.key === "Cheeta").value).toBe("齐塔");
  });
});
