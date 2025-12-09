import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "../../hooks/Theme";
import DraggableResizable from "./DraggableResizable";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CloseIcon from "@mui/icons-material/Close";
import Typography from "@mui/material/Typography";
import { useI18n } from "../../hooks/I18n";
import { useCallback, useState } from "react";
import { isMobile } from "../../libs/mobile";
import TranForm from "./TranForm.js";
import { MSG_OPEN_SEPARATE_WINDOW } from "../../config/msg.js";
import { sendBgMsg } from "../../libs/msg.js";
import { isExt } from "../../libs/client.js";

function Header({
  setShowBox,
  simpleStyle,
  setSimpleStyle,
  hideClickAway,
  setHideClickAway,
  followSelection,
  setFollowSelection,
  mouseHover,
}) {
  const i18n = useI18n();

  const openSeparateWindow = useCallback(() => {
    sendBgMsg(MSG_OPEN_SEPARATE_WINDOW);
  }, []);

  if (!isMobile && simpleStyle && !mouseHover) {
    return;
  }

  return (
    <Box
      onMouseUp={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" alignItems="center">
          <DragIndicatorIcon fontSize="small" />
          <Typography
            variant="body2"
            sx={{
              userSelect: "none",
              WebkitUserSelect: "none",
              fontWeight: "bold",
            }}
          >
            {`${process.env.REACT_APP_NAME} v${process.env.REACT_APP_VERSION}`}
          </Typography>
        </Stack>

        <Stack direction="row" alignItems="center">
          {isExt && (
            <IconButton
              size="small"
              title={i18n("open_separate_window")}
              onClick={openSeparateWindow}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            title={i18n("btn_tip_click_away")}
            onClick={() => {
              setHideClickAway((pre) => !pre);
            }}
          >
            {hideClickAway ? (
              <LockOpenIcon fontSize="small" />
            ) : (
              <LockIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            size="small"
            title={i18n("btn_tip_follow_selection")}
            onClick={() => {
              setFollowSelection((pre) => !pre);
            }}
          >
            {followSelection ? (
              <PushPinOutlinedIcon fontSize="small" />
            ) : (
              <PushPinIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            size="small"
            title={i18n("btn_tip_simple_style")}
            onClick={() => {
              setSimpleStyle((pre) => !pre);
            }}
          >
            {simpleStyle ? (
              <UnfoldMoreIcon fontSize="small" />
            ) : (
              <UnfoldLessIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setShowBox(false);
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
      <Divider />
    </Box>
  );
}

export default function TranBox({
  showBox,
  text,
  setText,
  setShowBox,
  tranboxSetting: {
    enDict,
    enSug,
    apiSlugs,
    fromLang,
    toLang,
    toLang2,
    autoHeight,
  },
  transApis,
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
  extStyles = "",
  langDetector,
}) {
  const [mouseHover, setMouseHover] = useState(false);
  // todo: 这里的 SettingProvider 不应和 background 的共用
  return (
    <SettingProvider context="tranbox">
      <ThemeProvider styles={extStyles}>
        {showBox && (
          <DraggableResizable
            position={boxPosition}
            size={boxSize}
            setSize={setBoxSize}
            setPosition={setBoxPosition}
            autoHeight={autoHeight}
            header={
              <Header
                setShowBox={setShowBox}
                simpleStyle={simpleStyle}
                setSimpleStyle={setSimpleStyle}
                hideClickAway={hideClickAway}
                setHideClickAway={setHideClickAway}
                followSelection={followSelection}
                setFollowSelection={setFollowSelection}
                mouseHover={mouseHover}
              />
            }
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setMouseHover(true)}
            onMouseLeave={() => setMouseHover(false)}
          >
            <Box sx={{ p: simpleStyle ? 1 : 2 }}>
              <TranForm
                text={text}
                setText={setText}
                apiSlugs={apiSlugs}
                fromLang={fromLang}
                toLang={toLang}
                toLang2={toLang2}
                transApis={transApis}
                simpleStyle={simpleStyle}
                langDetector={langDetector}
                enDict={enDict}
                enSug={enSug}
              />
            </Box>
          </DraggableResizable>
        )}
      </ThemeProvider>
    </SettingProvider>
  );
}
