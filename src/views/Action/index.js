import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import TranslateIcon from '@mui/icons-material/Translate';
import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Stack from "@mui/material/Stack";
import { useEffect, useState, useMemo, useCallback } from "react";
import { StoragesProvider } from "../../hooks/Storage";
import Popup from "../Popup";

export default function Action() {
  const fabWidth = 56;
  const [showPopup, setShowPopup] = useState(false);
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const [moved, setMoved] = useState(false);

  const handleWindowResize = (e) => {
    setWindowSize({
      w: window.innerWidth,
      h: window.innerHeight,
    });
  };

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
    window.addEventListener("click", handleWindowClick);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  const popProps = useMemo(() => {
    const width = Math.min(windowSize.w, 300);
    const height = Math.min(windowSize.h, 386);
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
    left: window.innerWidth - fabWidth - fabWidth,
    top: window.innerHeight - fabWidth - fabWidth,
  };

  return (
    <StoragesProvider>
      <ThemeProvider>
        {showPopup ? (
          <Draggable
            key="pop"
            {...popProps}
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
                    {process.env.REACT_APP_NAME}
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
              <Popup />
            </Paper>
          </Draggable>
        ) : (
          <Draggable
            key="fab"
            {...fabProps}
            onStart={handleStart}
            onMove={handleMove}
            handler={
              <Fab
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
        )}
      </ThemeProvider>
    </StoragesProvider>
  );
}
