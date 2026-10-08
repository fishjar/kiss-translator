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
    const insidePopup = (event) => popupRef.current?.contains(event.target);
    const dismissOnScroll = (event) => {
      if (!insidePopup(event) && !event.ctrlKey) {
        closeRef.current?.(event, "scroll");
      }
    };
    const dismissOnPointerDown = (event) => {
      if (insidePopup(event)) return;
      if (anchorEl?.contains(event.target)) {
        if (!toggleOnAnchor || event.button !== 0) return;
        // Select opens on mousedown. Suppress that compatibility event when
        // a second pointer press on the trigger is closing its current menu.
        event.preventDefault();
      }
      closeRef.current?.(event, "backdropClick");
    };
    const dismissOnFocus = (event) => {
      if (insidePopup(event) || anchorEl?.contains(event.target)) return;
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
