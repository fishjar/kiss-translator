import { useState, useEffect } from "react";
import TranBtn from "./Tranbtn";
import TranBox from "./Tranbox";
import { shortcutRegister } from "../../libs/shortcut";

export default function Slection({ tranboxSetting, transApis }) {
  const [showBox, setShowBox] = useState(false);
  const [showBtn, setShowBtn] = useState(false);
  const [selectedText, setSelText] = useState("");
  const [text, setText] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [boxSize, setBoxSize] = useState({ w: 600, h: 420 });
  const [boxPosition, setBoxPosition] = useState({
    x: (window.innerWidth - 600) / 2,
    y: (window.innerHeight - 420) / 2,
  });

  function handleMouseup(e) {
    const selectedText = window.getSelection()?.toString()?.trim() || "";
    if (!selectedText) {
      setShowBtn(false);
      return;
    }

    setSelText(selectedText);
    setShowBtn(true);
    setPosition({ x: e.clientX, y: e.clientY });
  }

  const handleClick = (e) => {
    e.stopPropagation();
    setShowBtn(false);

    setText(selectedText);
    if (!showBox) {
      setShowBox(true);
    }
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseup);
    return () => {
      window.removeEventListener("mouseup", handleMouseup);
    };
  }, []);

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
  }, [tranboxSetting.tranboxShortcut, setShowBox]);

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
