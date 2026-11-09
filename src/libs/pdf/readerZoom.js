/**
 * @file readerZoom.js
 * @description 内置 PDF 阅读器的滚轮缩放计算：不依赖 pdfjs 和 DOM，便于单独测试。
 */

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;

const WHEEL_SENSITIVITY = 0.002;
const MAX_WHEEL_DELTA_PX = 200;
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Mac 触控板捏合时浏览器也会带上 ctrlKey，所以捏合走的是同一条路径。 */
export const isZoomWheel = (event) => event.ctrlKey || event.metaKey;

const toPixels = ({ deltaY, deltaMode }) => {
  if (deltaMode === DOM_DELTA_LINE) return deltaY * LINE_HEIGHT_PX;
  if (deltaMode === DOM_DELTA_PAGE) return deltaY * PAGE_HEIGHT_PX;
  return deltaY;
};

/** 用指数换算，放大和缩小同样的滚动量时能互相抵消。 */
export function wheelZoomFactor(event) {
  const delta = Math.max(
    -MAX_WHEEL_DELTA_PX,
    Math.min(MAX_WHEEL_DELTA_PX, toPixels(event))
  );
  return Math.exp(-delta * WHEEL_SENSITIVITY);
}

export function clampScaleFactor(currentScale, factor) {
  const target = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, currentScale * factor)
  );
  return target / currentScale;
}

const roundScale = (scale) => Math.round(scale * 100) / 100;

/**
 * PDF.js 会把缩放比例四舍五入到两位小数，触控板捏合的细小变化会被吃掉，
 * 因此先累积，等足以改变比例时才返回。
 * @returns {function(number, WheelEvent): (number|null)} 返回缩放倍率，暂不缩放时返回 null。
 */
export function createWheelZoom() {
  let pending = 1;
  return (currentScale, event) => {
    pending *= wheelZoomFactor(event);
    const factor = clampScaleFactor(currentScale, pending);
    if (roundScale(currentScale * factor) === roundScale(currentScale)) {
      // 已经到达缩放上下限时不再累积，反向滚动才能立刻生效。
      if (factor === 1) pending = 1;
      return null;
    }
    pending = 1;
    return factor;
  };
}
