import { describe, expect, it } from "vitest";
import { hasNewFnCaller, patchCspCode } from "../../patchOpencvCsp";

describe("Local AI CSP asset patch", () => {
  it("匹配并替换含 $ 的压缩变量名（如 Hi(Function,$A).apply(null,tI)）", () => {
    const snippet = `var dI=Hi(Function,$A).apply(null,tI);return dI;`;
    expect(hasNewFnCaller(snippet)).toBe(true);
    const patched = patchCspCode(snippet);
    expect(patched).not.toContain("Hi(Function,$A)");
    expect(patched).toContain("})($A,tI)");
  });

  it("匹配并替换含 $ 的 METHOD_CALLER_RE（new Function(Object.keys($A), $B)）", () => {
    const snippet = `return new Function(Object.keys($A), $B)(...Object.values($A));`;
    const patched = patchCspCode(snippet);
    expect(patched).not.toContain("new Function(");
    expect(patched).toContain("})($A,$B)");
  });
});
