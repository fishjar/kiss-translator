import { useEffect, useState } from "react";
import { limitNumber } from "../../libs/utils";

export default function Draggable(props) {
  const [origin, setOrigin] = useState(null);
  const [position, setPosition] = useState({
    x: props.left,
    y: props.top,
  });

  const handlePointerDown = (e) => {
    e.target.setPointerCapture(e.pointerId);
    props?.onStart();
    setOrigin({
      x: position.x,
      y: position.y,
      px: e.clientX,
      py: e.clientY,
    });
  };

  const handlePointerMove = (e) => {
    props?.onMove();
    if (origin) {
      const dx = e.clientX - origin.px;
      const dy = e.clientY - origin.py;
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {props.handler}
      </div>
      <div>{props.children}</div>
    </div>
  );
}
