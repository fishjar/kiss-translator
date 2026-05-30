import { useState, useCallback, useMemo, useEffect } from "react";
import { sleep, limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import useAutoHideTranBtn from "./useAutoHideTranBtn";
import {
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
} from "../config";

/**
 * 获取当前选区的右下角坐标位置，以便于在此处展示划词翻译按钮或翻译框
 * @returns {object|null} {x, y} 坐标
 */
function getSelectionPosition() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  try {
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    if (rects.length === 0) return null;
    const lastRect = rects[rects.length - 1];
    return {
      x: lastRect.right + window.scrollX,
      y: lastRect.bottom + window.scrollY,
    };
  } catch {
    return null;
  }
}

/**
 * 划词翻译及弹出按钮选择状态控制器自定义 Hook
 *
 * // REVIEW: 1. Selection getRangeAt(0) 越界崩锁隐患。
 * //    在 `handleToggleTranbox()` 与 `handleMouseup()` 中直接调用了 `selection.getRangeAt(0)`。
 * //    虽然前置校验了选中文本非空，但在极少数异步交互或多 Iframe 切换场景中，`selection.rangeCount` 仍然可能为 0。
 * //    如果不加以 `rangeCount > 0` 保护而直接调用 `getRangeAt(0)`，会抛出 DOMException 异常导致页面脚本执行中断。
 * // 2. clickAway 点击别处收起冒泡风险。
 * //    直接通过 `window.addEventListener("click")` 实现点击空白处隐藏翻译框，若内部面板组件在被点击时没有严格执行 e.stopPropagation()，
 * //    会导致只要点击翻译框内部，事件冒泡至 window 后，直接误将翻译框隐藏关闭。
 */
export default function useSelectionController({
  tranboxSetting,
  followSelection,
  boxOffsetX,
  boxOffsetY,
  boxSize,
  setBoxPosition,
  hideClickAway,
}) {
  const { hideTranBtn = false, triggerMode } = tranboxSetting;

  const [showBox, setShowBox] = useState(false); // 翻译面板展示状态
  const [showBtn, setShowBtn] = useState(false); // 划词浮现的“译”按钮展示状态
  const [selectedText, setSelText] = useState(""); // 当前选中的原始文本缓存
  const [text, setText] = useState(""); // 实际翻译框中待翻译或翻译完成的文本
  const [position, setPosition] = useState({ x: 0, y: 0 }); // 划词按钮浮现位置

  // 绑定翻译触发按钮的自动超时隐藏机制
  useAutoHideTranBtn(showBtn, setShowBtn);

  // 打开翻译面板，将指定文本填入并显示面板
  const handleOpenTranbox = useCallback(
    (inputText) => {
      setShowBtn(false);
      setText(inputText || selectedText);
      setShowBox(true);
    },
    [selectedText]
  );

  // 切换/激活翻译面板
  const handleToggleTranbox = useCallback(() => {
    setShowBtn(false);

    const selection = window.getSelection();
    const currentSelectedText = selection?.toString()?.trim() || "";
    // 若没有选中文本，则执行面板展开状态的直接取反切换
    if (!currentSelectedText) {
      setShowBox((pre) => !pre);
      return;
    }

    const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
    // 如果启用跟随选中文字定位，重新计算并设定翻译面板相对于选区的展示位置，并边界限制防止溢出视口
    if (rect && followSelection) {
      const x = (rect.left + rect.right) / 2 + boxOffsetX;
      const y = rect.bottom + boxOffsetY;
      setBoxPosition({
        x: limitNumber(x, 0, window.innerWidth - boxSize.w),
        y: limitNumber(y, 0, window.innerHeight - 50),
      });
    }

    setSelText(currentSelectedText);
    setText(currentSelectedText);
    setShowBox(true);
  }, [followSelection, boxOffsetX, boxOffsetY, setBoxPosition, boxSize]);

  // 根据当前系统触发模式及移动端判定，确定翻译按钮的鼠标/触摸监听事件类型
  const btnEvent = useMemo(() => {
    if (isMobile) {
      return "onTouchEnd";
    } else if (triggerMode === OPT_TRANBOX_TRIGGER_HOVER) {
      return "onMouseOver";
    }
    return "onMouseUp";
  }, [triggerMode]);

  // 监听划词事件（mouseup / touchend）以实时定位选区并展示“译”按钮或直接打开翻译面板
  useEffect(() => {
    const eventName = isMobile ? "touchend" : "mouseup";

    async function handleMouseup(e) {
      if (e.button === 2) return; // 忽略鼠标右键

      await sleep(200); // 延迟等待系统选区高亮渲染及 Selection 属性就绪

      const selection = window.getSelection();
      const currentSelectedText = selection?.toString()?.trim() || "";
      setSelText(currentSelectedText);

      // 若没有选中文本，隐藏划词触发按钮
      if (!currentSelectedText) {
        setShowBtn(false);
        return;
      }

      // 获取选区相对于视口的边界数据，用以设定翻译面板的初始显示位置
      const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
      if (rect && followSelection) {
        const x = (rect.left + rect.right) / 2 + boxOffsetX;
        const y = rect.bottom + boxOffsetY;
        setBoxPosition({
          x: limitNumber(x, 0, window.innerWidth - boxSize.w),
          y: limitNumber(y, 0, window.innerHeight - 50),
        });
      }

      // 如果触发模式是划词完毕立即触发翻译，则直接打开翻译面板
      if (triggerMode === OPT_TRANBOX_TRIGGER_SELECT) {
        handleOpenTranbox(currentSelectedText);
        return;
      }

      // 否则，如果用户没有配置“隐藏翻译按钮”，计算选区右下角坐标以显示“译”按钮
      if (!hideTranBtn) {
        const selectionPos = getSelectionPosition();
        if (selectionPos) {
          setShowBtn(true);
          setPosition(selectionPos);
        } else {
          setShowBtn(false);
        }
      } else {
        setShowBtn(false);
      }
    }

    window.addEventListener(eventName, handleMouseup);
    return () => {
      window.removeEventListener(eventName, handleMouseup);
    };
  }, [
    hideTranBtn,
    triggerMode,
    followSelection,
    boxOffsetX,
    boxOffsetY,
    handleOpenTranbox,
    boxSize,
    setBoxPosition,
  ]);

  // 点击翻译面板空白处时，自动收起并隐藏翻译面板 (ClickAway)
  useEffect(() => {
    if (hideClickAway) {
      const handleHideBox = () => {
        setShowBox(false);
      };
      window.addEventListener("click", handleHideBox);
      return () => {
        window.removeEventListener("click", handleHideBox);
      };
    }
  }, [hideClickAway]);

  return {
    showBox,
    setShowBox,
    showBtn,
    setShowBtn,
    selectedText,
    setSelText,
    text,
    setText,
    position,
    setPosition,
    handleOpenTranbox,
    handleToggleTranbox,
    btnEvent,
  };
}
