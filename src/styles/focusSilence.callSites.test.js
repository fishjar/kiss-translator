// 焦点环治理闸·调用点接线层：下拉/菜单表面文件不得再出现裸 .focus(，
// 脚本化聚焦一律经 hooks/focusModality.js 的 scriptFocus()（全仓唯一
// 允许点，offenders 白名单钉数量与内容）；手写菜单面自带 inset 环与
// 抑制单源；自研焦点环一律绑 :focus-visible，不得回带
// .Mui-focusVisible 键。本闸断言的实现在调用点接线提交中兑现。
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

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
