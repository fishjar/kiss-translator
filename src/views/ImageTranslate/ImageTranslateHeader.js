/**
 * @file ImageTranslateHeader.js
 * @description 图片翻译弹窗顶部工具栏与配置选项区域（两行标准排版，Shadow DOM 菜单防漂移与圆角贴合）。
 */

import React, { useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import Logo from "../../components/Logo";

import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";
import { recognitionOptions } from "../../fileTranslation/recognition";
import { isPluginPromptSlug } from "../../providers/defaultPrompts";
import {
  supportsApiCapability,
  isApiConfigured,
} from "../../config/serviceSelection";
import {
  getAllTranslationPromptOptions,
  getPromptDisplayName,
  getVlmPromptOptions,
} from "../../config/prompt";

export function ImageTranslateSettings({
  scene = {},
  apis = [],
  prompts = [],
  busy = false,
  onSettingChange,
  i18n = (k, d) => d || k,
}) {
  const rootRef = useRef(null);

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
    const nextScene = {
      ...scene,
      ...(isPluginPromptSlug(scene.vlmPromptSlug) && { vlmPromptSlug: "" }),
    };
    if (!val) {
      onSettingChange?.({ ...nextScene, recognitionService: null });
    } else {
      try {
        const parsed = JSON.parse(val);
        onSettingChange?.({ ...nextScene, recognitionService: parsed });
      } catch {}
    }
  };

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
    () => getAllTranslationPromptOptions(prompts, selectedTranslateService),
    [prompts, selectedTranslateService]
  );

  const recognitionApi = apis.find(
    (api) => api.apiSlug === scene.recognitionService?.apiSlug
  );
  const vlmPrompts = getVlmPromptOptions(prompts, recognitionApi);

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
      }}
    >
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
          <InputLabel>
            {i18n("image_recognition_service", "文本识别")}
          </InputLabel>
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

        {scene.recognitionService?.capability === "parseImage" && (
          <FormControl size="small" fullWidth>
            <InputLabel shrink>
              {i18n("plugin_image_recognition_prompt", "识别提示词")}
            </InputLabel>
            <Select
              label={i18n("plugin_image_recognition_prompt", "识别提示词")}
              value={
                vlmPrompts.some((p) => p.slug === scene.vlmPromptSlug)
                  ? scene.vlmPromptSlug
                  : ""
              }
              displayEmpty
              disabled={busy}
              MenuProps={selectMenuProps}
              onChange={(e) =>
                onSettingChange?.({ ...scene, vlmPromptSlug: e.target.value })
              }
            >
              <MenuItem value="">
                {i18n("scene_prompt_follow_api", "跟随接口")}
              </MenuItem>
              {vlmPrompts.map((p) => (
                <MenuItem key={p.slug} value={p.slug}>
                  {getPromptDisplayName(p, i18n)}
                </MenuItem>
              ))}
            </Select>
            {scene.vlmPromptSlug &&
              !vlmPrompts.some((p) => p.slug === scene.vlmPromptSlug) && (
                <FormHelperText>
                  {i18n(
                    "plugin_prompt_unavailable",
                    "原提示词不可用，已跟随默认"
                  )}
                </FormHelperText>
              )}
          </FormControl>
        )}
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
              <InputLabel>
                {i18n("translation_prompt", "翻译提示词")}
              </InputLabel>
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
    </Box>
  );
}

export default function ImageTranslateHeader({
  onClose,
  i18n = (k, d) => d || k,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        p: 1.5,
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
  );
}
