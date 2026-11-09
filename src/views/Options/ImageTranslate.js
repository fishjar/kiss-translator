/**
 * @file ImageTranslate.js
 * @description 后台设置场景：网页图片翻译配置面板。
 */

import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import FormHelperText from "@mui/material/FormHelperText";

import { useI18n } from "../../hooks/I18n";
import { useSetting } from "../../hooks/Setting";
import { useApiList } from "../../hooks/Api";
import { useRules } from "../../hooks/Rules";
import { usePromptList } from "../../hooks/Prompt";
import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  GLOBLA_RULE,
} from "../../config";
import { DEFAULT_IMAGE_TRANSLATE_SETTING } from "../../config/setting";
import { recognitionOptions } from "../../fileTranslation/recognition";
import {
  supportsApiCapability,
  isApiConfigured,
} from "../../config/serviceSelection";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "./SettingsCard";
import ServiceSelect from "./ServiceSelect";
import ScenePromptSelect from "./ScenePromptSelect";
import { PROMPT_CATEGORY_VLM } from "../../config/prompt";
import { isPluginPromptSlug } from "../../providers/defaultPrompts";

export default function ImageTranslate() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const { transApis = [], enabledApis = [] } = useApiList();
  const { list: rules = [], put: putRule } = useRules();
  const { prompts } = usePromptList();

  const imageSetting = useMemo(
    () => ({
      ...DEFAULT_IMAGE_TRANSLATE_SETTING,
      ...(setting?.imageTranslateSetting || {}),
    }),
    [setting?.imageTranslateSetting]
  );

  const updateImageSetting = (patch) => {
    updateSetting((prev) => ({
      ...prev,
      imageTranslateSetting: {
        ...(prev?.imageTranslateSetting || DEFAULT_IMAGE_TRANSLATE_SETTING),
        ...patch,
        ...(Object.hasOwn(patch, "recognitionService") &&
          isPluginPromptSlug(prev?.imageTranslateSetting?.vlmPromptSlug) && {
            vlmPromptSlug: "",
          }),
      },
    }));
  };

  // 全局规则：统一作为网页图片悬停交互与小图过滤的事实源
  const globalRule = useMemo(
    () => rules.find((r) => r.pattern === "*") || GLOBLA_RULE,
    [rules]
  );

  const hoverEnabled = globalRule.imageTransOpen !== "false";
  const imageMinWidth =
    typeof globalRule.imageMinWidth === "number"
      ? globalRule.imageMinWidth
      : 120;
  const imageMinHeight =
    typeof globalRule.imageMinHeight === "number"
      ? globalRule.imageMinHeight
      : 80;

  const handleHoverToggle = (checked) => {
    putRule("*", { imageTransOpen: checked ? "true" : "false" });
  };

  const handleMinWidthChange = (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1) {
      putRule("*", { imageMinWidth: val });
    }
  };

  const handleMinHeightChange = (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1) {
      putRule("*", { imageMinHeight: val });
    }
  };

  // 1. 过滤翻译服务（具备 translate 能力）
  const translateApis = useMemo(
    () =>
      enabledApis.filter(
        (api) => !api.isDisabled && supportsApiCapability(api, "translate")
      ),
    [enabledApis]
  );

  // 2. 界面分析服务（参考文件翻译，以 transApis 为数据源筛选 analyzeLayout 实例）
  const layoutApis = useMemo(
    () =>
      transApis.filter(
        (api) =>
          !api.isDisabled &&
          isApiConfigured(api) &&
          supportsApiCapability(api, "analyzeLayout")
      ),
    [transApis]
  );

  // 3. 文本识别服务选项（参考文件翻译，以 transApis 为数据源筛选 OCR / VLM 实例）
  const recOptions = useMemo(
    () =>
      recognitionOptions(
        transApis,
        imageSetting.recognitionService,
        i18n,
        true
      ),
    [transApis, imageSetting.recognitionService, i18n]
  );

  const selectedRecValue = imageSetting.recognitionService
    ? JSON.stringify(imageSetting.recognitionService)
    : "";

  const handleRecChange = (e) => {
    const val = e.target.value;
    if (!val) {
      updateImageSetting({ recognitionService: null });
    } else {
      try {
        const parsed = JSON.parse(val);
        updateImageSetting({ recognitionService: parsed });
      } catch {}
    }
  };

  const isVlmService =
    imageSetting.recognitionService?.capability === "parseImage";

  return (
    <Box>
      <Stack spacing={3}>
        {/* 语言与翻译服务 */}
        <SettingsSection title={i18n("image_translate_general", "翻译与语言")}>
          <SettingsCard>
            <SettingsRow
              label={i18n("from_lang", "源语言")}
              description={i18n(
                "image_from_lang_desc",
                "图片文字识别翻译的源语言"
              )}
            >
              <SettingsSelect
                value={imageSetting.fromLang}
                label={i18n("from_lang", "源语言")}
                onChange={(value) => updateImageSetting({ fromLang: value })}
                options={OPT_LANGS_FROM}
              />
            </SettingsRow>

            <SettingsRow
              label={i18n("to_lang", "目标语言")}
              description={i18n("image_to_lang_desc", "图片文本翻译的目标语言")}
            >
              <SettingsSelect
                value={imageSetting.toLang}
                label={i18n("to_lang", "目标语言")}
                onChange={(value) => updateImageSetting({ toLang: value })}
                options={OPT_LANGS_TO}
              />
            </SettingsRow>

            <SettingsRow
              label={i18n("translation_service", "翻译服务")}
              description={i18n("image_api_desc", "用于翻译识别后文字的服务")}
            >
              <ServiceSelect
                scene={imageSetting}
                apis={translateApis}
                onChange={(apiSlug) => updateImageSetting({ apiSlug })}
              />
            </SettingsRow>

            <SettingsRow
              label={i18n("translation_prompt", "翻译提示词")}
              description={i18n(
                "image_prompt_desc",
                "使用大模型翻译服务时应用的提示词"
              )}
            >
              <ScenePromptSelect
                value={imageSetting.promptSlug || ""}
                scene={imageSetting}
                prompts={prompts}
                onChange={(promptSlug) => updateImageSetting({ promptSlug })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        {/* 识别与布局服务 */}
        <SettingsSection
          title={i18n("image_recognition_section", "图片识别与布局分析")}
        >
          <SettingsCard>
            <SettingsRow
              label={i18n(
                "image_setting_recognition_service",
                "文本识别服务 (OCR / VLM)"
              )}
              description={
                !imageSetting.recognitionService
                  ? i18n(
                      "image_no_recognition_warning",
                      "未配置识别服务时，图片翻译将无法识别文字"
                    )
                  : i18n(
                      "image_recognition_desc",
                      "支持坐标 OCR 或 VLM 视觉大模型"
                    )
              }
            >
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <Select
                  value={selectedRecValue}
                  onChange={handleRecChange}
                  displayEmpty
                >
                  {recOptions.map((opt, idx) =>
                    opt.groupLabel ? (
                      <MenuItem
                        key={`grp-${idx}`}
                        disabled
                        sx={{ opacity: 0.6, fontWeight: 700 }}
                      >
                        {opt.groupLabel}
                      </MenuItem>
                    ) : (
                      <MenuItem key={opt.value || "empty"} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    )
                  )}
                </Select>
                {!imageSetting.recognitionService && (
                  <FormHelperText error>
                    {i18n(
                      "recognition_required_hint",
                      "请选择至少一个 OCR 或 VLM 服务"
                    )}
                  </FormHelperText>
                )}
              </FormControl>
            </SettingsRow>

            {isVlmService && (
              <SettingsRow
                label={i18n("vlm_prompt", "视觉模型识别提示词")}
                description={i18n(
                  "vlm_prompt_desc",
                  "指定给 VLM 识别图像文本时的专用提示词"
                )}
              >
                <ScenePromptSelect
                  category={PROMPT_CATEGORY_VLM}
                  recognitionApi={setting.transApis?.find(
                    (api) =>
                      api.apiSlug === imageSetting.recognitionService?.apiSlug
                  )}
                  value={imageSetting.vlmPromptSlug || ""}
                  scene={{
                    ...imageSetting,
                    promptSlug: imageSetting.vlmPromptSlug,
                  }}
                  prompts={prompts}
                  onChange={(vlmPromptSlug) =>
                    updateImageSetting({ vlmPromptSlug })
                  }
                />
              </SettingsRow>
            )}

            <SettingsRow
              label={i18n("layout_service", "界面分析服务 (可选)")}
              description={i18n(
                "image_layout_desc",
                "默认整图识别。若启用布局服务，将先分块再按序识别"
              )}
            >
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel shrink>
                  {i18n("layout_service", "界面分析服务")}
                </InputLabel>
                <Select
                  value={imageSetting.layoutApiSlug || ""}
                  displayEmpty
                  label={i18n("layout_service", "界面分析服务")}
                  onChange={(e) =>
                    updateImageSetting({ layoutApiSlug: e.target.value })
                  }
                >
                  <MenuItem value="">
                    {i18n("layout_disabled", "不使用布局服务 (整图识别)")}
                  </MenuItem>
                  {layoutApis.map((api) => (
                    <MenuItem key={api.apiSlug} value={api.apiSlug}>
                      {api.apiName || api.apiSlug}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        {/* 网页悬停交互配置（直接绑定全局规则） */}
        <SettingsSection title={i18n("image_hover_section", "网页悬停与交互")}>
          <SettingsCard>
            <SettingsRow
              label={i18n("image_hover_enable", "启用网页图片悬停快捷按钮")}
              description={i18n(
                "image_hover_desc",
                "鼠标移入符合条件的图片时，立即显示“菜单”和“翻译”快捷按钮"
              )}
            >
              <SettingsSwitch
                checked={hoverEnabled}
                label={i18n("image_hover_enable", "启用图片悬停")}
                onChange={handleHoverToggle}
              />
            </SettingsRow>

            <SettingsRow
              label={i18n("image_min_width_label", "最小图片宽度 (像素)")}
              description={i18n(
                "image_min_width_desc",
                "低于该宽度的图片将被忽略，以过滤小图标和装饰图"
              )}
            >
              <TextField
                type="number"
                size="small"
                sx={{ width: 120 }}
                value={imageMinWidth}
                onChange={handleMinWidthChange}
              />
            </SettingsRow>

            <SettingsRow
              label={i18n("image_min_height_label", "最小图片高度 (像素)")}
              description={i18n(
                "image_min_height_desc",
                "低于该高度的图片将被忽略，以过滤小图标和横条装饰"
              )}
            >
              <TextField
                type="number"
                size="small"
                sx={{ width: 120 }}
                value={imageMinHeight}
                onChange={handleMinHeightChange}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      </Stack>
    </Box>
  );
}
