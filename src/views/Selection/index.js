import { useState, useEffect, useCallback } from "react";
import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import { shortcutRegister } from "../../libs/shortcut";
import { sleep } from "../../libs/utils";
import { isGm } from "../../libs/client";
import {
  MSG_TRANSLATE_SELECTED,
  MSG_OPEN_TRANBOX,
  DEFAULT_TRANSEL_SHORTCUT,
} from "../../config";

export default function Slection({ tranboxSetting, transApis }) {
  const [showBox, setShowBox] = useState(false);
  const [showBtn, setShowBtn] = useState(false);
  const [selectedText, setSelText] = useState("");
  const [text, setText] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [boxSize, setBoxSize] = useState({ w: 600, h: 400 });
  const [boxPosition, setBoxPosition] = useState({
    x: (window.innerWidth - 600) / 2,
    y: (window.innerHeight - 400) / 2,
  });

  const handleClick = (e) => {
    e.stopPropagation();

    setShowBtn(false);
    setText(selectedText);
    setShowBox(true);
  };

  const handleTranSelected = useCallback(() => {
    setShowBtn(false);

    const selectedText = window.getSelection()?.toString()?.trim() || "";
    if (!selectedText) {
      return;
    }

    setSelText(selectedText);
    setText(selectedText);
    setShowBox(true);
  }, []);

  useEffect(() => {
    async function handleMouseup(e) {
      await sleep(10);

      const selectedText = window.getSelection()?.toString()?.trim() || "";
      setSelText(selectedText);
      if (!selectedText) {
        setShowBtn(false);
        return;
      }

      !tranboxSetting.hideTranBtn && setShowBtn(true);
      setPosition({ x: e.clientX, y: e.clientY });
    }

    window.addEventListener("mouseup", handleMouseup);
    return () => {
      window.removeEventListener("mouseup", handleMouseup);
    };
  }, [tranboxSetting.hideTranBtn]);

  useEffect(() => {
    const clearShortcut = shortcutRegister(
      tranboxSetting.tranboxShortcut,
      () => {
        setShowBox((pre) => !pre);
      }
    );

    return () => {
      clearShortcut();
    };
  }, [tranboxSetting.tranboxShortcut]);

  useEffect(() => {
    const clearShortcut = shortcutRegister(
      tranboxSetting.transelShortcut || DEFAULT_TRANSEL_SHORTCUT,
      handleTranSelected
    );

    return () => {
      clearShortcut();
    };
  }, [tranboxSetting.transelShortcut, handleTranSelected]);

  useEffect(() => {
    window.addEventListener(MSG_TRANSLATE_SELECTED, handleTranSelected);
    return () => {
      window.removeEventListener(MSG_TRANSLATE_SELECTED, handleTranSelected);
    };
  }, [handleTranSelected]);

  useEffect(() => {
    const handleOpenTranbox = () => {
      setShowBox((pre) => !pre);
    };
    window.addEventListener(MSG_OPEN_TRANBOX, handleOpenTranbox);
    return () => {
      window.removeEventListener(MSG_OPEN_TRANBOX, handleOpenTranbox);
    };
  }, []);

  useEffect(() => {
    if (!isGm) {
      return;
    }

    // 注册菜单
    try {
      const menuCommandIds = [];
      menuCommandIds.push(
        GM.registerMenuCommand(
          "Translate Selected Text (Alt+S)",
          (event) => {
            handleTranSelected();
          },
          "S"
        ),
        GM.registerMenuCommand(
          "Open Translate Popup (Alt+B)",
          (event) => {
            setShowBox((pre) => !pre);
          },
          "B"
        )
      );

      return () => {
        menuCommandIds.forEach((id) => {
          GM.unregisterMenuCommand(id);
        });
      };
    } catch (err) {
      console.log("[registerMenuCommand]", err);
    }
  }, [handleTranSelected]);

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
