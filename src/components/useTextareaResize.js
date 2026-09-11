import { useMemo } from "react";

// 未拖动时限制 textarea 自动增长上限（内容超高时 textarea 内部滚动）
export const DEFAULT_MAX_ROWS = 10;

/**
 * 把缩放手柄的拖动高度换算为 TextField 的 minRows / maxRows / 根节点高度样式。
 *
 * 未拖动（resizeHeight == null）：
 * - minRows = defaultRows，maxRows = DEFAULT_MAX_ROWS（限制自动增长上限），
 *   高度仍由 MUI TextareaAutosize 自动测量，根节点不持有受控高度。
 *
 * 已拖动（resizeHeight 为像素值）：
 * - 受控像素高度落在 TextField 的 InputBase 根节点（rootStyle），
 *   与 TranForm/TranCont 采用的根节点高度模型对齐：helperText/标签不随
 *   拖动位移，TextareaAutosize 的自动测量不受影响。
 * - minRows 与 maxRows 全部释放为 undefined：不再把像素高度量化为整数行，
 *   高度由像素 state 直接驱动，避免量化整数行导致的「真源与 DOM 分离」。
 *   maxRows 必须保持 undefined，否则 TextareaAutosize 会无条件执行
 *   min(maxRows*singleRowHeight, outerHeight)，在拖动超过 DEFAULT_MAX_ROWS
 *   行后把 textarea 压回 maxRows 高度造成拖动死区。
 * - 可见 textarea 的内部滚动与几何契约由调用方的 scoped sx 规则承载
 *   （`& textarea:not([aria-hidden="true"])`：`box-sizing: border-box` +
 *   `max-height: 100%` + 拖高时 `overflow: auto !important`），既不会命中 MUI
 *   测量 shadow textarea（aria-hidden="true"），也不会把 `!important` 写入
 *   React inline style。
 * - 根节点不持有受控 overflowY（MUI TextareaAutosize 每帧会重写
 *   textarea.style.overflow，root 级滚动会与内部滚动形成双滚动条）。
 *
 * 仅约束 InputBase 根节点；内部 textarea 的样式统一交给调用方 scoped 规则。
 */
export function useTextareaResize(resizeHeight, defaultRows) {
  const minRows = resizeHeight == null ? defaultRows : undefined;
  const maxRows = resizeHeight == null ? DEFAULT_MAX_ROWS : undefined;
  const rootStyle = useMemo(
    () =>
      resizeHeight == null
        ? undefined
        : {
            height: resizeHeight,
            alignItems: "flex-start",
          },
    [resizeHeight]
  );
  return { minRows, maxRows, rootStyle };
}
