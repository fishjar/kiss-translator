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
import { useI18n } from "../../hooks/I18n";
import { OPT_LANGS_TO } from "../../config";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import { useSubtitle } from "../../hooks/Subtitle";
import { useApiList } from "../../hooks/Api";
import ValidationInput from "../../hooks/ValidationInput";
import { useState, useEffect, useCallback } from "react";

// CSS 解析工具函数
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

// 解析 rgba 颜色
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

// RGB 转 Hex
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

// Hex 转 RGB
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

// 解析 font-size，支持 clamp 格式
const parseFontSize = (fontSizeStr) => {
  if (!fontSizeStr) return { min: 1, preferred: 2, max: 3, unit: "rem" };

  // 匹配 clamp(1rem, 2cqw, 3rem) 格式
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

  // 匹配普通格式如 16px, 1.5rem
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

// 解析 padding
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

// 可视化样式编辑器组件
function StyleVisualEditor({ label, cssValue, onChange, type }) {
  const i18n = useI18n();
  const [cssObj, setCssObj] = useState({});

  useEffect(() => {
    setCssObj(parseCssToObject(cssValue));
  }, [cssValue]);

  const updateCss = useCallback(
    (key, value) => {
      setCssObj((prevCssObj) => {
        const newObj = { ...prevCssObj, [key]: value };
        onChange(objectToCss(newObj));
        return newObj;
      });
    },
    [onChange]
  );

  // 原文/译文样式 - 主要是 font-size
  if (type === "text") {
    const fontSizeStr = cssObj["font-size"] || "";
    const fontSize = parseFontSize(fontSizeStr);

    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {label} - {i18n("visual_editor") || "可视化编辑"}
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              {i18n("font_size") || "字体大小"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Slider
                size="small"
                value={fontSize.preferred}
                min={0.5}
                max={5}
                step={0.1}
                onChange={(e, val) => {
                  updateCss(
                    "font-size",
                    `clamp(${fontSize.min}${fontSize.unit}, ${val}cqw, ${fontSize.max}${fontSize.unit})`
                  );
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                value={fontSize.preferred}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 2;
                  updateCss(
                    "font-size",
                    `clamp(${fontSize.min}${fontSize.unit}, ${val}cqw, ${fontSize.max}${fontSize.unit})`
                  );
                }}
                inputProps={{ min: 0.5, max: 5, step: 0.1 }}
                sx={{ width: 80 }}
              />
            </Box>
          </Grid>
          {/* 字体颜色 */}
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              {i18n("font_color") || "字体颜色"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <input
                type="color"
                value={cssObj["color"] === "white" ? "#ffffff" : (cssObj["color"] || "#ffffff")}
                onChange={(e) => updateCss("color", e.target.value)}
                style={{ width: 40, height: 30, border: "none", cursor: "pointer" }}
              />
              <TextField
                size="small"
                value={cssObj["color"] || ""}
                onChange={(e) => updateCss("color", e.target.value)}
                placeholder="white / #ffffff"
                sx={{ flex: 1 }}
              />
            </Box>
          </Grid>
        </Grid>
      </Box>
    );
  }

  // 背景样式 - padding, background-color, color, line-height, text-shadow
  if (type === "window") {
    const paddingStr = cssObj["padding"] || "0.5em 1em";
    const padding = parsePadding(paddingStr);

    const bgColorStr = cssObj["background-color"] || "rgba(0, 0, 0, 0.5)";
    const bgRgba = parseRgba(bgColorStr) || { r: 0, g: 0, b: 0, a: 0.5 };
    const bgHex = rgbToHex(bgRgba.r, bgRgba.g, bgRgba.b);

    const lineHeight = parseFloat(cssObj["line-height"]) || 1.3;
    const hasTextShadow = !!cssObj["text-shadow"];

    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {label} - {i18n("visual_editor") || "可视化编辑"}
        </Typography>
        <Grid container spacing={2} alignItems="center">
          {/* 背景颜色 */}
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              {i18n("background_color") || "背景颜色"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <input
                type="color"
                value={bgHex}
                onChange={(e) => {
                  const rgb = hexToRgb(e.target.value);
                  updateCss(
                    "background-color",
                    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${bgRgba.a})`
                  );
                }}
                style={{ width: 40, height: 30, border: "none", cursor: "pointer" }}
              />
              <Typography variant="body2" sx={{ minWidth: 60 }}>
                {i18n("opacity") || "透明度"}
              </Typography>
              <Slider
                size="small"
                value={bgRgba.a}
                min={0}
                max={1}
                step={0.05}
                onChange={(e, val) => {
                  updateCss(
                    "background-color",
                    `rgba(${bgRgba.r}, ${bgRgba.g}, ${bgRgba.b}, ${val})`
                  );
                }}
                sx={{ flex: 1 }}
              />
              <Typography variant="body2" sx={{ minWidth: 40 }}>
                {Math.round(bgRgba.a * 100)}%
              </Typography>
            </Box>
          </Grid>

          {/* 内边距 */}
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              {i18n("padding") || "内边距"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="body2">{i18n("vertical") || "上下"}</Typography>
              <Slider
                size="small"
                value={padding.vertical}
                min={0}
                max={2}
                step={0.1}
                onChange={(e, val) => {
                  updateCss(
                    "padding",
                    `${val}${padding.unit} ${padding.horizontal}${padding.unit}`
                  );
                }}
                sx={{ width: 100 }}
              />
              <Typography variant="body2">{i18n("horizontal") || "左右"}</Typography>
              <Slider
                size="small"
                value={padding.horizontal}
                min={0}
                max={3}
                step={0.1}
                onChange={(e, val) => {
                  updateCss(
                    "padding",
                    `${padding.vertical}${padding.unit} ${val}${padding.unit}`
                  );
                }}
                sx={{ width: 100 }}
              />
            </Box>
          </Grid>

          {/* 行高 */}
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              {i18n("line_height") || "行高"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Slider
                size="small"
                value={lineHeight}
                min={1}
                max={2.5}
                step={0.1}
                onChange={(e, val) => updateCss("line-height", String(val))}
                sx={{ flex: 1 }}
              />
              <Typography variant="body2" sx={{ minWidth: 30 }}>
                {lineHeight}
              </Typography>
            </Box>
          </Grid>

          {/* 文字阴影 */}
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              {i18n("text_shadow") || "文字阴影"}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={8}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={hasTextShadow}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateCss("text-shadow", "1px 1px 2px black");
                    } else {
                      const newObj = { ...cssObj };
                      delete newObj["text-shadow"];
                      setCssObj(newObj);
                      onChange(objectToCss(newObj));
                    }
                  }}
                />
              }
              label={hasTextShadow ? (i18n("enabled") || "已启用") : (i18n("disabled") || "已禁用")}
            />
          </Grid>
        </Grid>
      </Box>
    );
  }

  return null;
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
  };

  const handleStyleChange = (name) => (value) => {
    updateSubtitle({ [name]: value });
  };

  const {
    enabled,
    apiSlug,
    segSlug,
    chunkLength,
    preTrans = 90,
    throttleTrans = 30,
    toLang,
    isBilingual,
    isEnhance = true,
    skipAd = false,
    windowStyle,
    originStyle,
    translationStyle,
  } = subtitleSetting;

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
                name="isEnhance"
                value={isEnhance}
                label={i18n("is_enable_enhance")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* 原文样式 - 可视化编辑器 */}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
          <StyleVisualEditor
            label={i18n("origin_styles")}
            cssValue={originStyle}
            onChange={handleStyleChange("originStyle")}
            type="text"
          />
          <Accordion sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color="text.secondary">
                {i18n("advanced_css") || "高级 CSS 编辑"}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                size="small"
                name="originStyle"
                value={originStyle}
                onChange={handleChange}
                maxRows={10}
                multiline
                fullWidth
              />
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* 译文样式 - 可视化编辑器 */}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
          <StyleVisualEditor
            label={i18n("translation_styles")}
            cssValue={translationStyle}
            onChange={handleStyleChange("translationStyle")}
            type="text"
          />
          <Accordion sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color="text.secondary">
                {i18n("advanced_css") || "高级 CSS 编辑"}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                size="small"
                name="translationStyle"
                value={translationStyle}
                onChange={handleChange}
                maxRows={10}
                multiline
                fullWidth
              />
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* 背景样式 - 可视化编辑器 */}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
          <StyleVisualEditor
            label={i18n("background_styles")}
            cssValue={windowStyle}
            onChange={handleStyleChange("windowStyle")}
            type="window"
          />
          <Accordion sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color="text.secondary">
                {i18n("advanced_css") || "高级 CSS 编辑"}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                size="small"
                name="windowStyle"
                value={windowStyle}
                onChange={handleChange}
                maxRows={10}
                multiline
                fullWidth
              />
            </AccordionDetails>
          </Accordion>
        </Box>
      </Stack>
    </Box>
  );
}
