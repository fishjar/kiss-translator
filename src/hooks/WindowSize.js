import { useState, useEffect } from "react";
import { useDebouncedCallback } from "./DebouncedCallback";

/**
 * 视口大小（宽/高）变化监听的自定义 Hook，内置了防抖功能以提升缩放性能
 * @returns {object} { w: number, h: number }
 */
function useWindowSize() {
  // 维护视口大小的局部 React 状态
  const [windowSize, setWindowSize] = useState({
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  });

  // 定义带去抖（200ms）的窗口大小变更处理函数，避免频繁触发重排与重绘
  const debounceWindowResize = useDebouncedCallback(() => {
    setWindowSize({
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    });
  }, 200);

  // 绑定与解绑 resize 事件监听器
  useEffect(() => {
    debounceWindowResize(); // 挂载时立即执行一次初始化尺寸

    window.addEventListener("resize", debounceWindowResize);
    return () => {
      window.removeEventListener("resize", debounceWindowResize);
    };
  }, [debounceWindowResize]);

  return windowSize;
}

export default useWindowSize;
