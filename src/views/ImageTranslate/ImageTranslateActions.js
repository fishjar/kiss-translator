import { useRef, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  Typography,
  CircularProgress,
} from "@mui/material";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import {
  supportsApiCapability,
  isApiConfigured,
} from "../../config/serviceSelection";

export default function ImageTranslateActions({
  scene = {},
  apis = [],
  busy = false,
  stage = "",
  recognitionProgress,
  hasRecognizedText = false,
  onRunAction,
  onCancel,
  i18n = (k, d) => d || k,
}) {
  const rootRef = useRef(null);
  const [actionAnchor, setActionAnchor] = useState(null);
  const activeLayoutApi = apis.find(
    (api) =>
      api.apiSlug === scene.layoutApiSlug &&
      !api.isDisabled &&
      isApiConfigured(api) &&
      supportsApiCapability(api, "analyzeLayout")
  );
  return (
    <Box ref={rootRef} sx={{ ml: "auto", minWidth: 0, maxWidth: "100%" }}>
      {/* 翻译操作按钮 / 进度状态 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          minHeight: "36px",
        }}
      >
        {busy ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
            <CircularProgress size={16} sx={{ flexShrink: 0 }} />
            <Typography
              variant="body2"
              color="primary"
              sx={{
                fontSize: "12px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {stage === "reading"
                ? i18n("image_stage_reading", "正在读取图片...")
                : stage === "layout"
                  ? i18n("image_stage_layout", "正在分析布局...")
                  : stage === "recognize"
                    ? i18n("image_stage_recognize", "正在识别文本...")
                    : i18n("image_stage_translate", "正在翻译文本...")}
              {stage === "recognize" && recognitionProgress?.total > 0
                ? ` ${recognitionProgress.current}/${recognitionProgress.total}`
                : ""}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={onCancel}
              sx={{
                px: 1,
                flexShrink: 0,
                py: 0.2,
                minWidth: "auto",
                fontSize: "11px",
                textTransform: "none",
              }}
            >
              {i18n("image_cancel", "取消")}
            </Button>
          </Box>
        ) : (
          <ButtonGroup variant="contained" size="small" sx={{ height: "36px" }}>
            <Button
              onClick={() => {
                if (hasRecognizedText) {
                  onRunAction?.("translate");
                } else {
                  onRunAction?.("all");
                }
              }}
              disabled={!scene.recognitionService}
              sx={{ px: 1.5, whiteSpace: "nowrap" }}
            >
              {i18n("image_translate_all", "翻译")}
            </Button>
            <Button
              size="small"
              aria-label="select merge action"
              aria-haspopup="menu"
              onClick={(e) => setActionAnchor(e.currentTarget)}
              sx={{ px: 0.5 }}
            >
              <ArrowDropDownRoundedIcon fontSize="small" />
            </Button>
          </ButtonGroup>
        )}
      </Box>
      {/* Split Button Menu 挂载到 rootRef */}
      <Menu
        container={() => rootRef.current}
        disableScrollLock
        anchorEl={actionAnchor}
        open={Boolean(actionAnchor)}
        onClose={() => setActionAnchor(null)}
        sx={{ zIndex: 2147483647 }}
      >
        <MenuItem
          disabled={!activeLayoutApi}
          onClick={() => {
            setActionAnchor(null);
            onRunAction?.("layout");
          }}
        >
          {i18n("image_hover_btn_layout", "布局分析")}
        </MenuItem>
        <MenuItem
          disabled={!scene.recognitionService}
          onClick={() => {
            setActionAnchor(null);
            onRunAction?.("recognize");
          }}
        >
          {i18n("image_recognition_service", "文本识别")}
        </MenuItem>
        <MenuItem
          disabled={!hasRecognizedText}
          onClick={() => {
            setActionAnchor(null);
            onRunAction?.("translate");
          }}
        >
          {i18n("image_translate_text", "文本翻译")}
        </MenuItem>
      </Menu>
    </Box>
  );
}
