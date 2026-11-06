import { parseAITerms } from "./utils";
import { parseTerms } from "./terms";

// parseAITerms 纯函数单元测试
// 目标：锁定修复后的目标语义（首个逗号分隔、重复 key 先出现者优先），
// 并回归既有不变式（行分隔符、空 key 过滤、空值、trim、非字符串输入）。
describe("parseAITerms", () => {
  test("empty string and non-string input return {}", () => {
    expect(parseAITerms("")).toEqual({});
    expect(parseAITerms("   ")).toEqual({});
    expect(parseAITerms(null)).toEqual({});
    expect(parseAITerms(undefined)).toEqual({});
    expect(parseAITerms(123)).toEqual({});
    expect(parseAITerms({})).toEqual({});
  });

  test("splits entries by newline and semicolon", () => {
    expect(
      parseAITerms("API,接口\nGPTs,智能体集合;React,React Native")
    ).toEqual({
      API: "接口",
      GPTs: "智能体集合",
      React: "React Native",
    });
  });

  test("comma semantics: key is text before FIRST comma, everything after it (incl. commas) is the value", () => {
    // "a,b,c" -> key "a", value "b,c" (the first comma separates; contrast with parseTerms lastIndexOf)
    expect(parseAITerms("a,b,c")).toEqual({ a: "b,c" });
    expect(parseAITerms("a,b,c\nd,e,f")).toEqual({ a: "b,c", d: "e,f" });
    expect(parseAITerms("API,接口,应用程序接口")).toEqual({
      API: "接口,应用程序接口",
    });
  });

  test("value-with-comma differs from parseTerms: AI keeps text after first comma, local splits at lastIndexOf", () => {
    // AI terms: value keeps everything after the first comma
    expect(parseAITerms("a,b,c")).toEqual({ a: "b,c" });
    // Local terms: key CAN contain a comma (lastIndexOf splits at the last comma)
    const { terms } = parseTerms("a,b,c");
    expect(terms[0].key).toBe("a,b");
    expect(terms[0].value).toBe("c");
  });

  test("first-wins dedup: later duplicate entries with the same key are silently ignored", () => {
    expect(parseAITerms("a,1\na,2")).toEqual({ a: "1" });
    expect(parseAITerms("a,1;a,2")).toEqual({ a: "1" });
    expect(parseAITerms("a,1\na,2\na,3")).toEqual({ a: "1" });
    expect(parseAITerms("a,1\nb,2;a,3")).toEqual({ a: "1", b: "2" });
  });

  test("does no regex validation, no sorting, and produces no diagnostics (contrast with parseTerms)", () => {
    // Invalid regex key "bad[re" is accepted as-is by parseAITerms
    expect(parseAITerms("bad[re,value")).toEqual({ "bad[re": "value" });
    // parseTerms flags it as invalid
    const { invalid } = parseTerms("bad[re,value");
    expect(invalid).toHaveLength(1);

    // No sorting: parseAITerms preserves nothing (object), parseTerms length-sorts
    const parsed = parseAITerms("APIKey,x\nAPI,y");
    expect(parsed).toEqual({ APIKey: "x", API: "y" });
  });

  test("empty key lines are filtered out", () => {
    expect(parseAITerms("a,1\n,value\nb,2")).toEqual({ a: "1", b: "2" });
    expect(parseAITerms(",value")).toEqual({});
  });

  test("regression invariants: no-comma lines, empty values, segment trimming", () => {
    expect(parseAITerms("solo")).toEqual({ solo: "" });
    expect(parseAITerms("a,")).toEqual({ a: "" });
    expect(parseAITerms("  a  ,  b  ")).toEqual({ a: "b" });
    expect(parseAITerms("  API  ,  接口  ,  备注  ")).toEqual({
      API: "接口  ,  备注",
    });
    expect(parseAITerms("__proto__,x")).toEqual({ ["__proto__"]: "x" });
    expect(parseAITerms("a,1\n  \nb,2")).toEqual({ a: "1", b: "2" });
    expect(parseAITerms("a,1\r\nb,2")).toEqual({ a: "1", b: "2" });
  });
});
