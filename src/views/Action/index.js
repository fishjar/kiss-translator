import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useEffect, useMemo, useCallback } from "react";
import { SettingProvider } from "../../hooks/Setting";
import Popup from "../Popup";
import Header from "../Popup/Header";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import useWindowSize from "../../hooks/WindowSize";

export default function Action({ translator, onClose }) {
  const windowSize = useWindowSize();

  const handleWindowClick = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("click", handleWindowClick);

    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, [handleWindowClick]);

  const popProps = useMemo(() => {
    const width = Math.min(windowSize.w, 360);
    const height = Math.min(windowSize.h, 442);
    const left = (windowSize.w - width) / 2;
    const top = (windowSize.h - height) / 2;
    return {
      windowSize,
      width,
      height,
      left,
      top,
    };
  }, [windowSize]);

  return (
    <SettingProvider>
      <ThemeProvider>
        <Draggable
          key="pop"
          {...popProps}
          usePaper
          handler={
            <Box style={{ cursor: "move" }}>
              <Header onClose={onClose} />
              <Divider />
            </Box>
          }
        >
          <Popup translator={translator} />
        </Draggable>
      </ThemeProvider>
    </SettingProvider>
  );
}
