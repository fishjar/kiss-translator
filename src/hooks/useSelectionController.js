import { useState, useCallback, useMemo, useEffect } from "react";
import { sleep, limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import useAutoHideTranBtn from "./useAutoHideTranBtn";
import {
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
  OPT_TRANBOX_INTERACT_CLICK,
  OPT_TRANBOX_INTERACT_DBLCLICK,
} from "../config";

// 判断事件是否发生在翻译框内部（兼容 Shadow DOM 事件重定向）
function isEventInTranbox(e) {
  const path = e.composedPath ? e.composedPath() : [];
  return path.some(
    (el) => el.classList && el.classList.contains("KT-draggable")
  );
}

export default function useSelectionController({
  tranboxSetting,
  followSelection,
  boxOffsetX,
  boxOffsetY,
  boxSize,
  setBoxPosition,
  hideClickAway,
}) {
  const {
    hideTranBtn = false,
    triggerMode,
    tranboxInteractMode = "-",
  } = tranboxSetting;

  const [showBox, setShowBox] = useState(false);
  const [showBtn, setShowBtn] = useState(false);
  const [selectedText, setSelText] = useState(""); // 当前选中的文本
  const [text, setText] = useState(""); // 翻译框中的文本
  const [position, setPosition] = useState({ x: 0, y: 0 }); // 划词按钮位置

  // 划词按钮自动隐藏
  useAutoHideTranBtn(showBtn, setShowBtn, position);

  // 打开翻译框
  const handleOpenTranbox = useCallback(
    (inputText) => {
      setShowBtn(false);
      setText(inputText || selectedText);
      setShowBox(true);
    },
    [selectedText]
  );

  // 切换翻译框显示状态
  const handleToggleTranbox = useCallback(() => {
    setShowBtn(false);

    const selection = window.getSelection();
    const currentSelectedText = selection?.toString()?.trim() || "";
    if (!currentSelectedText) {
      setShowBox((pre) => !pre);
      return;
    }

    const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
    // 如果跟随选中文字，重新设置翻译框位置
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

  // 翻译按钮绑定事件名称
  const btnEvent = useMemo(() => {
    if (isMobile) {
      return "onTouchEnd";
    } else if (triggerMode === OPT_TRANBOX_TRIGGER_HOVER) {
      return "onMouseOver";
    }
    return "onMouseUp";
  }, [triggerMode]);

  // 监听划词事件
  // 注意：翻译框内容区域已通过 onMouseUp/onTouchEnd stopPropagation 阻止事件冒泡，
  // 因此此处的 handleMouseup 不会被翻译框内的选中操作触发。
  useEffect(() => {
    const eventName = isMobile ? "touchend" : "mouseup";

    async function handleMouseup(e) {
      // e.stopPropagation();\
      if (e.button === 2) return;

      await sleep(200);

      const selection = window.getSelection();
      const currentSelectedText = selection?.toString()?.trim() || "";
      setSelText(currentSelectedText);
      if (!currentSelectedText) {
        setShowBtn(false);
        return;
      }

      const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
      if (rect && followSelection) {
        const x = (rect.left + rect.right) / 2 + boxOffsetX;
        const y = rect.bottom + boxOffsetY;
        setBoxPosition({
          x: limitNumber(x, 0, window.innerWidth - boxSize.w),
          y: limitNumber(y, 0, window.innerHeight - 50),
        });
      }

      // 如果触发模式是划词即翻译，直接打开翻译框
      if (triggerMode === OPT_TRANBOX_TRIGGER_SELECT) {
        handleOpenTranbox(currentSelectedText);
        return;
      }

      const { clientX, clientY } = isMobile ? e.changedTouches[0] : e;
      setShowBtn(!hideTranBtn);
      setPosition({ x: clientX, y: clientY });
    }

    // window.addEventListener("mouseup", handleMouseup);
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

  // 监听翻译框内交互事件（单击/双击选中文本触发新翻译）
  // 使用 composedPath 判断事件来源，兼容 Shadow DOM 事件重定向
  // 注意：翻译框内容区域已通过 stopPropagation 阻止 mouseup 冒泡到 window，
  // 因此此处改用 document 捕获阶段监听，以接收翻译框内的事件。
  useEffect(() => {
    if (
      tranboxInteractMode !== OPT_TRANBOX_INTERACT_CLICK &&
      tranboxInteractMode !== OPT_TRANBOX_INTERACT_DBLCLICK
    ) {
      return;
    }

    const eventName =
      tranboxInteractMode === OPT_TRANBOX_INTERACT_DBLCLICK
        ? "dblclick"
        : "mouseup";

    function handleInteract(e) {
      // 只响应来自翻译框内部的事件（通过 composedPath 跨越 Shadow DOM 边界检测）
      if (!isEventInTranbox(e)) return;

      const selection = window.getSelection();
      const currentSelectedText = selection?.toString()?.trim() || "";
      if (!currentSelectedText) return;

      handleOpenTranbox(currentSelectedText);
    }

    // 使用 capture=true 以在 stopPropagation 之前捕获到翻译框内的事件
    document.addEventListener(eventName, handleInteract, true);
    return () => {
      document.removeEventListener(eventName, handleInteract, true);
    };
  }, [tranboxInteractMode, handleOpenTranbox]);

  // 点击空白处隐藏翻译框
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
