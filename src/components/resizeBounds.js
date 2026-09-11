// 缩放手柄高度归一化：纯函数单一真源模块。
//
// 所有高度计算（拖动、键盘、测量初值、视口变化、ARIA 数值）都必须经由本模块，
// 保证任何路径都不会把 NaN / Infinity / 负数 / 超界值传给 CSS 或 ARIA。
// 本模块不依赖 DOM / 浏览器 API，可被组件与单测直接导入；以下常量与全部 6 个导出
// 仅在本文件定义。ResizeHandle.js 从本模块导入并再导出（维持既有 import 路径兼容）；
// useTextareaResize.js 不从本模块导入任何符号，保留自己的 DEFAULT_MAX_ROWS
// （行数上限语义，与像素高度归一化常量不同域，分开定义）。

// 自定义缩放手柄允许的最小文本框高度（像素），派生式：单行 23px（MUI
// InputBase lineHeight 1.4375em）+ small 根节点纵向 padding 17px（8.5×2）。
// 保持与 MUI 几何解耦：若主题 shape/尺寸变化，此处算式须同步复核。
export const MIN_RESIZE_HEIGHT = 40;

// medium 规格（TextField 未传 size）根节点纵向 padding 33px（16.5×2）下的
// 最小文本框高度：23 + 33 = 56。
export const MIN_RESIZE_HEIGHT_MEDIUM = 56;

// 键盘方向键（ArrowUp/ArrowDown）每次调整的高度步进（像素）
export const KEYBOARD_RESIZE_STEP = 12;

// 高度上界相对视口/裁剪祖先底部的安全留白（像素），防止拖高后底部控件被裁切
export const VIEWPORT_SAFE_GUTTER = 8;

/**
 * 把任意输入转换为有限数字，非有限值（NaN / Infinity / null / undefined /
 * 非数字类型）回退到 fallback。
 *
 * @param {*} value 待归一化的输入。
 * @param {number} fallback 非有限值时的回退值。
 * @returns {number} 始终为有限数字。
 */
export function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 解析可拖高度的上界：先把 maxHeight 转为有限值（不可测/非有限时用
 * fallbackHeight 兜底），再 clamp 到不小于下界。
 *
 * 上界永远 >= 下界：即使视口比最小高度还小（如虚拟键盘占屏、极小视口），
 * 上界也收敛到最小高度而非反转成负数。
 *
 * @param {*} maxHeight 候选上界（可为 NaN / Infinity / undefined）。
 * @param {number} fallbackHeight 不可测边界时的回退高度。
 * @param {number} [min=MIN_RESIZE_HEIGHT] 显式下界（如 medium 口径 56）。
 * @returns {number} 始终 >= 下界的有限上界。
 */
export function resolveResizeMaxHeight(maxHeight, fallbackHeight, min = MIN_RESIZE_HEIGHT) {
  const floor = toFiniteNumber(min, MIN_RESIZE_HEIGHT);
  if (Number.isFinite(maxHeight)) {
    return Math.max(floor, maxHeight);
  }
  const fallback = toFiniteNumber(fallbackHeight, floor);
  return Math.max(floor, fallback);
}

/**
 * 把任意高度输入归一化到合法区间：
 *   [下界, resolveResizeMaxHeight(maxHeight, fallbackHeight, min)]
 *
 * 对拖动、键盘、测量初值与视口变化统一执行；任何路径都不会把非有限值传给
 * CSS 或 ARIA。结果仅在真实变化时由调用方写回 state。
 *
 * @param {*} value 待归一化的高度（可为 NaN / Infinity / undefined / null）。
 * @param {*} maxHeight 当前解析出的上界（动态视口/容器上界）。
 * @param {number} fallbackHeight 不可测边界时的回退高度。
 * @param {number} [min=MIN_RESIZE_HEIGHT] 显式下界（如 medium 口径 56）。
 * @returns {number} 始终为区间内有限值。
 */
export function normalizeResizeHeight(value, maxHeight, fallbackHeight, min = MIN_RESIZE_HEIGHT) {
  const floor = toFiniteNumber(min, MIN_RESIZE_HEIGHT);
  const upper = resolveResizeMaxHeight(maxHeight, fallbackHeight, min);
  const fallback = toFiniteNumber(fallbackHeight, floor);
  const finite = toFiniteNumber(value, fallback);
  return Math.min(Math.max(floor, finite), upper);
}
