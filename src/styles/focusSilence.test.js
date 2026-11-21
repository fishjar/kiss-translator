import { FOCUS_SILENT_CSS, M3_GLOBAL_CSS } from "./m3";

describe("FOCUS_SILENT_CSS single-source lock", () => {
  test("FOCUS_SILENT_CSS is exported as a non-empty string", () => {
    expect(typeof FOCUS_SILENT_CSS).toBe("string");
    expect(FOCUS_SILENT_CSS.length).toBeGreaterThan(0);
  });

  test("FOCUS_SILENT_CSS contains the focus-silent attribute selector", () => {
    expect(FOCUS_SILENT_CSS).toContain('[data-kt-focus-silent="true"]');
    expect(FOCUS_SILENT_CSS).toContain(":focus-visible");
  });

  test("FOCUS_SILENT_CSS covers menuitem family roles", () => {
    expect(FOCUS_SILENT_CSS).toContain('[role="option"]');
    expect(FOCUS_SILENT_CSS).toContain('[role="menuitem"]');
    expect(FOCUS_SILENT_CSS).toContain('[role="menuitemcheckbox"]');
    expect(FOCUS_SILENT_CSS).toContain('[role="menuitemradio"]');
    expect(FOCUS_SILENT_CSS).toContain('[role="switch"]');
    expect(FOCUS_SILENT_CSS).toContain(".MuiMenuItem-root");
  });

  test("FOCUS_SILENT_CSS suppresses outline and box-shadow", () => {
    expect(FOCUS_SILENT_CSS).toContain("outline: none !important");
    expect(FOCUS_SILENT_CSS).toContain("box-shadow: none !important");
  });

  test("FOCUS_SILENT_CSS carries a :focus fallback for engines without :focus-visible", () => {
    // 兜底块必须在 @supports not selector(:focus-visible) 门内且改走 :focus；
    // 键盘语境不破环依赖 focusModality 键盘模态切入时清除静默标记的既有行为
    expect(FOCUS_SILENT_CSS).toContain(
      "@supports not selector(:focus-visible)"
    );
    expect(FOCUS_SILENT_CSS).toMatch(
      /\[data-kt-focus-silent="true"\]:focus \{/
    );
    expect(FOCUS_SILENT_CSS).toMatch(
      /\[data-kt-focus-silent="true"\]\[role="option"\]:focus/
    );
  });

  test("M3_GLOBAL_CSS interpolates FOCUS_SILENT_CSS", () => {
    // M3_GLOBAL_CSS must contain the focus-silent attribute selector
    // (interpolated from FOCUS_SILENT_CSS)
    expect(M3_GLOBAL_CSS).toContain('[data-kt-focus-silent="true"]');
    expect(M3_GLOBAL_CSS).toContain(":focus-visible");
    expect(M3_GLOBAL_CSS).toContain("outline: none !important");
  });

  test("FOCUS_SILENT_CSS is placed after resize-grip @supports block", () => {
    // The focus-silent rules must come after the resize-grip @supports block
    // to ensure correct cascade order (same specificity, source order wins)
    const resizeGripPos = M3_GLOBAL_CSS.indexOf(
      ".kt-resize-grip:focus-visible"
    );
    const focusSilentPos = M3_GLOBAL_CSS.indexOf(
      '[data-kt-focus-silent="true"]'
    );
    expect(resizeGripPos).toBeGreaterThan(-1);
    expect(focusSilentPos).toBeGreaterThan(-1);
    expect(focusSilentPos).toBeGreaterThan(resizeGripPos);
  });
});
