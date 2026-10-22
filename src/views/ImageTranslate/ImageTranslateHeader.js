/**
 * @file ImageTranslateHeader.js
 * @description 图片翻译弹窗顶部工具栏与配置选项区域（两行标准排版，Shadow DOM 菜单防漂移与圆角贴合）。
 */

import React, { useState, useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import Logo from "../../components/Logo";

import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";
import { recognitionOptions } from "../../fileTranslation/recognition";
import {
  supportsApiCapability,
  isApiConfigured,
} from "../../config/serviceSelection";
import {
  PROMPT_CATEGORY_USER,
  PROMPT_CATEGORY_BATCH_SYSTEM,
  getPromptDisplayName,
} from "../../config/prompt";

export default function ImageTranslateHeader({
  scene = {},
  apis = [],
  prompts = [],
  busy = false,
  stage = "",
  recognitionProgress = null,
  hasRecognizedText = false,
  onSettingChange,
  onRunAction,
  onCancel,
  onClose,
  i18n = (k, d) => d || k,
}) {
  const rootRef = useRef(null);
  const [actionAnchor, setActionAnchor] = useState(null);

  // 1. 过滤可用的服务选项
  const translateServices = apis.filter(
    (api) =>
      !api.isDisabled &&
      isApiConfigured(api) &&
      supportsApiCapability(api, "translate")
  );
  const layoutServices = apis.filter(
    (api) =>
      !api.isDisabled &&
      isApiConfigured(api) &&
      supportsApiCapability(api, "analyzeLayout")
  );
  const recOptions = recognitionOptions(
    apis,
    scene.recognitionService,
    i18n,
    true
  );

  const selectedRecValue = scene.recognitionService
    ? JSON.stringify(scene.recognitionService)
    : "";

  const handleRecChange = (e) => {
    const val = e.target.value;
    if (!val) {
      onSettingChange?.({ ...scene, recognitionService: null });
    } else {
      try {
        const parsed = JSON.parse(val);
        onSettingChange?.({ ...scene, recognitionService: parsed });
      } catch {}
    }
  };

  const activeLayoutApi = layoutServices.find(
    (s) => s.apiSlug === scene.layoutApiSlug
  );

  const selectedTranslateService = translateServices.find(
    (api) => api.apiSlug === scene.apiSlug
  );
  const isLlmTranslate = Boolean(
    selectedTranslateService?.provider?.capabilities?.translate?.customPrompt ||
      selectedTranslateService?.apiType === "OpenAI" ||
      selectedTranslateService?.apiType === "Claude" ||
      selectedTranslateService?.apiType === "Gemini" ||
      selectedTranslateService?.apiType === "Ollama" ||
      selectedTranslateService?.apiType === "LocalAI"
  );

  const transPrompts = useMemo(
    () =>
      (prompts || []).filter(
        (p) =>
          p.category === PROMPT_CATEGORY_USER ||
          p.category === PROMPT_CATEGORY_BATCH_SYSTEM
      ),
    [prompts]
  );

  // 2. 将所有下拉浮层锚定在 Shadow DOM 内当前容器，彻底防漂移
  const selectMenuProps = useMemo(
    () => ({
      container: () => rootRef.current,
      disableScrollLock: true,
      sx: {
        zIndex: 2147483647,
        "& .MuiPaper-root": {
          maxHeight: 280,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
        },
      },
    }),
    []
  );

  return (
    <Box
      ref={rootRef}
      sx={{
        backgroundColor: "background.paper",
        p: 1.5,
        userSelect: "none",
        // 彻底解决直角外突问题
        borderRadius: "16px 16px 0 0",
      }}
    >
      {/* 顶栏：标题、拖拽手柄、关闭按钮 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          mb: 1.2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <DragIndicatorRoundedIcon
            fontSize="small"
            sx={{ color: "text.secondary", cursor: "grab" }}
          />
          <Logo size={20} style={{ flexShrink: 0 }} />
          <Typography variant="subtitle2" fontWeight={600}>
            {i18n("image_translate_title", "图片翻译")}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* 第一行：原文语言、目标语言、翻译服务 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          mb: 1.2,
        }}
      >
        {/* 原文语言 */}
        <FormControl size="small" fullWidth>
          <InputLabel>{i18n("from_lang", "原文语言")}</InputLabel>
          <Select
            label={i18n("from_lang", "原文语言")}
            value={scene.fromLang || "auto"}
            disabled={busy}
            onChange={(e) =>
              onSettingChange?.({ ...scene, fromLang: e.target.value })
            }
            MenuProps={selectMenuProps}
          >
            {OPT_LANGS_FROM.map(([code, label]) => (
              <MenuItem key={code} value={code}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 目标语言 */}
        <FormControl size="small" fullWidth>
          <InputLabel>{i18n("to_lang", "目标语言")}</InputLabel>
          <Select
            label={i18n("to_lang", "目标语言")}
            value={scene.toLang || "zh-CN"}
            disabled={busy}
            onChange={(e) =>
              onSettingChange?.({ ...scene, toLang: e.target.value })
            }
            MenuProps={selectMenuProps}
          >
            {OPT_LANGS_TO.map(([code, label]) => (
              <MenuItem key={code} value={code}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 翻译服务 */}
        <FormControl size="small" fullWidth>
          <InputLabel>{i18n("translation_service", "翻译服务")}</InputLabel>
          <Select
            label={i18n("translation_service", "翻译服务")}
            value={scene.apiSlug || ""}
            disabled={busy}
            onChange={(e) =>
              onSettingChange?.({ ...scene, apiSlug: e.target.value })
            }
            MenuProps={selectMenuProps}
          >
            {translateServices.map((api) => (
              <MenuItem key={api.apiSlug} value={api.apiSlug}>
                {api.apiName || api.apiSlug}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* 第二行：布局分析、文本识别、翻译按钮组 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          alignItems: "center",
        }}
      >
        {/* 布局分析服务 */}
        <FormControl size="small" fullWidth>
          <InputLabel shrink>{i18n("layout_service", "布局分析")}</InputLabel>
          <Select
            label={i18n("layout_service", "布局分析")}
            value={scene.layoutApiSlug || ""}
            displayEmpty
            disabled={busy}
            onChange={(e) =>
              onSettingChange?.({ ...scene, layoutApiSlug: e.target.value })
            }
            MenuProps={selectMenuProps}
          >
            <MenuItem value="">
              <em>{i18n("image_setting_layout_none", "不启用")}</em>
            </MenuItem>
            {layoutServices.map((api) => (
              <MenuItem key={api.apiSlug} value={api.apiSlug}>
                {api.apiName || api.apiSlug}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 文本识别服务 (OCR / VLM) */}
        <FormControl size="small" fullWidth>
          <InputLabel>{i18n("image_recognition_service", "文本识别")}</InputLabel>
          <Select
            label={i18n("image_recognition_service", "文本识别")}
            value={selectedRecValue}
            disabled={busy}
            onChange={handleRecChange}
            MenuProps={selectMenuProps}
          >
            {recOptions.map((opt, idx) =>
              opt.groupLabel ? (
                <MenuItem key={`grp-${idx}`} disabled sx={{ fontWeight: 700 }}>
                  {opt.groupLabel}
                </MenuItem>
              ) : (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              )
            )}
          </Select>
        </FormControl>

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
              <CircularProgress size={16} />
              <Typography
                variant="body2"
                color="primary"
                sx={{ fontSize: "12px", whiteSpace: "nowrap" }}
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
            <ButtonGroup
              variant="contained"
              size="small"
              sx={{ height: "36px" }}
            >
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
      </Box>

      {/* 第三行：翻译提示词（按需显示） */}
      {isLlmTranslate && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 1,
            mt: 1.2,
          }}
        >
          {isLlmTranslate && (
            <FormControl size="small" fullWidth>
              <InputLabel>{i18n("translation_prompt", "翻译提示词")}</InputLabel>
              <Select
                label={i18n("translation_prompt", "翻译提示词")}
                value={scene.promptSlug || ""}
                disabled={busy}
                onChange={(e) =>
                  onSettingChange?.({ ...scene, promptSlug: e.target.value })
                }
                MenuProps={selectMenuProps}
              >
                <MenuItem value="">
                  <em>{i18n("default_prompt", "默认提示词")}</em>
                </MenuItem>
                {transPrompts.map((p) => (
                  <MenuItem key={p.slug} value={p.slug}>
                    {getPromptDisplayName(p, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

        </Box>
      )}

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
