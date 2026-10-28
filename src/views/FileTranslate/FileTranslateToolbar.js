import { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Collapse,
  LinearProgress,
} from "@mui/material";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import Logo from "../../components/Logo";
import { useFileTranslation } from "./State";

// 所有文件类型共用原有工具栏，格式专属操作和设置由调用方提供。
export default function FileTranslateToolbar({
  actions,
  configuration,
  busy,
  progress = [],
}) {
  const { i18n, connectionStatus, toggleTheme, openSettings } =
    useFileTranslation();
  const [optionsExpanded, setOptionsExpanded] = useState(true);
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 0,
        px: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        zIndex: 10,
        position: "relative",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 第一行主栏：Logo、主操作按钮与展开箭头 */}
      <Box
        sx={{
          minHeight: 56,
          py: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {/* 左侧：Logo 与标题 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
          }}
        >
          <Box
            component="a"
            href={
              process.env.REACT_APP_SITEURL ||
              "https://kiss-translator.rayjar.com"
            }
            target="_blank"
            rel="noreferrer noopener"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mr: 0.5,
              flexShrink: 0,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              "&:hover": {
                opacity: 0.85,
              },
            }}
            title="KISS Translator"
          >
            <Logo size={24} />
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}
            >
              {i18n("file_translate", "文件翻译")}
            </Typography>
          </Box>
          {connectionStatus}
        </Box>

        {/* 顶栏右侧：已选文件胶囊、操作按钮、系统辅助（统一高度 32px） */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            ml: 1.5,
            flexShrink: 0,
            flexWrap: "nowrap",
            height: 32,
          }}
        >
          {actions}
          <IconButton
            onClick={toggleTheme}
            aria-label={i18n("theme_toggle", "切换主题")}
            size="small"
            sx={{
              width: 32,
              height: 32,
              p: 0.5,
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          >
            <DarkModeRoundedIcon />
          </IconButton>

          <Tooltip title={i18n("open_options", "打开设置")}>
            <IconButton
              size="small"
              onClick={() => openSettings()}
              sx={{
                width: 32,
                height: 32,
                p: 0.5,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              <SettingsRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          {/* 折叠/展开配置小箭头按钮，始终常驻在第一行最右侧 */}
          <Tooltip
            title={
              optionsExpanded
                ? i18n("collapse_options", "收起配置")
                : i18n("expand_options", "展开配置")
            }
          >
            <IconButton
              size="small"
              onClick={() => setOptionsExpanded((prev) => !prev)}
              aria-expanded={optionsExpanded}
              aria-label={
                optionsExpanded
                  ? i18n("collapse_options", "收起配置")
                  : i18n("expand_options", "展开配置")
              }
              sx={{
                width: 32,
                height: 32,
                p: 0.5,
                color: "text.secondary",
                "&:hover": {
                  color: "primary.main",
                  bgcolor: "action.hover",
                },
              }}
            >
              <KeyboardArrowDownRoundedIcon
                sx={{
                  fontSize: 20,
                  transform: optionsExpanded
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                }}
              />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 第二行：流式展示核心下拉配置 */}
      <Collapse in={optionsExpanded} timeout="auto" unmountOnExit={false}>
        <Box
          sx={{
            pt: 2,
            pb: 1.25,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          {configuration}
        </Box>
      </Collapse>

      {/* 紧凑贴底进度条 */}
      {busy && (
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            width: "100%",
          }}
        >
          <LinearProgress
            variant={progress[1] ? "determinate" : "indeterminate"}
            value={progress[1] ? (progress[0] / progress[1]) * 100 : undefined}
            sx={{ height: 3 }}
          />
        </Box>
      )}
    </Paper>
  );
}
