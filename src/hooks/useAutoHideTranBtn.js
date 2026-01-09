import { useEffect, useRef } from "react";

export default function useAutoHideTranBtn(
  showBtn,
  setShowBtn,
  position,
  options = {}
) {
  const { delay = 5000, distance = 100 } = options;

  const timerRef = useRef(null);
  const originRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!showBtn) return;

    originRef.current = position;

    /*等待5 秒自动隐藏翻译按钮*/
    timerRef.current = setTimeout(() => {
      setShowBtn(false);
    }, delay);

    /*鼠标移出 100px 自动隐藏翻译按钮*/
    const handleMouseMove = (e) => {
      const { x, y } = originRef.current;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      if (dx * dx + dy * dy > distance * distance) {
        setShowBtn(false);
      }
    };

    /*点击右键,隐藏翻译按钮*/
    const handleMouseDown = (e) => {
      if (e.button === 2) {
        setShowBtn(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    window.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [showBtn, position, delay, distance, setShowBtn]);
}
