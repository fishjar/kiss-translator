import { forwardRef, useLayoutEffect, useRef } from "react";
import Portal from "@mui/material/Portal";
import Popper from "@mui/material/Popper";
import { useTheme } from "@mui/material/styles";
import { useForkRef } from "@mui/material/utils";
import useDropdownDismiss from "./useDropdownDismiss";

// Keep MUI's MenuList navigation and use Popper's flip/overflow positioning:
// settings behind a dropdown remain scrollable, focusable and clickable.
const DropdownSurface = forwardRef(function DropdownSurface(
  { children, className, id, onClose, open, ownerState, style },
  ref
) {
  const popupRef = useRef(null);
  const handleRef = useForkRef(ref, popupRef);
  const theme = useTheme();
  const anchorEl =
    typeof ownerState.anchorEl === "function"
      ? ownerState.anchorEl()
      : ownerState.anchorEl;
  const trigger = anchorEl?.querySelector('[role="combobox"]') || anchorEl;

  useDropdownDismiss({
    open,
    popupRef,
    anchorEl,
    onClose,
    toggleOnAnchor: trigger !== anchorEl,
  });
  useLayoutEffect(() => {
    if (!open) return undefined;
    const popup = popupRef.current;
    const item = popup?.querySelector(
      '[role="option"][aria-selected="true"]:not(.Mui-disabled), .MuiMenuItem-root.Mui-selected:not(.Mui-disabled)'
    );
    const focusTarget =
      item ||
      popup?.querySelector(
        '.MuiMenuItem-root:not(.Mui-disabled), [role="listbox"], [role="menu"]'
      );
    // MUI's default autofocus can scroll the page before Popover positions it.
    focusTarget?.focus({ preventScroll: true });
    const paper = popup?.querySelector(".MuiPaper-root");
    if (item && paper) {
      paper.scrollTop =
        item.offsetTop - (paper.clientHeight - item.offsetHeight) / 2;
    }
    return () => {
      if (popup?.contains(popup.ownerDocument.activeElement)) {
        trigger?.focus({ preventScroll: true });
      }
    };
  }, [open, trigger]);

  return (
    <Popper
      ref={handleRef}
      id={id}
      className={className}
      role="presentation"
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      disablePortal
      popperOptions={{ strategy: "fixed" }}
      modifiers={[
        { name: "offset", options: { offset: [0, 4] } },
        // The outer Portal already escaped the field's clipping ancestors.
        { name: "flip", options: { padding: 16, altBoundary: false } },
        {
          name: "preventOverflow",
          options: { padding: 16, altAxis: true, altBoundary: false },
        },
      ]}
      style={{
        ...style,
        zIndex: theme.zIndex.modal,
        minWidth: anchorEl?.getBoundingClientRect().width,
        maxWidth: "calc(100vw - 32px)",
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" && event.key !== "Tab") return;
        // Restore the trigger before native Tab navigation, so the same
        // keystroke advances to the next setting instead of trapping focus.
        event.stopPropagation();
        if (event.key === "Escape") event.preventDefault();
        trigger?.focus({ preventScroll: true });
        onClose?.(
          event,
          event.key === "Escape" ? "escapeKeyDown" : "tabKeyDown"
        );
      }}
    >
      {children}
    </Popper>
  );
});

const DropdownRoot = forwardRef(function DropdownRoot(
  { container, open, ...props },
  ref
) {
  // Unmount on dismissal so an exit transition never delays the next action.
  if (!open) return null;
  return (
    <Portal container={container}>
      <DropdownSurface {...props} open ref={ref} />
    </Portal>
  );
});

export default DropdownRoot;
