// Generate src/components/icons/lucide/index.js and src/components/icons/index.js from lucide-static (icons/*.svg).
// Usage: node src/scripts/gen-lucide-icons.mjs — re-run to re-sync after upgrading lucide-static.
// Hard-fails (exit 1, listing icon names) on: missing svg file, unexpected viewBox, or a glyph with
// zero shape children. Unlike MD3, any number/combination of path/circle/line/polyline/polygon/rect is allowed.
// All top-level icon bindings carry /*#__PURE__*/ (both files) so bundlers can drop unused icons per entry.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 以脚本自身位置锚定仓库根目录：从任意工作目录运行都能读到 lucide-static，
// 并把产物写回 src/components/icons/ 内的正确位置。
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..", "..");
const PKG_DIR = path.join(ROOT_DIR, "node_modules/lucide-static/icons");
const OUT_FILE = path.join(ROOT_DIR, "src/components/icons/lucide/index.js");
const DISPATCHER_FILE = path.join(ROOT_DIR, "src/components/icons/index.js");
const MASK_GLYPHS_FILE = path.join(ROOT_DIR, "src/components/icons/maskGlyphs.js");

export const MAPPING = {
  Add: "plus",
  AddRounded: "plus",                         // 新增：Add 的 Rounded 变体
  AdsClick: "mouse-pointer-click",            // 新增：点击广告语义
  AdsClickRounded: "mouse-pointer-click",     // 新增
  Api: "braces",
  ApiRounded: "braces",
  ArrowDropDown: "chevron-down",
  ArrowDropDownRounded: "chevron-down",
  ArrowForward: "arrow-right",                // 新增
  ArrowForwardRounded: "arrow-right",         // 新增
  AutorenewRounded: "refresh-cw",
  Block: "ban",
  BlockRounded: "ban",
  BookmarkAddRounded: "bookmark-plus",
  Bookmarks: "bookmark",
  BookmarksRounded: "bookmark",
  BrightnessAuto: "sun-medium",
  BrightnessAutoRounded: "sun-medium",
  BugReport: "bug",
  BugReportRounded: "bug",
  Cancel: "circle-x",
  CancelRounded: "circle-x",
  Check: "check",
  CheckBox: "square-check-big",
  CheckBoxRounded: "square-check-big",
  CheckBoxOutlineBlank: "square",
  CheckBoxOutlineBlankRounded: "square",
  CheckCircle: "circle-check-big",
  CheckCircleOutline: "circle-check",
  CheckCircleRounded: "circle-check-big",
  CheckRounded: "check",
  ChevronLeft: "chevron-left",                // 新增（仅非 Rounded，Rounded 变体缺）
  ChevronLeftRounded: "chevron-left",         // 新增
  ChevronRight: "chevron-right",
  ChevronRightRounded: "chevron-right",       // 新增（ChevronRight 已存在 L41）
  ClearAll: "eraser",
  Close: "x",
  CloseRounded: "x",
  CloudSync: "cloud-sync",
  CloudSyncRounded: "cloud-sync",
  CloudUpload: "cloud-upload",                // 新增
  CloudUploadRounded: "cloud-upload",         // 新增
  Code: "code",
  CodeRounded: "code",
  ContentCopy: "copy",
  ContentCopyRounded: "copy",
  ContentPaste: "clipboard-paste",
  ContentPasteRounded: "clipboard-paste",     // 新增（ContentPaste 已存在 L51）
  CropRounded: "crop",
  DarkMode: "moon",
  DarkModeRounded: "moon",
  DataObject: "braces",
  Delete: "trash",
  DeleteOutline: "trash-2",
  DeleteOutlineRounded: "trash-2",
  DeleteSweepRounded: "broom",
  Description: "file-text",
  DescriptionRounded: "file-text",
  DoNotDisturbOnRounded: "circle-slash",
  Download: "download",
  DownloadRounded: "download",
  DragIndicator: "grip-vertical",
  DragIndicatorRounded: "grip-vertical",
  Edit: "square-pen",
  Error: "circle-alert",
  ErrorOutline: "circle-alert",
  ErrorOutlineRounded: "circle-alert",
  EventNote: "calendar-days",
  ExpandLess: "chevron-up",
  ExpandMore: "chevron-down",
  ExpandMoreRounded: "chevron-down",
  ExtensionRounded: "puzzle",                 // 新增：接口插件语义
  Favorite: "heart",
  FavoriteBorder: "heart",                    // 差异化由 FILLED 承担：Favorite 实心 currentColor vs FavoriteBorder 描边 none（对齐 MUI 契约）
  AutoAwesome: "sparkles",
  Bolt: "zap",
  Brightness4: "moon",
  Brightness7: "sun",
  Extension: "puzzle",                        // 与 ExtensionRounded 同源
  FormatSizeRounded: "type",
  Input: "log-in",
  IntegrationInstructions: "file-code",
  Rule: "list-checks",
  Settings: "settings",                       // 与 SettingsRounded 同源
  Telegram: "send",
  Terminal: "terminal",
  PowerSettingsNew: "power",
  FileDownload: "file-down",
  FileDownloadRounded: "file-down",           // 新增（FileDownload 已存在 L77）
  FileUpload: "file-up",
  FileUploadRounded: "file-up",
  FolderShared: "folder-tree",
  FolderSharedRounded: "folder-tree",
  Help: "circle-help",
  HelpOutline: "circle-help",
  HighlightAlt: "mouse-pointer-2",            // 新增：高亮/选中语义
  HighlightAltRounded: "mouse-pointer-2",     // 新增
  Image: "image",
  ImageRounded: "image",
  InsertDriveFile: "file",                    // 新增：通用档案
  InsertDriveFileRounded: "file",             // 新增
  Info: "info",
  InfoRounded: "info",
  Keyboard: "keyboard",
  KeyboardArrowDown: "chevron-down",
  KeyboardArrowDownRounded: "chevron-down",
  KeyboardArrowUp: "chevron-up",
  KeyboardArrowUpRounded: "chevron-up",
  KeyboardRounded: "keyboard",
  Language: "globe",
  LanguageRounded: "globe",
  LibraryAddCheck: "list-checks",
  LightMode: "sun",
  LightModeRounded: "sun",
  Link: "link",
  Lock: "lock",
  LockOutlined: "lock",
  Menu: "menu",
  MenuBook: "book",                           // 新增：合上书
  MenuBookRounded: "book",                    // 新增
  MenuRounded: "menu",
  Memory: "cpu",
  MemoryRounded: "cpu",
  Mic: "mic",
  MicRounded: "mic",
  MoreVert: "more-vertical",
  MouseRounded: "mouse",
  MyLocation: "locate-fixed",
  MyLocationOutlined: "locate",
  OpenInNew: "external-link",
  OpenInNewRounded: "external-link",
  Palette: "palette",
  PaletteRounded: "palette",
  Pause: "pause",
  PauseCircleOutline: "circle-pause",
  PauseCircleOutlineRounded: "circle-pause",
  PauseRounded: "pause",
  PictureAsPdf: "file-text",                  // 新增：PDF 文档语义
  PictureAsPdfRounded: "file-text",           // 新增
  PlayArrow: "play",
  PlayArrowRounded: "play",
  PushPin: "pin",
  PushPinOutlined: "pin",
  RadioButtonChecked: "circle-dot",
  RadioButtonUnchecked: "circle",
  RateReviewRounded: "message-square-quote",
  Redo: "redo",                               // 新增
  RedoRounded: "redo",                        // 新增
  Refresh: "refresh-cw",
  RefreshRounded: "refresh-cw",
  Remove: "minus",
  RemoveCircle: "circle-minus",
  RemoveRounded: "minus",                     // 新增（Remove 已存在 L128）
  Replay: "rotate-ccw",
  ReplayRounded: "rotate-ccw",
  RestartAltRounded: "refresh-ccw",
  Save: "save",
  SaveOutlined: "save",
  Search: "search",
  SearchRounded: "search",
  Segment: "text-select",
  SegmentRounded: "text-select",
  SelectAll: "square-dashed",
  SelectAllRounded: "square-dashed",
  Send: "send",
  SendRounded: "send",
  SettingsRounded: "settings",
  Share: "share-2",
  Stop: "square",
  StopRounded: "square",
  Subject: "text",
  Subtitles: "subtitles",
  SubtitlesRounded: "subtitles",
  SwapHorizRounded: "arrow-left-right",
  SwapVert: "arrow-up-down",
  SwapVertRounded: "arrow-up-down",
  Sync: "refresh-cw",
  TableChartRounded: "file-spreadsheet",      // 新增：表格/CSV 导出语义
  TextSnippet: "scroll-text",
  Translate: "languages",
  TranslateRounded: "languages",
  TroubleshootRounded: "activity",            // 新增：诊断语义
  Tune: "sliders-horizontal",
  TuneRounded: "sliders-horizontal",
  Undo: "undo",                               // 新增（UndoRounded 已存在 L158）
  UndoRounded: "undo-2",
  UnfoldLess: "chevrons-down-up",
  UnfoldMore: "chevrons-up-down",
  UploadFile: "file-up",
  UploadFileRounded: "file-up",
  ViewQuilt: "layout-grid",                   // 新增：布局网格
  ViewQuiltRounded: "layout-grid",            // 新增
  Visibility: "eye",
  VisibilityOff: "eye-off",
  VisibilityOffRounded: "eye-off",            // 新增（VisibilityOff 已存在 L164）
  VisibilityRounded: "eye",                   // 新增（Visibility 已存在 L163）
  VolumeUp: "volume-2",
  VolunteerActivismRounded: "heart-handshake",
  Warning: "triangle-alert",
  WarningAmber: "triangle-alert",             // 新增：警告语义，与 Warning 共享字形
  WarningAmberRounded: "triangle-alert",      // 新增
  ZoomIn: "zoom-in",                          // 新增
  ZoomInRounded: "zoom-in",                   // 新增
  ZoomOut: "zoom-out",                        // 新增
  ZoomOutRounded: "zoom-out",                 // 新增
};

// 品牌图标例外（长期人工维护）：lucide 上游已移除品牌图标，MAPPING 无法派生
// 品牌字形，改由本表注入手补的品牌描边 path（stroke 范式与常规条目一致，不进
// FILLED）。Telegram 上游同样无品牌图标，但 send 纸飞机即其可辨识图形，故
// 保留 MAPPING 派生、不走本表。重新生成时本表随生成器持久保留。
export const BRAND_PATHS = {
  GitHub: {
    kebab: "github",
    paths: [
      {
        d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
      },
      { d: "M9 18c-4.51 2-5-2-7-2" },
    ],
  },
};

export const FILLED = new Set([
  "Favorite",
  "PushPin",
  "BrightnessAuto",
  "BrightnessAutoRounded",
  "Stop",
  "StopRounded",
]);

// 子元素级填充挂点：FILLED 管 g 级 fill，CHILD_FILL 管单个子元素级 fill
// （键＝图标基名，值＝{ tag, r } 匹配器；命中即对该子元素 attrs 注入
// fill: "currentColor"，其余子元素与 g 级 fill 不受影响）。后续同类
// 「局部实心」需求按本 map 扩展，不新增第二套机制。
export const CHILD_FILL = {
  RadioButtonChecked: { tag: "circle", r: "1" },
};

// MUI 半边改派表：键＝MAPPING 基名，值＝替代的 @mui/icons-material 模块基名。
// 缺省回落＝MUI 模块基名等于 MAPPING 基名（1:1 派生）。当前仅 MyLocation 对：
// MUI 的 MyLocation/MyLocationOutlined path d 逐字相同（视觉零差异），改派为
// CenterFocus 对（实心/空心环）以提供可辨识的选中/未选中视觉。
export const MUI_OVERRIDES = {
  MyLocation: "CenterFocusStrong",
  MyLocationOutlined: "CenterFocusWeak",
};

const camel = (key) => key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function parseLucideSvgInner(raw) {
  const noComment = raw.replace(/<!--[\s\S]*?-->/g, "");
  const svgOpen = noComment.indexOf("<svg");
  const svgBodyStart = noComment.indexOf(">", svgOpen) + 1;
  const svgClose = noComment.indexOf("</svg>", svgBodyStart);
  // 截断防护：</svg> 缺失时 indexOf 返回 -1，slice 会静默丢尾并返回
  // 不完整内容，必须在源头显式失败。
  if (svgClose === -1) {
    throw new Error("parseLucideSvgInner: missing </svg> (truncated input)");
  }
  return noComment.slice(svgBodyStart, svgClose);
}

export function parseLucideSvg(raw) {
  // viewBox 闸只看根 <svg> 开标签自身声明的属性值：在整个原始内容里搜
  // 字符串会漏判「根元素 48×48、注释或子元素属性恰好含 0 0 24 24 字样」
  // 的反例。根开标签先剥离注释再定位，属性值必须逐字等于 0 0 24 24。
  const noComment = raw.replace(/<!--[\s\S]*?-->/g, "");
  const svgOpenStart = noComment.indexOf("<svg");
  if (svgOpenStart === -1) {
    throw new Error("parseLucideSvg: missing <svg>");
  }
  const svgOpenEnd = noComment.indexOf(">", svgOpenStart);
  if (svgOpenEnd === -1) {
    throw new Error("parseLucideSvg: unclosed <svg> tag");
  }
  const svgOpenTag = noComment.slice(svgOpenStart, svgOpenEnd + 1);
  // 属性名前须有空白边界：无边界时 data-viewBox 一类属性会把 viewBox
  // 子串误喂给校验器，48×48 根元素借此蒙混过关。
  const viewBoxMatch = svgOpenTag.match(
    /(?:^|\s)viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/
  );
  if (!viewBoxMatch || (viewBoxMatch[1] ?? viewBoxMatch[2]) !== "0 0 24 24") {
    throw new Error("parseLucideSvg: unexpected root viewBox");
  }
  const inner = parseLucideSvgInner(raw);
  const matches = [...inner.matchAll(/<(path|circle|line|polyline|polygon|rect)\b([^>]*?)\/>/g)];
  // 全量开始标签核对：Lucide 源内所有子元素必须均为上述六类自闭合形状。
  // 出现未支持标签（如 ellipse/g）或非自闭合形状时数量不等，显式失败，
  // 避免静默丢弃元素生成残缺图标。先于无形状检查，保证报错指向真因。
  const startTagCount = (inner.match(/<[a-zA-Z][^/>\s]*/g) || []).length;
  if (startTagCount !== matches.length) {
    throw new Error(
      `parseLucideSvg: unsupported or non-self-closing element (start tags ${startTagCount}, shapes ${matches.length})`
    );
  }
  if (matches.length === 0) {
    throw new Error("parseLucideSvg: no shape children");
  }
  return matches.map(([, tag, attrStr]) => {
    const attrs = {};
    const attrRe = /([A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of attrStr.matchAll(attrRe)) {
      attrs[camel(match[1])] = match[2] ?? match[3];
    }
    // 完整解析闸：属性串中有未被捕获的残留（裸值、嵌套引号等）意味着
    // d 等必需属性可能缺失，生成必须失败，禁止产出残缺路径。
    const leftover = attrStr.replace(attrRe, " ").trim();
    if (leftover) {
      throw new Error(
        `parseLucideSvg: unparsed attribute fragment "${leftover}" on <${tag}>`
      );
    }
    return { tag, attrs };
  });
}

export function renderBundleEntry(name, children) {
  const childFill = CHILD_FILL[name];
  const kids = children
    .map(
      ({ tag, attrs }) => {
        if (
          childFill &&
          tag === childFill.tag &&
          attrs.r === childFill.r
        ) {
          attrs = { ...attrs, fill: "currentColor" };
        }
        return `/*#__PURE__*/ React.createElement(${JSON.stringify(tag)}, ${JSON.stringify(attrs)})`;
      }
    )
    .join(", ");
  const fill = FILLED.has(name) ? '"currentColor"' : '"none"';
  return `export const ${name}Icon = /*#__PURE__*/ createSvgIcon(/*#__PURE__*/ React.createElement("g", { fill: ${fill}, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, ${kids}), "${name}");`;
}

export function renderDispatcherHead() {
  return [
    "// Generated by src/scripts/gen-lucide-icons.mjs — style dispatcher over ./lucide and @mui/icons-material. Do not edit by hand.",
    'import React, { useSyncExternalStore } from "react";',
    'import { getIconStyleSnapshot, subscribeIconStyle } from "../../styles/iconStyleStore";',
  ].join("\n");
}

export function renderDispatcherHook() {
  return [
    "function useIconComponent(MuiComp, LucideComp) {",
    "  const iconStyle = useSyncExternalStore(subscribeIconStyle, getIconStyleSnapshot, getIconStyleSnapshot);",
    '  return iconStyle === "mui" ? MuiComp : LucideComp;',
    "}",
  ].join("\n");
}

export function renderDispatcherEntry(name) {
  return [
    `export const ${name}Icon = /*#__PURE__*/ React.forwardRef(function ${name}Icon(props, ref) {`,
    `  const Icon = useIconComponent(Mui${name}, Lucide${name}Icon);`,
    `  return <Icon {...props} ref={ref} />;`,
    `});`,
  ].join("\n");
}

// MUI 上游名解析单点：override 命中则改道，否则 1:1 透传。
// bundle 元数据（GLYPH_META.mui）与 dispatcher 的 MUI 导入都经此收敛。
export function resolveMuiName(name) {
  return MUI_OVERRIDES[name] ?? name;
}

/**
 * Render the maskGlyphs module with check icon mask data-URIs.
 * Single-source for menu check masks.
 */
export function renderMaskModule() {
  return [
    "/**",
    " * Mask glyph constants for check icons.",
    " * Single-source module for menu check mask data-URIs.",
    " * Generated by src/scripts/gen-lucide-icons.mjs. Do not edit by hand.",
    " */",
    "",
    `export const MENU_CHECK_MASK_LUCIDE = ${JSON.stringify(
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")`
    )};`,
    "",
    `export const MENU_CHECK_MASK_MUI = ${JSON.stringify(
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/%3E%3C/svg%3E")`
    )};`,
  ].join("\n");
}

export function kebabGroups() {
  const byKebab = new Map();
  for (const [name, kebab] of Object.entries(MAPPING)) {
    if (!byKebab.has(kebab)) byKebab.set(kebab, []);
    byKebab.get(kebab).push(name);
  }
  return [...byKebab.values()];
}

if (import.meta.url && path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  // 有意绊线：增删 MAPPING 条目时必须连动更新此常数与 gen-lucide-icons.test.mjs 的计数断言，
  // 防止合并误删条目后静默重生成。
  if (Object.keys(MAPPING).length !== 205) {
    console.error(`gen-lucide-icons: MAPPING must stay at 205 keys, got ${Object.keys(MAPPING).length}`);
    process.exit(1);
  }

  const failures = [];
  const icons = [];

  for (const [name, kebab] of Object.entries(MAPPING)) {
    const full = path.join(PKG_DIR, `${kebab}.svg`);
    if (!existsSync(full)) {
      failures.push(`${name}: missing ${kebab}.svg`);
      continue;
    }
    const svg = readFileSync(full, "utf8");
    try {
      const children = parseLucideSvg(svg);
      icons.push([name, children]);
    } catch (err) {
      failures.push(`${name} (${kebab}.svg): ${err.message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`gen-lucide-icons: ${failures.length} failure(s):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  // 品牌图标条目：不经 lucide svg 派生，直接由 BRAND_PATHS 注入手补 path。
  for (const [name, brand] of Object.entries(BRAND_PATHS)) {
    icons.push([
      name,
      brand.paths.map(({ d }) => ({ tag: "path", attrs: { d } })),
    ]);
  }
  icons.sort(([a], [b]) => a.localeCompare(b, "en"));

  const lines = [];
  lines.push(
    "// 来源：由生成脚本从 lucide-static/icons/*.svg 产出。",
    "// 维护口径：除下述品牌图标例外，请勿手工编辑，改动应回到生成器。",
    "//   品牌图标例外（长期人工维护）：GitHubIcon —— lucide 上游已移除品牌",
    "//   图标，生成器经 BRAND_PATHS 注入手补的品牌描边图形；Telegram 保留",
    "//   send 纸飞机派生（上游无品牌图标，纸飞机即其可辨识图形）。"
  );
  lines.push('import { createSvgIcon } from "@mui/material/utils";');
  lines.push('import React from "react";');
  lines.push("");
  // 只读派生元数据：{ name, kebab, fill } 由生成器从 MAPPING/FILLED 单点 emit，
  // 供生成物守卫（lucideIcons.test.js）直接 import——jest 27 的解析器无法
  // 从 .test.js 反向 import .mjs（transformIgnorePatterns 排除），守卫因此
  // 不得依赖构建脚本，元数据改由产物内联，随每次生成同步刷新。
  lines.push(
    `export const GLYPH_META = ${JSON.stringify(
      [...icons].map(([name]) => ({
        name: `${name}Icon`,
        kebab: MAPPING[name] ?? BRAND_PATHS[name].kebab,
        fill: FILLED.has(name) ? "currentColor" : "none",
        mui: resolveMuiName(name),
      }))
    )};`
  );
  lines.push("");
  for (const [name, children] of icons) {
    if (BRAND_PATHS[name]) {
      lines.push(
        "// 品牌图形手补：上游 lucide-static 已移除品牌图标，MAPPING 无法派生；",
        `// 本行经 BRAND_PATHS 注入 lucide 历史 ${BRAND_PATHS[name].kebab} 描边路径`,
        "// （stroke 范式与全文件一致）。重新生成时由生成器自动保留本手补。"
      );
    }
    lines.push(renderBundleEntry(name, children));
    lines.push("");
  }
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${lines.join("\n").trimEnd()}\n`, "utf8");

  const dispatcherLines = [];
  dispatcherLines.push(renderDispatcherHead());
  dispatcherLines.push("");
  for (const [name] of icons) {
    dispatcherLines.push(`import { ${name}Icon as Lucide${name}Icon } from "./lucide";`);
    const muiName = resolveMuiName(name);
    dispatcherLines.push(`import Mui${name} from "@mui/icons-material/${muiName}";`);
  }
  dispatcherLines.push("");
  dispatcherLines.push(renderDispatcherHook());
  dispatcherLines.push("");
  for (const [name] of icons) {
    dispatcherLines.push(renderDispatcherEntry(name));
    dispatcherLines.push("");
  }
  mkdirSync(path.dirname(DISPATCHER_FILE), { recursive: true });
  writeFileSync(
    DISPATCHER_FILE,
    `${dispatcherLines.join("\n").trimEnd()}\n`,
    "utf8"
  );
  mkdirSync(path.dirname(MASK_GLYPHS_FILE), { recursive: true });
  writeFileSync(
    MASK_GLYPHS_FILE,
    `${renderMaskModule()}\n`,
    "utf8"
  );
  console.log(
    `gen-lucide-icons: wrote ${icons.length} icons to ${OUT_FILE}, dispatcher to ${DISPATCHER_FILE}, and mask glyphs to ${MASK_GLYPHS_FILE}`
  );
}
