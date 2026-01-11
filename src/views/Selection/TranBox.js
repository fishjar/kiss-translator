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
import { useCallback, useEffect, useState } from "react";
import { isMobile } from "../../libs/mobile";
import TranForm from "./TranForm.js";
import { MSG_OPEN_SEPARATE_WINDOW } from "../../config/msg.js";
import { sendBgMsg } from "../../libs/msg.js";
import { isExt } from "../../libs/client.js";
import { useTheme, alpha } from "@mui/material/styles";
import Logo from '../../components/Logo';

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
  const theme = useTheme();
  const i18n = useI18n();

  const iconColor = theme.palette.text.secondary;
  const buttonHoverBg = theme.palette.action.hover;

  const openSeparateWindow = useCallback(() => {
    sendBgMsg(MSG_OPEN_SEPARATE_WINDOW);
  }, []);

  const blurOnLeave = (e) => e.currentTarget.blur();

  const baseBtnStyle = {
    borderRadius: "6px",
    padding: "3px",
    minWidth: "24px",
    minHeight: "24px",
    transition: "all 0.2s ease",
    backgroundColor: "transparent",
    "& svg": {
      color: iconColor,
    },
  };
  const isDark = theme.palette.mode === "dark";

  const headerBg = isDark
    ? "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.10))"
    : "linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)";

  // 移动端不显示标题栏
  if (isMobile) {
    return null;
  }

  return (
    <Box
      onMouseUp={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      sx={{
        backgroundColor: theme.palette.background.default,
        backgroundImage: headerBg,

        boxShadow: isDark
          ? `
        inset 0 1px 0 rgba(255,255,255,0.06),
        inset 0 -1px 0 rgba(0,0,0,0.25)
      `
          : "none",

        backdropFilter: isDark ? "saturate(120%) blur(0.6px)" : "blur(10px)",
        borderBottom: isDark ? "none" : `1px solid ${alpha(theme.palette.divider, 0.06)}`,
        padding: "2px 6px",
        height: isDark ? "32px" : "29px",
        display: "flex",
        alignItems: "center",
        minHeight: "auto",
        zIndex: 10,
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            pl: 1,
          }}
        >
          <Box
            sx={{
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              backgroundColor: "transparent",
              border: 0,
              boxShadow: isDark
                ? `
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 1px 3px rgba(0,0,0,0.35)
          `
                : theme.shadows[1],
              transition: "all 0.2s ease",
              "&:hover": {
                boxShadow: theme.shadows[2],
                filter: "brightness(1.08)",
              },
              flexShrink: 0,
            }}
          >
            <Logo style={{
              borderRadius: "4.5px"
            }} size={18} />
          </Box>

          {!simpleStyle && (
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                fontSize: "12px",
                color: theme.palette.text.secondary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {`${process.env.REACT_APP_NAME} v${process.env.REACT_APP_VERSION}`}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          {isExt && (
            <IconButton
              size="small"
              title={i18n("open_separate_window")}
              onClick={openSeparateWindow}
              onMouseLeave={blurOnLeave}
              sx={{
                ...baseBtnStyle,
                "&:hover": {
                  backgroundColor: theme.palette.primary.light + "20",
                  transform: "scale(1.05)",
                  boxShadow: theme.shadows[2],
                  "& svg": { color: theme.palette.primary.main },
                },
                "&:active": {
                  transform: "scale(0.95)",
                  backgroundColor: theme.palette.primary.light + "40",
                },
              }}
            >
              <OpenInNewIcon sx={{ width: 16, height: 16 }} />
            </IconButton>
          )}

          <IconButton
            size="small"
            title={i18n("btn_tip_click_away")}
            onMouseLeave={blurOnLeave}
            onClick={() => setHideClickAway((pre) => !pre)}
            sx={{
              ...baseBtnStyle,
              "&:hover": {
                backgroundColor: theme.palette.success.light + "20",
                transform: "scale(1.05)",
                boxShadow: theme.shadows[2],
                "& svg": { color: theme.palette.success.main },
              },
              "&:active": {
                transform: "scale(0.95)",
                backgroundColor: theme.palette.success.light + "40",
              },
            }}
          >
            {hideClickAway ? (
              <LockOpenIcon sx={{ width: 16, height: 16, color: theme.palette.success.main }} />
            ) : (
              <LockIcon sx={{ width: 16, height: 16 }} />
            )}
          </IconButton>

          <IconButton
            size="small"
            title={i18n("btn_tip_follow_selection")}
            onMouseLeave={blurOnLeave}
            onClick={() => setFollowSelection((pre) => !pre)}
            sx={{
              ...baseBtnStyle,
              "&:hover": {
                backgroundColor: theme.palette.warning.light + "20",
                transform: "scale(1.05)",
                boxShadow: theme.shadows[2],
                "& svg": { color: theme.palette.warning.main },
              },
              "&:active": {
                transform: "scale(0.95)",
                backgroundColor: theme.palette.warning.light + "40",
              },
            }}
          >
            {followSelection ? (
              <PushPinOutlinedIcon sx={{ width: 16, height: 16, color: theme.palette.warning.main }} />
            ) : (
              <PushPinIcon sx={{ width: 16, height: 16 }} />
            )}
          </IconButton>

          <IconButton
            size="small"
            title={i18n("btn_tip_simple_style")}
            onMouseLeave={blurOnLeave}
            onClick={() => setSimpleStyle((pre) => !pre)}
            sx={{
              ...baseBtnStyle,
              "&:hover": {
                backgroundColor: theme.palette.info.light + "20",
                transform: "scale(1.05)",
                boxShadow: theme.shadows[2],
                "& svg": { color: theme.palette.info.main },
              },
              "&:active": {
                transform: "scale(0.95)",
                backgroundColor: theme.palette.info.light + "40",
              },
            }}
          >
            {simpleStyle ? (
              <UnfoldMoreIcon sx={{ width: 16, height: 16, color: theme.palette.info.main }} />
            ) : (
              <UnfoldLessIcon sx={{ width: 16, height: 16 }} />
            )}
          </IconButton>

          <IconButton
            size="small"
            title={i18n("close")}
            onMouseLeave={blurOnLeave}
            onClick={() => setShowBox(false)}
            sx={{
              ...baseBtnStyle,
              "&:hover": {
                backgroundColor: theme.palette.error.light + "20",
                transform: "scale(1.05)",
                boxShadow: theme.shadows[2],
                "& svg": { color: theme.palette.error.main },
              },
              "&:active": {
                transform: "scale(0.95)",
                backgroundColor: theme.palette.error.light + "40",
              },
            }}
          >
            <CloseIcon sx={{ width: 16, height: 16 }} />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  );
}

function TranBoxContent({
  simpleStyle,
  text,
  setText,
  apiSlugs,
  fromLang,
  toLang,
  toLang2,
  transApis,
  langDetector,
  enDict,
  enSug,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const scrollbarTrackColor =
    theme.palette.mode === "dark" ? "#1f1f23" : theme.palette.background.paper;
  const scrollbarThumbColor = theme.palette.mode === "dark"
    ? alpha(theme.palette.text.primary, 0.28)
    : alpha(theme.palette.text.primary, 0.24);
  const contentBg = isDark
    ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.06))"
    : "none";

  return (
    <Box
      sx={{
        px: simpleStyle ? 2 : 3,//稍微增加点内边距,看着舒服点
        py: simpleStyle ? 1 : 2,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: contentBg,

        boxShadow: isDark
          ? "inset 0 1px 0 rgba(255,255,255,0.04)"
          : "none",

        color: isDark
          ? "rgba(255,255,255,0.88)"
          : theme.palette.text.primary,

        lineHeight: 1.55,
        backdropFilter: isDark ? "saturate(120%) blur(0.5px)" : "none",

        "&::-webkit-scrollbar": {
          width: 10,
          height: 10,
        },
        "&::-webkit-scrollbar-track": {
          background: scrollbarTrackColor,
        },
        "&::-webkit-scrollbar-thumb": {
          backgroundColor: scrollbarThumbColor,
          borderRadius: 8,
          border: `2px solid ${theme.palette.background.paper}`,
        },
        "&::-webkit-scrollbar-thumb:hover": {
          backgroundColor: alpha(theme.palette.text.primary, 0.36),
        },
        // Firefox
        scrollbarWidth: "thin",
        scrollbarColor: `${scrollbarThumbColor} ${scrollbarTrackColor}`,

        color: isDark
          ? "rgba(255,255,255,0.82)"   // 柔白, 避免刺眼
          : theme.palette.text.primary,

        lineHeight: 1.55,
      }}
    >
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
  );
}

export default function TranBox(props) {
  const [mouseHover, setMouseHover] = useState(false);

  const simpleStyle = props.simpleStyle;
  const setSimpleStyle = props.setSimpleStyle;
  const hideClickAway = props.hideClickAway;
  const setHideClickAway = props.setHideClickAway;
  const followSelection = props.followSelection;
  const setFollowSelection = props.setFollowSelection;

  useEffect(() => {
    if (!props.showBox) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        props.setShowBox(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [props.showBox, props.setShowBox]);

  return (
    <SettingProvider context="tranbox">
      <ThemeProvider styles={props.extStyles}>
        {props.showBox && (
          <DraggableResizable
            position={props.boxPosition}
            size={props.boxSize}

            setSize={props.setBoxSize}
            setPosition={props.setBoxPosition}
            autoHeight={props.tranboxSetting.autoHeight}
            header={
              <Header
                setShowBox={props.setShowBox}
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
            <TranBoxContent
              simpleStyle={simpleStyle}
              text={props.text}
              setText={props.setText}
              apiSlugs={props.tranboxSetting.apiSlugs}
              fromLang={props.tranboxSetting.fromLang}
              toLang={props.tranboxSetting.toLang}
              toLang2={props.tranboxSetting.toLang2}
              transApis={props.transApis}
              langDetector={props.langDetector}
              enDict={props.tranboxSetting.enDict}
              enSug={props.tranboxSetting.enSug}
            />
          </DraggableResizable>
        )}
      </ThemeProvider>
    </SettingProvider>
  );
}
