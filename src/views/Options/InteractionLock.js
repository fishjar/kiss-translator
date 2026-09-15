import { useLayoutEffect, useRef } from "react";

export default function InteractionLock({ locked, children, ...props }) {
  const rootRef = useRef(null);
  const focusedRef = useRef(null);

  useLayoutEffect(() => {
    if (!locked) return;
    const activeElement = rootRef.current?.ownerDocument.activeElement;
    if (
      rootRef.current?.contains(activeElement) ||
      focusedRef.current === activeElement
    ) {
      activeElement?.blur();
    }
  }, [locked]);

  const blockInteraction = (event) => {
    if (!locked) return;
    // React registers touchstart as passive; the later click is still blocked.
    if (event.type !== "touchstart") event.preventDefault();
    event.stopPropagation();
  };

  const blockKeyboard = (event) => {
    if (!locked) return;
    event.stopPropagation();
    // Preserve browser shortcuts and allow Tab to move beyond the locked view.
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== "Tab" &&
      !/^F\d{1,2}$/.test(event.key)
    ) {
      event.preventDefault();
    }
  };

  const handleFocus = (event) => {
    if (!locked) {
      focusedRef.current = event.target;
      return;
    }
    event.stopPropagation();
    event.target.blur();
  };

  return (
    <div
      {...props}
      ref={rootRef}
      // React 18 requires a string for the native inert attribute.
      inert={locked ? "" : undefined}
      aria-busy={locked}
      // Capture handlers also cover dynamically mounted controls and portals.
      onClickCapture={blockInteraction}
      onDoubleClickCapture={blockInteraction}
      onMouseDownCapture={blockInteraction}
      onMouseUpCapture={blockInteraction}
      onPointerDownCapture={blockInteraction}
      onPointerUpCapture={blockInteraction}
      onTouchStartCapture={blockInteraction}
      onTouchEndCapture={blockInteraction}
      onKeyDownCapture={blockKeyboard}
      onKeyPressCapture={blockKeyboard}
      onKeyUpCapture={blockKeyboard}
      onBeforeInputCapture={blockInteraction}
      onInputCapture={blockInteraction}
      onChangeCapture={blockInteraction}
      onCutCapture={blockInteraction}
      onPasteCapture={blockInteraction}
      onDropCapture={blockInteraction}
      onDragStartCapture={blockInteraction}
      onSubmitCapture={blockInteraction}
      onResetCapture={blockInteraction}
      onFocusCapture={handleFocus}
      onBlurCapture={blockInteraction}
    >
      {children}
    </div>
  );
}
