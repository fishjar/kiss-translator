import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CodeField from "./CodeField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Divider from "@mui/material/Divider";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_ENHANCE_ON,
  OPT_ENHANCE_OFF,
  OPT_ENHANCE_MOBILE_OFF,
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  PROMPT_MODE_FOLLOW_API,
  PROMPT_MODE_GLOBAL,
  getPromptDisplayName,
  getSubtitlePromptOptions,
} from "../../config";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import { useSubtitle } from "../../hooks/Subtitle";
import { useApiList } from "../../hooks/Api";
import { usePromptList } from "../../hooks/Prompt";
import ValidationInput from "../../hooks/ValidationInput";
import { useCallback, useMemo } from "react";
import { normalizeSubtitleMode } from "../../subtitle/modes";
import {
  SettingsAdvanced,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSelect,
  SettingsSwitch,
} from "./SettingsCard";
import {
  colorToHex,
  cssObjectToReactStyle,
  getCssLengthSliderRange,
  hexToRgb,
  parseCssToObject,
  parseCssColor,
  parseFontSize,
  parseLineHeight,
  parsePadding,
  resolveEditableBackgroundRgba,
  resolveBackgroundRgba,
  rgbToHex,
  serializeFontSize,
} from "./subtitleStyleUtils";
import { useSubtitleStyleEditor } from "./useSubtitleStyleEditor";

// YouTube 默认字幕容器的最大参考宽度
const YOUTUBE_CAPTION_CONTAINER_WIDTH = 640;

/**
 * 视频双语字幕预览面板组件
 */
function SubtitleStylePreview({
  windowStyle,
  originStyle,
  translationStyle,
  displayOrder,
}) {
  const i18n = useI18n();

  const windowCss = useMemo(() => parseCssToObject(windowStyle), [windowStyle]);
  const originCss = useMemo(() => parseCssToObject(originStyle), [originStyle]);
  const transCss = useMemo(
    () => parseCssToObject(translationStyle),
    [translationStyle]
  );
  const windowReactStyle = useMemo(
    () => cssObjectToReactStyle(windowCss),
    [windowCss]
  );
  const originReactStyle = useMemo(
    () => cssObjectToReactStyle(originCss),
    [originCss]
  );
  const transReactStyle = useMemo(
    () => cssObjectToReactStyle(transCss),
    [transCss]
  );
  const originPreview = (
    <p style={{ ...originReactStyle, margin: 0 }}>
      This is an example subtitle
    </p>
  );
  const translationPreview = (
    <p style={{ ...transReactStyle, margin: 0 }}>
      {i18n("subtitle_preview_sample") || "这是示例字幕文本"}
    </p>
  );
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {i18n("subtitle_style_preview") || "样式预览"}
      </Typography>
      <Box
        sx={{
          bgcolor: "#ffffff",
          borderRadius: 1,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 120,
        }}
      >
        <Box
          sx={{
            containerType: "inline-size",
            width: YOUTUBE_CAPTION_CONTAINER_WIDTH,
            maxWidth: "100%",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {/* 渲染模拟网页上的字幕窗格 */}
          <div style={{ ...windowReactStyle, textAlign: "center" }}>
            {displayOrder === "translation-first" ? (
              <>
                {translationPreview}
                {originPreview}
              </>
            ) : (
              <>
                {originPreview}
                {translationPreview}
              </>
            )}
          </div>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * 视频双语字幕翻译设置页面组件 (SubtitleSetting)
 */
export default function SubtitleSetting() {
  const i18n = useI18n();
  // 字幕设置 Hook
  const { subtitleSetting, updateSubtitle } = useSubtitle();
  // 启用的翻译引擎列表与 AI 模型引擎列表
  const { enabledApis, aiEnabledApis } = useApiList();
  const { prompts } = usePromptList();
  const subtitlePromptOptions = useMemo(
    () => getSubtitlePromptOptions(prompts),
    [prompts]
  );

  // 通用表单变动提交
  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    updateSubtitle({
      [name]: value,
    });
    styleEditor.syncStyleSource(name, value);
  };

  const handleSegPromptChange = (e) => {
    e.preventDefault();
    const { value } = e.target;

    if (value === PROMPT_MODE_FOLLOW_API) {
      updateSubtitle({
        segPromptMode: PROMPT_MODE_FOLLOW_API,
      });
      return;
    }

    updateSubtitle({
      segPromptMode: PROMPT_MODE_GLOBAL,
      segPromptSlug: value,
    });
  };

  // 解构当前字幕翻译的具体设置
  const {
    enabled,
    apiSlug,
    segSlug,
    forceSubtitleRetranslate = false,
    useAlgorithmBreaker = "rule",
    chunkLength,
    longSentenceThreshold = 120,
    preTrans = 90,
    throttleTrans = 30,
    toLang,
    autoTranslate = true,
    isBilingual,
    displayOrder = "original-first",
    blurTranslation = false,
    enhanceMode,
    hoverLookupMode,
    autoFavWord = false,
    showList = OPT_ENHANCE_MOBILE_OFF,
    skipAd = false,
    aiContextSlug = "-",
    segPromptMode = PROMPT_MODE_FOLLOW_API,
    segPromptSlug,
    windowStyle,
    originStyle,
    translationStyle,
    showLoadNotification = true,
    hideSubtitleButton = false,
  } = subtitleSetting;

  // 整理悬浮查词模式和字幕列表模式的回退逻辑
  const hoverLookupModeValue = normalizeSubtitleMode(
    hoverLookupMode,
    enhanceMode || OPT_ENHANCE_MOBILE_OFF
  );
  const showListValue = normalizeSubtitleMode(
    showList,
    enhanceMode || OPT_ENHANCE_MOBILE_OFF
  );
  const selectedSegPromptSlug = segPromptSlug || DEFAULT_SUBTITLE_PROMPT_SLUG;
  const hasSelectedSegPrompt = subtitlePromptOptions.some(
    (prompt) => prompt.slug === selectedSegPromptSlug
  );
  const segPromptValue =
    segPromptMode === PROMPT_MODE_GLOBAL && hasSelectedSegPrompt
      ? selectedSegPromptSlug
      : PROMPT_MODE_FOLLOW_API;
  const segmentationValue =
    segSlug && segSlug !== "-" ? `ai:${segSlug}` : useAlgorithmBreaker;

  const styleEditor = useSubtitleStyleEditor({
    originStyle,
    translationStyle,
    windowStyle,
    updateSubtitle,
  });
  const {
    localOriginStyle,
    localTransStyle,
    localWindowStyle,
    updateOriginCss,
    updateTranslationCss,
    updateWindowCss,
  } = styleEditor;

  // 从本地计算生成的临时 CSS 键值对，用于给 Slider 及其余受控组件展示当前样式属性值
  const originCssObj = useMemo(
    () => parseCssToObject(localOriginStyle),
    [localOriginStyle]
  );
  const transCssObj = useMemo(
    () => parseCssToObject(localTransStyle),
    [localTransStyle]
  );
  const windowCssObj = useMemo(
    () => parseCssToObject(localWindowStyle),
    [localWindowStyle]
  );

  const originFontSize = parseFontSize(originCssObj["font-size"] || "");
  const transFontSize = parseFontSize(transCssObj["font-size"] || "");

  const windowPadding = parsePadding(windowCssObj["padding"] || "0.5em 1em");
  const verticalPaddingRange = getCssLengthSliderRange(
    windowPadding.vertical,
    windowPadding.unit
  );
  const horizontalPaddingRange = getCssLengthSliderRange(
    windowPadding.horizontal,
    windowPadding.unit
  );
  const editableWindowBgRgba = resolveEditableBackgroundRgba(windowCssObj);
  const windowBgRgba = resolveBackgroundRgba(windowCssObj);
  const windowBgHex = rgbToHex(windowBgRgba.r, windowBgRgba.g, windowBgRgba.b);
  const windowLineHeight = parseLineHeight(windowCssObj["line-height"]);
  const windowHasTextShadow = !!windowCssObj["text-shadow"];

  // 缓存可复用的单个文本（如原文或译文）的 CSS 字体、大小及颜色滑动条控制器结构
  const textStyleControls = useCallback(
    (label, fontSize, cssObj, updateCss) => {
      const fontSizeRange = getCssLengthSliderRange(
        fontSize.preferred,
        fontSize.preferredUnit
      );
      const colorSource = cssObj["color"] || "";
      const parsedColor = colorSource
        ? parseCssColor(colorSource)
        : { r: 255, g: 255, b: 255, a: 1 };
      const colorIsEditable = !colorSource || Boolean(parsedColor);

      return (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            {label}
          </Typography>
          <Stack spacing={1.5}>
            {/* 字号 Slider 滑动控制 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ minWidth: 56, flexShrink: 0 }}
              >
                {i18n("font_size") || "字体大小"}
              </Typography>
              <Slider
                aria-label={`${label} ${i18n("font_size")}`}
                size="small"
                value={fontSize.preferred}
                min={fontSizeRange.min}
                max={fontSizeRange.max}
                step={fontSizeRange.step}
                disabled={!fontSize.isEditable}
                onChange={(e, val) => {
                  const value = serializeFontSize(fontSize, val);
                  if (value) updateCss("font-size", value);
                }}
                sx={{ flex: 1 }}
              />
              <Typography
                variant="body2"
                sx={{ minWidth: 48, textAlign: "right" }}
              >
                {fontSize.preferred}
                {fontSize.preferredUnit}
              </Typography>
            </Box>
            {/* 字体颜色选取器与 HEX 文本框 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ minWidth: 56, flexShrink: 0 }}
              >
                {i18n("font_color") || "字体颜色"}
              </Typography>
              <Box
                component="input"
                type="color"
                aria-label={`${label} ${i18n("font_color")}`}
                value={colorToHex(cssObj["color"])}
                disabled={!colorIsEditable}
                onChange={(e) => {
                  if (!parsedColor) return;
                  const rgb = hexToRgb(e.target.value);
                  const value =
                    parsedColor.a < 1
                      ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${parsedColor.a})`
                      : e.target.value;
                  updateCss("color", value);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  border: "none",
                  cursor: colorIsEditable ? "pointer" : "not-allowed",
                  p: 0,
                  bgcolor: "transparent",
                }}
              />
              <TextField
                size="small"
                value={cssObj["color"] || ""}
                onChange={(e) => updateCss("color", e.target.value)}
                placeholder="#ffffff"
                sx={{ flex: 1 }}
              />
            </Box>
          </Stack>
        </Box>
      );
    },
    [i18n]
  );

  return (
    <Box>
      <Stack spacing={3}>
        <SettingsSection>
          <SettingsCard>
            <SettingsRow label={i18n("toggle_subtitle_translate")}>
              <SettingsSwitch
                checked={enabled}
                label={i18n("toggle_subtitle_translate")}
                onChange={(checked) => updateSubtitle({ enabled: checked })}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("settings_subtitle_auto_start")}
              description={i18n("settings_subtitle_auto_start_description")}
            >
              <SettingsSwitch
                checked={autoTranslate}
                disabled={!enabled}
                label={i18n("settings_subtitle_auto_start")}
                onChange={(checked) =>
                  updateSubtitle({ autoTranslate: checked })
                }
              />
            </SettingsRow>
            <SettingsRow label={i18n("is_bilingual_view")}>
              <SettingsSwitch
                checked={isBilingual}
                label={i18n("is_bilingual_view")}
                onChange={(checked) => updateSubtitle({ isBilingual: checked })}
              />
            </SettingsRow>
            <SettingsRow label={i18n("trans_order")}>
              <SettingsSegmented
                value={displayOrder}
                label={i18n("trans_order")}
                onChange={(value) => updateSubtitle({ displayOrder: value })}
                items={[
                  {
                    value: "original-first",
                    label: i18n("original_first"),
                  },
                  {
                    value: "translation-first",
                    label: i18n("translation_first"),
                  },
                ]}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title={i18n("settings_quality_group")}>
          <SettingsCard>
            <SettingsRow label={i18n("translate_service")}>
              <SettingsSelect
                value={apiSlug}
                label={i18n("translate_service")}
                onChange={(value) => updateSubtitle({ apiSlug: value })}
                options={enabledApis.map((api) => ({
                  value: api.apiSlug,
                  label: api.apiName,
                }))}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("settings_segmentation_method")}
              description={i18n("settings_segmentation_description")}
            >
              <SettingsSelect
                value={segmentationValue}
                label={i18n("settings_segmentation_method")}
                onChange={(value) => {
                  if (value.startsWith("ai:")) {
                    updateSubtitle({ segSlug: value.slice(3) });
                  } else {
                    updateSubtitle({
                      segSlug: "-",
                      useAlgorithmBreaker: value,
                    });
                  }
                }}
                options={[
                  { value: "rule", label: i18n("rule_sentence_break") },
                  {
                    value: "statistical",
                    label: i18n("statistical_sentence_break"),
                  },
                  ...aiEnabledApis.map((api) => ({
                    value: `ai:${api.apiSlug}`,
                    label: `AI · ${api.apiName}`,
                  })),
                ]}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("is_skip_ad")}
              description={i18n("settings_skip_ad_description")}
            >
              <SettingsSwitch
                checked={skipAd}
                label={i18n("is_skip_ad")}
                onChange={(checked) => updateSubtitle({ skipAd: checked })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title={i18n("settings_learning_group")}>
          <SettingsCard>
            <SettingsRow
              label={i18n("is_blur_translation")}
              description={i18n("settings_blur_translation_description")}
            >
              <SettingsSwitch
                checked={blurTranslation}
                label={i18n("is_blur_translation")}
                onChange={(checked) =>
                  updateSubtitle({ blurTranslation: checked })
                }
              />
            </SettingsRow>
            <SettingsRow label={i18n("subtitle_hover_lookup")}>
              <SettingsSegmented
                value={hoverLookupModeValue}
                label={i18n("subtitle_hover_lookup")}
                onChange={(value) => updateSubtitle({ hoverLookupMode: value })}
                items={[
                  { value: OPT_ENHANCE_OFF, label: i18n("disable") },
                  {
                    value: OPT_ENHANCE_MOBILE_OFF,
                    label: i18n("disable_on_mobile"),
                  },
                  { value: OPT_ENHANCE_ON, label: i18n("enable") },
                ]}
              />
            </SettingsRow>
            <SettingsRow
              label={i18n("auto_fav_word")}
              description={i18n("settings_auto_favorite_description")}
            >
              <SettingsSwitch
                checked={autoFavWord}
                label={i18n("auto_fav_word")}
                onChange={(checked) => updateSubtitle({ autoFavWord: checked })}
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsAdvanced label={i18n("settings_detailed_controls")}>
          {/* 顶部字幕翻译相关交互功能友情说明 */}
          <Alert severity="info">
            {i18n("subtitle_helper_1")}
            <br />
            {i18n("subtitle_helper_2")}
            <br />
            {i18n("subtitle_helper_3")}
          </Alert>

          {/* 字幕分句分词策略、翻译引擎、超前预翻译等参数配置网格区域 */}
          <Box>
            <Grid container spacing={2} columns={12}>
              {segSlug !== "-" && (
                <Grid item xs={12} sm={12} md={6} lg={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    name="segPromptSlug"
                    value={segPromptValue}
                    label={i18n("seg_prompt_mode", "AI断句提示词")}
                    onChange={handleSegPromptChange}
                  >
                    <MenuItem value={PROMPT_MODE_FOLLOW_API}>
                      {i18n("follow_api_prompt", "接口默认")}
                    </MenuItem>
                    {subtitlePromptOptions.map((prompt) => (
                      <MenuItem key={prompt.slug} value={prompt.slug}>
                        {getPromptDisplayName(prompt, i18n)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}
              {/* AI 断句服务与翻译服务不同时，是否丢弃 AI 断句返回的译文并交给翻译服务重翻 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="forceSubtitleRetranslate"
                  value={forceSubtitleRetranslate}
                  label={i18n("force_subtitle_retranslate")}
                  onChange={handleChange}
                >
                  <MenuItem value={true}>{i18n("enable")}</MenuItem>
                  <MenuItem value={false}>{i18n("disable")}</MenuItem>
                </TextField>
              </Grid>
              {/* 字幕翻译是否使用 AI 增强上下文，并指定提供服务的 AI 引擎 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="aiContextSlug"
                  value={aiContextSlug}
                  label={i18n("ai_enhanced_context")}
                  onChange={handleChange}
                >
                  <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                  {aiEnabledApis.map((api) => (
                    <MenuItem key={api.apiSlug} value={api.apiSlug}>
                      {api.apiName}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* 一批提交给 AI 进行断句的最长原始字幕文本长度阈值 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("ai_chunk_length")}
                  type="number"
                  name="chunkLength"
                  value={chunkLength}
                  onChange={handleChange}
                  min={200}
                  max={20000}
                />
              </Grid>
              {/* 判定为长句并强行触发断句的句子最大长度限制 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("long_sentence_threshold")}
                  type="number"
                  name="longSentenceThreshold"
                  value={longSentenceThreshold}
                  onChange={handleChange}
                  min={20}
                  max={500}
                />
              </Grid>
              {/* 视频拉取到字幕时，默认超前预翻译多少秒的后续字幕，以防视频播放时发生延迟查词 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("pre_trans_seconds")}
                  type="number"
                  name="preTrans"
                  value={preTrans}
                  onChange={handleChange}
                  min={10}
                  max={36000}
                />
              </Grid>
              {/* 避免短时间内视频拖拽和字幕块大量翻滚时发生高频网络请求的防抖限流间隔 (s) */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  fullWidth
                  size="small"
                  label={i18n("throttle_trans_interval")}
                  type="number"
                  name="throttleTrans"
                  value={throttleTrans}
                  onChange={handleChange}
                  min={1}
                  max={3600}
                />
              </Grid>
              {/* 目标翻译出的双语字幕语言 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="toLang"
                  value={toLang}
                  label={i18n("to_lang")}
                  onChange={handleChange}
                >
                  {OPT_LANGS_TO.map(([lang, name]) => (
                    <MenuItem key={lang} value={lang}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* 视频侧边/下方的独立字幕全文滚动列表显示模式 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="showList"
                  value={showListValue}
                  label={i18n("show_subtitle_list") || "显示字幕列表"}
                  onChange={handleChange}
                >
                  <MenuItem value={OPT_ENHANCE_ON}>{i18n("enable")}</MenuItem>
                  <MenuItem value={OPT_ENHANCE_OFF}>{i18n("disable")}</MenuItem>
                  <MenuItem value={OPT_ENHANCE_MOBILE_OFF}>
                    {i18n("disable_on_mobile")}
                  </MenuItem>
                </TextField>
              </Grid>
              {/* 网页加载完毕且成功识别到视频字幕流时，是否在右下角弹出载入成功的横幅提示 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="showLoadNotification"
                  value={showLoadNotification}
                  label={i18n("subtitle_loading_notification")}
                  onChange={handleChange}
                >
                  <MenuItem value={true}>{i18n("show")}</MenuItem>
                  <MenuItem value={false}>{i18n("hide")}</MenuItem>
                </TextField>
              </Grid>
              {/* 是否隐藏 YouTube 播放器控制栏中的 KT 字幕功能按钮 */}
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  name="hideSubtitleButton"
                  value={hideSubtitleButton}
                  label={i18n("hide_subtitle_button")}
                  onChange={handleChange}
                >
                  <MenuItem value={true}>{i18n("enable")}</MenuItem>
                  <MenuItem value={false}>{i18n("disable")}</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Box>

          {/* 字幕外观样式设计及预览器板块 */}
          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              p: 2,
            }}
          >
            <Stack spacing={2}>
              {/* 字幕预览展示窗 */}
              <SubtitleStylePreview
                windowStyle={localWindowStyle}
                originStyle={localOriginStyle}
                translationStyle={localTransStyle}
                displayOrder={displayOrder}
              />

              <Divider />

              {/* 字号与字体颜色修改 */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  {textStyleControls(
                    i18n("origin_styles"),
                    originFontSize,
                    originCssObj,
                    updateOriginCss
                  )}
                </Grid>
                <Grid item xs={12} sm={6}>
                  {textStyleControls(
                    i18n("translation_styles"),
                    transFontSize,
                    transCssObj,
                    updateTranslationCss
                  )}
                </Grid>
              </Grid>

              <Divider />

              {/* 字幕窗格背景样式控制区域 */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {i18n("background_styles")}
                </Typography>
                <Grid container spacing={1.5} alignItems="center">
                  {/* 窗格背景底色与透明度滑动条 */}
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ minWidth: 56, flexShrink: 0 }}
                      >
                        {i18n("background_color") || "背景颜色"}
                      </Typography>
                      <Box
                        component="input"
                        type="color"
                        aria-label={i18n("background_color")}
                        value={windowBgHex}
                        disabled={!editableWindowBgRgba}
                        onChange={(e) => {
                          const rgb = hexToRgb(e.target.value);
                          updateWindowCss(
                            "background-color",
                            `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${windowBgRgba.a})`
                          );
                        }}
                        sx={{
                          width: 28,
                          height: 28,
                          border: "none",
                          cursor: editableWindowBgRgba
                            ? "pointer"
                            : "not-allowed",
                          p: 0,
                          bgcolor: "transparent",
                        }}
                      />
                      <Typography variant="body2" sx={{ minWidth: 48 }}>
                        {i18n("opacity") || "透明度"}
                      </Typography>
                      <Slider
                        aria-label={i18n("opacity")}
                        size="small"
                        value={windowBgRgba.a}
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={!editableWindowBgRgba}
                        onChange={(e, val) => {
                          updateWindowCss(
                            "background-color",
                            `rgba(${windowBgRgba.r}, ${windowBgRgba.g}, ${windowBgRgba.b}, ${val})`
                          );
                        }}
                        sx={{ flex: 1 }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ minWidth: 36, textAlign: "right" }}
                      >
                        {Math.round(windowBgRgba.a * 100)}%
                      </Typography>
                    </Box>
                  </Grid>
                  {/* 行高微调 Slider */}
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ minWidth: 56, flexShrink: 0 }}
                      >
                        {i18n("line_height") || "行高"}
                      </Typography>
                      <Slider
                        aria-label={i18n("line_height")}
                        size="small"
                        value={windowLineHeight.value}
                        min={0}
                        max={Math.max(2.5, windowLineHeight.value * 2)}
                        step={0.1}
                        disabled={!windowLineHeight.isEditable}
                        onChange={(e, val) =>
                          updateWindowCss("line-height", String(val))
                        }
                        sx={{ flex: 1 }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ minWidth: 28, textAlign: "right" }}
                      >
                        {windowLineHeight.value}
                      </Typography>
                    </Box>
                  </Grid>
                  {/* 上下与左右内边距微调 Slider */}
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ minWidth: 56, flexShrink: 0 }}
                      >
                        {i18n("padding") || "内边距"}
                      </Typography>
                      <Typography variant="body2">
                        {i18n("vertical") || "上下"}
                      </Typography>
                      <Slider
                        aria-label={i18n("vertical")}
                        size="small"
                        value={windowPadding.vertical}
                        min={verticalPaddingRange.min}
                        max={verticalPaddingRange.max}
                        step={verticalPaddingRange.step}
                        disabled={!windowPadding.isEditable}
                        onChange={(e, val) => {
                          updateWindowCss(
                            "padding",
                            `${val}${windowPadding.unit} ${windowPadding.horizontal}${windowPadding.unit}`
                          );
                        }}
                        sx={{ width: 80 }}
                      />
                      <Typography variant="body2">
                        {i18n("horizontal") || "左右"}
                      </Typography>
                      <Slider
                        aria-label={i18n("horizontal")}
                        size="small"
                        value={windowPadding.horizontal}
                        min={horizontalPaddingRange.min}
                        max={horizontalPaddingRange.max}
                        step={horizontalPaddingRange.step}
                        disabled={!windowPadding.isEditable}
                        onChange={(e, val) => {
                          updateWindowCss(
                            "padding",
                            `${windowPadding.vertical}${windowPadding.unit} ${val}${windowPadding.unit}`
                          );
                        }}
                        sx={{ width: 80 }}
                      />
                    </Box>
                  </Grid>
                  {/* 字幕文字四周的阴影开关 */}
                  <Grid item xs={12} sm={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={windowHasTextShadow}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateWindowCss(
                                "text-shadow",
                                "1px 1px 2px black"
                              );
                            } else {
                              updateWindowCss("text-shadow", "");
                            }
                          }}
                        />
                      }
                      label={
                        <Typography variant="body2">
                          {i18n("text_shadow") || "文字阴影"}
                        </Typography>
                      }
                    />
                  </Grid>
                </Grid>
              </Box>

              {/* 折叠的高级 CSS 源码编辑器面板 (可自由手写额外的样式规则覆盖视频字幕的外观) */}
              <Accordion
                sx={{ boxShadow: "none", "&:before": { display: "none" } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2" color="text.secondary">
                    {i18n("advanced_css") || "高级 CSS 编辑"}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <CodeField
                        size="small"
                        label={i18n("origin_styles")}
                        name="originStyle"
                        value={originStyle}
                        onChange={handleChange}
                        maxRows={10}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <CodeField
                        size="small"
                        label={i18n("translation_styles")}
                        name="translationStyle"
                        value={translationStyle}
                        onChange={handleChange}
                        maxRows={10}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <CodeField
                        size="small"
                        label={i18n("background_styles")}
                        name="windowStyle"
                        value={windowStyle}
                        onChange={handleChange}
                        maxRows={10}
                        fullWidth
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Stack>
          </Box>
        </SettingsAdvanced>
      </Stack>
    </Box>
  );
}
