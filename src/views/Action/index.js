import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useEffect, useMemo, useCallback, useState } from "react";
import { SettingProvider } from "../../hooks/Setting";
import Header from "../Popup/Header";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import useWindowSize from "../../hooks/WindowSize";
import {
  EVENT_KISS_INNER,
  MSG_OPEN_OPTIONS,
  MSG_POPUP_TOGGLE,
} from "../../config";
import PopupCont from "../Popup/PopupCont";
import { isExt } from "../../libs/client";
import { sendBgMsg } from "../../libs/msg";

export default function Action({ translator, processActions }) {
  const [showPopup, setShowPopup] = useState(true);
  const [rule, setRule] = useState(translator.rule);
  const [setting, setSetting] = useState(translator.setting);
  const windowSize = useWindowSize();

  const handleOpenSetting = useCallback(() => {
    if (isExt) {
      sendBgMsg(MSG_OPEN_OPTIONS);
    } else {
      window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank");
    }
  }, []);

  useEffect(() => {
    const handleWindowClick = () => {
      setShowPopup(false);
    };
    window.addEventListener("click", handleWindowClick);
    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_POPUP_TOGGLE) {
        setShowPopup((pre) => !pre);
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, []);

  useEffect(() => {
    if (showPopup) {
      setRule(translator.rule);
      setSetting(translator.setting);
    }
  }, [showPopup, translator]);

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
    <SettingProvider context="contentPopup">
      <ThemeProvider>
        {showPopup && (
          <Draggable
            key="pop"
            {...popProps}
            usePaper
            handler={
              <Box style={{ cursor: "move" }}>
                <Header
                  onClose={() => {
                    setShowPopup(false);
                  }}
                />
                <Divider />
              </Box>
            }
          >
            <Box width={360}>
              <PopupCont
                rule={rule}
                setting={setting}
                setRule={setRule}
                setSetting={setSetting}
                handleOpenSetting={handleOpenSetting}
                processActions={processActions}
                isContent={true}
              />
            </Box>
          </Draggable>
        )}
      </ThemeProvider>
    </SettingProvider>
  );
}
