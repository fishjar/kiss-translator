import { useLayoutEffect, useRef } from "react";

export default function useDropdownDismiss({
  open,
  popupRef,
  anchorEl,
  onClose,
  toggleOnAnchor = false,
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const doc = anchorEl?.ownerDocument || document;
    // 影子拓扑下 document 级监听收到的 event.target 被重定向为影子宿主，
    // contains() 会把弹层内点击误判为外部——composedPath 取真实事件路径
    // 判定归属，contains 仅作 composedPath 不可用时的回退。
    const inPath = (event, node) =>
      Boolean(
        node &&
          (event.composedPath?.().includes(node) || node.contains(event.target))
      );
    const insidePopup = (event) => inPath(event, popupRef.current);
    const onAnchor = (event) => inPath(event, anchorEl);
    const dismissOnScroll = (event) => {
      if (!insidePopup(event) && !event.ctrlKey) {
        closeRef.current?.(event, "scroll");
      }
    };
    const dismissOnPointerDown = (event) => {
      if (insidePopup(event)) return;
      if (onAnchor(event)) {
        if (!toggleOnAnchor || event.button !== 0) return;
        // Select opens on mousedown. Suppress that compatibility event when
        // a second pointer press on the trigger is closing its current menu.
        event.preventDefault();
      }
      closeRef.current?.(event, "backdropClick");
    };
    const dismissOnFocus = (event) => {
      if (insidePopup(event) || onAnchor(event)) return;
      closeRef.current?.(event, "blur");
    };

    // Passive capture observes the first scroll gesture without consuming it.
    // Scrolling the options themselves must keep a long menu open.
    const scrollOptions = { capture: true, passive: true };
    doc.addEventListener("wheel", dismissOnScroll, scrollOptions);
    doc.addEventListener("touchmove", dismissOnScroll, scrollOptions);
    doc.addEventListener("scroll", dismissOnScroll, scrollOptions);
    doc.addEventListener("pointerdown", dismissOnPointerDown, true);
    doc.addEventListener("focusin", dismissOnFocus, true);
    return () => {
      doc.removeEventListener("wheel", dismissOnScroll, true);
      doc.removeEventListener("touchmove", dismissOnScroll, true);
      doc.removeEventListener("scroll", dismissOnScroll, true);
      doc.removeEventListener("pointerdown", dismissOnPointerDown, true);
      doc.removeEventListener("focusin", dismissOnFocus, true);
    };
  }, [open, popupRef, anchorEl, toggleOnAnchor]);
}
