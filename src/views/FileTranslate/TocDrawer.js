import { useEffect, useRef, useState } from "react";
import { Box, Paper } from "@mui/material";

export default function TocDrawer({
  open,
  onClose,
  toggleRef,
  width,
  defaultWidth,
  onWidthChange,
  children,
}) {
  const panel = useRef(null);
  const cleanup = useRef(() => {});
  const close = useRef(onClose);
  close.current = onClose;
  const [available, setAvailable] = useState(624);
  const max = Math.max(0, Math.min(600, available - 24));
  const min = Math.min(180, max);
  const clamp = (value) => Math.max(min, Math.min(max, value));
  const actualWidth = clamp(width);
  useEffect(() => {
    const parent = panel.current.parentElement;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width)
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (
        !panel.current?.contains(event.target) &&
        !toggleRef.current?.contains(event.target)
      )
        close.current();
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      cleanup.current();
    };
  }, [open, toggleRef]);
  const start = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanup.current();
    const startX = event.clientX,
      pointerId = event.pointerId;
    const cursor = document.body.style.cursor,
      userSelect = document.body.style.userSelect;
    let next = actualWidth,
      frame = null;
    const apply = () => {
      panel.current.style.width = `${next}px`;
    };
    const move = (e) => {
      if (e.pointerId !== pointerId) return;
      next = clamp(actualWidth + e.clientX - startX);
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          apply();
        });
    };
    const finish = (e) => {
      if (e.pointerId !== pointerId) return;
      if (e.type === "pointerup") move(e);
      cleanup.current();
      apply();
      onWidthChange(next);
    };
    cleanup.current = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (panel.current) panel.current.style.width = `${actualWidth}px`;
      cleanup.current = () => {};
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  return (
    <Paper
      ref={panel}
      className="kt-toc-drawer"
      elevation={8}
      aria-label="目录"
      aria-hidden={!open}
      style={{ width: actualWidth }}
      sx={{
        position: "absolute",
        top: 48,
        bottom: 0,
        left: 0,
        zIndex: 5,
        display: open ? "flex" : "none",
        flexDirection: "column",
        minHeight: 0,
        maxWidth: "calc(100% - 24px)",
        borderRadius: 0,
        overflow: "hidden",
      }}
    >
      {children}
      <Box
        role="separator"
        aria-label="目录宽度"
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={actualWidth}
        tabIndex={open ? 0 : -1}
        onPointerDown={start}
        onDoubleClick={() => onWidthChange(clamp(defaultWidth))}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            onWidthChange(
              clamp(actualWidth + (event.key === "ArrowLeft" ? -16 : 16))
            );
          }
        }}
        sx={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "col-resize",
          touchAction: "none",
          userSelect: "none",
          "&:hover, &:focus-visible": { bgcolor: "action.selected" },
        }}
      />
    </Paper>
  );
}
