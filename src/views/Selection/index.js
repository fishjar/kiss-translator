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
} from "../../config";
import { isMobile } from "../../libs/mobile";
import { kissLog } from "../../libs/log";
import { useLangMap } from "../../hooks/I18n";

export default function Slection({
  contextMenuType,
  tranboxSetting,
  transApis,
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

  const handleTranbox = useCallback(() => {
    setShowBtn(false);

    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim() || "";
    if (!selectedText) {
      setShowBox((pre) => !pre);
      return;
    }

    const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
    if (rect && followSelection) {
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
    async function handleMouseup(e) {
      e.stopPropagation();
      await sleep(200);

      const selection = window.getSelection();
      const selectedText = selection?.toString()?.trim() || "";
      setSelText(selectedText);
      if (!selectedText) {
        setShowBtn(false);
        return;
      }

      const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
      if (rect && followSelection) {
        const x = (rect.left + rect.right) / 2 + boxOffsetX;
        const y = rect.bottom + boxOffsetY;
        setBoxPosition({
          x: limitNumber(x, 0, window.innerWidth - 300),
          y: limitNumber(y, 0, window.innerHeight - 200),
        });
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

  useEffect(() => {
    window.addEventListener(MSG_OPEN_TRANBOX, handleTranbox);
    return () => {
      window.removeEventListener(MSG_OPEN_TRANBOX, handleTranbox);
    };
  }, [handleTranbox]);

  useEffect(() => {
    if (!isGm) {
      return;
    }

    // 注册菜单
    try {
      const menuCommandIds = [];
      contextMenuType !== 0 &&
        menuCommandIds.push(
          GM.registerMenuCommand(
            langMap("translate_selected_text"),
            (event) => {
              handleTranbox();
            },
            "S"
          )
        );

      return () => {
        menuCommandIds.forEach((id) => {
          GM.unregisterMenuCommand(id);
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
      {showBox && (
        <TranBox
          text={text}
          setText={setText}
          boxSize={boxSize}
          setBoxSize={setBoxSize}
          boxPosition={boxPosition}
          setBoxPosition={setBoxPosition}
          tranboxSetting={tranboxSetting}
          transApis={transApis}
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
      )}

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
