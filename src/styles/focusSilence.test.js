// 焦点环治理闸·基座层：M3_GLOBAL_CSS 必须内置"脚本化聚焦抑制"规则，
// 覆盖菜单项家族全部角色，且抑制段作为单源常量排在最后一个
// @supports selector(:focus-visible) 块之后。
// 模态接线闸与调用点闸分别由 focusSilence.modality.test.js（焦点模态层）
// 与 focusSilence.callSites.test.js（调用点接线层）兑现，不在此声明。
import { FOCUS_SILENT_CSS, M3_GLOBAL_CSS } from "./m3";

describe("scripted focus suppression", () => {
  const SILENT = '[data-kt-focus-silent="true"]';

  test("ships a suppression rule for the silent-focus attribute", () => {
    expect(M3_GLOBAL_CSS).toContain(`${SILENT}:focus-visible`);
  });

  test("suppresses the inset ring on every focusable role family", () => {
    for (const role of [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="switch"]',
      ".MuiMenuItem-root",
    ]) {
      expect(M3_GLOBAL_CSS).toContain(`${SILENT}${role}:focus-visible`);
    }
    const block = M3_GLOBAL_CSS.match(
      /\[data-kt-focus-silent="true"\]\[role="option"\]:focus-visible[\s\S]*?\{[^}]*\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("outline: none !important");
    expect(block).toContain("box-shadow: none !important");
  });

  test("keeps the suppression after the last :focus-visible support block", () => {
    expect(
      M3_GLOBAL_CSS.indexOf("@supports selector(:focus-visible) {")
    ).toBeGreaterThan(-1);
    expect(M3_GLOBAL_CSS.indexOf(`${SILENT}:focus-visible`)).toBeGreaterThan(
      M3_GLOBAL_CSS.lastIndexOf("@supports selector(:focus-visible) {")
    );
  });
});

describe("FOCUS_SILENT_CSS single-source lock", () => {
  test("M3_GLOBAL_CSS contains FOCUS_SILENT_CSS body and inserts after last @supports :focus-visible block", () => {
    // 单源锁：M3_GLOBAL_CSS 含 FOCUS_SILENT_CSS 本体，
    // 其插入位在最后一个 @supports selector(:focus-visible) 块之后（顺序断言）。
    expect(M3_GLOBAL_CSS).toContain(FOCUS_SILENT_CSS);
    const supportsIdx = M3_GLOBAL_CSS.lastIndexOf(
      "@supports selector(:focus-visible)"
    );
    const silentIdx = M3_GLOBAL_CSS.indexOf(FOCUS_SILENT_CSS);
    expect(silentIdx).toBeGreaterThan(supportsIdx);
  });
});
