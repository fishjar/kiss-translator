// 术语库三级合成模块测试
//
// 核心不变量（必须有专门测试锁定，不能靠直觉判断）：
//   「同 key 的首次出现，必定来自最高优先级来源」
import { parseTerms, FATAL_DIAGNOSTIC_TYPES } from "./terms";
import {
  composeTermText,
  composeAndValidate,
  extractKeyValue,
  renderEntry,
} from "./termsCompose";

const parse = (text) => parseTerms(text, { fullDiagnostics: true });
const firstKeyLine = (text, key) =>
  text.split("\n").find((l) => extractKeyValue(l).key === key);

describe("extractKeyValue 与 parseTerms 切分规则一致", () => {
  test.each([
    ["API,接口", "API", "接口"],
    ["a,b,c", "a,b", "c"], // 最后一个逗号切分
    ["GPT", "GPT", ""], // 无逗号
    ["key,", "key", ""], // 尾逗号
    ["  spaced ,  val ", "spaced", "val"], // 两侧 trim
    ["Dr\\.whob,神经病", "Dr\\.whob", "神经病"],
  ])("%s → key=%s value=%s", (input, key, value) => {
    expect(extractKeyValue(input)).toEqual({ key, value });
    // 与真引擎交叉验证
    const parsed = parse(input);
    expect(parsed.terms[0]?.key).toBe(key);
    expect(parsed.terms[0]?.value).toBe(value);
  });

  test("非字符串输入安全", () => {
    expect(extractKeyValue(null)).toEqual({ key: "", value: "" });
    expect(extractKeyValue(undefined)).toEqual({ key: "", value: "" });
  });
});

describe("renderEntry", () => {
  test("value 为空时只写 key（不带尾逗号）", () => {
    expect(renderEntry("GPT", "")).toBe("GPT");
  });
  test("有 value 时写 key,value", () => {
    expect(renderEntry("API", "接口")).toBe("API,接口");
  });
});

describe("优先级链：custom > subscription > rule", () => {
  test("custom 胜 subscription", () => {
    const r = composeTermText("X,自定义", "X,订阅", "");
    expect(parse(r.text).terms[0].value).toBe("自定义");
    expect(r.shadowed).toHaveLength(1);
    expect(r.shadowed[0].value).toBe("订阅");
  });

  test("subscription 胜 rule", () => {
    const r = composeTermText("", "SUB,订阅值", "SUB,规则值");
    expect(parse(r.text).terms[0].value).toBe("订阅值");
    expect(r.shadowed).toHaveLength(1);
  });

  test("custom 胜 rule", () => {
    const r = composeTermText("Z,自定义", "", "Z,规则");
    expect(parse(r.text).terms[0].value).toBe("自定义");
  });

  test("三层同 key 时 custom 最终胜出", () => {
    const r = composeTermText("A,1", "A,2", "A,3");
    expect(parse(r.text).terms[0].value).toBe("1");
    // 另外两层都被记录为被覆盖
    expect(r.shadowed).toHaveLength(2);
  });
});

describe("核心不变量：同 key 首次出现来自最高优先级", () => {
  test("每 key 的首行来源正确", () => {
    const r = composeTermText("A,1;Z,1", "Z,2", "Z,3;A,3");
    const p = parse(r.text);
    expect(p.hasErrors).toBe(false);
    expect(firstKeyLine(r.text, "A")).toBe("A,1");
    expect(firstKeyLine(r.text, "Z")).toBe("Z,1");
  });

  test("originMap 的段号与 parseTerms 段数对齐", () => {
    // 【范围限定，独立审查指出】本断言仅在**输入不含非法段**时成立。
    // 若输入含被 parseTerms 丢弃的段（如空 key 的 `,v`），originMap 仍会计入它，
    // 导致索引与 parseTerms 的 segmentIndex 错位。
    // 影响：UI 若用 originMap[segmentIndex-1] 反查来源会指错行。
    // 当前 UI 未使用该反查，故无实际影响；此限制已记入
    // .anchorlaw/specs/acceptance-defect-fix.md，供后续维护者参考。
    const r = composeTermText("A,1\nB,2", "", "C,3");
    const p = parse(r.text);
    expect(r.originMap).toHaveLength(p.terms.length);
  });

  test("已知限制：含非法段时 originMap 与段号错位（记录而非缺陷）", () => {
    // 锁定当前行为，避免后续无意"修复"成其他语义而无人知晓。
    const r = composeTermText(",v", "", "");
    const p = parse(r.text);
    expect(p.terms).toHaveLength(0); // 空 key 段被 parseTerms 丢弃
    expect(r.originMap).toHaveLength(1); // 但 originMap 仍计它 → 错位
  });
});

describe("跨层覆盖不触发致命诊断（方案 A 的存在理由）", () => {
  test("跨层同 key 不同 value → hasErrors 为 false", () => {
    const r = composeTermText("Cheeta,齐塔", "", "Cheeta,猎豹");
    const p = parse(r.text);
    expect(p.hasErrors).toBe(false);
    expect(p.terms).toHaveLength(1);
    expect(p.terms[0].value).toBe("齐塔");
    const fatal = p.diagnostics.filter((d) => FATAL_DIAGNOSTIC_TYPES.has(d.type));
    expect(fatal).toHaveLength(0);
  });

  test("对照：不做预去重时该场景会是致命错误（证明预去重必要）", () => {
    const naive = "Cheeta,齐塔\nCheeta,猎豹"; // 直接拼接（等于方案 B）
    const p = parse(naive);
    expect(p.hasErrors).toBe(true);
    expect(
      p.diagnostics.some((d) => d.type === "conflicting-mapping")
    ).toBe(true);
  });
});

describe("同层冲突必须保留给引擎报出", () => {
  test("同层同 key 不同 value → 仍报 conflicting-mapping（不被静默吞掉）", () => {
    const r = composeTermText("", "", "Cheeta,齐塔;Cheeta,猎豹");
    const p = parse(r.text);
    expect(p.hasErrors).toBe(true);
    expect(p.diagnostics.some((d) => d.type === "conflicting-mapping")).toBe(
      true
    );
    expect(r.sameLayerConflicts).toHaveLength(1);
    expect(r.sameLayerConflicts[0].key).toBe("Cheeta");
  });

  test("custom 层内部冲突同样保留", () => {
    const r = composeTermText("X,1;X,2", "", "");
    const p = parse(r.text);
    expect(p.hasErrors).toBe(true);
  });
});

describe("陷阱：跨层相同 value 不记为被覆盖", () => {
  test("完全相同映射 → shadowed 为空", () => {
    const r = composeTermText("API,接口", "", "API,接口");
    expect(r.shadowed).toHaveLength(0);
    expect(parse(r.text).terms[0].value).toBe("接口");
  });

  test("不同映射 → 仍记为被覆盖", () => {
    const r = composeTermText("API,接口", "", "API,网关");
    expect(r.shadowed).toHaveLength(1);
    expect(r.shadowed[0].value).toBe("网关");
  });
});

describe("向后兼容与边界", () => {
  test("仅 rule 时输出等价于原 terms（顺序保持）", () => {
    const r = composeTermText("", "", "API,接口;APIKey,应用编程接口");
    expect(r.text).toBe("API,接口\nAPIKey,应用编程接口");
    expect(parse(r.text).terms).toHaveLength(2);
  });

  test("三层全空 → 空文本", () => {
    const r = composeTermText("", "", "");
    expect(r.text).toBe("");
    expect(r.shadowed).toHaveLength(0);
    expect(r.originMap).toHaveLength(0);
  });

  test("非字符串/undefined 输入安全", () => {
    expect(composeTermText(null, undefined, null).text).toBe("");
  });

  test("空段与多余分隔符被跳过，不影响其他段", () => {
    const r = composeTermText("A,1;;\n\nB,2", "", "");
    expect(r.text).toBe("A,1\nB,2");
  });

  test("含逗号的 key（a,b,c）在合成中保持正确", () => {
    const r = composeTermText("a,b,c", "", "");
    const p = parse(r.text);
    expect(p.terms[0].key).toBe("a,b");
    expect(p.terms[0].value).toBe("c");
  });

  test("空 value 输出为裸 key（不带尾逗号）", () => {
    const r = composeTermText("GPT", "", "");
    expect(r.text).toBe("GPT");
    // 不应产生 extra-comma 诊断
    const p = parse(r.text);
    expect(p.diagnostics.some((d) => d.type === "extra-comma")).toBe(false);
  });
});

describe("跨层覆盖不得吞掉低层的同层冲突（缺陷回归锁）", () => {
  test("高层覆盖时，低层内部的同层冲突必须被上报", () => {
    // 【实测缺陷回归锁】发现于独立验收（judge，2026-10-01）：
    // 原实现在"低层有同层冲突 + 高层也定义了同 key"时，冲突段被覆盖后整体
    // 退出文本，parseTerms 便不再报告它 —— 用户订阅源内部的损坏被静默吞掉。
    // 根因：去重循环有两条丢弃路径（"被更高层替换"与"低于当前层被丢弃"），
    // 同层冲突组可能走任意一条，只在一条上挂钩会漏。
    const r = composeTermText("X,自定义", "X,1\nX,2", "");
    const p = parse(r.text);

    // 文本里只剩高优先级的 custom（正确）
    expect(p.terms).toHaveLength(1);
    expect(p.terms[0].value).toBe("自定义");

    // 但被覆盖的订阅层冲突必须被上报出来
    expect(r.evictedSameLayerConflicts).toHaveLength(1);
    const conflict = r.evictedSameLayerConflicts[0];
    expect(conflict.key).toBe("X");
    expect(conflict.source).toBe("subscription");
    expect(conflict.values.sort()).toEqual(["1", "2"]);
  });

  test("规则层内部的同层冲突被更高层覆盖时同样上报", () => {
    const r = composeTermText("A,自定义", "", "A,1\nA,2");
    expect(r.evictedSameLayerConflicts).toHaveLength(1);
    expect(r.evictedSameLayerConflicts[0].source).toBe("rule");
  });

  test("无覆盖时仍由 parseTerms 正常报出，不重复计入 evicted", () => {
    const r = composeTermText("", "X,1\nX,2", "");
    const p = parse(r.text);
    expect(p.hasErrors).toBe(true);
    // 该冲突已由 parseTerms 报告，不应再进 evictedSameLayerConflicts
    expect(r.evictedSameLayerConflicts).toHaveLength(0);
  });

  test("普通跨层覆盖（低层无冲突）不产生误报", () => {
    const r = composeTermText("X,自定义", "X,订阅", "");
    expect(r.evictedSameLayerConflicts).toHaveLength(0);
  });

  test("低层同 key 相同值（重复而非冲突）不产生误报", () => {
    const r = composeTermText("X,自定义", "X,同名\nX,同名", "");
    expect(r.evictedSameLayerConflicts).toHaveLength(0);
  });
});

describe("composeAndValidate", () => {
  test("返回致命诊断列表（跨层覆盖时为空）", () => {
    const v = composeAndValidate("Cheeta,齐塔", "", "Cheeta,猎豹", parseTerms);
    expect(v.fatalDiagnostics).toHaveLength(0);
    expect(v.parsed.hasErrors).toBe(false);
    expect(v.shadowed).toHaveLength(1);
  });

  test("同层冲突时列出致命诊断", () => {
    const v = composeAndValidate("", "", "X,1;X,2", parseTerms);
    expect(v.fatalDiagnostics.length).toBeGreaterThan(0);
  });
});
