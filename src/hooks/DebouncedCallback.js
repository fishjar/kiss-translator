import { useMemo, useEffect, useRef } from "react";
import { debounce } from "../libs/utils";

/**
 * 自定义防抖回调 Hook。其核心优势在于使用 callbackRef 追踪最新回调，
 * 避免因外部传入的回调函数实例改变而导致防抖函数高频重新生成（进而导致计时器被不断重置）。
 * @param {function} callback 待防抖的回调函数
 * @param {number} delay 防抖延迟时间（毫秒）
 * @returns {function} 带有 cancel() 方法的防抖化回调函数
 */
export function useDebouncedCallback(callback, delay) {
  // 使用 Ref 保存最新传入的回调函数引用，从而避免防抖函数在 dependencies 中依赖 callback
  const callbackRef = useRef(callback);

  // 每次传入的 callback 改变时，更新 Ref 的值
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 仅当 delay 改变时，才会重新调用 debounce 生成防抖函数
  const debouncedCallback = useMemo(
    () => debounce((...args) => callbackRef.current(...args), delay),
    [delay]
  );

  // 当 debouncedCallback 改变（即 delay 变化）或组件卸载时，自动取消在途的延迟防抖执行，避免内存泄漏
  useEffect(() => {
    return () => {
      debouncedCallback.cancel();
    };
  }, [debouncedCallback]);

  return debouncedCallback;
}
