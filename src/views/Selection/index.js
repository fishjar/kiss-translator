import { useState, useEffect, useCallback } from "react";
import TranBtn from "./TranBtn";
import TranBox from "./TranBox";
import { shortcutRegister } from "../../libs/shortcut";
import { sleep } from "../../libs/utils";
import { isGm } from "../../libs/client";
import { MSG_OPEN_TRANBOX, DEFAULT_TRANBOX_SHORTCUT } from "../../config";

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
      menuCommandIds.push(
        GM.registerMenuCommand(
          "Translate Selected Text (Alt+S)",
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
      console.log("[registerMenuCommand]", err);
    }
  }, [handleTranbox]);

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
