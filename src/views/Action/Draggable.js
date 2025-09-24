import { useEffect, useMemo, useState } from "react";
import { limitNumber } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";
import { putFab } from "../../libs/storage";
import { debounce } from "../../libs/utils";
import Paper from "@mui/material/Paper";

const getEdgePosition = ({
  x: left,
  y: top,
  width,
  height,
  windowWidth,
  windowHeight,
  hover,
}) => {
  const right = windowWidth - left - width;
  const bottom = windowHeight - top - height;
  const min = Math.min(left, top, right, bottom);
  switch (min) {
    case right:
      left = hover ? windowWidth - width : windowWidth - width / 2;
      break;
    case left:
      left = hover ? 0 : -width / 2;
      break;
    case bottom:
      top = hover ? windowHeight - height : windowHeight - height / 2;
      break;
    default:
      top = hover ? 0 : -height / 2;
  }
  return { x: left, y: top };
};

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

export default function Draggable({
  windowSize: { w: windowWidth, h: windowHeight },
  width,
  height,
  left,
  top,
  show,
  snapEdge,
  onStart,
  onMove,
  handler,
  children,
  usePaper,
}) {
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState(null);
  const [position, setPosition] = useState({ x: left, y: top });
  const setFabPosition = useMemo(() => debounce(putFab, 500), []);

  const handlePointerDown = (e) => {
    !isMobile && e.target.setPointerCapture(e.pointerId);
    onStart && onStart();
    const { x, y } = position;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({ x, y, clientX, clientY });
  };

  const handlePointerMove = (e) => {
    onMove && onMove();
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    if (origin) {
      const dx = clientX - origin.clientX;
      const dy = clientY - origin.clientY;
      let x = origin.x + dx;
      let y = origin.y + dy;
      x = limitNumber(x, -width / 2, windowWidth - width / 2);
      y = limitNumber(y, 0, windowHeight - height / 2);
      setPosition({ x, y });
    }
  };

  const handlePointerUp = (e) => {
    e.stopPropagation();
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

  useEffect(() => {
    if (!snapEdge || !!origin) {
      return;
    }

    setPosition((pre) => {
      const edgePosition = getEdgePosition({
        ...pre,
        width,
        height,
        windowWidth,
        windowHeight,
        hover,
      });
      setFabPosition(edgePosition);
      return edgePosition;
    });
  }, [
    origin,
    hover,
    width,
    height,
    windowWidth,
    windowHeight,
    snapEdge,
    setFabPosition,
  ]);

  const opacity = useMemo(() => {
    if (snapEdge) {
      return hover || origin ? 1 : 0.2;
    }
    return origin ? 0.8 : 1;
  }, [origin, snapEdge, hover]);

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
    <DraggableWrapper
      usePaper={usePaper}
      style={{
        opacity,
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
        display: show ? "block" : "none",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div
        style={{
          touchAction: "none",
        }}
        {...touchProps}
      >
        {handler}
      </div>
      <div>{children}</div>
    </DraggableWrapper>
  );
}
