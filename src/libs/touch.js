/**
 * 移动端多击/手势监听器。
 * 默认监听单指双击 (Double Tap) 手势，用于在移动端设备上快捷唤起或关闭翻译。
 * @param {Function} fn 手势触发后的回调函数
 * @param {Object} options 监听器配置项
 * @param {number} options.taps 触发回调所需的连续点击次数，默认 2 (双击)
 * @param {number} options.fingers 触屏的手指数量，默认 1 (单指)
 * @param {number} options.delay 点击判定最大间隔时间 (毫秒)，默认 300ms
 * @returns {Function} 用于解绑事件监听并销毁定时器的清理函数
 */
export function touchTapListener(fn, options = {}) {
  const config = {
    taps: 2,
    fingers: 1,
    delay: 300,
    ...options,
  };

  let maxTouches = 0; // 本次手势中最大同时触碰屏幕的手指数量
  let tapCount = 0; // 当前在有效期内的点击计数
  let tapTimer = null; // 多击判定延迟定时器
  let isMoved = false; // 手指是否发生了滑动偏移（大于 10px）
  let startPositions = []; // 记录所有触控手指按下时的初始 clientX / clientY 坐标

  // 监听触摸开始事件
  const handleTouchStart = (e) => {
    // 记录历史最大手指数量，用来区分布局手势（如单指双击 vs 双指单次点击）
    maxTouches = Math.max(maxTouches, e.touches.length);
    startPositions = Array.from(e.touches).map((t) => ({
      x: t.clientX,
      y: t.clientY,
    }));
  };

  // 监听触摸移动事件，用于过滤“滑动/拖拽”手势而非“点击”
  const handleTouchMove = (e) => {
    if (isMoved) return;

    // 遍历当前触屏的每个点，计算与按下的初始点的距离（欧氏距离）
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const start = startPositions[i];
      if (!start) continue;

      const dist = Math.sqrt(
        Math.pow(touch.clientX - start.x, 2) +
          Math.pow(touch.clientY - start.y, 2)
      );

      // 若移动距离超过 10px，则标记为“已滑动移动”，判定其为滑动行为而非 Tap
      if (dist > 10) {
        isMoved = true;
        break;
      }
    }
  };

  // 监听触摸结束事件
  const handleTouchend = (e) => {
    // 只有当所有手指都离开屏幕时，才进行最终的手势判定
    if (e.touches.length === 0) {
      if (!isMoved && maxTouches === config.fingers) {
        // 未发生偏移且手指数量符合预期，记为一次有效 Tap
        tapCount++;
        clearTimeout(tapTimer);

        if (tapCount === config.taps) {
          // 达到目标点击次数，执行回调
          fn(e);
          tapCount = 0; // 重置计数
        } else {
          // 未达到次数，则注册定时器，在指定 delay 时间后若无下一次 tap 则判定本次链中断并清零
          tapTimer = setTimeout(() => {
            tapCount = 0;
          }, config.delay);
        }
      } else {
        // 发生了移动或手指数量不符，立即清零并打断点击判定
        tapCount = 0;
        clearTimeout(tapTimer);
      }
      // 重置本次手势的状态参数
      maxTouches = 0;
      isMoved = false;
      startPositions = [];
    }
  };

  // 注册全局触摸监听器，使用 passive: true 提升移动端页面的滚动流畅度
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: true });
  document.addEventListener("touchend", handleTouchend, { passive: true });

  // 返回注销函数
  return () => {
    clearTimeout(tapTimer);
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchend);
  };
}
