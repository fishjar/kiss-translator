/**
 * @file styles.js
 * @description 译文展示的样式外观常量定义模块。提供如波浪线下划线、马克笔高亮、虚线框等各种极富视觉美感的译文样式标识。
 */

export const OPT_STYLE_NONE = "style_none"; // 无特殊样式 (直接展示为普通文本)
export const OPT_STYLE_LINE = "under_line"; // 普通下划直线
export const OPT_STYLE_DOTLINE = "dot_line"; // 点状下划线
export const OPT_STYLE_DASHLINE = "dash_line"; // 虚线下划线
export const OPT_STYLE_DASHLINE_BOLD = "dash_line_bold"; // 粗虚线下划线
export const OPT_STYLE_DASHBOX = "dash_box"; // 围绕译文的虚线线框
export const OPT_STYLE_DASHBOX_BOLD = "dash_box_bold"; // 围绕译文的粗虚线线框
export const OPT_STYLE_WAVYLINE = "wavy_line"; // 波浪下划线
export const OPT_STYLE_WAVYLINE_BOLD = "wavy_line_bold"; // 粗波浪下划线
export const OPT_STYLE_MARKER = "marker"; // 荧光笔/马克笔涂抹底色高亮效果
export const OPT_STYLE_GRADIENT_MARKER = "gradient_marker"; // 渐变色荧光笔底色高亮效果
export const OPT_STYLE_FUZZY = "fuzzy"; // 模糊滤镜效果 (鼠标悬浮时才清晰，常用于听力或背诵场景)
export const OPT_STYLE_HIGHLIGHT = "highlight"; // 精致的背景色高亮
export const OPT_STYLE_BLOCKQUOTE = "blockquote"; // 侧边竖线引用格式 (Markdown blockquote 风格)
export const OPT_STYLE_GRADIENT = "gradient"; // 译文字体自带渐变色填充
export const OPT_STYLE_BLINK = "blink"; // 译文淡入淡出的呼吸灯动效
export const OPT_STYLE_GLOW = "glow"; // 译文文字外发光效果
export const OPT_STYLE_COLORFUL = "colorful"; // 多彩斑斓的视觉效果
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

// 默认提供给用户可用于编辑的自定义译文 CSS 样式结构
export const DEFAULT_CUSTOM_STYLES = [
  {
    styleSlug: "custom",
    styleName: "Custom Style",
    styleCode: `color: #209CEE;`, // 自定义样式的 CSS 原生规则字符串
  },
];
