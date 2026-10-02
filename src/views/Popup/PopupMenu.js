import Menu from "@mui/material/Menu";
import { useLayoutEffect, useState } from "react";

/** Keep popup menus outside the scrolling panel and within its viewport. */
export default function PopupMenu({
  anchorEl,
  open,
  onClose,
  children,
  className = "",
  id,
  ariaLabel,
  maxHeight = 320,
  estimatedHeight = 200,
  align = "auto",
  position,
  menuRole = "menu",
}) {
  const [placement, setPlacement] = useState(null);
  const positionTop = position?.top;
  const positionLeft = position?.left;
  useLayoutEffect(() => {
    if (!open || !anchorEl) return undefined;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const viewport = anchorEl.ownerDocument.defaultView;
      const below = Math.max(0, viewport.innerHeight - rect.bottom - 12);
      const above = Math.max(0, rect.top - 12);
      const upwards =
        positionTop === undefined &&
        below < Math.min(estimatedHeight, maxHeight) &&
        above > below;
      const right =
        align === "right" ||
        (align === "auto" &&
          rect.left + rect.width / 2 > viewport.innerWidth / 2);
      setPlacement({
        top: positionTop ?? (upwards ? rect.top - 4 : rect.bottom + 4),
        left: positionLeft ?? (right ? rect.right : rect.left),
        vertical: upwards ? "bottom" : "top",
        horizontal: right ? "right" : "left",
        height: Math.max(
          36,
          Math.min(
            maxHeight,
            positionTop !== undefined
              ? viewport.innerHeight - positionTop - 8
              : upwards
                ? above
                : below
          )
        ),
      });
    };
    update();
    const viewport = anchorEl.ownerDocument.defaultView;
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update, true);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update, true);
    };
  }, [
    open,
    anchorEl,
    maxHeight,
    estimatedHeight,
    align,
    positionTop,
    positionLeft,
  ]);
  // Unmount immediately on dismissal. Changing a portal's container during
  // MUI's exit transition can leave an invisible modal intercepting clicks.
  if (!open || !anchorEl || !placement) return null;
  return (
    <Menu
      id={id}
      open
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        placement ? { top: placement.top, left: placement.left } : undefined
      }
      transformOrigin={{
        vertical: placement?.vertical || "top",
        horizontal: placement?.horizontal || "left",
      }}
      container={() =>
        anchorEl?.closest(".kt-m3-root") || anchorEl?.ownerDocument.body
      }
      disableScrollLock
      marginThreshold={8}
      transitionDuration={0}
      sx={{ zIndex: 2147483647 }}
      PaperProps={{
        className: `kt-popup-menu ${className}`,
        elevation: 0,
        style: {
          maxHeight: placement?.height,
          maxWidth: "calc(100% - 16px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
        },
      }}
      MenuListProps={{ "aria-label": ariaLabel, role: menuRole, dense: true }}
    >
      {children}
    </Menu>
  );
}
