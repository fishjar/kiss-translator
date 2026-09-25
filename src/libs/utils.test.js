import { parseAITerms } from "./utils";
import { parseTerms } from "./terms";

// parseAITerms 纯函数单元测试（Task 1）
// 目标：锁定现状（含与 parseTerms 的既定差异）为预期行为，不改解析语义。
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

  test("comma semantics: key is text before FIRST comma, extra segments are silently dropped", () => {
    // "a,b,c" -> key "a", value "b", the trailing ",c" is dropped (contrast with parseTerms lastIndexOf)
    expect(parseAITerms("a,b,c")).toEqual({ a: "b" });
    expect(parseAITerms("a,b,c\nd,e,f")).toEqual({ a: "b", d: "e" });
  });

  test("comma-in-key differs from parseTerms: AI uses split(',') first-comma, local uses lastIndexOf", () => {
    // AI terms: key cannot contain a comma (first comma separates, trailing dropped)
    expect(parseAITerms("a,b,c")).toEqual({ a: "b" });
    // Local terms: key CAN contain a comma (lastIndexOf splits at the last comma)
    const { terms } = parseTerms("a,b,c");
    expect(terms[0].key).toBe("a,b");
    expect(terms[0].value).toBe("c");
  });

  test("last-wins dedup: later entry overwrites earlier same key (Object.fromEntries)", () => {
    expect(parseAITerms("a,1\na,2")).toEqual({ a: "2" });
    expect(parseAITerms("a,1;a,2")).toEqual({ a: "2" });
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
});
