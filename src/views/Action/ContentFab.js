import Fab from "@mui/material/Fab";
import TranslateIcon from "@mui/icons-material/Translate";
import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useState, useMemo, useCallback } from "react";
import { SettingProvider } from "../../hooks/Setting";
import { MSG_TRANS_TOGGLE } from "../../config";
import { sendIframeMsg } from "../../libs/iframe";
import useWindowSize from "../../hooks/WindowSize";

export default function ContentFab({
  translator,
  fabConfig: { x: fabX, y: fabY, fabClickAction = 0 } = {},
  popupManager,
}) {
  const fabWidth = 40;
  const windowSize = useWindowSize();
  const [moved, setMoved] = useState(false);

  const handleStart = useCallback(() => {
    setMoved(false);
  }, []);

  const handleMove = useCallback(() => {
    setMoved(true);
  }, []);

  const handleClick = useCallback(() => {
    if (!moved) {
      if (fabClickAction === 1) {
        translator.toggle();
        sendIframeMsg(MSG_TRANS_TOGGLE);
      } else {
        popupManager.toggle();
      }
    }
  }, [moved, translator, popupManager, fabClickAction]);

  const fabProps = useMemo(
    () => ({
      windowSize,
      width: fabWidth,
      height: fabWidth,
      left: fabX ?? -fabWidth,
      top: fabY ?? windowSize.h / 2,
    }),
    [windowSize, fabWidth, fabX, fabY]
  );

  return (
    <SettingProvider>
      <ThemeProvider>
        <Draggable
          key="fab"
          snapEdge
          {...fabProps}
          onStart={handleStart}
          onMove={handleMove}
          handler={
            <Fab size="small" color="primary" onClick={handleClick}>
              <TranslateIcon
                sx={{
                  width: 24,
                  height: 24,
                }}
              />
            </Fab>
          }
        />
      </ThemeProvider>
    </SettingProvider>
  );
}
