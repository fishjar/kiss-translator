import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
  OPT_LANGS_TO,
  OPT_ENHANCE_ON,
  OPT_ENHANCE_OFF,
  OPT_ENHANCE_MOBILE_OFF,
} from "../../config";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import { useSubtitle } from "../../hooks/Subtitle";
import { useApiList } from "../../hooks/Api";
import ValidationInput from "../../hooks/ValidationInput";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { normalizeSubtitleMode } from "../../subtitle/modes";

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

const objectToCss = (obj) => {
  const entries = Object.entries(obj).filter(
    ([, value]) => value !== undefined && value !== ""
  );
  if (entries.length === 0) {
    return "";
  }
  return entries.map(([key, value]) => `${key}: ${value}`).join(";\n") + ";";
};

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

const YOUTUBE_CAPTION_CONTAINER_WIDTH = 640;

function SubtitleStylePreview({ windowStyle, originStyle, translationStyle }) {
  const i18n = useI18n();

  const windowCss = useMemo(() => parseCssToObject(windowStyle), [windowStyle]);
  const originCss = useMemo(() => parseCssToObject(originStyle), [originStyle]);
  const transCss = useMemo(
    () => parseCssToObject(translationStyle),
    [translationStyle]
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
          <div style={{ ...windowCss, textAlign: "center" }}>
            <p style={{ ...originCss, margin: 0 }}>
              This is an example subtitle
            </p>
            <p style={{ ...transCss, margin: 0 }}>这是示例字幕文本</p>
          </div>
        </Box>
      </Box>
    </Box>
  );
}

export default function SubtitleSetting() {
  const i18n = useI18n();
  const { subtitleSetting, updateSubtitle } = useSubtitle();
  const { enabledApis, aiEnabledApis } = useApiList();

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    updateSubtitle({
      [name]: value,
    });
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

  const {
    enabled,
    apiSlug,
    segSlug,
    useAlgorithmBreaker = "rule",
    chunkLength,
    longSentenceThreshold = 120,
    preTrans = 90,
    throttleTrans = 30,
    toLang,
    isBilingual,
    enhanceMode,
    hoverLookupMode,
    showList = OPT_ENHANCE_MOBILE_OFF,
    skipAd = false,
    aiContextSlug = "-",
    windowStyle,
    originStyle,
    translationStyle,
  } = subtitleSetting;
  const hoverLookupModeValue = normalizeSubtitleMode(
    hoverLookupMode,
    enhanceMode || OPT_ENHANCE_MOBILE_OFF
  );
  const showListValue = normalizeSubtitleMode(
    showList,
    enhanceMode || OPT_ENHANCE_MOBILE_OFF
  );

  const [localOriginStyle, setLocalOriginStyle] = useState(originStyle);
  const [localTransStyle, setLocalTransStyle] = useState(translationStyle);
  const [localWindowStyle, setLocalWindowStyle] = useState(windowStyle);

  useEffect(() => {
    setLocalOriginStyle(originStyle);
  }, [originStyle]);
  useEffect(() => {
    setLocalTransStyle(translationStyle);
  }, [translationStyle]);
  useEffect(() => {
    setLocalWindowStyle(windowStyle);
  }, [windowStyle]);

  const debounceTimers = useRef({});
  const rafIds = useRef({ origin: 0, trans: 0, window: 0 });

  const originCssRef = useRef(parseCssToObject(localOriginStyle));
  const transCssRef = useRef(parseCssToObject(localTransStyle));
  const windowCssRef = useRef(parseCssToObject(localWindowStyle));

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

  const updateOriginCss = useCallback(
    (key, value) => {
      originCssRef.current[key] = value;
      const css = objectToCss(originCssRef.current);
      scheduleRafUpdate("originStyle", setLocalOriginStyle, css);
      debouncedUpdate("originStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

  const updateTranslationCss = useCallback(
    (key, value) => {
      transCssRef.current[key] = value;
      const css = objectToCss(transCssRef.current);
      scheduleRafUpdate("translationStyle", setLocalTransStyle, css);
      debouncedUpdate("translationStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

  const updateWindowCss = useCallback(
    (key, value) => {
      windowCssRef.current[key] = value;
      const css = objectToCss(windowCssRef.current);
      scheduleRafUpdate("windowStyle", setLocalWindowStyle, css);
      debouncedUpdate("windowStyle", css);
    },
    [debouncedUpdate, scheduleRafUpdate]
  );

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

  const textStyleControls = useCallback(
    (label, fontSize, cssObj, updateCss) => (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {label}
        </Typography>
        <Stack spacing={1.5}>
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
        <Alert severity="info">
          {i18n("subtitle_helper_1")}
          <br />
          {i18n("subtitle_helper_2")}
          <br />
          {i18n("subtitle_helper_3")}
        </Alert>

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

        <Box>
          <Grid container spacing={2} columns={12}>
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
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="segSlug"
                value={segSlug}
                label={i18n("ai_segmentation")}
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
          </Grid>
        </Box>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 2,
          }}
        >
          <Stack spacing={2}>
            <SubtitleStylePreview
              windowStyle={localWindowStyle}
              originStyle={localOriginStyle}
              translationStyle={localTransStyle}
            />

            <Divider />

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

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {i18n("background_styles")}
              </Typography>
              <Grid container spacing={1.5} alignItems="center">
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
                    <TextField
                      size="small"
                      label={i18n("origin_styles")}
                      name="originStyle"
                      value={originStyle}
                      onChange={handleChange}
                      maxRows={10}
                      multiline
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      size="small"
                      label={i18n("translation_styles")}
                      name="translationStyle"
                      value={translationStyle}
                      onChange={handleChange}
                      maxRows={10}
                      multiline
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      size="small"
                      label={i18n("background_styles")}
                      name="windowStyle"
                      value={windowStyle}
                      onChange={handleChange}
                      maxRows={10}
                      multiline
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
