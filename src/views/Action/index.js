import Paper from "@mui/material/Paper";
import Fab from "@mui/material/Fab";
import TranslateIcon from "@mui/icons-material/Translate";
import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useEffect, useState, useMemo, useCallback } from "react";
import { SettingProvider } from "../../hooks/Setting";
import Popup from "../Popup";
import { debounce, isSameSet } from "../../libs/utils";
import { isGm } from "../../libs/client";
import Header from "../Popup/Header";
import { DEFAULT_SHORTCUTS, OPT_SHORTCUT_TRANSLATE } from "../../config";

export default function Action({ translator, fab }) {
  const fabWidth = 40;
  const [showPopup, setShowPopup] = useState(false);
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const [moved, setMoved] = useState(false);

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

  // useEffect(() => {
  //   // 注册快捷键
  //   const handleKeydown = (e) => {
  //     if (!e.altKey) {
  //       return;
  //     }
  //     if (e.code === "KeyQ") {
  //       translator.toggle();
  //       setShowPopup(false);
  //     } else if (e.code === "KeyC") {
  //       translator.toggleStyle();
  //       setShowPopup(false);
  //     } else if (e.code === "KeyK") {
  //       setShowPopup((pre) => !pre);
  //     }
  //   };
  //   window.addEventListener("keydown", handleKeydown);
  //   return () => {
  //     window.removeEventListener("keydown", handleKeydown);
  //   };
  // }, [translator]);

  useEffect(() => {
    // 注册快捷键
    const shortcuts = translator.setting.shortcuts || DEFAULT_SHORTCUTS;
    const keys = new Set();

    const handleKeydown = (e) => {
      console.log("keydown", e);
      e.code && keys.add(e.key);

      console.log("keys", keys);
      const isSame = isSameSet(
        keys,
        new Set(shortcuts[OPT_SHORTCUT_TRANSLATE])
      );
      console.log("isSame", keys, isSame);
    };

    const handleKeyup = (e) => {
      console.log("keyup", e);
      keys.delete(e.key);
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", handleKeyup);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
    };
  }, [translator]);

  useEffect(() => {
    // 注册菜单
    const menuCommandIds = [];
    if (isGm) {
      try {
        menuCommandIds.push(
          GM.registerMenuCommand(
            "Toggle Translate",
            (event) => {
              translator.toggle();
              setShowPopup(false);
            },
            "Q"
          ),
          GM.registerMenuCommand(
            "Toggle Style",
            (event) => {
              translator.toggleStyle();
              setShowPopup(false);
            },
            "C"
          ),
          GM.registerMenuCommand(
            "Open Menu",
            (event) => {
              setShowPopup((pre) => !pre);
            },
            "K"
          )
        );
      } catch (err) {
        console.log("[registerMenuCommand]", err);
      }
    }

    return () => {
      if (isGm) {
        try {
          menuCommandIds.forEach((id) => {
            GM.unregisterMenuCommand(id);
          });
        } catch (err) {
          //
        }
      }
    };
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
    const width = Math.min(windowSize.w, 300);
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
    left: fab.x ?? 0,
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
          handler={
            <Paper style={{ cursor: "move" }} elevation={3}>
              <Header setShowPopup={setShowPopup} />
            </Paper>
          }
        >
          <Paper>
            {showPopup && (
              <Popup setShowPopup={setShowPopup} translator={translator} />
            )}
          </Paper>
        </Draggable>
        <Draggable
          key="fab"
          snapEdge
          {...fabProps}
          show={!showPopup}
          onStart={handleStart}
          onMove={handleMove}
          handler={
            <Fab
              size="small"
              color="primary"
              onClick={(e) => {
                if (!moved) {
                  setShowPopup((pre) => !pre);
                }
              }}
            >
              <TranslateIcon />
            </Fab>
          }
        />
      </ThemeProvider>
    </SettingProvider>
  );
}
