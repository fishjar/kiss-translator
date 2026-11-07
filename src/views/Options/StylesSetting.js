import { useEffect, useMemo, useRef, useState } from "react";
import { useRevealSearchTarget } from "./SettingsSearchTarget";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CodeField from "./CodeField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import { AddIcon, ExpandMoreIcon, TuneIcon } from "../../components/icons";
import { useConfirm } from "../../hooks/Confirm";
import Box from "@mui/material/Box";
import {
  getCompactStylePreviewCode,
  toPersistedCustomStyle,
  useAllTextStyles,
  useStyleList,
} from "../../hooks/CustomStyles";
import { css } from "@emotion/css";
import { getRandomQuote } from "../../config/quotes";
import { useSetting } from "../../hooks/Setting";
import Slider from "@mui/material/Slider";
import { useSystemDarkPreference } from "../../hooks/SystemColorScheme";
import {
  calculateAdaptiveIconColor,
  hslToHex,
  ICON_COLOR_PRESETS,
  resolveIconHue,
  resolveIconStyle,
} from "../../styles/m3";
import { GripGlyph } from "../../components/TextareaResizeGrip";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import { useTextareaGripStyle } from "../../hooks/useTextareaHeightLock";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSelect,
} from "./SettingsCard";

/**
 * 单个自定义 CSS 样式编辑表单区域
 *
 * @param {Object} props
 * @param {Object} props.customStyle - 样式对象配置
 * @param {Function} props.deleteStyle - 删除样式回调
 * @param {Function} props.updateStyle - 保存/更新样式回调
 * @param {boolean} props.isBuiltin - 是否是系统内置的只读样式 (内置样式不允许修改和删除)
 */
function StyleFields({ customStyle, deleteStyle, updateStyle, isBuiltin }) {
  const i18n = useI18n();
  const {
    setting: { uiLang },
  } = useSetting();
  const [formData, setFormData] = useState(() => customStyle || {});
  const lastSyncedStyleRef = useRef(JSON.stringify(customStyle || {}));
  const confirm = useConfirm();

  // useAllTextStyles rebuilds style objects whenever customStyles changes.
  // Equivalent objects must not reset the active form.
  // Preserve unsaved edits when another style is added or changed.
  // Reset the draft only when the persisted style content changes.
  useEffect(() => {
    const nextSnapshot = JSON.stringify(customStyle || {});
    if (lastSyncedStyleRef.current === nextSnapshot) {
      return;
    }
    lastSyncedStyleRef.current = nextSnapshot;
    setFormData(customStyle || {});
  }, [customStyle]);

  const isModified = useMemo(
    () => JSON.stringify(customStyle || {}) !== JSON.stringify(formData),
    [customStyle, formData]
  );

  // 表单字段输入改变处理
  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // 触发样式规则更新
  const handleSave = () => {
    updateStyle(customStyle.styleSlug, toPersistedCustomStyle(formData));
  };

  // 二次确认删除自定义样式
  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      deleteStyle(customStyle.styleSlug);
    }
  };

  const { styleName = "", styleCode = "" } = formData;

  // 使用 @emotion/css 动态把用户手写的 CSS 转换为随机类名挂载到预览框上展示样式效果
  const textClass = useMemo(
    () => css`
      ${styleCode}
    `,
    [styleCode]
  );

  // 动态生成一句预览文字
  const quote = useMemo(() => {
    const q = getRandomQuote();
    if (uiLang === "en") {
      return [q.zh, q.en];
    }
    return [q.en, q[uiLang]];
  }, [uiLang]);

  return (
    <Stack spacing={3}>
      {/* 实时 CSS 渲染预览展示区 */}
      <Box>
        {quote[0]}
        <br />
        <span className={textClass}>{quote[1]}</span>
      </Box>

      {/* 样式名称输入框 */}
      <TextField
        size="small"
        label={i18n("style_name")}
        name="styleName"
        value={styleName}
        onChange={handleChange}
        disabled={isBuiltin}
      />
      {/* CSS 源码编辑器 */}
      <CodeField
        size="small"
        label={i18n("style_code")}
        name="styleCode"
        value={styleCode}
        onChange={handleChange}
        maxRows={10}
        disabled={isBuiltin}
      />

      {/* 非只读的自定义样式，提供保存和删除动作按钮 */}
      {!isBuiltin && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={!isModified}
          >
            {i18n("save")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleDelete}
          >
            {i18n("delete")}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * 样式的折叠手风琴壳组件
 */
export function StyleAccordion({ customStyle, deleteStyle, updateStyle }) {
  const [expanded, setExpanded] = useState(false);
  useRevealSearchTarget(setExpanded, ["style_name", "style_code"]);
  const i18n = useI18n();
  const { isBuiltin } = customStyle;
  const previewCode = getCompactStylePreviewCode(customStyle);
  const previewClass = useMemo(
    () =>
      previewCode
        ? css`
            ${previewCode}
          `
        : undefined,
    [previewCode]
  );

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion
      className="kt-style-card"
      expanded={expanded}
      onChange={handleChange}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box className="kt-style-card__summary">
          <span>{i18n("style_preview_source")}</span>
          <span className={previewClass}>
            {i18n("style_preview_translation")}
          </span>
          <Typography sx={{ overflowWrap: "anywhere" }}>
            {customStyle.styleName}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <StyleFields
            customStyle={customStyle}
            deleteStyle={deleteStyle}
            updateStyle={updateStyle}
            isBuiltin={isBuiltin}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * 下拉选项图标 + 文案的内联排布（参照 Apis.js MenuItem 内联图标先例；
 * SettingsSelect 的 label 天然接受 React 节点，SettingsSelect 自身零改造）。
 * 图标由 GripGlyph 纯展示渲染；hidden 项不渲染手柄，textarea 回退原生 resize。
 *
 * @param {string} variant 手柄样式 key。
 * @param {string} text 选项文案。
 * @returns {JSX.Element}
 */
function gripOptionLabel(variant, text) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      <GripGlyph variant={variant} />
      {text}
    </Box>
  );
}

// hue 落点匹配预设档（±0.5° 内吸附）。8-bit Hex 量化往返（hue→
// hslToHex(·,23.3,64.7)→hexToHsl）存在随色相区间变化的漂移（预设邻域
// 实测 0.03°–0.43°，如 191.0°→#90b2ba→191.43°）；容差取 0.5° 以覆盖
// 量化误差上界，保证提交任意落点后预设高亮不回弹。导出常量与函数供
// 测试锁定。初值与外部 value 同步共用。
export const HUE_PRESET_SNAP_TOLERANCE = 0.5;
export const matchPresetId = (hue) => {
  const matched = ICON_COLOR_PRESETS.find(
    (preset) => Math.abs(preset.hue - hue) <= HUE_PRESET_SNAP_TOLERANCE
  );
  return matched ? matched.id : null;
};

// 色相滑轨上界。hue 环 [0°,360°) 的环缝高危：360°≡0°，且接近 360° 的落点经
// 8-bit Hex 量化后会塌回与 0° 逐位同色，反解即归 0，提交后被 useEffect 复位到
// 左端并误亮红预设。故上界必须使 hslToHex(max,23.3,64.7) 反解后离任一预设
// ≥ matchPresetId 的 0.5° 容差，且落点可稳定停留。取 359°：量化 #ba9091 反解
// ≈358.57°，距最近预设(干玫瑰 337.1°)21.4°，不落任何容差窗、不回弹。
export const ICON_HUE_SLIDER_MAX = 359;

/**
 * 图标主体色莫兰迪连续色相滑轨（区块版）：行头左侧为标题与说明，右侧为
 * 读数胶囊（固定表面底色，不随主题色），下方为全宽 15° 渐变轨道与预设
 * 基准色排。S/L 锁死（存储恒存规范环 Hex），唯一自由维度为色相
 * h ∈ [0°, ICON_HUE_SLIDER_MAX]。上界刻意避开环缝（360°≡0°，且近 360° 落点经
 * 8-bit Hex 量化会塌回与 0° 同色、反解误亮红预设），取值约束见常量处。
 * 单向联动——拖滑轨清除高亮且不吸附，点预设卡滑轨瞬移
 * 吸附、置高亮并立即提交。提交语义对齐 SettingsRange：松手
 * （onChangeCommitted）才写存储。
 */
function IconColorSlider({
  label,
  description,
  presetsTitle,
  value,
  dotColorMode,
  onChange,
}) {
  const i18n = useI18n();
  const [draft, setDraft] = useState(value);
  const [activePresetId, setActivePresetId] = useState(() =>
    matchPresetId(value)
  );

  useEffect(() => {
    setDraft(value);
    // 外部 value 变化（存储回写/重挂载）时同步预设高亮；滑轨交互内的
    // 清除/吸附行为不变——拖动仍显式清高亮，提交不吸附。
    setActivePresetId(matchPresetId(value));
  }, [value]);

  const displayHex = calculateAdaptiveIconColor(draft, dotColorMode);

  const trackStops = useMemo(() => {
    const stops = [];
    for (let h = 0; h <= 360; h += 15) {
      stops.push(
        `${calculateAdaptiveIconColor(h, dotColorMode)} ${((h / 360) * 100).toFixed(1)}%`
      );
    }
    return stops.join(", ");
  }, [dotColorMode]);

  const handleSliderChange = (_event, next) => {
    setDraft(Number(next));
    setActivePresetId(null);
  };

  const handleSliderCommitted = (_event, next) => {
    const hue = Number(next);
    const hex = hslToHex(hue, 23.3, 64.7);
    setDraft(hue);
    // 与外部 useEffect 的 matchPresetId(value) 同语义：提交 Hex 经同色相反解
    // 后若命中预设窗则保留高亮，避免"提交同值预设高亮被清空"的回归。
    setActivePresetId(matchPresetId(resolveIconHue(hex)));
    onChange(hex);
  };

  const handlePresetClick = (preset) => {
    setActivePresetId(preset.id);
    setDraft(preset.hue);
    onChange(preset.darkHex);
  };

  return (
    <Box className="kt-settings-icon-color">
      <Box className="kt-settings-color-header">
        <Box className="kt-settings-row__copy">
          <strong>{label}</strong>
          <span>{description}</span>
        </Box>
        <Box className="kt-settings-color-badge">
          <Box
            aria-hidden="true"
            className="kt-settings-color-badge__swatch"
            sx={{ backgroundColor: displayHex }}
          />
          <Box component="span">{`${displayHex.toUpperCase()} · `}</Box>
          <Box
            component="span"
            sx={{ color: "var(--kt-onv)", fontWeight: 400 }}
          >
            {`${draft.toFixed(1)}°`}
          </Box>
        </Box>
      </Box>
      <Box sx={{ pt: "26px", pb: "32px" }}>
        <Slider
          value={draft}
          min={0}
          max={ICON_HUE_SLIDER_MAX}
          step={0.5}
          aria-label={label}
          onChange={handleSliderChange}
          onChangeCommitted={handleSliderCommitted}
          sx={{
            "& .MuiSlider-track": { visibility: "hidden" },
            "& .MuiSlider-rail": {
              height: 14,
              borderRadius: 7,
              background: `linear-gradient(90deg, ${trackStops})`,
            },
            "& .MuiSlider-thumb": {
              width: 24,
              height: 24,
              backgroundColor: "#fff",
              border: "3.5px solid var(--kt-on)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, .3)",
            },
          }}
        />
      </Box>
      <Box className="kt-settings-presets-title">{presetsTitle}</Box>
      <Box className="kt-settings-icon-presets">
        {ICON_COLOR_PRESETS.map((preset) => {
          // 预设名随界面语言本地化：键含主题模式后缀，双名制对齐
          // m3.js ICON_COLOR_PRESETS 的 darkName/lightName 语义。
          const presetName = i18n(
            `settings_icon_preset_${preset.id}_${dotColorMode}`
          );
          return (
            <button
              key={preset.id}
              type="button"
              className="kt-settings-preset-chip"
              aria-pressed={preset.id === activePresetId}
              onClick={() => handlePresetClick(preset)}
            >
              <span
                aria-hidden="true"
                className="kt-settings-preset-chip__dot"
                style={{
                  // 与读数徽章、主题图标同源：按 hue 经自适应映射取色，
                  // darkHex/lightHex 仅作存储写入口径，非 dark 模式渲染色。
                  backgroundColor: calculateAdaptiveIconColor(
                    preset.hue,
                    dotColorMode
                  ),
                }}
              />
              <span className="kt-settings-preset-chip__name">
                {presetName}
              </span>
            </button>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * 译文展现样式设置主页面组件 (StylesSetting)
 */
export default function StylesSetting() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const [showStyleManager, setShowStyleManager] = useState(false);
  const [hasOpenedStyleManager, setHasOpenedStyleManager] = useState(false);
  useRevealSearchTarget(setShowStyleManager, [
    "settings_style_library",
    "style_name",
    "style_code",
  ]);
  useRevealSearchTarget(setHasOpenedStyleManager, [
    "settings_style_library",
    "style_name",
    "style_code",
  ]);
  // 自定义 CSS 列表 Hook
  const { addStyle, deleteStyle, updateStyle } = useStyleList();
  // 系统内置的只读样式配置列表
  const { builtinStyles, customStyles } = useAllTextStyles();

  // 添加新 CSS 样式
  const handleClick = (e) => {
    e.preventDefault();
    addStyle();
  };

  const setStyleManagerVisibility = (visible) => {
    if (visible) setHasOpenedStyleManager(true);
    setShowStyleManager(visible);
  };

  const darkMode = setting.darkMode || "auto";
  const systemPrefersDark = useSystemDarkPreference();
  const resolvedThemeMode =
    darkMode === "dark" || (darkMode === "auto" && systemPrefersDark)
      ? "dark"
      : "light";
  const iconStyle = resolveIconStyle(setting?.iconStyle);
  // 滑轨 hue 由存储 Hex 反解并受 ICON_HUE_SLIDER_MAX 上界钳制；
  // 存储 Hex 保持无损归一（resolveIconColorHex 不变），仅滑轨显示值受钳制。
  const iconHue = Math.min(
    resolveIconHue(setting?.iconColor),
    ICON_HUE_SLIDER_MAX
  );
  const gripStyle = useTextareaGripStyle();

  return (
    <Box>
      <SettingsSection title={i18n("settings_interface_theme")}>
        <SettingsCard>
          <SettingsRow
            label={i18n("settings_appearance_mode")}
            description={i18n("settings_appearance_mode_desc")}
          >
            <SettingsSegmented
              size="small"
              value={darkMode}
              label={i18n("settings_appearance_mode")}
              onChange={(value) => updateSetting({ darkMode: value })}
              items={[
                { value: "light", label: i18n("settings_theme_light") },
                { value: "dark", label: i18n("settings_theme_dark") },
                { value: "auto", label: i18n("settings_theme_system") },
              ]}
            />
          </SettingsRow>
          <SettingsRow
            className="kt-settings-row--inline"
            label={i18n("settings_icon_style")}
            description={i18n("settings_icon_style_desc")}
          >
            <Box
              className="icon-style-control"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                color: "var(--kt-icon)",
              }}
            >
              <TuneIcon fontSize="small" />
              <SettingsSegmented
                size="small"
                value={iconStyle}
                label={i18n("settings_icon_style")}
                onChange={(value) => updateSetting({ iconStyle: value })}
                items={[
                  {
                    value: "lucide",
                    label: i18n("settings_icon_style_lucide"),
                  },
                  { value: "mui", label: i18n("settings_icon_style_mui") },
                ]}
              />
            </Box>
          </SettingsRow>
          <li className="kt-settings-row kt-settings-row--stacked">
            <IconColorSlider
              label={i18n("settings_icon_color")}
              description={i18n("settings_icon_color_desc")}
              presetsTitle={i18n("settings_icon_color_presets")}
              value={iconHue}
              dotColorMode={resolvedThemeMode}
              onChange={(hex) => updateSetting({ iconColor: hex })}
            />
          </li>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={i18n("settings_textarea_grip_style")}>
        <SettingsCard>
          <SettingsRow
            label={i18n("settings_textarea_grip_style")}
            description={i18n("settings_textarea_grip_style_desc")}
          >
            <SettingsSelect
              value={gripStyle}
              label={i18n("settings_textarea_grip_style")}
              onChange={(value) => updateSetting({ textareaGripStyle: value })}
              options={TEXTAREA_GRIP_STYLE_KEYS.map((key) => ({
                value: key,
                label: gripOptionLabel(
                  key,
                  i18n(`grip_style_${key.replace(/-/g, "_")}`)
                ),
              }))}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={i18n("settings_translation_styles")}>
        <SettingsCard>
          <SettingsRow
            label={i18n("settings_custom_css")}
            description={i18n("settings_custom_css_description")}
          >
            <Button
              size="small"
              variant="contained"
              onClick={() => setStyleManagerVisibility(true)}
            >
              {i18n("edit")}
            </Button>
          </SettingsRow>
          <SettingsRow
            label={i18n("settings_style_library")}
            description={i18n("settings_style_library_description")
              .replace("{0}", String(customStyles.length))
              .replace("{1}", String(builtinStyles.length))}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={() => setStyleManagerVisibility(!showStyleManager)}
            >
              {showStyleManager ? i18n("hide") : i18n("edit")}
            </Button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {hasOpenedStyleManager && (
        <Stack
          className="kt-style-manager"
          spacing={3}
          hidden={!showStyleManager}
          aria-hidden={!showStyleManager}
          sx={{ display: showStyleManager ? "flex" : "none" }}
        >
          <Box>
            <Button
              size="small"
              id="add-style-button"
              variant="contained"
              onClick={handleClick}
              startIcon={<AddIcon />}
            >
              {i18n("add")}
            </Button>
          </Box>

          <section>
            <Typography component="h2" className="kt-options-section-title">
              {i18n("custom_styles")}
            </Typography>
            <Box className="kt-style-grid">
              {customStyles.map((customStyle) => (
                <StyleAccordion
                  key={customStyle.styleSlug}
                  customStyle={customStyle}
                  deleteStyle={deleteStyle}
                  updateStyle={updateStyle}
                />
              ))}
            </Box>
          </section>
          <section>
            <Typography component="h2" className="kt-options-section-title">
              {i18n("builtin_styles")}
            </Typography>
            <Box className="kt-style-grid">
              {builtinStyles.map((customStyle) => (
                <StyleAccordion
                  key={customStyle.styleSlug}
                  customStyle={customStyle}
                  deleteStyle={deleteStyle}
                  updateStyle={updateStyle}
                />
              ))}
            </Box>
          </section>
        </Stack>
      )}
    </Box>
  );
}
