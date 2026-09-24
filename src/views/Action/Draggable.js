import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { limitFloat, limitNumber } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";
import { putFab } from "../../libs/storage";
import { debounce } from "../../libs/utils";
import Paper from "@mui/material/Paper";

const FAB_EDGES = ["left", "right", "top", "bottom"];

// Find the viewport edge nearest to the current position.
export const getNearestEdge = ({
  x: left,
  y: top,
  width,
  height,
  windowWidth,
  windowHeight,
}) => {
  const right = windowWidth - left - width;
  const bottom = windowHeight - top - height;
  const min = Math.min(left, top, right, bottom);
  switch (min) {
    case right:
      return "right";
    case left:
      return "left";
    case bottom:
      return "bottom";
    default:
      return "top";
  }
};

// Position the control on one edge while keeping the cross-axis fully visible.
export const getEdgePosition = ({
  x: left,
  y: top,
  width,
  height,
  windowWidth,
  windowHeight,
  revealed,
  edge,
}) => {
  // Normalize non-finite values before calculating viewport bounds.
  const safeCoord = (value, fallback) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  width = safeCoord(width, 1);
  height = safeCoord(height, 1);
  windowWidth = safeCoord(windowWidth, 1);
  windowHeight = safeCoord(windowHeight, 1);
  left = safeCoord(left, 0);
  top = safeCoord(top, 0);
  const maxLeft = Math.max(0, windowWidth - width);
  const maxTop = Math.max(0, windowHeight - height);

  switch (edge) {
    case "right":
      left = revealed ? windowWidth - width : windowWidth - width / 2;
      top = limitFloat(top, 0, maxTop);
      break;
    case "left":
      left = revealed ? 0 : -width / 2;
      top = limitFloat(top, 0, maxTop);
      break;
    case "bottom":
      left = limitFloat(left, 0, maxLeft);
      top = revealed ? windowHeight - height : windowHeight - height / 2;
      break;
    default:
      left = limitFloat(left, 0, maxLeft);
      top = revealed ? 0 : -height / 2;
  }

  return { x: left, y: top };
};

// Optionally wrap the draggable content in a Material UI Paper surface.
function DraggableWrapper({ children, usePaper, ...props }) {
  if (usePaper) {
    return (
      <Paper {...props} elevation={4}>
        {children}
      </Paper>
    );
  }
  return <div {...props}>{children}</div>;
}

/**
 * Support pointer and touch dragging with edge snapping and hover reveal.
 */
export default function Draggable({
  windowSize: { w: windowWidth, h: windowHeight },
  width,
  height,
  left,
  top,
  edge: savedEdge,
  show = true,
  snapEdge,
  onStart,
  onMove,
  onPositionTransitionEnd,
  handler, // The drag handle.
  children, // The main content.
  usePaper,
  // The transformed wrapper is the containing block for fixed descendants.
  // Let it fit the action menu while edge snapping still uses the explicit width.
  fitContent,
  expanded, // Keep the anchor revealed while a child overlay is expanded.
}) {
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [positionTransitionEnabled, setPositionTransitionEnabled] =
    useState(false);
  const [origin, setOrigin] = useState(null); // Starting position and client coordinates.
  const [edge, setEdge] = useState(
    FAB_EDGES.includes(savedEdge) ? savedEdge : null
  );
  const containerRef = useRef(null);
  const draggedRef = useRef(false);
  const revealed = hover || focusWithin || expanded || Boolean(origin);

  // Store proportional positions so they scale with viewport changes.
  // Edge snapping normalizes invalid coordinates from zero-sized viewports.
  const latestPosition = useRef({
    x: left / windowWidth,
    y: top / windowHeight,
  });
  const latestEdge = useRef(edge);
  const [position, setPosition] = useState({
    x: left / windowWidth,
    y: top / windowHeight,
  });
  // Debounce storage updates for the latest drag position.
  const setFabPosition = useMemo(() => debounce(putFab, 500), []);

  // Apply the current position directly to the container.
  const applyTransform = useCallback((x, y) => {
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  // Keep event handlers synchronized with the latest position.
  useEffect(() => {
    latestPosition.current = position;
  }, [position]);

  useEffect(() => {
    latestEdge.current = edge;
  }, [edge]);

  // Preserve proportional positions and the locked edge on viewport resize.
  useEffect(() => {
    const onResize = () => {
      if (!containerRef.current) return;
      const { x: px, y: py } = latestPosition.current;
      const newWindowWidth = document.documentElement.clientWidth;
      const newWindowHeight = document.documentElement.clientHeight;
      const currentPosition = {
        x: px * newWindowWidth,
        y: py * newWindowHeight,
      };

      if (snapEdge && latestEdge.current) {
        const edgePosition = getEdgePosition({
          ...currentPosition,
          width,
          height,
          windowWidth: newWindowWidth,
          windowHeight: newWindowHeight,
          revealed,
          edge: latestEdge.current,
        });
        applyTransform(edgePosition.x, edgePosition.y);
        return;
      }

      applyTransform(currentPosition.x, currentPosition.y);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyTransform, height, revealed, snapEdge, width]);

  // Snap to the locked edge and persist the resulting position.
  useEffect(() => {
    if (!snapEdge || !!origin) {
      return;
    }

    const currentPosition = {
      x: position.x * windowWidth,
      y: position.y * windowHeight,
    };

    const activeEdge =
      edge ||
      getNearestEdge({
        ...currentPosition,
        width,
        height,
        windowWidth,
        windowHeight,
      });
    if (!edge) {
      setEdge(activeEdge);
      latestEdge.current = activeEdge;
    }

    const edgePosition = getEdgePosition({
      ...currentPosition,
      width,
      height,
      windowWidth,
      windowHeight,
      revealed,
      edge: activeEdge,
    });

    applyTransform(edgePosition.x, edgePosition.y);

    const percentageEdge = {
      x: edgePosition.x / windowWidth,
      y: edgePosition.y / windowHeight,
    };
    setPosition(percentageEdge);
    setFabPosition({ ...edgePosition, edge: activeEdge });
  }, [
    edge,
    origin,
    revealed,
    width,
    height,
    windowWidth,
    windowHeight,
    snapEdge,
    setFabPosition,
    position.x,
    position.y,
    applyTransform,
  ]);

  useEffect(() => {
    setPositionTransitionEnabled(true);
  }, []);

  // Begin dragging and capture the initial coordinates.
  const handlePointerDown = (e) => {
    if (
      usePaper &&
      e.target.closest?.("button, a, input, select, textarea, [role='button']")
    ) {
      return;
    }
    // Only panel controls skip dragging: the FAB handle is itself a button.
    // Capture pointer movement even after the pointer leaves the handle.
    !isMobile && e.target.setPointerCapture(e.pointerId);
    onStart && onStart();
    draggedRef.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : position.x * windowWidth;
    const currentY = rect ? rect.top : position.y * windowHeight;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({ x: currentX, y: currentY, clientX, clientY });
  };

  // Move the container by the current pointer or touch displacement.
  const handlePointerMove = (e) => {
    if (!origin) return;
    onMove && onMove();
    draggedRef.current = true;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    const dx = clientX - origin.clientX;
    const dy = clientY - origin.clientY;
    let x = origin.x + dx;
    let y = origin.y + dy;

    // Keep the dragged control within the reachable viewport bounds.
    x = limitNumber(x, -width / 2, windowWidth - width / 2);
    y = limitNumber(y, 0, windowHeight - height / 2);

    applyTransform(x, y);
    const relativePosition = {
      x: x / windowWidth,
      y: y / windowHeight,
    };
    setPosition(relativePosition);
    latestPosition.current = relativePosition;
  };

  // Finish dragging without forwarding the event to underlying elements.
  const handlePointerUp = (e) => {
    e.stopPropagation();
    if (snapEdge && draggedRef.current) {
      const currentPosition = {
        x: latestPosition.current.x * windowWidth,
        y: latestPosition.current.y * windowHeight,
      };
      const nextEdge = getNearestEdge({
        ...currentPosition,
        width,
        height,
        windowWidth,
        windowHeight,
      });
      setEdge(nextEdge);
      latestEdge.current = nextEdge;
    }
    setOrigin(null);
  };

  const handleClick = (e) => {
    e.stopPropagation();
  };

  const handleMouseEnter = (e) => {
    e.stopPropagation();
    setHover(true);
  };

  const handleMouseLeave = (e) => {
    e.stopPropagation();
    setHover(false);
  };

  const handleFocusCapture = () => {
    setFocusWithin(true);
  };

  const handleBlurCapture = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setFocusWithin(false);
    }
  };

  // M3 FABs remain fully opaque; non-snapped panels still soften while dragging.
  const opacity = useMemo(() => {
    if (snapEdge) {
      return 1;
    }
    return origin ? 0.8 : 1;
  }, [origin, snapEdge]);

  const transition =
    positionTransitionEnabled && !origin
      ? "opacity 160ms ease, transform 180ms cubic-bezier(.2, 0, 0, 1)"
      : "opacity 160ms ease";

  // Cancellation must end a drag because browsers do not emit a later up event.
  const touchProps = isMobile
    ? {
        onTouchStart: handlePointerDown,
        onTouchMove: handlePointerMove,
        onTouchEnd: handlePointerUp,
        onTouchCancel: handlePointerUp,
      }
    : {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerUp,
      };

  return (
    <div
      ref={containerRef}
      style={{
        width: fitContent ? undefined : width,
        opacity,
        transition,
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 2147483647,
        display: show ? "block" : "none",
        willChange: "transform, opacity",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      onClick={handleClick}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "transform"
        ) {
          onPositionTransitionEnd?.();
        }
      }}
    >
      <DraggableWrapper usePaper={usePaper}>
        <div
          style={{
            touchAction: "none", // Prevent scrolling gestures while dragging.
          }}
          {...touchProps}
        >
          {handler}
        </div>
        <div>{children}</div>
      </DraggableWrapper>
    </div>
  );
}
