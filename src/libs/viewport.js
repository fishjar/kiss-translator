/**
 * 获取布局视口尺寸，单位为 CSS 像素。
 * 优先读取浏览器提供的滚动根节点，排除经典滚动条；
 * 节点不存在或尺寸为零时回退到窗口尺寸（包含滚动条）。
 * @returns {{w: number, h: number}} 视口宽度和高度
 */
export function getViewportSize() {
  // 由浏览器确定标准模式和怪异模式下的滚动根节点。
  const viewport = document.scrollingElement;
  return {
    w: viewport?.clientWidth || window.innerWidth || 0,
    h: viewport?.clientHeight || window.innerHeight || 0,
  };
}
