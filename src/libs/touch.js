export function touchTapListener(fn, setting) {
  const [touchLength, touchCount, touchTime] = setting;

  let lastTouch = 0;
  let curCount = 0;
  const handleTouchend = (e) => {
    if (e.touches.length !== touchLength) {
      return;
    }

    const timer = setTimeout(() => {
      clearTimeout(timer);
      curCount = 0;
    }, touchTime);

    curCount++;
    const now = Date.now();
    if (curCount === touchCount && now - lastTouch <= touchTime) {
      timer && clearTimeout(timer);
      curCount = 0;
      fn();
    }

    lastTouch = now;
  };

  document.addEventListener("touchend", handleTouchend);
  return () => {
    document.removeEventListener("touchend", handleTouchend);
  };
}
