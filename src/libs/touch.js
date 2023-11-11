export function touchTapListener(fn, touchsLength) {
  const handleTouchend = (e) => {
    if (e.touches.length === touchsLength) {
      fn();
    }
  };

  document.addEventListener("touchstart", handleTouchend);
  return () => {
    document.removeEventListener("touchstart", handleTouchend);
  };
}
