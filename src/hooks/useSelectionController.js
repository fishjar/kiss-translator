import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { sleep, limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import useAutoHideTranBtn from "./useAutoHideTranBtn";
import {
  OPT_TRANBOX_BTN_POSITION_FIXED,
  OPT_TRANBOX_BTN_POSITION_MOUSE,
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
} from "../config";

const TRANBTN_SIZE = isMobile ? 32 : 20; // 与 TranBtn 组件中的 SVG 尺寸保持一致
const TRANBTN_MOUSE_GAP = isMobile ? 16 : 12; // 鼠标模式下按钮与指针之间的基础间距

/**
 * 获取当前选区的右下角坐标位置，以便于在此处展示划词翻译按钮或翻译框
 * @returns {object|null} {x, y} 坐标
 */
function getSelectionPosition(selection = window.getSelection()) {
  if (!selection || selection.isCollapsed) return null;
  try {
    if (selection.rangeCount === 0) return null;
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
 * 从鼠标或触摸事件中提取页面坐标，用于让划词按钮跟随本次指针释放位置。
 *
 * 触摸事件优先使用 changedTouches[0]，因为 touchend 时 touches 可能已经为空。
 * @param {MouseEvent|TouchEvent|React.SyntheticEvent} e 鼠标或触摸事件
 * @returns {object|null} {x, y} 页面坐标
 */
function getPointerPosition(e) {
  const touch = e?.changedTouches?.[0] || e?.touches?.[0];
  if (typeof touch?.pageX === "number" && typeof touch?.pageY === "number") {
    return {
      x: touch.pageX,
      y: touch.pageY,
    };
  }

  if (typeof e?.pageX === "number" && typeof e?.pageY === "number") {
    return {
      x: e.pageX,
      y: e.pageY,
    };
  }

  return null;
}

function limitButtonPosition(value, min, max) {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

/**
 * 计算鼠标跟随模式下的按钮位置。
 *
 * 返回的是传给 TranBtn 的基础坐标；TranBtn 内部仍会叠加用户配置的 btnOffsetX/Y。
 * 因此这里先按最终渲染位置做边界修正，再扣回用户偏移，避免偏移后越出当前视口。
 * @param {object|null} pointerPosition 鼠标或触摸结束位置
 * @param {number} btnOffsetX 用户配置的按钮横向偏移
 * @param {number} btnOffsetY 用户配置的按钮纵向偏移
 * @returns {object|null} {x, y} 按钮基础坐标
 */
function getPointerButtonPosition(
  pointerPosition,
  btnOffsetX = 0,
  btnOffsetY = 0
) {
  if (!pointerPosition) return null;

  const offsetX = Number(btnOffsetX) || 0;
  const offsetY = Number(btnOffsetY) || 0;
  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = viewportLeft + window.innerWidth;
  const viewportBottom = viewportTop + window.innerHeight;

  let left = pointerPosition.x + TRANBTN_MOUSE_GAP + offsetX;
  let top = pointerPosition.y + TRANBTN_MOUSE_GAP + offsetY;

  // 指针靠近右侧或底部边界时，改放到左侧或上方，尽量保持与指针的间距。
  if (left + TRANBTN_SIZE > viewportRight) {
    left = pointerPosition.x - TRANBTN_MOUSE_GAP - TRANBTN_SIZE + offsetX;
  }
  if (top + TRANBTN_SIZE > viewportBottom) {
    top = pointerPosition.y - TRANBTN_MOUSE_GAP - TRANBTN_SIZE + offsetY;
  }

  const finalLeft = limitButtonPosition(
    left,
    viewportLeft,
    viewportRight - TRANBTN_SIZE
  );
  const finalTop = limitButtonPosition(
    top,
    viewportTop,
    viewportBottom - TRANBTN_SIZE
  );

  return {
    x: finalLeft - offsetX,
    y: finalTop - offsetY,
  };
}

/**
 * 根据事件来源定位 Selection 所在根节点。
 *
 * 翻译框可能运行在 ShadowRoot 内，直接使用 window.getSelection()
 * 会读不到面板内部二次划词的内容，因此需要优先读取事件目标所属根节点。
 *
 * @param {Event} e 鼠标或触摸事件
 * @returns {Document|ShadowRoot} 可提供 getSelection 的根节点
 */
function getSelectionRootFromEvent(e) {
  const root = e?.target?.getRootNode?.();
  return root?.getSelection ? root : document;
}

/**
 * 从当前选区提取最多 1000 字的段落上下文，供 AI 词典做语义消歧。
 *
 * @param {Selection} selection 当前浏览器选区
 * @returns {string} 清理空白后的上下文文本
 */
function getSelectionContext(selection) {
  try {
    if (!selection || selection.rangeCount === 0) return "";
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const container = element?.closest?.(
      "p, li, blockquote, article, section, main, div"
    );
    return (container?.textContent || element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
  } catch {
    return "";
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
  const {
    hideTranBtn = false,
    triggerMode,
    btnPositionMode = OPT_TRANBOX_BTN_POSITION_FIXED,
    btnOffsetX = 0,
    btnOffsetY = 0,
  } = tranboxSetting;

  const [showBox, setShowBox] = useState(false); // 翻译面板展示状态
  const [showBtn, setShowBtn] = useState(false); // 划词浮现的“译”按钮展示状态
  const [selectedText, setSelText] = useState(""); // 当前选中的原始文本缓存
  const [text, setText] = useState(""); // 实际翻译框中待翻译或翻译完成的文本
  const [textContext, setTextContext] = useState(""); // 当前选区所在段落上下文，供 AI 词典使用
  const [position, setPosition] = useState({ x: 0, y: 0 }); // 划词按钮浮现位置
  const selectionRootRef = useRef(document); // 最近一次划词所在根节点，兼容 ShadowRoot 内部选区

  const getActiveSelection = useCallback(
    () => selectionRootRef.current?.getSelection?.() || window.getSelection(),
    []
  );

  // 绑定翻译触发按钮的自动超时隐藏机制
  useAutoHideTranBtn(showBtn, setShowBtn, getActiveSelection);

  // 打开翻译面板，将指定文本填入并显示面板
  const handleOpenTranbox = useCallback(
    (inputText) => {
      setShowBtn(false);
      setText(inputText || selectedText);
      setShowBox(true);
    },
    [selectedText]
  );

  const handleSelectedText = useCallback(
    (selection, currentSelectedText, pointerPosition = null) => {
      setSelText(currentSelectedText);
      setTextContext(getSelectionContext(selection));

      if (!currentSelectedText) {
        setShowBtn(false);
        return;
      }

      // 同一套选区处理同时服务页面划词和翻译框内二次划词，统一做 rangeCount 防护。
      const rect =
        selection?.rangeCount > 0
          ? selection.getRangeAt(0)?.getBoundingClientRect()
          : null;
      if (rect && followSelection) {
        const x = (rect.left + rect.right) / 2 + boxOffsetX;
        const y = rect.bottom + boxOffsetY;
        setBoxPosition({
          x: limitNumber(x, 0, window.innerWidth - boxSize.w),
          y: limitNumber(y, 0, window.innerHeight - 50),
        });
      }

      if (triggerMode === OPT_TRANBOX_TRIGGER_SELECT) {
        handleOpenTranbox(currentSelectedText);
        return;
      }

      if (!hideTranBtn) {
        const buttonPosition =
          btnPositionMode === OPT_TRANBOX_BTN_POSITION_MOUSE && pointerPosition
            ? getPointerButtonPosition(pointerPosition, btnOffsetX, btnOffsetY)
            : getSelectionPosition(selection);

        if (buttonPosition) {
          setShowBtn(true);
          setPosition(buttonPosition);
        } else {
          setShowBtn(false);
        }
      } else {
        setShowBtn(false);
      }
    },
    [
      hideTranBtn,
      triggerMode,
      btnPositionMode,
      btnOffsetX,
      btnOffsetY,
      followSelection,
      boxOffsetX,
      boxOffsetY,
      handleOpenTranbox,
      boxSize,
      setBoxPosition,
    ]
  );

  const handlePanelSelection = useCallback(
    async (e) => {
      if (e.button === 2) return;

      e.stopPropagation?.();
      // 面板内选词使用事件根节点读取 Selection，避免 Shadow DOM 场景读到页面旧选区。
      selectionRootRef.current = getSelectionRootFromEvent(e);
      const pointerPosition = getPointerPosition(e);
      await sleep(0);
      const selection = getActiveSelection();
      const currentSelectedText = selection?.toString()?.trim() || "";
      if (!currentSelectedText) {
        return;
      }

      handleSelectedText(selection, currentSelectedText, pointerPosition);
    },
    [getActiveSelection, handleSelectedText]
  );

  // 切换/激活翻译面板
  const handleToggleTranbox = useCallback(() => {
    setShowBtn(false);

    selectionRootRef.current = document;
    const selection = window.getSelection();
    const currentSelectedText = selection?.toString()?.trim() || "";
    // 若没有选中文本，则执行面板展开状态的直接取反切换
    if (!currentSelectedText) {
      setShowBox((pre) => !pre);
      return;
    }

    const rect =
      selection?.rangeCount > 0
        ? selection.getRangeAt(0)?.getBoundingClientRect()
        : null;
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
    setTextContext(getSelectionContext(selection));
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

      const pointerPosition = getPointerPosition(e);
      await sleep(200); // 延迟等待系统选区高亮渲染及 Selection 属性就绪

      selectionRootRef.current = document;
      const selection = window.getSelection();
      const currentSelectedText = selection?.toString()?.trim() || "";
      handleSelectedText(selection, currentSelectedText, pointerPosition);
    }

    window.addEventListener(eventName, handleMouseup);
    return () => {
      window.removeEventListener(eventName, handleMouseup);
    };
  }, [handleSelectedText]);

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
    textContext,
    position,
    setPosition,
    handleOpenTranbox,
    handleToggleTranbox,
    handlePanelSelection,
    btnEvent,
  };
}
