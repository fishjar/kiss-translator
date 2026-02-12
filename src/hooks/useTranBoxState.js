import { useState, useEffect } from "react";
import { limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import { debouncePutTranBox, getTranBox } from "../libs/storage";
import { isIframe } from "../libs/iframe";

export default function useTranBoxState(tranboxSetting) {
  const {
    simpleStyle: initSimpleStyle = false,
    hideClickAway: initHideClickAway = false,
    followSelection: initFollowMouse = false,
    boxOffsetX = 0,
    boxOffsetY = 10,
  } = tranboxSetting;

  const boxWidth =
    isMobile || initSimpleStyle
      ? 400
      : limitNumber(window.innerWidth, 400, 800);
  const boxHeight =
    isMobile || initSimpleStyle
      ? 200
      : limitNumber(window.innerHeight, 200, 600);

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

  // 从 storage 恢复位置和大小状态
  useEffect(() => {
    (async () => {
      try {
        const { w, h, x, y } = (await getTranBox()) || {};
        if (w !== undefined && h !== undefined) {
          setBoxSize({
            w: Math.min(w, window.innerWidth),
            h: Math.min(h, window.innerHeight),
          });
        }
        if (x !== undefined && y !== undefined) {
          setBoxPosition({
            x: limitNumber(x, 0, window.innerWidth - w),
            y: limitNumber(y, 0, window.innerHeight - 50),
          });
        }
      } catch (err) {
        //
      }
    })();
  }, []);

  // debounce 存储位置和大小状态到 storage
  useEffect(() => {
    // 如果是在iframe中，则不执行
    if (!isIframe && boxSize.w > 0 && boxSize.h > 0) {
      debouncePutTranBox({
        ...boxSize,
        ...boxPosition,
      });
    }
  }, [boxSize, boxPosition]);

  return {
    boxSize,
    setBoxSize,
    boxPosition,
    setBoxPosition,
    simpleStyle,
    setSimpleStyle,
    hideClickAway,
    setHideClickAway,
    followSelection,
    setFollowSelection,
    boxOffsetX,
    boxOffsetY,
  };
}
