import { useState } from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { isMobile } from "../../libs/mobile";

function Pointer({
  direction,
  size,
  setSize,
  position,
  setPosition,
  children,
  minSize,
  maxSize,
  ...props
}) {
  const [origin, setOrigin] = useState(null);

  function handlePointerDown(e) {
    !isMobile && e.target.setPointerCapture(e.pointerId);
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

  function handlePointerMove(e) {
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    if (origin) {
      const dx = clientX - origin.clientX;
      const dy = clientY - origin.clientY;
      let x = position.x;
      let y = position.y;
      let w = size.w;
      let h = size.h;

      switch (direction) {
        case "Header":
          x = origin.x + dx;
          y = origin.y + dy;
          break;
        case "TopLeft":
          x = origin.x + dx;
          y = origin.y + dy;
          w = origin.w - dx;
          h = origin.h - dy;
          break;
        case "Top":
          y = origin.y + dy;
          h = origin.h - dy;
          break;
        case "TopRight":
          y = origin.y + dy;
          w = origin.w + dx;
          h = origin.h - dy;
          break;
        case "Left":
          x = origin.x + dx;
          w = origin.w - dx;
          break;
        case "Right":
          w = origin.w + dx;
          break;
        case "BottomLeft":
          x = origin.x + dx;
          w = origin.w - dx;
          h = origin.h + dy;
          break;
        case "Bottom":
          h = origin.h + dy;
          break;
        case "BottomRight":
          w = origin.w + dx;
          h = origin.h + dy;
          break;
        default:
      }

      if (w < minSize.w) {
        w = minSize.w;
        x = position.x;
      }
      if (w > maxSize.w) {
        w = maxSize.w;
        x = position.x;
      }
      if (h < minSize.h) {
        h = minSize.h;
        y = position.y;
      }
      if (h > maxSize.h) {
        h = maxSize.h;
        y = position.y;
      }

      setPosition({ x, y });
      setSize({ w, h });
    }
  }

  function handlePointerUp(e) {
    e.stopPropagation();
    setOrigin(null);
  }

  const touchProps = isMobile
    ? {
        onTouchStart: handlePointerDown,
        onTouchMove: handlePointerMove,
        onTouchEnd: handlePointerUp,
      }
    : {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
      };

  return (
    <div {...props} {...touchProps}>
      {children}
    </div>
  );
}

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
  const lineWidth = 4;
  const opts = {
    size,
    setSize,
    position,
    setPosition,
    minSize,
    maxSize,
  };

  return (
    <Box
      className="KT-draggable"
      style={{
        touchAction: "none",
        position: "fixed",
        left: position.x,
        top: position.y,
        display: "grid",
        gridTemplateColumns: `${lineWidth * 2}px auto ${lineWidth * 2}px`,
        gridTemplateRows: `${lineWidth * 2}px auto ${lineWidth * 2}px`,
        zIndex: 2147483647,
      }}
      {...props}
    >
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
      <Paper className="KT-draggable-body" elevation={4}>
        <Pointer
          className="KT-draggable-header"
          direction="Header"
          style={{ cursor: "move" }}
          {...opts}
        >
          {header}
        </Pointer>
        <Box
          className="KT-draggable-container"
          style={
            autoHeight
              ? {
                  width: size.w,
                  maxHeight: size.h,
                  overflow: "hidden auto",
                }
              : {
                  width: size.w,
                  height: size.h,
                  overflow: "hidden auto",
                }
          }
        >
          {children}
        </Box>
      </Paper>
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
