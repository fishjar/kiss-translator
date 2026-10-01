import { useEffect, useMemo, useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CodeField from "./CodeField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
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
import { GripGlyph } from "../../components/TextareaResizeGrip";
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

/**
 * 译文展现样式设置主页面组件 (StylesSetting)
 */
export default function StylesSetting() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const [showStyleManager, setShowStyleManager] = useState(false);
  const [hasOpenedStyleManager, setHasOpenedStyleManager] = useState(false);
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
  const gripStyle = useTextareaGripStyle();

  return (
    <Box>
      <SettingsSection title={i18n("settings_interface_theme")}>
        <SettingsCard>
          <SettingsRow label={i18n("settings_appearance_mode")}>
            <SettingsSegmented
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
              options={[
                {
                  value: "concentric-smooth",
                  label: gripOptionLabel(
                    "concentric-smooth",
                    i18n("grip_style_concentric_smooth")
                  ),
                },
                {
                  value: "concentric-triple",
                  label: gripOptionLabel(
                    "concentric-triple",
                    i18n("grip_style_concentric_triple")
                  ),
                },
                {
                  value: "corner-pill",
                  label: gripOptionLabel(
                    "corner-pill",
                    i18n("grip_style_corner_pill")
                  ),
                },
                {
                  value: "dotted-concentric",
                  label: gripOptionLabel(
                    "dotted-concentric",
                    i18n("grip_style_dotted_concentric")
                  ),
                },
                {
                  value: "dotted-single",
                  label: gripOptionLabel(
                    "dotted-single",
                    i18n("grip_style_dotted_single")
                  ),
                },
                {
                  value: "triple-chevrons",
                  label: gripOptionLabel(
                    "triple-chevrons",
                    i18n("grip_style_triple_chevrons")
                  ),
                },
                {
                  value: "diagonal-arrow",
                  label: gripOptionLabel(
                    "diagonal-arrow",
                    i18n("grip_style_diagonal_arrow")
                  ),
                },
                {
                  value: "dual-pills",
                  label: gripOptionLabel(
                    "dual-pills",
                    i18n("grip_style_dual_pills")
                  ),
                },
                {
                  value: "expanding-beads",
                  label: gripOptionLabel(
                    "expanding-beads",
                    i18n("grip_style_expanding_beads")
                  ),
                },
                {
                  value: "chevrons-star",
                  label: gripOptionLabel(
                    "chevrons-star",
                    i18n("grip_style_chevrons_star")
                  ),
                },
                {
                  value: "symmetric-division",
                  label: gripOptionLabel(
                    "symmetric-division",
                    i18n("grip_style_symmetric_division")
                  ),
                },
                {
                  value: "percent-style",
                  label: gripOptionLabel(
                    "percent-style",
                    i18n("grip_style_percent_style")
                  ),
                },
                {
                  value: "orbit-satellite",
                  label: gripOptionLabel(
                    "orbit-satellite",
                    i18n("grip_style_orbit_satellite")
                  ),
                },
                {
                  value: "hidden",
                  label: gripOptionLabel("hidden", i18n("grip_style_hidden")),
                },
              ]}
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
