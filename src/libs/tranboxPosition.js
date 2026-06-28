// 左右拉伸触发区的宽度 (8px 左侧 + 8px 右侧)
const TRANBOX_SIDE_GRIP_WIDTH = 16;
// 翻译框非内容区的高度 (36px Header + 8px 顶部拉伸区 + 8px 底部拉伸区)
const TRANBOX_CHROME_HEIGHT = 52;

/**
 * 获取翻译框包含拉伸触发区在内的整体外部宽度
 */
export function getTranBoxOuterWidth(contentWidth) {
  return contentWidth + TRANBOX_SIDE_GRIP_WIDTH;
}

/**
 * 获取翻译框包含 Header 和拉伸触发区在内的整体外部高度
 */
export function getTranBoxOuterHeight(contentHeight) {
  return contentHeight + TRANBOX_CHROME_HEIGHT;
}

/**
 * 获取翻译框内容区允许的最大宽度 (防止整体外部宽度超出视口)
 */
export function getMaxTranBoxContentWidth() {
  return Math.max(0, window.innerWidth - TRANBOX_SIDE_GRIP_WIDTH);
}

/**
 * 获取翻译框内容区允许的最大高度 (防止整体外部高度超出视口)
 */
export function getMaxTranBoxContentHeight() {
  return Math.max(0, window.innerHeight - TRANBOX_CHROME_HEIGHT);
}

/**
 * 获取翻译框允许的最大 X 坐标 (防止右侧拉伸区溢出屏幕)
 */
export function getMaxTranBoxX(contentWidth) {
  return Math.max(0, window.innerWidth - getTranBoxOuterWidth(contentWidth));
}

/**
 * 获取翻译框允许的最大 Y 坐标 (防止底部拉伸区溢出屏幕)
 */
export function getMaxTranBoxY(contentHeight) {
  return Math.max(0, window.innerHeight - getTranBoxOuterHeight(contentHeight));
}
