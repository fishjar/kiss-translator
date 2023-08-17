import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import TranslateIcon from "@mui/icons-material/Translate";
import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Stack from "@mui/material/Stack";
import { useEffect, useState, useMemo, useCallback } from "react";
import { StoragesProvider } from "../../hooks/Storage";
import Popup from "../Popup";
import { debounce } from "../../libs/utils";

export default function Action({ translator, fab }) {
  const fabWidth = 40;
  const [showPopup, setShowPopup] = useState(false);
  const [windowSize, setWindowSize] = useState({
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  });
  const [moved, setMoved] = useState(false);

  const handleWindowResize = useMemo(
    () =>
      debounce(() => {
        setWindowSize({
          w: document.documentElement.clientWidth,
          h: document.documentElement.clientHeight,
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
    <StoragesProvider>
      <ThemeProvider>
        <Draggable
          key="pop"
          {...popProps}
          show={showPopup}
          onStart={handleStart}
          onMove={handleMove}
          handler={
            <Paper style={{ cursor: "move" }} elevation={3}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={2}
              >
                <Box style={{ marginLeft: 16 }}>
                  {`${process.env.REACT_APP_NAME} v${process.env.REACT_APP_VERSION}`}
                </Box>
                <IconButton
                  onClick={() => {
                    setShowPopup(false);
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Stack>
            </Paper>
          }
        >
          <Paper>
            <Popup setShowPopup={setShowPopup} translator={translator} />
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
    </StoragesProvider>
  );
}
