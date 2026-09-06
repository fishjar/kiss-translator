// 左右拉伸触发区的宽度 (8px 左侧 + 8px 右侧)
// DraggableResizable uses lineWidth = 4, with lineWidth * 2 on each grid side.
const TRANBOX_SIDE_GRIP_WIDTH = 16;
// Non-content height: 56px header + two 8px resize grips + two 1px card borders.
// Keep this aligned with .kt-tranbox-header and .KT-draggable-body in
// Selection/styles.js, plus the outer grid rows in DraggableResizable.
// Omitting the taller M3 header and borders lets the box overflow by 22px.
const TRANBOX_CHROME_HEIGHT = 74;

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
