import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { isMobile } from "../../libs/mobile";
import TranslationPanelSurface from "../../components/TranslationPanel/Surface";
import { limitNumber } from "../../libs/utils";
import {
  getMaxTranBoxContentWidth,
  getMaxTranBoxContentHeight,
  getMaxTranBoxX,
  getMaxTranBoxY,
  getTranBoxOuterHeight,
} from "../../libs/tranboxPosition";

/**
 * Drag and resize handle for eight resize directions and header dragging.
 *
 * @param {Object} props
 * @param {string} props.direction - Direction, such as "Header", "TopLeft", or "Bottom".
 * @param {Object} props.size - Current container dimensions { w, h }.
 * @param {Function} props.setSize - React setter for container dimensions.
 * @param {Object} props.position - Current container position { x, y }.
 * @param {Function} props.setPosition - React setter for container position.
 * @param {Object} props.minSize - Minimum allowed container dimensions.
 * @param {Object} props.maxSize - Maximum allowed container dimensions.
 */
function Pointer({
  direction,
  size,
  setSize,
  position,
  setPosition,
  children,
  minSize,
  maxSize,
  getMaxPositionY,
  ...props
}) {
  // Store the pointer coordinates, position, and size at the start of a drag or resize.
  const [origin, setOrigin] = useState(null);

  // Handle pointer or touch start.
  function handlePointerDown(e) {
    // The header contains buttons and an overflow menu as well as the drag area.
    // Pressing a control must not start a drag. Clear origin too, so the next move
    // cannot calculate its displacement from a stale starting point.
    if (e.target.closest?.("button, input, select, textarea, a")) {
      setOrigin(null);
      return;
    }

    // Capture desktop pointers to keep receiving events outside the element.
    !isMobile && e.target.setPointerCapture(e.pointerId);

    // Read the initial client coordinates, including mobile touch events.
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
      clientX,
      clientY,
    });
  }

  // Handle pointer or touch movement.
  function handlePointerMove(e) {
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    if (origin) {
      // Calculate the displacement.
      const dx = clientX - origin.clientX;
      const dy = clientY - origin.clientY;
      let x = position.x;
      let y = position.y;
      let w = size.w;
      let h = size.h;

      // Calculate the new position (x, y) and size (w, h) for this direction.
      switch (direction) {
        case "Header": // Move without resizing.
          x = origin.x + dx;
          y = origin.y + dy;
          break;
        case "TopLeft": // Resize from the top-left corner.
          x = origin.x + dx;
          y = origin.y + dy;
          w = origin.w - dx;
          h = origin.h - dy;
          break;
        case "Top": // Resize from the top edge.
          y = origin.y + dy;
          h = origin.h - dy;
          break;
        case "TopRight": // Resize from the top-right corner.
          y = origin.y + dy;
          w = origin.w + dx;
          h = origin.h - dy;
          break;
        case "Left": // Resize from the left edge.
          x = origin.x + dx;
          w = origin.w - dx;
          break;
        case "Right": // Resize from the right edge.
          w = origin.w + dx;
          break;
        case "BottomLeft": // Resize from the bottom-left corner.
          x = origin.x + dx;
          w = origin.w - dx;
          h = origin.h + dy;
          break;
        case "Bottom": // Resize from the bottom edge.
          h = origin.h + dy;
          break;
        case "BottomRight": // Resize from the bottom-right corner.
          w = origin.w + dx;
          h = origin.h + dy;
          break;
        default:
      }

      // Clamp the width to [minSize.w, maxSize.w].
      if (w < minSize.w) {
        w = minSize.w;
        x = position.x;
      }
      if (w > maxSize.w) {
        w = maxSize.w;
        x = position.x;
      }
      // Clamp the height to [minSize.h, maxSize.h].
      if (h < minSize.h) {
        h = minSize.h;
        y = position.y;
      }
      if (h > maxSize.h) {
        h = maxSize.h;
        y = position.y;
      }

      // Keep the translation panel inside the viewport while dragging or resizing.
      const nextSize = {
        w: limitNumber(w, minSize.w, getMaxTranBoxContentWidth()),
        h: limitNumber(h, minSize.h, getMaxTranBoxContentHeight()),
      };

      setPosition({
        x: limitNumber(x, 0, getMaxTranBoxX(nextSize.w)),
        y: limitNumber(y, 0, getMaxPositionY(nextSize.h)),
      });
      setSize(nextSize);
    }
  }

  // Handle pointer or touch end.
  function handlePointerUp(e) {
    e.stopPropagation();
    setOrigin(null);
  }

  // REVIEW: handlePointerDown reads TouchEvent.targetTouches[0] on mobile and PointerEvent elsewhere. Using PointerEvent consistently could improve hybrid touch/mouse support and avoid conflicts between touch and pointer listeners.
  // Browsers do not emit pointerup / touchend after pointercancel / touchcancel,
  // so cancellation must call handlePointerUp to clear origin.
  // Otherwise, a system gesture such as scrolling or pinching leaves a stale origin,
  // and moving over the header resumes dragging without any button pressed.
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
    <div {...props} {...touchProps}>
      {children}
    </div>
  );
}

/**
 * Positioned container with drag and resize support.
 */
export default function DraggableResizable({
  header,
  children,
  position = {
    x: 0,
    y: 0,
  },
  size = {
    w: 600,
    h: 400,
  },
  minSize = {
    w: 300,
    h: 200,
  },
  maxSize = {
    w: 1200,
    h: 1200,
  },
  setSize,
  setPosition,
  onChangeSize,
  onChangePosition,
  autoHeight,
  ...props
}) {
  // Width of the resize handles in pixels.
  const lineWidth = 4;
  const containerRef = useRef(null);

  const getMaxPositionY = useCallback(
    (contentHeight) => {
      if (!autoHeight) return getMaxTranBoxY(contentHeight);

      const outerHeight = containerRef.current?.offsetHeight;
      return Math.max(
        0,
        window.innerHeight -
          (outerHeight || getTranBoxOuterHeight(contentHeight))
      );
    },
    [autoHeight]
  );

  useLayoutEffect(() => {
    if (!autoHeight || !containerRef.current) return;

    const clampPosition = () => {
      setPosition((previous) => {
        const y = limitNumber(previous.y, 0, getMaxPositionY(size.h));
        return y === previous.y ? previous : { ...previous, y };
      });
    };

    clampPosition();
    const ResizeObserver = window.ResizeObserver;
    if (!ResizeObserver) return;

    const observer = new ResizeObserver(clampPosition);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [autoHeight, getMaxPositionY, setPosition, size.h]);

  const opts = {
    size,
    setSize,
    position,
    setPosition,
    minSize,
    maxSize,
    getMaxPositionY,
  };

  return (
    <Box
      ref={containerRef}
      className="KT-draggable"
      style={{
        touchAction: "none", // Disable default touch gestures.
        position: "fixed",
        left: position.x,
        top: position.y,
        // Arrange the resize handles around the panel in a 3x3 CSS grid.
        display: "grid",
        gridTemplateColumns: `${lineWidth * 2}px ${size.w}px ${lineWidth * 2}px`,
        gridTemplateRows: `${lineWidth * 2}px auto ${lineWidth * 2}px`,
        zIndex: 2147483647,
        borderRadius: "16px",
        overflow: "hidden",
      }}
      {...props}
    >
      {/* ---------------- Top and side resize handles ---------------- */}
      <Pointer
        direction="TopLeft"
        style={{
          transform: `translate(${lineWidth}px, ${lineWidth}px)`,
          cursor: "nw-resize",
        }}
        {...opts}
      />
      <Pointer
        direction="Top"
        style={{
          margin: `0 ${lineWidth}px`,
          transform: `translate(0px, ${lineWidth}px)`,
          cursor: "row-resize",
        }}
        {...opts}
      />
      <Pointer
        direction="TopRight"
        style={{
          transform: `translate(-${lineWidth}px, ${lineWidth}px)`,
          cursor: "ne-resize",
        }}
        {...opts}
      />
      <Pointer
        direction="Left"
        style={{
          margin: `${lineWidth}px 0`,
          transform: `translate(${lineWidth}px, 0px)`,
          cursor: "col-resize",
        }}
        {...opts}
      />

      <TranslationPanelSurface
        className="KT-draggable-body"
        bodyClassName="KT-draggable-container"
        width={size.w}
        contentHeight={size.h}
        autoHeight={autoHeight}
        header={
          <Pointer
            className="KT-draggable-header"
            direction="Header"
            style={{ cursor: "move" }}
            {...opts}
          >
            {header}
          </Pointer>
        }
      >
        {children}
      </TranslationPanelSurface>
      {/* ---------------- Right and bottom resize handles ---------------- */}
      <Pointer
        direction="Right"
        style={{
          margin: `${lineWidth}px 0`,
          transform: `translate(-${lineWidth}px, 0px)`,
          cursor: "col-resize",
        }}
        {...opts}
      />
      <Pointer
        direction="BottomLeft"
        style={{
          transform: `translate(${lineWidth}px, -${lineWidth}px)`,
          cursor: "ne-resize",
        }}
        {...opts}
      />
      <Pointer
        direction="Bottom"
        style={{
          margin: `0 ${lineWidth}px`,
          transform: `translate(0px, -${lineWidth}px)`,
          cursor: "row-resize",
        }}
        {...opts}
      />
      <Pointer
        direction="BottomRight"
        style={{
          transform: `translate(-${lineWidth}px, -${lineWidth}px)`,
          cursor: "nw-resize",
        }}
        {...opts}
      />
    </Box>
  );
}
