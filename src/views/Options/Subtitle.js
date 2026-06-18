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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { normalizeSubtitleMode } from "../../subtitle/modes";

/**
 * 将 CSS 字符串解析成键值对 JavaScript 对象
 */
const parseCssToObject = (cssString) => {
  const result = {};
  if (!cssString) return result;

  const properties = cssString.split(";").filter((p) => p.trim());
  properties.forEach((prop) => {
    const colonIndex = prop.indexOf(":");
    if (colonIndex > 0) {
      const key = prop.substring(0, colonIndex).trim();
      const value = prop.substring(colonIndex + 1).trim();
      result[key] = value;
    }
  });
  return result;
};

/**
 * 将 JavaScript CSS 样式对象转换回标准 CSS 字符串
 */
const objectToCss = (obj) => {
  const entries = Object.entries(obj).filter(
    ([, value]) => value !== undefined && value !== ""
  );
  if (entries.length === 0) {
    return "";
  }
  return entries.map(([key, value]) => `${key}: ${value}`).join(";\n") + ";";
};

/**
 * 提取并解析 rgba() 或 rgb() 颜色字符串的 R、G、B、A 属性
 */
const parseRgba = (rgbaString) => {
  const match = rgbaString?.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1,
    };
  }
  return null;
};

/**
 * 将 RGB 十进制数值转换为 Hex 十六进制颜色代码
 */
const rgbToHex = (r, g, b) => {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        let v = Number(x);
        if (Number.isNaN(v)) v = 0;
        v = Math.min(255, Math.max(0, Math.round(v)));
        return v.toString(16).padStart(2, "0");
      })
      .join("")
  );
};

/**
 * 将 Hex 十六进制颜色代码转换成 RGB 十进制颜色对象
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

/**
 * 从 CSS 字体大小声明中解析出具体的值 (如从 clamp 表达式中提取其弹性首选 rem 等)
 */
const parseFontSize = (fontSizeStr) => {
  if (!fontSizeStr) return { min: 1, preferred: 2, max: 3, unit: "rem" };

  const clampMatch = fontSizeStr.match(
    /clamp\s*\(\s*([\d.]+)(\w+)\s*,\s*([\d.]+)(\w+)\s*,\s*([\d.]+)(\w+)\s*\)/
  );
  if (clampMatch) {
    return {
      min: parseFloat(clampMatch[1]),
      preferred: parseFloat(clampMatch[3]),
      max: parseFloat(clampMatch[5]),
      unit: clampMatch[2],
    };
  }

  const simpleMatch = fontSizeStr.match(/([\d.]+)(\w+)/);
  if (simpleMatch) {
    const value = parseFloat(simpleMatch[1]);
    return {
      min: value * 0.5,
      preferred: value,
      max: value * 1.5,
      unit: simpleMatch[2],
    };
  }

  return { min: 1, preferred: 2, max: 3, unit: "rem" };
};

/**
 * 从 CSS 的 padding 声明中解析出上下和左右内边距
 */
const parsePadding = (paddingStr) => {
  if (!paddingStr) return { vertical: 0.5, horizontal: 1, unit: "em" };

  const parts = paddingStr.trim().split(/\s+/);
  if (parts.length === 1) {
    const match = parts[0].match(/([\d.]+)(\w+)/);
    if (match) {
      return {
        vertical: parseFloat(match[1]),
        horizontal: parseFloat(match[1]),
        unit: match[2],
      };
    }
  } else if (parts.length >= 2) {
    const vMatch = parts[0].match(/([\d.]+)(\w+)/);
    const hMatch = parts[1].match(/([\d.]+)(\w+)/);
    if (vMatch && hMatch) {
      return {
        vertical: parseFloat(vMatch[1]),
        horizontal: parseFloat(hMatch[1]),
        unit: vMatch[2],
      };
    }
  }
  return { vertical: 0.5, horizontal: 1, unit: "em" };
};

/**
 * 将常见的 CSS 颜色名转化成十六进制颜色代码
 */
const colorToHex = (colorStr) => {
  if (!colorStr) return "#ffffff";
  const namedColors = {
    white: "#ffffff",
    black: "#000000",
    red: "#ff0000",
    green: "#00ff00",
    blue: "#0000ff",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    gray: "#808080",
    grey: "#808080",
    orange: "#ffa500",
    transparent: "#ffffff",
  };
  const lower = colorStr.toLowerCase().trim();
  if (namedColors[lower]) return namedColors[lower];
  if (colorStr.startsWith("#")) return colorStr;
  const rgba = parseRgba(colorStr);
  if (rgba) return rgbToHex(rgba.r, rgba.g, rgba.b);
  return "#ffffff";
};

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
  const originPreview = (
    <p style={{ ...originCss, margin: 0 }}>This is an example subtitle</p>
  );
  const translationPreview = (
    <p style={{ ...transCss, margin: 0 }}>
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
          <div style={{ ...windowCss, textAlign: "center" }}>
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
    // 如果修改了自定义 CSS 源码，同步刷新本地的 CSS 临时解析缓存
    if (name === "originStyle") {
      setLocalOriginStyle(value);
      originCssRef.current = parseCssToObject(value);
    } else if (name === "translationStyle") {
      setLocalTransStyle(value);
      transCssRef.current = parseCssToObject(value);
    } else if (name === "windowStyle") {
      setLocalWindowStyle(value);
      windowCssRef.current = parseCssToObject(value);
    }
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
    isBilingual,
    displayOrder = "original-first",
    blurTranslation = false,
    enhanceMode,
    hoverLookupMode,
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

  // 维护一份本地的 CSS 临时样式值，以供 Slider 滑块频繁拖拽时实现低延迟渲染
  const [localOriginStyle, setLocalOriginStyle] = useState(originStyle);
  const [localTransStyle, setLocalTransStyle] = useState(translationStyle);
  const [localWindowStyle, setLocalWindowStyle] = useState(windowStyle);

  // 监听外部配置的样式同步更新本地
  useEffect(() => {
    setLocalOriginStyle(originStyle);
  }, [originStyle]);
  useEffect(() => {
    setLocalTransStyle(translationStyle);
  }, [translationStyle]);
  useEffect(() => {
    setLocalWindowStyle(windowStyle);
  }, [windowStyle]);

  // 控制频繁 Slider 输入时的防抖定时器
  const debounceTimers = useRef({});
  const rafIds = useRef({ origin: 0, trans: 0, window: 0 });

  const originCssRef = useRef(parseCssToObject(localOriginStyle));
  const transCssRef = useRef(parseCssToObject(localTransStyle));
  const windowCssRef = useRef(parseCssToObject(localWindowStyle));

  // 组件卸载时销毁所有动画帧与防抖定时器
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      debounceTimers.current = {};
      Object.values(rafIds.current).forEach(
        (id) => id && cancelAnimationFrame(id)
      );
      rafIds.current = { origin: 0, trans: 0, window: 0 };
    };
  }, []);

  // 防抖保存最终 CSS 样式至 Chrome 扩展的持久存储中，避免拖动滑块时高频读写造成卡顿
  const debouncedUpdate = useCallback(
    (name, value) => {
      if (debounceTimers.current[name]) {
        clearTimeout(debounceTimers.current[name]);
      }
      debounceTimers.current[name] = setTimeout(() => {
        updateSubtitle({ [name]: value });
      }, 200);
    },
    [updateSubtitle]
  );

  // 使用 requestAnimationFrame 优化滑动时预览的流畅性
  const scheduleRafUpdate = useCallback((name, setter, cssString) => {
    const rafKey = {
      originStyle: "origin",
      translationStyle: "trans",
      windowStyle: "window",
    }[name];
    if (rafIds.current[rafKey]) {
      cancelAnimationFrame(rafIds.current[rafKey]);
    }
    rafIds.current[rafKey] = requestAnimationFrame(() => {
      rafIds.current[rafKey] = 0;
      setter(cssString);
    });
  }, []);

  // 联动更新原文的 CSS 并触发防抖同步
  const updateOriginCss = useCallback(
    (key, value) => {
      originCssRef.current[key] = value;
      const css = objectToCss(originCssRef.current);
      scheduleRafUpdate("originStyle", setLocalOriginStyle, css);
      debouncedUpdate("originStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

  // 联动更新译文的 CSS 并触发防抖同步
  const updateTranslationCss = useCallback(
    (key, value) => {
      transCssRef.current[key] = value;
      const css = objectToCss(transCssRef.current);
      scheduleRafUpdate("translationStyle", setLocalTransStyle, css);
      debouncedUpdate("translationStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

  // 联动更新背景窗格的 CSS 并触发防抖同步
  const updateWindowCss = useCallback(
    (key, value) => {
      windowCssRef.current[key] = value;
      const css = objectToCss(windowCssRef.current);
      scheduleRafUpdate("windowStyle", setLocalWindowStyle, css);
      debouncedUpdate("windowStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

  // 直接全量更新背景窗格 CSS 并防抖
  const updateWindowCssDirect = useCallback(
    (css) => {
      windowCssRef.current = parseCssToObject(css);
      scheduleRafUpdate("windowStyle", setLocalWindowStyle, css);
      debouncedUpdate("windowStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

  useEffect(() => {
    originCssRef.current = parseCssToObject(localOriginStyle);
  }, [localOriginStyle]);
  useEffect(() => {
    transCssRef.current = parseCssToObject(localTransStyle);
  }, [localTransStyle]);
  useEffect(() => {
    windowCssRef.current = parseCssToObject(localWindowStyle);
  }, [localWindowStyle]);

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
  const windowBgRgba = parseRgba(
    windowCssObj["background-color"] || "rgba(0, 0, 0, 0.5)"
  ) || { r: 0, g: 0, b: 0, a: 0.5 };
  const windowBgHex = rgbToHex(windowBgRgba.r, windowBgRgba.g, windowBgRgba.b);
  const windowLineHeight = parseFloat(windowCssObj["line-height"]) || 1.3;
  const windowHasTextShadow = !!windowCssObj["text-shadow"];

  // 缓存可复用的单个文本（如原文或译文）的 CSS 字体、大小及颜色滑动条控制器结构
  const textStyleControls = useCallback(
    (label, fontSize, cssObj, updateCss) => (
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
              size="small"
              value={fontSize.preferred}
              min={0.5}
              max={5}
              step={0.1}
              onChange={(e, val) => {
                const p = fontSize.preferred || 1;
                const minRatio = fontSize.min / p;
                const maxRatio = fontSize.max / p;
                updateCss(
                  "font-size",
                  `clamp(${(val * minRatio).toFixed(2)}${fontSize.unit}, ${val}cqw, ${(val * maxRatio).toFixed(2)}${fontSize.unit})`
                );
              }}
              sx={{ flex: 1 }}
            />
            <Typography
              variant="body2"
              sx={{ minWidth: 28, textAlign: "right" }}
            >
              {fontSize.preferred}
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
              value={colorToHex(cssObj["color"])}
              onChange={(e) => updateCss("color", e.target.value)}
              sx={{
                width: 28,
                height: 28,
                border: "none",
                cursor: "pointer",
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
    ),
    [i18n]
  );

  return (
    <Box>
      <Stack spacing={3}>
        {/* 顶部字幕翻译相关交互功能友情说明 */}
        <Alert severity="info">
          {i18n("subtitle_helper_1")}
          <br />
          {i18n("subtitle_helper_2")}
          <br />
          {i18n("subtitle_helper_3")}
        </Alert>

        {/* 开关：是否在支持的视频网站上加载双语字幕翻译逻辑 */}
        <FormControlLabel
          control={
            <Switch
              size="small"
              name="enabled"
              checked={enabled}
              onChange={() => {
                updateSubtitle({ enabled: !enabled });
              }}
            />
          }
          label={i18n("toggle_subtitle_translate")}
          sx={{ width: "fit-content" }}
        />

        {/* 字幕分句分词策略、翻译引擎、超前预翻译等参数配置网格区域 */}
        <Box>
          <Grid container spacing={2} columns={12}>
            {/* 字幕翻译首选的翻译引擎服务商 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="apiSlug"
                value={apiSlug}
                label={i18n("translate_service")}
                onChange={handleChange}
              >
                {enabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 字幕长句断句首选的大语言 AI 引擎服务商 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="segSlug"
                value={segSlug}
                label={i18n("ai_segmentation")}
                onChange={handleChange}
                helperText={
                  forceSubtitleRetranslate &&
                  segSlug !== "-" &&
                  segSlug !== apiSlug
                    ? i18n("seg_trans_diff_warning") ||
                      "断句和翻译服务不同，翻译引擎会重复翻译字幕"
                    : ""
                }
                FormHelperTextProps={{
                  sx: { color: "error.main" },
                }}
              >
                <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                {aiEnabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
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
            {/* 系统内置的轻量断句算法类型 (基于固定句尾符号断句，或统计学概率断句) */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="useAlgorithmBreaker"
                value={useAlgorithmBreaker}
                label={i18n("builtin_sentence_break")}
                onChange={handleChange}
              >
                <MenuItem value={"rule"}>
                  {i18n("rule_sentence_break")}
                </MenuItem>
                <MenuItem value={"statistical"}>
                  {i18n("statistical_sentence_break")}
                </MenuItem>
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

            {/* 是否保留双语字幕 (若禁用则在视频窗口上仅显示翻译后的目标语字幕) */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
                select
                size="small"
                name="isBilingual"
                value={isBilingual}
                label={i18n("is_bilingual_view")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 双语字幕在视频画面中的显示顺序 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
                select
                size="small"
                name="displayOrder"
                value={displayOrder}
                label={i18n("trans_order")}
                onChange={handleChange}
              >
                <MenuItem value={"original-first"}>
                  {i18n("original_first")}
                </MenuItem>
                <MenuItem value={"translation-first"}>
                  {i18n("translation_first")}
                </MenuItem>
              </TextField>
            </Grid>
            {/* 是否开启磨砂模糊译文字幕显示效果 (鼠标划过时才高亮看清译文，用于英语听力训练备考) */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
                select
                size="small"
                name="blurTranslation"
                value={blurTranslation}
                label={i18n("is_blur_translation")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 视频插播商业广告时是否自动识别并跳过翻译网络请求 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
                select
                size="small"
                name="skipAd"
                value={skipAd}
                label={i18n("is_skip_ad")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 鼠标悬停在视频窗口字幕单字词上时是否允许悬浮框划词查词解释 */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
                select
                size="small"
                name="hoverLookupMode"
                value={hoverLookupModeValue}
                label={i18n("subtitle_hover_lookup")}
                onChange={handleChange}
              >
                <MenuItem value={OPT_ENHANCE_ON}>{i18n("enable")}</MenuItem>
                <MenuItem value={OPT_ENHANCE_OFF}>{i18n("disable")}</MenuItem>
                <MenuItem value={OPT_ENHANCE_MOBILE_OFF}>
                  {i18n("disable_on_mobile")}
                </MenuItem>
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
                      value={windowBgHex}
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
                        cursor: "pointer",
                        p: 0,
                        bgcolor: "transparent",
                      }}
                    />
                    <Typography variant="body2" sx={{ minWidth: 48 }}>
                      {i18n("opacity") || "透明度"}
                    </Typography>
                    <Slider
                      size="small"
                      value={windowBgRgba.a}
                      min={0}
                      max={1}
                      step={0.05}
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
                      size="small"
                      value={windowLineHeight}
                      min={1}
                      max={2.5}
                      step={0.1}
                      onChange={(e, val) =>
                        updateWindowCss("line-height", String(val))
                      }
                      sx={{ flex: 1 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ minWidth: 28, textAlign: "right" }}
                    >
                      {windowLineHeight}
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
                      size="small"
                      value={windowPadding.vertical}
                      min={0}
                      max={2}
                      step={0.1}
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
                      size="small"
                      value={windowPadding.horizontal}
                      min={0}
                      max={3}
                      step={0.1}
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
                            updateWindowCss("text-shadow", "1px 1px 2px black");
                          } else {
                            const newObj = { ...windowCssRef.current };
                            delete newObj["text-shadow"];
                            updateWindowCssDirect(objectToCss(newObj));
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
      </Stack>
    </Box>
  );
}
