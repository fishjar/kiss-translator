export function touchTapListener(fn, options = {}) {
  const config = {
    taps: 2,
    fingers: 1,
    delay: 300,
    ...options,
  };

  let maxTouches = 0;
  let tapCount = 0;
  let tapTimer = null;

  const handleTouchStart = (e) => {
    maxTouches = Math.max(maxTouches, e.touches.length);
  };

  const handleTouchend = (e) => {
    if (e.touches.length === 0) {
      if (maxTouches === config.fingers) {
        tapCount++;
        clearTimeout(tapTimer);

        if (tapCount === config.taps) {
          fn(e);
          tapCount = 0;
        } else {
          tapTimer = setTimeout(() => {
            tapCount = 0;
          }, config.delay);
        }
      } else {
        tapCount = 0;
        clearTimeout(tapTimer);
      }
      maxTouches = 0;
    }
  };

  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchend, { passive: true });

  return () => {
    clearTimeout(tapTimer);
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchend", handleTouchend);
  };
}
