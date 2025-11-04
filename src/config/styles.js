export const OPT_STYLE_NONE = "style_none"; // 无
export const OPT_STYLE_LINE = "under_line"; // 下划线
export const OPT_STYLE_DOTLINE = "dot_line"; // 点状线
export const OPT_STYLE_DASHLINE = "dash_line"; // 虚线
export const OPT_STYLE_DASHLINE_BOLD = "dash_line_bold"; // 虚线加粗
export const OPT_STYLE_DASHBOX = "dash_box"; // 虚线框
export const OPT_STYLE_DASHBOX_BOLD = "dash_box_bold"; // 虚线框加粗
export const OPT_STYLE_WAVYLINE = "wavy_line"; // 波浪线
export const OPT_STYLE_WAVYLINE_BOLD = "wavy_line_bold"; // 波浪线加粗
export const OPT_STYLE_MARKER = "marker"; // 马克笔
export const OPT_STYLE_GRADIENT_MARKER = "gradient_marker"; // 渐变马克笔
export const OPT_STYLE_FUZZY = "fuzzy"; // 模糊
export const OPT_STYLE_HIGHLIGHT = "highlight"; // 高亮
export const OPT_STYLE_BLOCKQUOTE = "blockquote"; // 引用
export const OPT_STYLE_GRADIENT = "gradient"; // 渐变
export const OPT_STYLE_BLINK = "blink"; // 闪现
export const OPT_STYLE_GLOW = "glow"; // 发光
export const OPT_STYLE_COLORFUL = "colorful"; // 多彩
export const OPT_STYLE_ALL = [
  OPT_STYLE_NONE,
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_DASHLINE_BOLD,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_WAVYLINE_BOLD,
  OPT_STYLE_DASHBOX,
  OPT_STYLE_DASHBOX_BOLD,
  OPT_STYLE_MARKER,
  OPT_STYLE_GRADIENT_MARKER,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
  OPT_STYLE_GRADIENT,
  OPT_STYLE_BLINK,
  OPT_STYLE_GLOW,
  OPT_STYLE_COLORFUL,
];

export const DEFAULT_CUSTOM_STYLES = [
  {
    styleSlug: "custom",
    styleName: "Custom Style",
    styleCode: `color: #209CEE;`,
  },
];
