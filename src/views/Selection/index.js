import { useState, useEffect, useCallback, useMemo } from "react";
import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import { shortcutRegister } from "../../libs/shortcut";
import { sleep, limitNumber } from "../../libs/utils";
import { isGm, isExt } from "../../libs/client";
import {
  MSG_OPEN_TRANBOX,
  DEFAULT_TRANBOX_SHORTCUT,
  OPT_TRANBOX_TRIGGER_CLICK,
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
  EVENT_KISS_INNER,
} from "../../config";
import { APP_CONSTS } from "../../config";
import { isMobile } from "../../libs/mobile";
import { kissLog } from "../../libs/log";
import { useLangMap } from "../../hooks/I18n";
import { debouncePutTranBox, getTranBox, putSetting } from "../../libs/storage";
import { debounce } from "../../libs/utils";
import useAutoHideTranBtn from "../../hooks/useAutoHideTranBtn";


export default function Slection({
  contextMenuType,
  tranboxSetting,
  transApis,
  tones,
  uiLang,
  langDetector,
}) {
  const {
    hideTranBtn = false,
    simpleStyle: initSimpleStyle = false,
    hideClickAway: initHideClickAway = false,
    followSelection: initFollowMouse = false,
    tranboxShortcut = DEFAULT_TRANBOX_SHORTCUT,
    triggerMode = OPT_TRANBOX_TRIGGER_CLICK,
    // extStyles,
    btnOffsetX,
    btnOffsetY,
    boxOffsetX = 0,
    boxOffsetY = 10,
  } = tranboxSetting;

  const boxWidth =
    isMobile || initSimpleStyle
      ? 300
      : limitNumber(window.innerWidth, 300, 600);
  const boxHeight =
    isMobile || initSimpleStyle
      ? 200
      : limitNumber(window.innerHeight, 200, 400);

  const langMap = useLangMap(uiLang);
  const [showBox, setShowBox] = useState(false);
  const [showBtn, setShowBtn] = useState(false);
  const [selectedText, setSelText] = useState("");
  const [text, setText] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // 划词按钮自动隐藏（5 秒 / 移动 100px / 右键）
  useAutoHideTranBtn(showBtn, setShowBtn, position);

  const [boxSize, setBoxSize] = useState({
    w: boxWidth,
    h: boxHeight,
  });
  const [boxPosition, setBoxPosition] = useState({
    x: (window.innerWidth - boxWidth) / 2,
    y: (window.innerHeight - boxHeight) / 2,
  });
  const [simpleStyle, setSimpleStyle] = useState(initSimpleStyle);
  const [hideClickAway, setHideClickAway] = useState(initHideClickAway);
  const [followSelection, setFollowSelection] = useState(initFollowMouse);

  const handleTrigger = useCallback(
    (text) => {
      setShowBtn(false);
      setText(text || selectedText);
      setShowBox(true);
    },
    [selectedText]
  );

  const isNodeInsideTransbox = (node) => {
    if (!node) return false;
    let cur = node.nodeType === 3 ? node.parentNode : node;
    while (cur) {
      if (cur.id === APP_CONSTS.boxID) return true;
      const root = cur.getRootNode && cur.getRootNode();
      if (root && root.host) {
        if (root.host.id === APP_CONSTS.boxID) return true;
        cur = root.host;
        continue;
      }
      cur = cur.parentNode;
    }
    return false;
  };

  const isSelectionInsideTransbox = (selection) => {
    if (!selection) return false;
    try {
      const range = selection.getRangeAt(0);
      const nodes = [
        range.commonAncestorContainer,
        range.startContainer,
        range.endContainer,
        selection.anchorNode,
        selection.focusNode,
      ];
      for (const node of nodes) {
        if (!node) continue;
        let cur = node.nodeType === 3 ? node.parentNode : node;
        while (cur) {
          if (cur.id === APP_CONSTS.boxID) return true;
          const root = cur.getRootNode && cur.getRootNode();
          if (root && root.host) {
            if (root.host.id === APP_CONSTS.boxID) return true;
            cur = root.host;
            continue;
          }
          cur = cur.parentNode;
        }
      }
    } catch (err) {
    }
    return false;
  };

  const handleTranbox = useCallback(() => {
    setShowBtn(false);

    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim() || "";
    if (!selectedText) {
      setShowBox((pre) => !pre);
      return;
    }

    const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
    
    const anchorNode = selection?.anchorNode;
    if (!isNodeInsideTransbox(anchorNode) && rect && followSelection) {
      const x = (rect.left + rect.right) / 2 + boxOffsetX;
      const y = rect.bottom + boxOffsetY;
      setBoxPosition({
        x: limitNumber(x, 0, window.innerWidth - 300),
        y: limitNumber(y, 0, window.innerHeight - 200),
      });
    }

    setSelText(selectedText);
    setText(selectedText);
    setShowBox(true);
  }, [followSelection, boxOffsetX, boxOffsetY]);

  const btnEvent = useMemo(() => {
    if (isMobile) {
      return "onTouchEnd";
    } else if (triggerMode === OPT_TRANBOX_TRIGGER_HOVER) {
      return "onMouseOver";
    }
    return "onMouseUp";
  }, [triggerMode]);

  useEffect(() => {
    (async () => {
      try {
        const { w, h, x, y } = (await getTranBox()) || {};
        if (w !== undefined && h !== undefined) {
          setBoxSize({ w, h });
        }
        if (x !== undefined && y !== undefined) {
          setBoxPosition({
            x: limitNumber(x, 0, window.innerWidth),
            y: limitNumber(y, 0, window.innerHeight),
          });
        }
      } catch (err) {
        //
      }
    })();
  }, []);

  useEffect(() => {
    debouncePutTranBox({ ...boxSize, ...boxPosition });
  }, [boxSize, boxPosition]);

  const saveTranboxSetting = useMemo(
    () =>
      debounce((obj) => {
        try {
          putSetting({ tranboxSetting: obj });
        } catch (err) {
          // ignore
        }
      }, 300),
    []
  );

  useEffect(() => {
    saveTranboxSetting({
      ...(tranboxSetting || {}),
      simpleStyle,
      hideClickAway,
      followSelection,
    });
  }, [simpleStyle, hideClickAway, followSelection, tranboxSetting, saveTranboxSetting]);

  useEffect(() => {
    async function handleMouseup(e) {
      // e.stopPropagation();
      if (e.button === 2) return;

      await sleep(200);

      const selection = window.getSelection();
      const selectedText = selection?.toString()?.trim() || "";
      // 用于解决tranbox 内选中文字时窗口跳到左上角的问题
      if (isSelectionInsideTransbox(selection)) {
        setSelText(selectedText);
        setShowBtn(false);
        return;
      }
      try {
        const path = e.composedPath ? e.composedPath() : [];
        for (const el of path) {
          if (!el) continue;
          if (el.id === APP_CONSTS.boxID) {
            setSelText(selectedText);
            setShowBtn(false);
            return;
          }
          if (el.host && el.host.id === APP_CONSTS.boxID) {
            setSelText(selectedText);
            setShowBtn(false);
            return;
          }
        }
      } catch (err) {
      }
      setSelText(selectedText);
      if (!selectedText) {
        setShowBtn(false);
        return;
      }

      const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
      
      const anchorNode = selection?.anchorNode;
      if (anchorNode) {
        const root = anchorNode.getRootNode && anchorNode.getRootNode();
        if (!(root && root.host && root.host.id === APP_CONSTS.boxID) && rect && followSelection && !showBox) {
          const x = (rect.left + rect.right) / 2 + boxOffsetX;
          const y = rect.bottom + boxOffsetY;
          setBoxPosition({
            x: limitNumber(x, 0, window.innerWidth - 300),
            y: limitNumber(y, 0, window.innerHeight - 200),
          });
        }
      } else if (rect && followSelection) {
        
        const x = (rect.left + rect.right) / 2 + boxOffsetX;
        const y = rect.bottom + boxOffsetY;
        if (followSelection && !showBox) {
          setBoxPosition({
            x: limitNumber(x, 0, window.innerWidth - 300),
            y: limitNumber(y, 0, window.innerHeight - 200),
          });
        }
      }

      if (triggerMode === OPT_TRANBOX_TRIGGER_SELECT) {
        handleTrigger(selectedText);
        return;
      }

      const { clientX, clientY } = isMobile ? e.changedTouches[0] : e;
      setShowBtn(!hideTranBtn);
      setPosition({ x: clientX, y: clientY });
    }

    // todo: mobile support
    // window.addEventListener("mouseup", handleMouseup);
    window.addEventListener(isMobile ? "touchend" : "mouseup", handleMouseup);
    return () => {
      window.removeEventListener(
        isMobile ? "touchend" : "mouseup",
        handleMouseup
      );
    };
  }, [
    hideTranBtn,
    triggerMode,
    followSelection,
    boxOffsetX,
    boxOffsetY,
    handleTrigger,
    showBox,
  ]);

  useEffect(() => {
    if (isExt) {
      return;
    }
    const clearShortcut = shortcutRegister(tranboxShortcut, handleTranbox);
    return () => {
      clearShortcut();
    };
  }, [tranboxShortcut, handleTranbox]);

  const handleToggle = useCallback(() => {
    if (showBox) {
      setShowBox(false);
    } else {
      handleTranbox();
    }
  }, [showBox, handleTranbox]);

  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_OPEN_TRANBOX) {
        handleToggle();
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, [handleToggle]);

  useEffect(() => {
    if (!isGm) {
      return;
    }

    // 注册菜单
    try {
      const menuCommandIds = [];
      contextMenuType !== 0 &&
        menuCommandIds.push(
          GM.registerMenuCommand?.(
            langMap("translate_selected_text"),
            (event) => {
              handleTranbox();
            },
            "S"
          )
        );

      return () => {
        menuCommandIds.forEach((id) => {
          GM.unregisterMenuCommand?.(id);
        });
      };
    } catch (err) {
      kissLog("registerMenuCommand", err);
    }
  }, [handleTranbox, contextMenuType, langMap]);

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

  return (
    <>
      {
        <TranBox
          showBox={showBox}
          text={text}
          setText={setText}
          boxSize={boxSize}
          setBoxSize={setBoxSize}
          boxPosition={boxPosition}
          setBoxPosition={setBoxPosition}
          tranboxSetting={tranboxSetting}
          transApis={transApis}
          tones={tones}
          setShowBox={setShowBox}
          simpleStyle={simpleStyle}
          setSimpleStyle={setSimpleStyle}
          hideClickAway={hideClickAway}
          setHideClickAway={setHideClickAway}
          followSelection={followSelection}
          setFollowSelection={setFollowSelection}
          // extStyles={extStyles}
          langDetector={langDetector}
        />
      }

      {showBtn && (
        <TranBtn
          position={position}
          btnOffsetX={btnOffsetX}
          btnOffsetY={btnOffsetY}
          btnEvent={btnEvent}
          onTrigger={(e) => {
            e.stopPropagation();
            handleTrigger();
          }}
        />
      )}
    </>
  );
}
