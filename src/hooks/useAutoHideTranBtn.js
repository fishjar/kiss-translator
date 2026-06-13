import { useEffect } from "react";

/**
 * 翻译按钮自动隐藏机制自定义 Hook。
 * 当用户在页面中点击右键，或者页面中的文字选区被清空（Collapsed）时，自动隐藏划词翻译触发按钮。
 * @param {boolean} showBtn 按钮当前是否显示
 * @param {function} setShowBtn 控制按钮显示隐藏的 set 函数
 * @param {function} getSelection 获取当前有效选区
 */
export default function useAutoHideTranBtn(
  showBtn,
  setShowBtn,
  getSelection = () => window.getSelection()
) {
  useEffect(() => {
    // 如果按钮本就处于隐藏状态，无需做任何事件监听
    if (!showBtn) return;

    /* 点击鼠标右键时，自动隐藏翻译按钮 */
    const handleMouseDown = (e) => {
      if (e.button === 2) {
        setShowBtn(false);
      }
    };

    // 监听选区变化：如果当前选区不存在，或是选区被折叠（collapsed，即没有选中实际文本内容），隐藏翻译按钮
    // REVIEW: selectionchange 事件是一个超高频触发事件（在用户鼠标滑过文本或精细选择文字的整个拖拽期间会持续高频发生）。
    // 在其中高频判断并触发状态更新（setShowBtn(false)）可能带来性能开销。
    // 可以考虑引入轻量级去抖（debounce）或者仅在状态真正发生 true -> false 突变时才执行状态派发。
    const handleSelectionChange = () => {
      const selection = getSelection();
      if (!selection || selection.isCollapsed) setShowBtn(false);
    };

    window.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("selectionchange", handleSelectionChange);

    // 清理事件监听器
    return () => {
      window.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [showBtn, setShowBtn, getSelection]);
}
