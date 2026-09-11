import { useCallback, useEffect, useRef, useState } from "react";

// 真离场后的退出动画时长（ms）：关闭过渡结束后卸载相关控件
export const FOCUS_CLOSE_DELAY_MS = 120;

/**
 * 唯一焦点退出 gate：TranForm / TranCont 共享的「聚焦 + 退出动画」状态机。
 *
 * 从两个组件中抽取的共同逻辑，保证焦点保活与退出动画行为单一真源：
 * - 容器内焦点迁移（Tab/Shift+Tab 在 textarea、复制按钮、提交按钮、缩放手柄
 *   之间移动）不放行关闭；
 * - 真正离开容器时立即执行 onTrueBlur（TranForm 在此提交 editText.trim()，
 *   TranCont 无提交回调），并进入 120ms closing 过渡；
 * - prefers-reduced-motion 时跳过过渡、同步关闭并同步完成关闭生命周期（onClosingEnd）；
 * - closing 期间重新聚焦任意子元素会取消未到期定时器并恢复 focused；
 * - 组件卸载时取消未决定时器，不产生卸载后的状态回写。
 *
 * 输入：
 * @param {Object} options
 * @param {boolean} options.prefersReducedMotion 系统是否启用"减少动态效果"。
 * @param {Function} [options.onTrueBlur] 焦点真正离开容器时的提交回调。
 * @param {Function} [options.onClosingEnd] closing 过渡结束时的回调（常规路径 120ms 到期触发；reduced-motion 下随同步关闭立即触发）。
 *
 * 输出：
 * @returns {{focused: boolean, closing: boolean, handleFocus: Function, handleBlur: Function}}
 *   - focused：容器内是否存在焦点（驱动 rail / 手柄显隐）。
 *   - closing：是否处于退出过渡中。
 *   - handleFocus：容器内任意可聚焦元素聚焦时调用（只恢复 gate，不修改业务 editMode）。
 *   - handleBlur：容器包装层 onBlur（focusout 冒泡）处理器。
 *
 * 注意：textarea 自身的 onFocus/onChange 与粘贴命令继续负责恢复业务 editMode；
 * 活动 Pointer/Touch 拖动会话由 ResizeHandle 自己保活，不并入本 Hook。
 */
export function useFocusClosingGate({
  prefersReducedMotion = false,
  onTrueBlur,
  onClosingEnd,
}) {
  const [focused, setFocused] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  // 卸载时取消未决定时器，避免卸载后仍触发状态更新
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const handleFocus = useCallback(() => {
    // 重新聚焦：取消未到期的退出动画定时器，rail 重新进入
    clearCloseTimer();
    setFocused(true);
    setClosing(false);
  }, [clearCloseTimer]);

  const handleBlur = useCallback(
    (e) => {
      // 焦点保活：relatedTarget 判定必须先于 reduced-motion 的同步卸载分支。
      // textarea ↔ rail ↔ 手柄之间的内部焦点迁移（Tab）不关闭、不卸载——否则
      // 键盘用户 Tab 进手柄/按钮的瞬间字段即卸载；relatedTarget 为 null 或
      // 在包装层外才恢复正常关闭。
      if (e.currentTarget.contains(e.relatedTarget)) {
        return;
      }
      // 提交语义立即生效：真正离开字段时提交当前编辑内容（TranCont 无提交回调）
      onTrueBlur?.();
      // focus-gating 立即翻转：手柄与 rail 中的焦点相关控件随失焦卸载
      setFocused(false);
      if (prefersReducedMotion) {
        // 减少动态效果：跳过退出动画延迟，立即关闭并同步完成关闭生命周期
        clearCloseTimer();
        setClosing(false);
        onClosingEnd?.();
        return;
      }
      // 退出动画：rail 滞留 120ms 播放淡出。先清理未到期定时器，
      // 防止双 blur 边界旧定时器提前截断本次退出动画。
      setClosing(true);
      clearCloseTimer();
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        onClosingEnd?.();
      }, FOCUS_CLOSE_DELAY_MS);
    },
    [clearCloseTimer, onTrueBlur, onClosingEnd, prefersReducedMotion]
  );

  return { focused, closing, handleFocus, handleBlur };
}
