import { useEffect, useMemo, useState } from "react";
import { limitNumber } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";

const getSidePosition = (
  windowWidth,
  windowHeight,
  width,
  height,
  left,
  top
) => {
  const right = Math.abs(windowWidth - left - width);
  const bottom = Math.abs(windowHeight - top - height);
  left = Math.abs(left);
  top = Math.abs(top);
  const min = Math.min(left, top, right, bottom);
  switch (min) {
    case right:
      left = windowWidth - width / 2;
      break;
    case left:
      left = -width / 2;
      break;
    case bottom:
      top = windowHeight - height / 2;
      break;

    default:
      top = -height / 2;
  }
  return { x: left, y: top };
};

export default function Draggable({
  windowSize,
  width,
  height,
  left,
  top,
  show,
  goside,
  onStart,
  onMove,
  handler,
  children,
}) {
  const [origin, setOrigin] = useState(goside ? {} : null);
  const [position, setPosition] = useState({
    x: left,
    y: top,
  });

  const handlePointerDown = (e) => {
    !isMobile && e.target.setPointerCapture(e.pointerId);
    onStart && onStart();
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
      x = limitNumber(x, -width / 2, w - width / 2);
      y = limitNumber(y, -height / 2, h - height / 2);
      setPosition({ x, y });
    }
  };

  const handlePointerUp = (e) => {
    setOrigin(null);
    if (!goside) {
      return;
    }
    setPosition((pre) =>
      getSidePosition(windowSize.w, windowSize.h, width, height, pre.x, pre.y)
    );
  };

  const handleClick = (e) => {
    e.stopPropagation();
  };

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

  useEffect(() => {
    setOrigin(null);
    if (!goside) {
      return;
    }
    setPosition((pre) =>
      getSidePosition(windowSize.w, windowSize.h, width, height, pre.x, pre.y)
    );
  }, [goside, windowSize.w, windowSize.h, width, height]);

  const opacity = useMemo(() => {
    if (goside) {
      return origin ? 1 : 0.3;
    }
    return origin ? 0.7 : 1;
  }, [origin, goside]);

  return (
    <div
      style={{
        opacity,
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
        display: show ? "block" : "none",
        transitionProperty: origin ? "none" : "all",
        transitionDuration: "0.5s",
        transitionDelay: "0.5s",
      }}
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
