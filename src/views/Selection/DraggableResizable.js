import { useState } from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { isMobile } from "../../libs/mobile";
import { useTheme, alpha } from "@mui/material/styles";
import { limitNumber } from "../../libs/utils";
import {
  getMaxTranBoxContentWidth,
  getMaxTranBoxContentHeight,
  getMaxTranBoxX,
  getMaxTranBoxY,
} from "../../libs/tranboxPosition";

/**
 * 拖拽/拉伸触发点（控制八个方向拉伸和顶部拖拽移动）
 *
 * @param {Object} props
 * @param {string} props.direction - 方向标识（例如 "Header", "TopLeft", "Bottom" 等）
 * @param {Object} props.size - 当前容器尺寸 { w, h }
 * @param {Function} props.setSize - 容器尺寸的 React setter
 * @param {Object} props.position - 当前容器位置 { x, y }
 * @param {Function} props.setPosition - 容器位置的 React setter
 * @param {Object} props.minSize - 容器最小允许尺寸
 * @param {Object} props.maxSize - 容器最大允许尺寸
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
  ...props
}) {
  // 记录拖动/拉伸开始时的起点物理坐标及初始位置大小
  const [origin, setOrigin] = useState(null);

  // 指针/触控按下事件
  function handlePointerDown(e) {
    // 非移动端环境，对指针捕获进行锁定，防止拖出元素边界时事件丢失
    !isMobile && e.target.setPointerCapture(e.pointerId);

    // 获取初始触点 client 坐标 (兼容移动端 Touch 事件)
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

  // 指针/触控移动事件
  function handlePointerMove(e) {
    const { clientX, clientY } = isMobile ? e.targetTouches[0] : e;
    if (origin) {
      // 计算偏移量
      const dx = clientX - origin.clientX;
      const dy = clientY - origin.clientY;
      let x = position.x;
      let y = position.y;
      let w = size.w;
      let h = size.h;

      // 根据拉伸方向，计算最新的位置 (x, y) 和尺寸 (w, h)
      switch (direction) {
        case "Header": // 仅位置平移拖拽
          x = origin.x + dx;
          y = origin.y + dy;
          break;
        case "TopLeft": // 左上角拉伸
          x = origin.x + dx;
          y = origin.y + dy;
          w = origin.w - dx;
          h = origin.h - dy;
          break;
        case "Top": // 顶边向上拉伸
          y = origin.y + dy;
          h = origin.h - dy;
          break;
        case "TopRight": // 右上角拉伸
          y = origin.y + dy;
          w = origin.w + dx;
          h = origin.h - dy;
          break;
        case "Left": // 左边向左拉伸
          x = origin.x + dx;
          w = origin.w - dx;
          break;
        case "Right": // 右边向右拉伸
          w = origin.w + dx;
          break;
        case "BottomLeft": // 左下角拉伸
          x = origin.x + dx;
          w = origin.w - dx;
          h = origin.h + dy;
          break;
        case "Bottom": // 底边向下拉伸
          h = origin.h + dy;
          break;
        case "BottomRight": // 右下角拉伸
          w = origin.w + dx;
          h = origin.h + dy;
          break;
        default:
      }

      // 限制拉伸宽度在 [minSize.w, maxSize.w] 区间
      if (w < minSize.w) {
        w = minSize.w;
        x = position.x;
      }
      if (w > maxSize.w) {
        w = maxSize.w;
        x = position.x;
      }
      // 限制拉伸高度在 [minSize.h, maxSize.h] 区间
      if (h < minSize.h) {
        h = minSize.h;
        y = position.y;
      }
      if (h > maxSize.h) {
        h = maxSize.h;
        y = position.y;
      }

      // 执行物理坐标边界控制更新 (保证翻译窗口在拖拽和缩放时不会移出屏幕可视区)
      const nextSize = {
        w: limitNumber(w, minSize.w, getMaxTranBoxContentWidth()),
        h: limitNumber(h, minSize.h, getMaxTranBoxContentHeight()),
      };

      setPosition({
        x: limitNumber(x, 0, getMaxTranBoxX(nextSize.w)),
        y: limitNumber(y, 0, getMaxTranBoxY(nextSize.h)),
      });
      setSize(nextSize);
    }
  }

  // 指针/触控抬起结束事件
  function handlePointerUp(e) {
    e.stopPropagation();
    setOrigin(null);
  }

  // REVIEW: handlePointerDown 中针对 isMobile 使用 TouchEvent 的 targetTouches[0] 获取坐标，非 isMobile 使用 PointerEvent。但在一些混合模式设备上（同时支持触屏和鼠标），使用 PointerEvent 代替 TouchEvent 可以获得更好的跨设备体验，同时能避免因 TouchEvent 与 PointerEvent 双重监听导致的事件冲突。
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

/**
 * 可拖拽、可拉伸调整大小的绝对定位弹性容器组件
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
  // 边缘拉伸触发边线的物理像素宽度
  const lineWidth = 4;
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // 深色模式下，为悬浮翻译小窗口提供精美的外发光日食效果阴影
  const glowShadow = isDark
    ? `
        0 0 0 1px rgba(255,255,255,0.18),
        0 0 10px 2px rgba(255,255,255,0.18),
        0 8px 32px rgba(0,0,0,0.35)
      `
    : ` 
        0 4px 18px rgba(0, 0, 0, 0.15)
      `;

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
        touchAction: "none", // 阻止系统默认的触摸手势行为
        position: "fixed",
        left: position.x,
        top: position.y,
        // CSS Grid 网格划分 3x3 空间，用于完美排布四周及顶部的拉伸触控条
        display: "grid",
        gridTemplateColumns: `${lineWidth * 2}px ${size.w}px ${lineWidth * 2}px`,
        gridTemplateRows: `${lineWidth * 2}px auto ${lineWidth * 2}px`,
        zIndex: 2147483647,
        borderRadius: "12px",
        overflow: "hidden",
      }}
      {...props}
    >
      {/* ---------------- 顶部与两侧的拉伸触发点组件 ---------------- */}
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

      {/* ---------------- 容器内部主体卡片区域 ---------------- */}
      <Paper
        className="KT-draggable-body"
        elevation={4}
        sx={{
          width: size.w,
          maxWidth: size.w,
          minWidth: 0,
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: theme.palette.background.paper,
          boxShadow: glowShadow,
        }}
      >
        {/* 顶部标题栏 (可拖动它来移动整个窗口位置) */}
        <Pointer
          className="KT-draggable-header"
          direction="Header"
          style={{ cursor: "move" }}
          {...opts}
        >
          {header}
        </Pointer>

        {/* 内容展示区 (支持纵向滚动，高度自适应或固定) */}
        <Box
          className="KT-draggable-container"
          sx={() => {
            const containerStyle = autoHeight
              ? {
                  width: size.w,
                  maxHeight: size.h,
                  overflow: "hidden auto",
                  wordBreak: "break-word",
                }
              : {
                  width: size.w,
                  height: size.h,
                  overflow: "hidden auto",
                  wordBreak: "break-word",
                };

            // 自定义滚动条风格
            const scrollbarTrackColor =
              theme.palette.mode === "dark"
                ? "#1f1f23"
                : theme.palette.background.paper;
            const scrollbarThumbColor =
              theme.palette.mode === "dark"
                ? alpha(theme.palette.text.primary, 0.28)
                : alpha(theme.palette.text.primary, 0.24);

            return {
              ...containerStyle,
              backgroundColor: theme.palette.background.paper,
              "&::-webkit-scrollbar": {
                width: 10,
                height: 10,
              },
              "&::-webkit-scrollbar-track": {
                background: scrollbarTrackColor,
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: scrollbarThumbColor,
                borderRadius: 8,
                border: `2px solid ${theme.palette.background.paper}`,
              },
              "&::-webkit-scrollbar-thumb:hover": {
                backgroundColor: alpha(theme.palette.text.primary, 0.36),
              },
              // firefox
              scrollbarWidth: "thin",
              scrollbarColor: `${scrollbarThumbColor} ${scrollbarTrackColor}`,
            };
          }}
        >
          {children}
        </Box>
      </Paper>

      {/* ---------------- 右下侧及底部拉伸触发点组件 ---------------- */}
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
