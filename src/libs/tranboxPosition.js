// Combined width of the left and right resize grips (8px on each side).
// DraggableResizable uses lineWidth = 4, with lineWidth * 2 on each grid side.
const TRANBOX_SIDE_GRIP_WIDTH = 16;
// Non-content height: 56px header + two 8px resize grips + two 1px card borders.
// Keep this aligned with .kt-tranbox-header and .KT-draggable-body in
// Selection/styles.js, plus the outer grid rows in DraggableResizable.
// Omitting the taller M3 header and borders lets the box overflow by 22px.
const TRANBOX_CHROME_HEIGHT = 74;

// The document client area excludes classic scrollbars. Use the current window's
// document so embedded frames keep their own bounds; unmeasured roots (including
// test environments) fall back to the window dimensions.
function getTranBoxViewportElement() {
  const doc = window.document;
  // In quirks mode, the body exposes the viewport while the root can grow with
  // the page content and therefore cannot provide a safe vertical bound.
  return doc?.compatMode === "BackCompat"
    ? doc.body || doc.documentElement
    : doc?.documentElement;
}

function getTranBoxViewportWidth() {
  const clientWidth = getTranBoxViewportElement()?.clientWidth;
  return clientWidth > 0 ? clientWidth : window.innerWidth;
}

export function getTranBoxViewportHeight() {
  const clientHeight = getTranBoxViewportElement()?.clientHeight;
  return clientHeight > 0 ? clientHeight : window.innerHeight;
}

/**
 * Get the outer translation box width, including the resize grips.
 */
export function getTranBoxOuterWidth(contentWidth) {
  return contentWidth + TRANBOX_SIDE_GRIP_WIDTH;
}

/**
 * Get the outer translation box height, including the header and resize grips.
 */
export function getTranBoxOuterHeight(contentHeight) {
  return contentHeight + TRANBOX_CHROME_HEIGHT;
}

/**
 * Get the maximum content width that keeps the outer box inside the viewport.
 */
export function getMaxTranBoxContentWidth() {
  return Math.max(0, getTranBoxViewportWidth() - TRANBOX_SIDE_GRIP_WIDTH);
}

/**
 * Get the maximum content height that keeps the outer box inside the viewport.
 */
export function getMaxTranBoxContentHeight() {
  return Math.max(0, getTranBoxViewportHeight() - TRANBOX_CHROME_HEIGHT);
}

/**
 * Get the maximum X position that keeps the right resize grip visible.
 */
export function getMaxTranBoxX(contentWidth) {
  return Math.max(
    0,
    getTranBoxViewportWidth() - getTranBoxOuterWidth(contentWidth)
  );
}

/**
 * Get the maximum Y position that keeps the bottom resize grip visible.
 */
export function getMaxTranBoxY(contentHeight) {
  return Math.max(
    0,
    getTranBoxViewportHeight() - getTranBoxOuterHeight(contentHeight)
  );
}
