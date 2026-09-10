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
  width,
  viewport,
}) {
  const panel = useRef(null);
  const origin = useRef(null);
  const [height, setHeight] = useState(0);
  const panelWidth = Math.min(width, viewport.w - 24);
  const left = limitNumber(position.x, 12, viewport.w - panelWidth - 12);
  const top = limitNumber(
    position.y,
    12,
    Math.max(12, viewport.h - height - 12)
  );

  useLayoutEffect(() => {
    const measure = () =>
      setHeight(panel.current.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);

  const move = (x, y) =>
    onMove({
      x: limitNumber(x, 12, viewport.w - panelWidth - 12),
      y: limitNumber(y, 12, Math.max(12, viewport.h - height - 12)),
    });
  const stopDrag = () => {
    origin.current = null;
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
        maxHeight: "min(760px, calc(100dvh - 24px))",
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
            move(left + direction[0] * 24, top + direction[1] * 24);
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
      <Box sx={{ overflowY: "auto", minHeight: 0, p: 2 }}>{children}</Box>
      {footer && (
        <Box
          sx={{
            p: 2,
            pt: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          {footer}
        </Box>
      )}
    </Paper>
  );
}
