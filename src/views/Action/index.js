import Fab from "@mui/material/Fab";
import TranslateIcon from "@mui/icons-material/Translate";
import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useEffect, useState, useMemo, useCallback } from "react";
import { SettingProvider } from "../../hooks/Setting";
import Popup from "../Popup";
import { debounce } from "../../libs/utils";
import { isGm } from "../../libs/client";
import Header from "../Popup/Header";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import {
  DEFAULT_SHORTCUTS,
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
} from "../../config";
import { shortcutRegister } from "../../libs/shortcut";
import { sendIframeMsg } from "../../libs/iframe";
import { kissLog } from "../../libs/log";
import { getI18n } from "../../hooks/I18n";

export default function Action({ translator, fab }) {
  const fabWidth = 40;
  const [showPopup, setShowPopup] = useState(false);
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const [moved, setMoved] = useState(false);

  const { fabClickAction = 0 } = fab || {};

  const handleWindowResize = useMemo(
    () =>
      debounce(() => {
        setWindowSize({
          w: window.innerWidth,
          h: window.innerHeight,
        });
      }),
    []
  );

  const handleWindowClick = (e) => {
    setShowPopup(false);
  };

  const handleStart = useCallback(() => {
    setMoved(false);
  }, []);

  const handleMove = useCallback(() => {
    setMoved(true);
  }, []);

  useEffect(() => {
    if (!isGm) {
      return;
    }

    // 注册快捷键
    const shortcuts = translator.setting.shortcuts || DEFAULT_SHORTCUTS;
    const clearShortcuts = [
      shortcutRegister(shortcuts[OPT_SHORTCUT_TRANSLATE], () => {
        translator.toggle();
        sendIframeMsg(MSG_TRANS_TOGGLE);
        setShowPopup(false);
      }),
      shortcutRegister(shortcuts[OPT_SHORTCUT_STYLE], () => {
        translator.toggleStyle();
        sendIframeMsg(MSG_TRANS_TOGGLE_STYLE);
        setShowPopup(false);
      }),
      shortcutRegister(shortcuts[OPT_SHORTCUT_POPUP], () => {
        setShowPopup((pre) => !pre);
      }),
      shortcutRegister(shortcuts[OPT_SHORTCUT_SETTING], () => {
        window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank");
      }),
    ];

    return () => {
      clearShortcuts.forEach((fn) => {
        fn();
      });
    };
  }, [translator]);

  useEffect(() => {
    if (!isGm) {
      return;
    }

    // 注册菜单
    try {
      const menuCommandIds = [];
      const { contextMenuType, uiLang } = translator.setting;
      contextMenuType !== 0 &&
        menuCommandIds.push(
          GM.registerMenuCommand(
            getI18n(uiLang, "translate_switch"),
            (event) => {
              translator.toggle();
              sendIframeMsg(MSG_TRANS_TOGGLE);
              setShowPopup(false);
            },
            "Q"
          ),
          GM.registerMenuCommand(
            getI18n(uiLang, "toggle_style"),
            (event) => {
              translator.toggleStyle();
              sendIframeMsg(MSG_TRANS_TOGGLE_STYLE);
              setShowPopup(false);
            },
            "C"
          ),
          GM.registerMenuCommand(
            getI18n(uiLang, "open_menu"),
            (event) => {
              setShowPopup((pre) => !pre);
            },
            "K"
          ),
          GM.registerMenuCommand(
            getI18n(uiLang, "open_setting"),
            (event) => {
              window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank");
            },
            "O"
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
  }, [translator]);

  useEffect(() => {
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [handleWindowResize]);

  useEffect(() => {
    window.addEventListener("click", handleWindowClick);

    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

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

  const fabProps = {
    windowSize,
    width: fabWidth,
    height: fabWidth,
    left: fab.x ?? -fabWidth,
    top: fab.y ?? windowSize.h / 2,
  };

  return (
    <SettingProvider>
      <ThemeProvider>
        <Draggable
          key="pop"
          {...popProps}
          show={showPopup}
          onStart={handleStart}
          onMove={handleMove}
          usePaper
          handler={
            <Box style={{ cursor: "move" }}>
              <Header setShowPopup={setShowPopup} />
              <Divider />
            </Box>
          }
        >
          {showPopup && (
            <Popup setShowPopup={setShowPopup} translator={translator} />
          )}
        </Draggable>
        <Draggable
          key="fab"
          snapEdge
          {...fabProps}
          show={fab.isHide ? false : !showPopup}
          onStart={handleStart}
          onMove={handleMove}
          handler={
            <Fab
              size="small"
              color="primary"
              onClick={(e) => {
                if (!moved) {
                  if (fabClickAction === 1) {
                    translator.toggle();
                    sendIframeMsg(MSG_TRANS_TOGGLE);
                    setShowPopup(false);
                  } else {
                    setShowPopup((pre) => !pre);
                  }
                }
              }}
            >
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
