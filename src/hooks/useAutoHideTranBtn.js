import { useEffect } from "react";

export default function useAutoHideTranBtn(showBtn, setShowBtn) {
  useEffect(() => {
    if (!showBtn) return;

    /*点击右键,隐藏翻译按钮*/
    const handleMouseDown = (e) => {
      if (e.button === 2) {
        setShowBtn(false);
      }
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setShowBtn(false);
    };

    window.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [showBtn, setShowBtn]);
}
