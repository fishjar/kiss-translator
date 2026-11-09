// 焦点环治理双闸：
// 闸一——M3_GLOBAL_CSS 必须内置"脚本化聚焦抑制"规则，覆盖菜单项家族全部角色；
// 闸二——下拉/菜单表面文件不得再出现裸 .focus(，脚本化聚焦一律经
//        hooks/focusModality.js 的 scriptFocus()（全仓唯一允许点）。
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { FOCUS_SILENT_CSS, M3_GLOBAL_CSS } from "./m3";

const SRC = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([
  "node_modules",
  "build",
  ".git",
  ".kilo",
  "coverage",
  "public",
  "testdata",
  "tmp",
]);
// 下拉/菜单表面：这些文件会在开合菜单时移动焦点，必须走 scriptFocus()。
const MENU_SURFACES = [
  path.join("views", "Options", "DropdownRoot.js"),
  path.join("views", "Options", "AddServiceMenu.js"),
  path.join("views", "Action", "ContentFab.js"),
  path.join("views", "Popup", "PopupCont.js"),
  path.join("components", "TranslationPanel", "Header.js"),
  path.join("subtitle", "youtubePlayerUi.js"),
];

const productionFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory())
      return SKIP_DIRS.has(entry) ? [] : productionFiles(full);
    if (!/\.jsx?$/.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });

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

describe("focus modality wiring gate", () => {
  const M3_THEME = readFileSync(path.join(SRC, "hooks", "M3Theme.js"), "utf8");

  test("M3Theme root installs focus modality on its ownerDocument", () => {
    expect(M3_THEME).toContain("installFocusModality");
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
      /'&\.Mui-focused:has\(\.MuiSelect-select\[aria-expanded="true"\]\)':\s*\{[\s\S]*?\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain('borderColor: "transparent"');
  });

  test("pointer-silence suppression key keeps the filled background", () => {
    // 防回归断言：压制边框的同时必须压住聚焦换底色，字段不得隐没。
    const block = M3_THEME.match(
      /'&\.Mui-focused:has\(\.MuiSelect-select\[data-kt-focus-silent="true"\]\)':\s*\{[\s\S]*?\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("backgroundColor: color.surfaceContainer");
  });

  test("open-state suppression key keeps the filled background", () => {
    const block = M3_THEME.match(
      /'&\.Mui-focused:has\(\.MuiSelect-select\[aria-expanded="true"\]\)':\s*\{[\s\S]*?\}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("backgroundColor: color.surfaceContainer");
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
    expect(M3_THEME).toContain('&.Mui-selected[role="menuitemcheckbox"]:hover');
    expect(M3_THEME).toContain('[aria-multiselectable="true"] &.Mui-selected');
    // 闸序断言（承接现行用例形态）：去染色闸须排在纯染色基线键的 hover
    // 变体之后——同特异性靠源码顺序压制。
    expect(
      M3_THEME.indexOf('&.Mui-selected[role="menuitemcheckbox"]')
    ).toBeGreaterThan(M3_THEME.indexOf('"&.Mui-selected:hover"'));
  });

  test("FileTranslate domain wires focus silence (State.js gate)", () => {
    const state = readFileSync(
      path.join(SRC, "views", "FileTranslate", "State.js"),
      "utf8"
    );
    // 域内必须安装模态监听（唯一挂载点缺口的回归锁）。
    expect(state).toContain("installFocusModality");
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
});

describe("handwritten menu items paint inset rings", () => {
  const TRANBOX = readFileSync(
    path.join(SRC, "components", "TranslationPanel", "styles.js"),
    "utf8"
  );
  const SUBTITLE = readFileSync(path.join(SRC, "subtitle", "Menus.js"), "utf8");

  test("tranbox header menu uses an inset ring", () => {
    expect(TRANBOX).toContain(
      ".kt-tranbox-header__menu button:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--kt-pri); }"
    );
    expect(TRANBOX).toContain(
      ".kt-tranbox-header__menu button:focus-visible { outline: 3px solid; outline-offset: -3px; box-shadow: none; }"
    );
  });

  test("subtitle menus carry an inset ring plus the silent-focus suppression", () => {
    expect(SUBTITLE).toContain("box-shadow: inset 0 0 0 3px #b8e0fa");
    // 单源锁：字幕域消费 FOCUS_SILENT_CSS 字面量（单源常量），不含内联复刻抑制段。
    expect(SUBTITLE).toContain("FOCUS_SILENT_CSS");
    expect(SUBTITLE).not.toContain(
      '[data-kt-focus-silent="true"][role="option"]:focus-visible,[data-kt-focus-silent="true"][role="menuitem"]:focus-visible'
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

describe("menu surfaces must not call focus directly", () => {
  test.each(MENU_SURFACES)(
    "%s routes focus through scriptFocus()",
    (relative) => {
      const text = readFileSync(path.join(SRC, relative), "utf8");
      expect(text).toContain("scriptFocus(");
      expect(text).not.toMatch(/\.focus\(/);
    }
  );

  test("focusModality.js is the only production caller of .focus(", () => {
    const offenders = productionFiles(SRC)
      .filter(
        (file) =>
          !file.endsWith(path.join("hooks", "focusModality.js")) &&
          /\.focus\(/.test(readFileSync(file, "utf8"))
      )
      .map((file) => path.relative(SRC, file));
    // 豁免范围：纯键盘处理器内的聚焦（此刻模态必为键盘，环本应出现）、
    // 文本框聚焦（输入框恒有环）与工具栏/抽屉等非菜单面控件的程序化回焦
    // （TocDrawer/TextareResizeGrip/PdfWorkspace 同类）。名单只允许因上游
    // dev 新文件而增长（每条须注明来源），不得因本仓新增菜单面而增长；
    // toEqual 已逐名一致锁定，同时钉数量与内容。
    expect(offenders.sort()).toEqual(
      [
        path.join("components", "TextareaResizeGrip.js"),
        path.join("hooks", "useTranboxFocus.js"),
        path.join("libs", "imageTranslate", "screenshotOverlay.js"),
        path.join("libs", "inputTranslate.js"),
        path.join("libs", "menuFocus.js"),
        path.join("libs", "shadowHost.js"),
        path.join("libs", "translator.js"),
        path.join("views", "Action", "index.js"),
        path.join("views", "FileTranslate", "PdfWorkspace.js"),
        path.join("views", "FileTranslate", "TocDrawer.js"),
        path.join("views", "Options", "Layout.js"),
        path.join("views", "Options", "Prompts.js"),
        path.join("views", "Options", "SettingsCard.js"),
        path.join("views", "Options", "SettingsSearchTarget.js"),
        path.join("views", "Options", "ShortcutInput.js"),
        path.join("views", "Options", "SubtitleSegmentationPlayground.js"),
        path.join("views", "Options", "SyncSetting.js"),
        path.join("views", "Popup", "PopupTextPanel.js"),
        path.join("views", "Popup", "index.js"),
        path.join("views", "Selection", "TranForm.js"),
      ].sort()
    );
  });
});

describe("focus rings bind :focus-visible (no .Mui-focusVisible ring keys)", () => {
  const RING_SOURCES = [
    path.join("hooks", "M3Theme.js"),
    path.join("views", "FileTranslate", "State.js"),
    path.join("views", "RuleEditor", "index.js"),
    path.join("views", "Options", "styles.js"),
    path.join("components", "FloatingButton.styles.js"),
    path.join("components", "TranslationPanel", "styles.js"),
  ];

  test("no self-authored focus ring or state layer binds the input-agnostic .Mui-focusVisible class", () => {
    for (const relative of RING_SOURCES) {
      const text = readFileSync(path.join(SRC, relative), "utf8");
      expect(text).not.toContain(".Mui-focusVisible");
    }
  });
});
