import { useState, useEffect } from "react";
import TranBtn from "./Tranbtn";
import TranBox from "./Tranbox";

export default function Slection({ tranboxSetting }) {
  const [showBox, setShowBox] = useState(false);
  const [showBtn, setShowBtn] = useState(false);
  const [text, setText] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });

  console.log("tranboxSetting", tranboxSetting);

  function handleMouseup(e) {
    const text = window.getSelection()?.toString()?.trim() || "";
    setPosition({ x: e.clientX, y: e.clientY });
    setText(text);
    setShowBtn(!!text);
  }

  const handleClick = (e) => {
    e.stopPropagation();
    setShowBtn(false);
    if (!!text) {
      setShowBox(true);
    }
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseup);
    return () => {
      window.removeEventListener("mouseup", handleMouseup);
    };
  }, []);

  return (
    <>
      {showBox && (
        <TranBox
          position={position}
          tranboxSetting={tranboxSetting}
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
