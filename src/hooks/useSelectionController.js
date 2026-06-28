import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { sleep, limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import useAutoHideTranBtn from "./useAutoHideTranBtn";
import {
  APP_CONSTS,
  OPT_TRANBOX_BTN_POSITION_FIXED,
  OPT_TRANBOX_BTN_POSITION_MOUSE,
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
  OPT_TRANBOX_INTERACT_CLICK,
  OPT_TRANBOX_INTERACT_DBLCLICK,
} from "../config";
import {
  getMaxTranBoxX,
  getMaxTranBoxY,
  getTranBoxOuterHeight,
} from "../libs/tranboxPosition";

const TRANBTN_SIZE = isMobile ? 32 : 20;
const TRANBTN_MOUSE_GAP = isMobile ? 16 : 12;

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

function getEventPath(e) {
  return typeof e?.composedPath === "function" ? e.composedPath() : [];
}

function getOriginalEventTarget(e) {
  return getEventPath(e)?.[0] || e?.target;
}

function getSelectionRootFromEvent(e) {
  const target = getOriginalEventTarget(e);
  const root = target?.getRootNode?.();
  return root?.getSelection ? root : document;
}

function isTranboxEvent(e) {
  return getEventPath(e).some(
    (node) =>
      node?.id === APP_CONSTS.boxID ||
      node?.classList?.contains?.(`${APP_CONSTS.boxID}_wrapper`)
  );
}

function isPanelInteractiveTarget(target) {
  return Boolean(
    target?.closest?.(
      'button, input, textarea, select, [role="tab"], [role="button"]'
    )
  );
}

function isPanelInteractiveEvent(e) {
  return getEventPath(e).some((node) => isPanelInteractiveTarget(node));
}

function isTranButtonEvent(e) {
  return getEventPath(e).some((node) =>
    node?.classList?.contains?.("KT-tranbtn")
  );
}

function isUsableRect(rect) {
  if (!rect) return false;
  return Boolean(
    rect.width ||
      rect.height ||
      rect.left ||
      rect.right ||
      rect.top ||
      rect.bottom
  );
}

function getSelectionRects(selection) {
  try {
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const rects = range.getClientRects();
    return {
      rect,
      lastRect: rects.length > 0 ? rects[rects.length - 1] : rect,
    };
  } catch {
    return null;
  }
}

function getSelectionPositionFromRect(rect) {
  if (!rect) return null;
  return {
    x: rect.right + window.scrollX,
    y: rect.bottom + window.scrollY,
  };
}

/**
 * 计算翻译框跟随选区时的最佳显示位置。
 * 默认显示在选区下方，若下方空间不足则智能翻转到上方。若选区过大导致上下均无空间，则停靠在视口顶部。
 */
function getFollowBoxPosition(rect, boxOffsetX, boxOffsetY, boxSize) {
  const x = (rect.left + rect.right) / 2 + boxOffsetX;
  const bottomY = rect.bottom + boxOffsetY;
  const maxY = getMaxTranBoxY(boxSize.h);
  const y =
    bottomY + getTranBoxOuterHeight(boxSize.h) > window.innerHeight
      ? rect.top - getTranBoxOuterHeight(boxSize.h) - boxOffsetY
      : bottomY;

  return {
    x: limitNumber(x, 0, getMaxTranBoxX(boxSize.w)),
    y: limitNumber(y, 0, maxY),
  };
}

function getTargetContext(target) {
  const element =
    target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  const container = element?.closest?.(
    "p, li, blockquote, article, section, main, div"
  );
  return (container?.textContent || element?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function getSelectionContext(selection) {
  try {
    if (!selection || selection.rangeCount === 0) return "";
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const container = element?.closest?.(
      "p, li, blockquote, article, section, main, div"
    );
    if (!container) return "";
    return (container?.textContent || element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
  } catch {
    return "";
  }
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
    btnPositionMode = OPT_TRANBOX_BTN_POSITION_FIXED,
    btnOffsetX = 0,
    btnOffsetY = 0,
    tranboxInteractMode = "-",
  } = tranboxSetting;

  const [showBox, setShowBox] = useState(false);
  const [showBtn, setShowBtn] = useState(false);
  const [selectedText, setSelText] = useState("");
  const [text, setText] = useState("");
  const [textContext, setTextContext] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const selectionRootRef = useRef(document);
  const pendingSelectionRef = useRef(null);

  const getActiveSelection = useCallback(
    () => selectionRootRef.current?.getSelection?.() || window.getSelection(),
    []
  );

  useAutoHideTranBtn(showBtn, setShowBtn, getActiveSelection);

  const commitSelectionSnapshot = useCallback((snapshot) => {
    if (!snapshot?.text) return;

    pendingSelectionRef.current = snapshot;
    setSelText(snapshot.text);
    setTextContext(snapshot.context);
    setShowBtn(false);
    setText(snapshot.text);
    setShowBox(true);
  }, []);

  const handleOpenTranbox = useCallback(
    (inputText) => {
      const pending = pendingSelectionRef.current;
      const snapshot =
        inputText && pending?.text !== inputText
          ? { text: inputText, context: "", source: "manual" }
          : pending || { text: selectedText, context: "", source: "manual" };

      commitSelectionSnapshot(snapshot);
    },
    [commitSelectionSnapshot, selectedText]
  );

  const createSelectionSnapshot = useCallback(
    (selection, pointerPosition, source, target) => {
      const currentSelectedText = selection?.toString()?.trim() || "";
      if (!currentSelectedText) return null;
      const selectionRects = getSelectionRects(selection);
      const rect = isUsableRect(selectionRects?.rect)
        ? selectionRects.rect
        : null;
      const lastRect = isUsableRect(selectionRects?.lastRect)
        ? selectionRects.lastRect
        : rect;

      return {
        text: currentSelectedText,
        context: getSelectionContext(selection) || getTargetContext(target),
        pointerPosition,
        source,
        rect,
        lastRect,
      };
    },
    []
  );

  const processSelectionSnapshot = useCallback(
    (snapshot) => {
      if (!snapshot?.text) {
        setShowBtn(false);
        return;
      }

      pendingSelectionRef.current = snapshot;
      setSelText(snapshot.text);

      // 翻译框内交互模式：拦截面板内选区，等待用户单击/双击触发
      if (snapshot.source === "panel" && tranboxInteractMode !== "-") {
        return;
      }

      if (snapshot.rect && followSelection) {
        setBoxPosition(
          getFollowBoxPosition(snapshot.rect, boxOffsetX, boxOffsetY, boxSize)
        );
      }

      if (triggerMode === OPT_TRANBOX_TRIGGER_SELECT) {
        commitSelectionSnapshot(snapshot);
        return;
      }

      if (hideTranBtn) {
        setShowBtn(false);
        return;
      }

      const buttonPosition =
        btnPositionMode === OPT_TRANBOX_BTN_POSITION_MOUSE &&
        snapshot.pointerPosition
          ? getPointerButtonPosition(
              snapshot.pointerPosition,
              btnOffsetX,
              btnOffsetY
            )
          : getSelectionPositionFromRect(snapshot.lastRect) ||
            getPointerButtonPosition(
              snapshot.pointerPosition,
              btnOffsetX,
              btnOffsetY
            );

      if (buttonPosition) {
        setShowBtn(true);
        setPosition(buttonPosition);
      } else {
        setShowBtn(false);
      }
    },
    [
      hideTranBtn,
      triggerMode,
      tranboxInteractMode,
      btnPositionMode,
      btnOffsetX,
      btnOffsetY,
      followSelection,
      boxOffsetX,
      boxOffsetY,
      commitSelectionSnapshot,
      boxSize,
      setBoxPosition,
    ]
  );

  const handleSelectionEvent = useCallback(
    async (e) => {
      if (e.button === 2) return;
      if (isTranButtonEvent(e)) return;

      const isFromTranbox = isTranboxEvent(e);
      if (isFromTranbox && isPanelInteractiveEvent(e)) return;
      const target = getOriginalEventTarget(e);

      // 必须在 await 释放事件循环前获取 selectionRoot，否则 e.composedPath() 会被清空
      const selectionRoot = isFromTranbox
        ? getSelectionRootFromEvent(e)
        : document;

      const pointerPosition = getPointerPosition(e);
      await sleep(isFromTranbox ? 0 : 200);

      selectionRootRef.current = selectionRoot;

      const selection = isFromTranbox
        ? selectionRoot.getSelection?.()
        : window.getSelection();
      const snapshot = createSelectionSnapshot(
        selection,
        pointerPosition,
        isFromTranbox ? "panel" : "page",
        target
      );

      processSelectionSnapshot(snapshot);
    },
    [createSelectionSnapshot, processSelectionSnapshot]
  );

  const handleToggleTranbox = useCallback(() => {
    setShowBtn(false);

    let selection = window.getSelection();
    let snapshot = createSelectionSnapshot(selection, null, "page");

    // 尝试读取当前激活的根节点（如 ShadowRoot）中的选区
    if (!snapshot?.text && selectionRootRef.current) {
      selection =
        selectionRootRef.current.getSelection?.() || window.getSelection();
      snapshot = createSelectionSnapshot(selection, null, "page");
    }

    // 尝试使用最后一次合法的划词快照
    if (!snapshot?.text && pendingSelectionRef.current?.text) {
      snapshot = pendingSelectionRef.current;
    }

    if (!snapshot?.text) {
      setShowBox((pre) => !pre);
      return;
    }

    selectionRootRef.current = document;

    if (snapshot.rect && followSelection) {
      setBoxPosition(
        getFollowBoxPosition(snapshot.rect, boxOffsetX, boxOffsetY, boxSize)
      );
    }

    commitSelectionSnapshot(snapshot);
  }, [
    followSelection,
    boxOffsetX,
    boxOffsetY,
    setBoxPosition,
    boxSize,
    createSelectionSnapshot,
    commitSelectionSnapshot,
  ]);

  const btnEvent = useMemo(() => {
    if (isMobile) {
      return "onTouchEnd";
    } else if (triggerMode === OPT_TRANBOX_TRIGGER_HOVER) {
      return "onMouseOver";
    }
    return "onMouseUp";
  }, [triggerMode]);

  useEffect(() => {
    const eventName = isMobile ? "touchend" : "mouseup";

    window.addEventListener(eventName, handleSelectionEvent);
    return () => {
      window.removeEventListener(eventName, handleSelectionEvent);
    };
  }, [handleSelectionEvent]);

  useEffect(() => {
    if (!hideClickAway) return;

    const handleHideBox = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim() !== "") {
        return; // Ignore click away if user is selecting text on the page
      }
      setShowBox(false);
    };
    window.addEventListener("click", handleHideBox);
    return () => {
      window.removeEventListener("click", handleHideBox);
    };
  }, [hideClickAway]);

  // 监听翻译框内交互事件（单击/双击选中文本触发新翻译）
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
      if (!isTranboxEvent(e)) return;
      const target = getOriginalEventTarget(e);
      const selectionRoot = getSelectionRootFromEvent(e);
      const selection = selectionRoot.getSelection?.() || window.getSelection();
      const snapshot = createSelectionSnapshot(
        selection,
        getPointerPosition(e),
        "panel",
        target
      );
      commitSelectionSnapshot(snapshot);
    }

    document.addEventListener(eventName, handleInteract, true);
    return () => {
      document.removeEventListener(eventName, handleInteract, true);
    };
  }, [tranboxInteractMode, createSelectionSnapshot, commitSelectionSnapshot]);

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
    btnEvent,
  };
}
