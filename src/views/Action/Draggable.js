import { useEffect, useState } from "react";
import { limitNumber } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";

export default function Draggable(props) {
  const [origin, setOrigin] = useState(null);
  const [position, setPosition] = useState({
    x: props.left,
    y: props.top,
  });

  const handlePointerDown = (e) => {
    !isMobile && e.target.setPointerCapture(e.pointerId);
    props?.onStart();
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({
      x: position.x,
      y: position.y,
      px: clientX,
      py: clientY,
    });
  };

  const handlePointerMove = (e) => {
    props?.onMove();
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    if (origin) {
      const dx = clientX - origin.px;
      const dy = clientY - origin.py;
      let x = origin.x + dx;
      let y = origin.y + dy;
      const { w, h } = props.windowSize;
      x = limitNumber(x, 0, w - props.width);
      y = limitNumber(y, 0, h - props.height);
      setPosition({ x, y });
    }
  };

  const handlePointerUp = (e) => {
    setOrigin(null);
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
    const { w, h } = props.windowSize;
    setPosition(({ x, y }) => ({
      x: limitNumber(x, 0, w - props.width),
      y: limitNumber(y, 0, h - props.height),
    }));
  }, [props.windowSize, props.width, props.height]);

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
      }}
      onClick={handleClick}
    >
      <div
        style={{
          touchAction: "none",
        }}
        {...touchProps}
      >
        {props.handler}
      </div>
      <div>{props.children}</div>
    </div>
  );
}
