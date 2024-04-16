import { useState, useEffect, useCallback } from "react";
import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import { shortcutRegister } from "../../libs/shortcut";
import { sleep, limitNumber } from "../../libs/utils";
import { isGm, isExt } from "../../libs/client";
import { MSG_OPEN_TRANBOX, DEFAULT_TRANBOX_SHORTCUT } from "../../config";
import { isMobile } from "../../libs/mobile";
import { kissLog } from "../../libs/log";

export default function Slection({
  contextMenuType,
  tranboxSetting,
  transApis,
}) {
  const boxWidth =
    isMobile || tranboxSetting.simpleStyle
      ? 300
      : limitNumber(window.innerWidth, 300, 600);
  const boxHeight =
    isMobile || tranboxSetting.simpleStyle
      ? 200
      : limitNumber(window.innerHeight, 200, 400);

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
  const [simpleStyle, setSimpleStyle] = useState(!!tranboxSetting.simpleStyle);
  const [hideClickAway, setHideClickAway] = useState(
    !!tranboxSetting.hideClickAway
  );

  const handleClick = (e) => {
    e.stopPropagation();

    setShowBtn(false);
    setText(selectedText);
    setShowBox(true);
  };

  const handleTranbox = useCallback(() => {
    setShowBtn(false);

    const selectedText = window.getSelection()?.toString()?.trim() || "";
    if (!selectedText) {
      setShowBox((pre) => !pre);
      return;
    }

    setSelText(selectedText);
    setText(selectedText);
    setShowBox(true);
  }, []);

  useEffect(() => {
    async function handleMouseup(e) {
      e.stopPropagation();
      await sleep(100);

      const selectedText = window.getSelection()?.toString()?.trim() || "";
      setSelText(selectedText);
      if (!selectedText) {
        setShowBtn(false);
        return;
      }

      const { clientX, clientY } = isMobile ? e.changedTouches[0] : e;
      !tranboxSetting.hideTranBtn && setShowBtn(true);
      // setPosition({ x: e.clientX, y: e.clientY });
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
  }, [tranboxSetting.hideTranBtn]);

  useEffect(() => {
    if (isExt) {
      return;
    }

    const clearShortcut = shortcutRegister(
      tranboxSetting.tranboxShortcut || DEFAULT_TRANBOX_SHORTCUT,
      handleTranbox
    );

    return () => {
      clearShortcut();
    };
  }, [tranboxSetting.tranboxShortcut, handleTranbox]);

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
            "Translate Selected Text",
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
      kissLog(err, "registerMenuCommand");
    }
  }, [handleTranbox, contextMenuType]);

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
        />
      )}

      {showBtn && (
        <TranBtn
          position={position}
          tranboxSetting={tranboxSetting}
          onClick={handleClick}
        />
      )}
    </>
  );
}
