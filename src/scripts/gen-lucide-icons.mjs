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
  FavoriteBorder: "heart",
  FileDownload: "file-down",
  FileDownloadRounded: "file-down",           // 新增（FileDownload 已存在 L77）
  FileUpload: "file-up",
  FileUploadRounded: "file-up",
  FolderShared: "folder-tree",
  FolderSharedRounded: "folder-tree",
  Help: "circle-help",
  HelpOutline: "message-circle-question",
  HighlightAlt: "mouse-pointer-2",            // 新增：高亮/选中语义
  HighlightAltRounded: "mouse-pointer-2",     // 新增
  Image: "image",
  ImageRounded: "image",
  InsertDriveFile: "file",                    // 新增：通用档案
  InsertDriveFileRounded: "file",             // 新增
  Info: "info",
  InfoRounded: "info",
  Keyboard: "keyboard",
  KeyboardArrowDown: "arrow-down",
  KeyboardArrowDownRounded: "arrow-down",
  KeyboardArrowUp: "arrow-up",
  KeyboardArrowUpRounded: "arrow-up",
  KeyboardRounded: "keyboard",
  Language: "globe",
  LanguageRounded: "globe",
  LibraryAddCheck: "list-checks",
  LightMode: "sun",
  LightModeRounded: "sun",
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
  if (!raw.includes('viewBox="0 0 24 24"')) {
    throw new Error("parseLucideSvg: unexpected viewBox");
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
    for (const [, key, val] of attrStr.matchAll(/([A-Za-z_][\w:-]*)="([^"]*)"/g)) {
      attrs[camel(key)] = val;
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
    'import { getIconStyleSnapshot, subscribeIconStyle } from "../../styles/m3";',
  ].join("\n");
}

export function renderDispatcherHook() {
  return [
    "function useIconComponent(MuiComp, LucideComp) {",
    "  const iconStyle = useSyncExternalStore(subscribeIconStyle, getIconStyleSnapshot);",
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
  if (Object.keys(MAPPING).length !== 191) {
    console.error(`gen-lucide-icons: MAPPING must stay at 191 keys, got ${Object.keys(MAPPING).length}`);
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

  icons.sort(([a], [b]) => a.localeCompare(b));

  const lines = [];
  lines.push(
    "// Generated by src/scripts/gen-lucide-icons.mjs — source: lucide-static/icons/*.svg. Do not edit by hand."
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
        kebab: MAPPING[name],
        fill: FILLED.has(name) ? "currentColor" : "none",
        mui: MUI_OVERRIDES[name] ?? name,
      }))
    )};`
  );
  lines.push("");
  for (const [name, children] of icons) {
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
    const muiName = MUI_OVERRIDES[name] ?? name;
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
  console.log(
    `gen-lucide-icons: wrote ${icons.length} icons to ${OUT_FILE} and dispatcher to ${DISPATCHER_FILE}`
  );
}
