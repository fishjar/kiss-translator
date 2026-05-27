import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
  show = true,
  snapEdge,
  onStart,
  onMove,
  handler,
  children,
  usePaper,
}) {
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState(null);
  const containerRef = useRef(null);
  const latestPosition = useRef({
    x: left / windowWidth,
    y: top / windowHeight,
  });
  const [position, setPosition] = useState({
    x: left / windowWidth,
    y: top / windowHeight,
  });
  const setFabPosition = useMemo(() => debounce(putFab, 500), []);

  const applyTransform = useCallback((x, y) => {
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  useEffect(() => {
    latestPosition.current = position;
  }, [position]);

  useEffect(() => {
    const onResize = () => {
      if (!containerRef.current) return;
      const { x: px, y: py } = latestPosition.current;
      const newX = px * window.innerWidth;
      const newY = py * window.innerHeight;
      applyTransform(newX, newY);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyTransform]);

  useEffect(() => {
    if (!snapEdge || !!origin) {
      return;
    }

    const currentPosition = {
      x: position.x * windowWidth,
      y: position.y * windowHeight,
    };

    const edgePosition = getEdgePosition({
      x: currentPosition.x,
      y: currentPosition.y,
      width,
      height,
      windowWidth,
      windowHeight,
      hover,
    });

    applyTransform(edgePosition.x, edgePosition.y);

    const percentageEdge = {
      x: edgePosition.x / windowWidth,
      y: edgePosition.y / windowHeight,
    };
    setPosition(percentageEdge);
    setFabPosition(edgePosition);
  }, [
    origin,
    hover,
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

  const handlePointerDown = (e) => {
    !isMobile && e.target.setPointerCapture(e.pointerId);
    onStart && onStart();
    const rect = containerRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : position.x * windowWidth;
    const currentY = rect ? rect.top : position.y * windowHeight;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({ x: currentX, y: currentY, clientX, clientY });
  };

  const handlePointerMove = (e) => {
    onMove && onMove();
    if (!origin) return;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    const dx = clientX - origin.clientX;
    const dy = clientY - origin.clientY;
    let x = origin.x + dx;
    let y = origin.y + dy;
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
    <div
      ref={containerRef}
      style={{
        opacity,
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 2147483647,
        display: show ? "block" : "none",
        willChange: "transform",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <DraggableWrapper usePaper={usePaper}>
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
    </div>
  );
}
