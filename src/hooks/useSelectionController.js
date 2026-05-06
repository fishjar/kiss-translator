import { useState, useCallback, useMemo, useEffect } from "react";
import { sleep, limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import useAutoHideTranBtn from "./useAutoHideTranBtn";
import {
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
} from "../config";

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
  useEffect(() => {
    const eventName = isMobile ? "touchend" : "mouseup";

    async function handleMouseup(e) {
      // e.stopPropagation();
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
