import { useCallback, useEffect, useMemo, useState } from "react";
import { limitNumber } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";

const getEdgePosition = (
  { x: left, y: top, edge },
  windowWidth,
  windowHeight,
  width,
  height
) => {
  const right = windowWidth - left - width;
  const bottom = windowHeight - top - height;
  const min = Math.min(left, top, right, bottom);
  switch (min) {
    case right:
      edge = "right";
      left = windowWidth - width;
      break;
    case left:
      edge = "left";
      left = 0;
      break;
    case bottom:
      edge = "bottom";
      top = windowHeight - height;
      break;
    default:
      edge = "top";
      top = 0;
  }
  return { x: left, y: top, edge, hide: false };
};

const getHidePosition = (
  { x: left, y: top, edge },
  windowWidth,
  windowHeight,
  width,
  height
) => {
  switch (edge) {
    case "right":
      left = windowWidth - width / 2;
      break;
    case "left":
      left = -width / 2;
      break;
    case "bottom":
      top = windowHeight - height / 2;
      break;
    default:
      top = -height / 2;
  }
  return { x: left, y: top, edge, hide: true };
};

export default function Draggable({
  windowSize,
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
}) {
  const [origin, setOrigin] = useState({
    x: left,
    y: top,
    px: left,
    py: top,
  });
  const [position, setPosition] = useState({
    x: left,
    y: top,
    edge: null,
    hide: false,
  });
  const [edgeTimer, setEdgeTimer] = useState(null);

  const goEdge = useCallback((w, h, width, height) => {
    setPosition((pre) => getEdgePosition(pre, w, h, width, height));

    setEdgeTimer(
      setTimeout(() => {
        setPosition((pre) => getHidePosition(pre, w, h, width, height));
      }, 2000)
    );
  }, []);

  const handlePointerDown = (e) => {
    !isMobile && e.target.setPointerCapture(e.pointerId);
    onStart && onStart();
    edgeTimer && clearTimeout(edgeTimer);
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({
      x: position.x,
      y: position.y,
      px: clientX,
      py: clientY,
    });
  };

  const handlePointerMove = (e) => {
    onMove && onMove();
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    if (origin) {
      const dx = clientX - origin.px;
      const dy = clientY - origin.py;
      let x = origin.x + dx;
      let y = origin.y + dy;
      const { w, h } = windowSize;
      x = limitNumber(x, 0, w - width);
      y = limitNumber(y, 0, h - height);
      setPosition({ x, y, edge: null, hide: false });
    }
  };

  const handlePointerUp = (e) => {
    e.stopPropagation();
    setOrigin(null);
    if (!snapEdge) {
      return;
    }
    goEdge(windowSize.w, windowSize.h, width, height);
  };

  const handleClick = (e) => {
    e.stopPropagation();
  };

  const handleMouseEnter = (e) => {
    e.stopPropagation();
    if (snapEdge && position.hide) {
      edgeTimer && clearTimeout(edgeTimer);
      goEdge(windowSize.w, windowSize.h, width, height);
    }
  };

  useEffect(() => {
    setOrigin(null);
    if (!snapEdge) {
      return;
    }
    goEdge(windowSize.w, windowSize.h, width, height);
  }, [snapEdge, goEdge, windowSize.w, windowSize.h, width, height]);

  const opacity = useMemo(() => {
    if (snapEdge) {
      return position.hide ? 0.1 : 1;
    }
    return origin ? 0.8 : 1;
  }, [origin, snapEdge, position.hide]);

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
    <div
      style={{
        opacity,
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
        display: show ? "block" : "none",
      }}
      onMouseEnter={handleMouseEnter}
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
    </div>
  );
}
