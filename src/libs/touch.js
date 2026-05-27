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
  let isMoved = false;
  let startPositions = [];

  const handleTouchStart = (e) => {
    maxTouches = Math.max(maxTouches, e.touches.length);
    startPositions = Array.from(e.touches).map((t) => ({
      x: t.clientX,
      y: t.clientY,
    }));
  };

  const handleTouchMove = (e) => {
    if (isMoved) return;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const start = startPositions[i];
      if (!start) continue;

      const dist = Math.sqrt(
        Math.pow(touch.clientX - start.x, 2) +
          Math.pow(touch.clientY - start.y, 2)
      );

      if (dist > 10) {
        isMoved = true;
        break;
      }
    }
  };

  const handleTouchend = (e) => {
    if (e.touches.length === 0) {
      if (!isMoved && maxTouches === config.fingers) {
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
      isMoved = false;
      startPositions = [];
    }
  };

  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: true });
  document.addEventListener("touchend", handleTouchend, { passive: true });

  return () => {
    clearTimeout(tapTimer);
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchend);
  };
}
