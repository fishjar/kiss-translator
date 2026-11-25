// 焦点环治理闸·模态接线层：M3Theme 根须安装焦点模态，FilledInput 的
// focused 基线与两种抑制半闸（指针静默 / aria-expanded 展开态）在场且
// 保底色；多选去染色双闸须真实命中行载体并保持闸序；FileTranslate 域
// 走模态单源注入。本闸断言的实现在焦点模态提交中兑现，晚于基座规则闸。
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "fs";
import path from "path";
import { FOCUS_SILENT_CSS, M3_GLOBAL_CSS } from "./m3";
import { FileTranslationProvider } from "../views/FileTranslate/State";

// 桩形态经 jest.mock 工厂闭包注入：Provider 挂载期的 client 接线在 jsdom
// 内不建立真实连接，本闸只核作用域挂载行为。
const mockClientInstance = {
  connect: () => {},
  request: () => Promise.resolve({}),
  subscribe: () => () => {},
  dispose: () => {},
};

jest.mock("../fileTranslation/client", () => {
  const actual = jest.requireActual("../fileTranslation/client");
  return { ...actual, getFileClient: () => mockClientInstance };
});

const SRC = path.resolve(__dirname, "..");

describe("focus modality wiring gate", () => {
  const M3_THEME = readFileSync(path.join(SRC, "hooks", "M3Theme.js"), "utf8");
  const FOCUS_MODALITY_SRC = readFileSync(
    path.join(SRC, "hooks", "focusModality.js"),
    "utf8"
  );

  test("M3Theme root installs focus modality on its ownerDocument", () => {
    expect(M3_THEME).toContain("retainFocusModality");
  });

  test("M3Theme root releases focus modality when its last instance unmounts", () => {
    expect(M3_THEME).toContain("releaseFocusModality");
    expect(FOCUS_MODALITY_SRC).toContain("uninstallFocusModality");
  });

  test("MuiFilledInput keeps the focused baseline border", () => {
    const block = M3_THEME.match(/"&\.Mui-focused":\s*\{[\s\S]*?\}/)?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("borderColor");
  });

  test("MuiFocused baseline gains the pointer-silence suppression half", () => {
    expect(M3_THEME).toContain(
      '&.Mui-focused:has(.MuiSelect-select[data-kt-focus-silent="true"])'
    );
  });

  test("MuiFocused baseline gains the open-state (aria-expanded) suppression half", () => {
    // 菜单展开期间焦点移到菜单项，字段边框全模态让位：aria-expanded 由 MUI
    // 恒定管理，打开期 "true" 命中透明边框，关闭期回 "false" 不命中。
    const block = M3_THEME.match(
      /'&\.Mui-focused:has\(\.MuiSelect-select\[aria-expanded="true"\]\)(?::not\(\.Mui-error\))?\':\s*\{[\s\S]*?\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain('borderColor: "transparent"');
  });

  test("pointer-silence suppression key keeps the filled background", () => {
    // 防回归断言：压制边框的同时必须压住聚焦换底色，字段不得隐没。
    const block = M3_THEME.match(
      /'&\.Mui-focused:has\(\.MuiSelect-select\[data-kt-focus-silent="true"\]\)(?::not\(\.Mui-error\))?\':\s*\{[\s\S]*?\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("backgroundColor: color.surfaceContainer");
  });

  test("open-state suppression key keeps the filled background", () => {
    const block = M3_THEME.match(
      /'&\.Mui-focused:has\(\.MuiSelect-select\[aria-expanded="true"\]\)(?::not\(\.Mui-error\))?\':\s*\{[\s\S]*?\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("backgroundColor: color.surfaceContainer");
  });

  test("both suppression halves stand down while the field is in error state", () => {
    // 特异度账：两条静默规则 (0,4,0) 压过 &.Mui-error.Mui-focused (0,3,0)，
    // 不带 :not(.Mui-error) 时错误描边会被透明覆盖，校验信号消失。
    expect(M3_THEME).toContain(
      '&.Mui-focused:has(.MuiSelect-select[data-kt-focus-silent="true"]):not(.Mui-error)'
    );
    expect(M3_THEME).toContain(
      '&.Mui-focused:has(.MuiSelect-select[aria-expanded="true"]):not(.Mui-error)'
    );
  });

  test("multi-select rows opt out of the selected fill (hit semantics)", () => {
    // 多选去染色闸结构校验（命中语义版）：闸选择器必须真实命中行载体，
    // 而非仅字面量在场。双轨断言——①源码定点 includes（两条闸键＋hover 变体）；
    // ②由两条闸选择器手工换算出的两条具体选择器，对 jsdom
    // 三类行载体做 matches()。任一轨失败即红，不做任何正则盲提。
    document.body.innerHTML = `
      <div role="menu">
        <div class="MuiMenuItem-root Mui-selected" role="menuitemcheckbox"></div>
      </div>
      <div role="listbox" aria-multiselectable="true">
        <div class="MuiMenuItem-root Mui-selected" role="option"></div>
      </div>
      <div role="listbox">
        <div class="MuiMenuItem-root Mui-selected" role="option"></div>
      </div>`;
    // 闸① '&.Mui-selected[role="menuitemcheckbox"]' 换算形态。
    const gateA = '.MuiMenuItem-root.Mui-selected[role="menuitemcheckbox"]';
    // 闸② '[aria-multiselectable="true"] &.Mui-selected' 换算形态。
    const gateB =
      '[aria-multiselectable="true"] .MuiMenuItem-root.Mui-selected';
    // 闸① 多选 checkbox 行（menu 容器）仍被命中——不得回归。
    expect(
      document.querySelector('[role="menuitemcheckbox"]').matches(gateA)
    ).toBe(true);
    // 闸② MUI multiple Select 的 listbox 多选行（role=option + 容器
    // aria-multiselectable）必须被命中。
    expect(
      document
        .querySelector('[aria-multiselectable="true"] [role="option"]')
        .matches(gateB)
    ).toBe(true);
    // 单选 listbox 行（容器无 aria-multiselectable）不得被任一闸命中——染色保留。
    const solo = document.querySelector(
      'div[role="listbox"]:not([aria-multiselectable]) [role="option"]'
    );
    expect(solo.matches(gateA)).toBe(false);
    expect(solo.matches(gateB)).toBe(false);
  });

  test("multi-select opt-out gate keeps key shapes, hover pairing and gate order", () => {
    // 源码形态闸：两条闸键与 hover 变体逐字在场。
    expect(M3_THEME).toContain('&.Mui-selected[role="menuitemcheckbox"]');
    expect(M3_THEME).toContain(
      '&&.Mui-selected[role="menuitemcheckbox"]:hover'
    );
    expect(M3_THEME).toContain('[aria-multiselectable="true"] &.Mui-selected');
    // 闸序断言（承接现行用例形态）：去染色闸须排在纯染色基线键的 hover
    // 变体之后——同特异性靠源码顺序压制。基线缺失时 indexOf 为 -1，
    // 直接比较会空真，先钉基线锚点在场再比序。
    const baselineAt = M3_THEME.indexOf('"&.Mui-selected:hover"');
    expect(baselineAt).toBeGreaterThanOrEqual(0);
    expect(
      M3_THEME.indexOf('&.Mui-selected[role="menuitemcheckbox"]')
    ).toBeGreaterThan(baselineAt);
  });

  test("multi-select focus State-Layer overlays are gated to keyboard modality", () => {
    expect(M3_THEME).toContain(
      '&&.Mui-selected[role="menuitemcheckbox"]:focus-visible:not([data-kt-focus-silent="true"])'
    );
    expect(M3_THEME).toContain(
      '[aria-multiselectable="true"] &&.Mui-selected:focus-visible:not([data-kt-focus-silent="true"])'
    );
    expect(M3_THEME).toContain(
      '&&:focus-visible:not([data-kt-focus-silent="true"])'
    );
    const checkboxOverlay = M3_THEME.match(
      /'&&\.Mui-selected\[role="menuitemcheckbox"\]:focus-visible:not\(\[data-kt-focus-silent="true"\]\)':\s*\{(?:[^{}]|\{[^}]*\})*\}/
    )?.[0];
    expect(checkboxOverlay).toBeDefined();
    expect(checkboxOverlay).toContain("currentColor 12%");
    expect(checkboxOverlay).toContain("inset 0 0 0 3px");
  });

  test("single-select selected focus fill is preserved and not silent-gated", () => {
    const singleSelFocus = M3_THEME.match(
      /"&&\.Mui-selected:focus-visible":\s*\{\s*outline: "none",(?:[^{}]|\{[^}]*\})*?\}/
    )?.[0];
    expect(singleSelFocus).toBeDefined();
    expect(singleSelFocus).toContain("secondaryContainer");
    expect(singleSelFocus).not.toContain("data-kt-focus-silent");
  });

  test("multi-select hover overlay is never silent-gated", () => {
    const msSelectedHover = M3_THEME.match(
      /'\[aria-multiselectable="true"\] &&\.Mui-selected:hover':\s*\{[^}]*\}/
    )?.[0];
    expect(msSelectedHover).toBeDefined();
    expect(msSelectedHover).toContain("currentColor 8%");
    expect(msSelectedHover).not.toContain("data-kt-focus-silent");
    expect(M3_THEME).toContain('"&:hover"');
  });

  test("silent-gated multiselect overlay distinguishes pointer vs keyboard on the carrier", () => {
    document.body.innerHTML = `
      <div role="listbox" aria-multiselectable="true">
        <div class="MuiMenuItem-root Mui-selected" role="option" data-kt-focus-silent="true"></div>
        <div class="MuiMenuItem-root Mui-selected" role="option"></div>
      </div>`;
    const overlay =
      '[aria-multiselectable="true"] .MuiMenuItem-root.Mui-selected:not([data-kt-focus-silent="true"])';
    const rows = document.querySelectorAll(
      '[aria-multiselectable="true"] [role="option"]'
    );
    expect(rows[0].matches(overlay)).toBe(false);
    expect(rows[1].matches(overlay)).toBe(true);
  });

  test("pointer-silent selected multiselect rows fall to transparent base, not the single-select fill", () => {
    // :not 摘除 12% 叠色后，单选 &&.Mui-selected:focus-visible
    // (0,4,0) 会把选中多选行压成 secondaryContainer 实心。两条命中"静默标记
    // 在场"的更高特异度 (0,7,0，含 :not(:hover)) 让位键须存在且把背景压回透明，
    // 且不含选中实底。
    expect(M3_THEME).toContain(
      '&&.Mui-selected[role="menuitemcheckbox"]:focus-visible[data-kt-focus-silent="true"]:not(:hover)'
    );
    expect(M3_THEME).toContain(
      '[aria-multiselectable="true"] &&.Mui-selected:focus-visible[data-kt-focus-silent="true"]:not(:hover)'
    );
    const checkboxSilent = M3_THEME.match(
      /'&&\.Mui-selected\[role="menuitemcheckbox"\]:focus-visible\[data-kt-focus-silent="true"\]:not\(:hover\)':\s*\{(?:[^{}]|\{[^}]*\})*?\}/
    )?.[0];
    expect(checkboxSilent).toBeDefined();
    expect(checkboxSilent).toContain('backgroundColor: "transparent"');
    expect(checkboxSilent).not.toContain("secondaryContainer");
    const optionSilent = M3_THEME.match(
      /'\[aria-multiselectable="true"\] &&\.Mui-selected:focus-visible\[data-kt-focus-silent="true"\]:not\(:hover\)':\s*\{(?:[^{}]|\{[^}]*\})*?\}/
    )?.[0];
    expect(optionSilent).toBeDefined();
    expect(optionSilent).toContain('backgroundColor: "transparent"');
    // jsdom 命中语义：静默+选中行命中让位键（落透明），键盘+选中行不命中
    // （保留上条 12% 叠色 + inset 环）。
    document.body.innerHTML = `
      <div role="listbox" aria-multiselectable="true">
        <div class="MuiMenuItem-root Mui-selected" role="option" data-kt-focus-silent="true"></div>
        <div class="MuiMenuItem-root Mui-selected" role="option"></div>
      </div>`;
    const fallback =
      '[aria-multiselectable="true"] .MuiMenuItem-root.Mui-selected[data-kt-focus-silent="true"]';
    const rows = document.querySelectorAll(
      '[aria-multiselectable="true"] [role="option"]'
    );
    expect(rows[0].matches(fallback)).toBe(true);
    expect(rows[1].matches(fallback)).toBe(false);
  });

  test("pointer-silent selected multiselect rows keep 8% hover feedback", () => {
    // 鼠标打开后再主动悬停末个选中行：让位键须用 :not(:hover) 在悬停时退场，
    // 多选选中 hover 键须用 && 抬到 (0,5,0) 压过单选 secondaryContainer 实心
    // (0,4,0)，让悬停显 8% State Layer 而非实心/透明。
    const cbSelHover = M3_THEME.match(
      /'&&\.Mui-selected\[role="menuitemcheckbox"\]:hover':\s*\{[^}]*\}/
    )?.[0];
    expect(cbSelHover).toBeDefined();
    expect(cbSelHover).toContain("currentColor 8%");
    expect(cbSelHover).not.toContain("data-kt-focus-silent");
    const optSelHover = M3_THEME.match(
      /'\[aria-multiselectable="true"\] &&\.Mui-selected:hover':\s*\{[^}]*\}/
    )?.[0];
    expect(optSelHover).toBeDefined();
    expect(optSelHover).toContain("currentColor 8%");
    expect(optSelHover).not.toContain("data-kt-focus-silent");
  });

  test("FileTranslate domain wires focus silence (State.js gate)", () => {
    const state = readFileSync(
      path.join(SRC, "views", "FileTranslate", "State.js"),
      "utf8"
    );
    // 域内必须通过共享持有计数安装模态监听（唯一挂载点缺口的回归锁）。
    expect(state).toContain("retainFocusModality");
    expect(state).toContain("releaseFocusModality");
    // 域内必须注入抑制规则单源导出（不得域内复刻第二份规则串）。
    expect(state).toContain("FOCUS_SILENT_CSS");
    expect(state.indexOf("FOCUS_SILENT_CSS")).toBeGreaterThan(-1);
    // 单源守恒：M3_GLOBAL_CSS 必须含 FOCUS_SILENT_CSS 本体而非复刻。
    expect(M3_GLOBAL_CSS).toContain(FOCUS_SILENT_CSS);
    // 作用域闸回归锁：State.js 必须把 kt-focus-silent-scope 挂到
    // document.body（isExtensionUiEvent 的命中凭据；MUI Portal 内容祖先链
    // 只到 body，#root 内 wrapper 无法命中 Portal 菜单项），且严禁改挂
    // .kt-m3-root（m3.js 根规则会整体注入本域）、严禁恢复 #root 内
    // wrapper 形态（Portal 逃逸缺陷的旧根因）。
    expect(state).toContain('classList.add("kt-focus-silent-scope")');
    expect(state).not.toContain('className="kt-m3-root"');
    expect(state).not.toContain('className="kt-focus-silent-scope"');
  });

  test("the silent scope lands on document.body after mounting the provider", () => {
    // 行为断言：作用域确实挂在 document.body 上（而非其他元素），挂载
    // 即在场、卸载即移除——与源码形态闸双保险。
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => {
        root.render(
          <FileTranslationProvider>
            <div />
          </FileTranslationProvider>
        );
      });
      expect(document.body.classList.contains("kt-focus-silent-scope")).toBe(
        true
      );
      act(() => root.unmount());
      expect(document.body.classList.contains("kt-focus-silent-scope")).toBe(
        false
      );
    } finally {
      container.remove();
    }
  });
});
