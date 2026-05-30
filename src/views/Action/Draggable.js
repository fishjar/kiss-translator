import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { limitNumber } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";
import { putFab } from "../../libs/storage";
import { debounce } from "../../libs/utils";
import Paper from "@mui/material/Paper";

// 计算吸附到最近视口边缘的 X 或 Y 坐标
const getEdgePosition = ({
  x: left,
  y: top,
  width,
  height,
  windowWidth,
  windowHeight,
  hover, // 鼠标悬浮时展开显示，移开时吸附并隐藏一半以减少视觉打扰
}) => {
  const right = windowWidth - left - width;
  const bottom = windowHeight - top - height;
  // 找出当前距离上下左右哪个边缘最近
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

// 拖拽容器的包装器组件，支持通过 usePaper 配置决定是否使用 Material UI 的 Paper 阴影卡片背景
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
 * 拖拽交互容器组件，支持非移动端 Pointer 事件和移动端 Touch 事件
 * 同时支持贴边自动吸附及鼠标悬浮半展开效果
 */
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
  handler, // 点击并开始拖拽的触发区域
  children, // 容器内部的主体渲染元素
  usePaper,
}) {
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState(null); // 拖动起始的参考原点坐标和 client 坐标
  const containerRef = useRef(null);

  // 用百分比的形式保存位置，以便在视口大小 resize 时等比例缩放位置
  // REVIEW: 这里的 left / windowWidth 和 top / windowHeight 在首帧 windowWidth/Height 为 0 的异常场景下，
  // 会产生值为 NaN 或 Infinity 的致命错误。推荐使用 (windowWidth || 1) 对除数进行安全拦截。
  const latestPosition = useRef({
    x: left / windowWidth,
    y: top / windowHeight,
  });
  const [position, setPosition] = useState({
    x: left / windowWidth,
    y: top / windowHeight,
  });
  // 缓存防抖的 putFab，用于将最新的拖拽坐标写入本地 storage 持久化
  const setFabPosition = useMemo(() => debounce(putFab, 500), []);

  // 执行 transform 移动的 DOM 操作
  const applyTransform = useCallback((x, y) => {
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  // 同步最新位置的 Ref
  useEffect(() => {
    latestPosition.current = position;
  }, [position]);

  // 监听 resize 事件，自适应保持拖拽组件在屏幕中的相对比例坐标
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

  // 贴边自动吸附效果逻辑
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

  // 鼠标/手指按下，标记拖拽开始并记录起始坐标
  const handlePointerDown = (e) => {
    !isMobile && e.target.setPointerCapture(e.pointerId); // 捕获指针事件，使得移出当前元素时仍能响应 move
    onStart && onStart();
    const rect = containerRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : position.x * windowWidth;
    const currentY = rect ? rect.top : position.y * windowHeight;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    setOrigin({ x: currentX, y: currentY, clientX, clientY });
  };

  // 鼠标/手指拖动，计算当前位移偏差并移动 DOM
  const handlePointerMove = (e) => {
    onMove && onMove();
    if (!origin) return;
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    const dx = clientX - origin.clientX;
    const dy = clientY - origin.clientY;
    let x = origin.x + dx;
    let y = origin.y + dy;

    // 对拖动范围做视口越界拦截保护
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

  // 鼠标松开/手指抬起，清除拖拽 origin，并阻止事件冒泡防止底层元素误触
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

  // 根据拖拽状态及贴边设定，动态计算当前的半透明度 (非 hover 或没被拖拽时呈透明隐藏状态)
  const opacity = useMemo(() => {
    if (snapEdge) {
      return hover || origin ? 1 : 0.2;
    }
    return origin ? 0.8 : 1;
  }, [origin, snapEdge, hover]);

  // 根据移动端/PC端不同绑定不同的触摸/指针监听属性
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
            touchAction: "none", // 阻止浏览器默认的手势滑页行为，以便拖拽正常工作
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
