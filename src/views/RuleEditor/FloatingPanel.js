import { useLayoutEffect, useRef, useState } from "react";
import { Box, ButtonBase, Paper } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { limitNumber } from "../../libs/utils";

// Shared by the editor and inspector; position is independent of page elements.
export default function FloatingPanel({
  title,
  moveLabel,
  actions,
  children,
  footer,
  position,
  onMove,
  onMoveEnd,
  width,
  viewport,
  bodySx,
}) {
  const panel = useRef(null);
  const origin = useRef(null);
  const lastMove = useRef(null);
  const [height, setHeight] = useState(0);
  const margin = Math.min(12, viewport.w / 4, viewport.h / 4);
  const panelWidth = Math.min(width, viewport.w - margin * 2);
  const minX = (viewport.x || 0) + margin;
  const minY = (viewport.y || 0) + margin;
  const maxX = minX + viewport.w - panelWidth - margin * 2;
  const maxY = minY + Math.max(0, viewport.h - height - margin * 2);
  const left = limitNumber(position.x, minX, maxX);
  const top = limitNumber(position.y, minY, maxY);

  useLayoutEffect(() => {
    const measure = () =>
      setHeight(panel.current.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = panel.current;
    // overscroll-behavior handles scrollable lists. Also consume wheel input
    // over empty lists and fixed controls, where there is no scroll container.
    const containWheel = (event) => {
      event.stopPropagation();
      const canScroll = event.composedPath().some((node) => {
        if (!(node instanceof Element) || !element.contains(node)) return false;
        const style = getComputedStyle(node);
        return (
          (/(auto|scroll)/.test(style.overflowY) &&
            ((event.deltaY < 0 && node.scrollTop > 0) ||
              (event.deltaY > 0 &&
                node.scrollTop + node.clientHeight < node.scrollHeight - 1))) ||
          (/(auto|scroll)/.test(style.overflowX) &&
            ((event.deltaX < 0 && node.scrollLeft > 0) ||
              (event.deltaX > 0 &&
                node.scrollLeft + node.clientWidth < node.scrollWidth - 1)))
        );
      });
      if (!canScroll && !event.ctrlKey) event.preventDefault();
    };
    element.addEventListener("wheel", containWheel, { passive: false });
    return () => element.removeEventListener("wheel", containWheel);
  }, []);

  const move = (x, y) => {
    const next = {
      x: limitNumber(x, minX, maxX),
      y: limitNumber(y, minY, maxY),
    };
    lastMove.current = next;
    onMove(next);
    return next;
  };
  const stopDrag = () => {
    if (origin.current && lastMove.current) onMoveEnd?.(lastMove.current);
    origin.current = null;
    lastMove.current = null;
  };
  return (
    <Paper
      ref={panel}
      component="aside"
      aria-label={title}
      sx={{
        position: "fixed",
        zIndex: 2147483647,
        left,
        top,
        width: panelWidth,
        maxHeight: viewport.h - margin * 2,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: "0 12px 48px #0003",
      }}
    >
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <ButtonBase
          data-rule-editor-move=""
          aria-label={moveLabel}
          title={moveLabel}
          disableRipple
          onPointerDown={(event) => {
            if (event.button !== 0 || event.isPrimary === false) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            origin.current = {
              x: left,
              y: top,
              clientX: event.clientX,
              clientY: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            if (!origin.current) return;
            move(
              origin.current.x + event.clientX - origin.current.clientX,
              origin.current.y + event.clientY - origin.current.clientY
            );
          }}
          onPointerUp={(event) => {
            stopDrag();
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={stopDrag}
          onLostPointerCapture={stopDrag}
          onKeyDown={(event) => {
            const directions = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const direction = directions[event.key];
            if (!direction) return;
            event.preventDefault();
            onMoveEnd?.(
              move(left + direction[0] * 24, top + direction[1] * 24)
            );
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            justifyContent: "start",
            py: 1.75,
            gap: 0.5,
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            fontSize: 18,
            fontWeight: 700,
            "&:active": { cursor: "grabbing" },
            "&.Mui-focusVisible": {
              outline: "2px solid",
              outlineColor: "primary.main",
            },
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 20, color: "text.secondary" }} />
          {title}
        </ButtonBase>
        {actions}
      </Box>
      <Box
        sx={{
          overflowY: "auto",
          overscrollBehavior: "contain",
          minHeight: 0,
          p: 2,
          ...bodySx,
        }}
      >
        {children}
      </Box>
      {footer && (
        <Box
          component="footer"
          sx={{
            p: 2,
            pt: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
            maxHeight: viewport.h * 0.55,
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {footer}
        </Box>
      )}
    </Paper>
  );
}
