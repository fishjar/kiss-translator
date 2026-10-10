import { useEffect, useRef } from "react";
import { isShadowHostMoving } from "../libs/shadowHost";

/** Keep selection panels and their portaled menus within one focus boundary. */
export default function useTranboxFocus({ showBox, hideOnBlur, setShowBox }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!showBox || !hideOnBlur || !panel) return;

    const boundary =
      panel.closest(".kt-m3-root") || panel.closest(".KT-draggable") || panel;
    const ownerDocument = panel.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    let blurTimer;
    let pointerTimer;
    let internalPointer = false;
    const contains = (node) => Boolean(node && boundary.contains(node));
    const hasPanelFocus = () => contains(panel.getRootNode().activeElement);
    const dismiss = () => {
      ownerWindow.clearTimeout(blurTimer);
      setShowBox(false);
    };
    const handlePointerDown = (event) => {
      const path = event.composedPath();
      internalPointer = path.includes(boundary);
      if (
        internalPointer ||
        path.some((node) => node?.classList?.contains("KT-tranbtn"))
      ) {
        return;
      }
      // Nonfocusable page regions can preserve both focus and an old selection.
      // Capture the press before the page can prevent its default or bubbling.
      dismiss();
    };
    const handlePointerEnd = () => {
      ownerWindow.clearTimeout(pointerTimer);
      pointerTimer = ownerWindow.setTimeout(() => {
        internalPointer = false;
      }, 0);
    };
    const handleKeyDown = () => {
      internalPointer = false;
    };
    const handleFocusOut = (event) => {
      if (isShadowHostMoving(event.target) || contains(event.relatedTarget)) {
        return;
      }
      if (
        event.relatedTarget &&
        event.relatedTarget !== ownerDocument &&
        event.relatedTarget !== ownerDocument.body &&
        event.relatedTarget !== ownerDocument.documentElement
      ) {
        dismiss();
        return;
      }

      const preservePointerFocus = internalPointer;
      ownerWindow.clearTimeout(blurTimer);
      // Menu transitions and source submission can temporarily clear focus.
      // Resolve the final active element after the current interaction finishes.
      blurTimer = ownerWindow.setTimeout(() => {
        if (!panel.isConnected || hasPanelFocus()) return;
        if (preservePointerFocus) {
          panel.focus({ preventScroll: true });
        } else {
          dismiss();
        }
      }, 0);
    };
    const handleVisibilityChange = () => {
      if (ownerDocument.hidden) dismiss();
    };

    boundary.addEventListener("focusout", handleFocusOut, true);
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    ownerDocument.addEventListener("pointerup", handlePointerEnd, true);
    ownerDocument.addEventListener("pointercancel", handlePointerEnd, true);
    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    ownerWindow.addEventListener("blur", dismiss);
    ownerDocument.addEventListener("visibilitychange", handleVisibilityChange);
    // Full mode already focuses its source input; minimal mode needs a fallback.
    if (!hasPanelFocus()) panel.focus({ preventScroll: true });

    return () => {
      ownerWindow.clearTimeout(blurTimer);
      ownerWindow.clearTimeout(pointerTimer);
      boundary.removeEventListener("focusout", handleFocusOut, true);
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      ownerDocument.removeEventListener("pointerup", handlePointerEnd, true);
      ownerDocument.removeEventListener(
        "pointercancel",
        handlePointerEnd,
        true
      );
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
      ownerWindow.removeEventListener("blur", dismiss);
      ownerDocument.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [showBox, hideOnBlur, setShowBox]);

  return panelRef;
}
