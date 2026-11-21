import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevealSearchTarget } from "./SettingsSearchTarget";
import { useTheme } from "@mui/material/styles";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import {
  AddIcon,
  CloseIcon,
  ExpandMoreIcon,
  TuneIcon,
} from "../../components/icons";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { useConfirm } from "../../hooks/Confirm";
import Box from "@mui/material/Box";
import CodeField from "./CodeField";
import TextareaResizeGrip from "../../components/TextareaResizeGrip";
import useTextareaHeightLock, {
  useReleaseOnGripHidden,
} from "../../hooks/useTextareaHeightLock";
import { ClassNames } from "@emotion/react";
import { OPT_STYLE_NONE } from "../../config/styles";
import { PREVIEW_ANIMATION_STYLES } from "../../libs/previewKeyframes";
import {
  toPersistedCustomStyle,
  useAllTextStyles,
  useStyleList,
} from "../../hooks/CustomStyles";
import { useSetting } from "../../hooks/Setting";
import { scriptFocus } from "../../hooks/focusModality";
import Slider from "@mui/material/Slider";
import { useSystemDarkPreference } from "../../hooks/SystemColorScheme";
import {
  calculateAdaptiveIconColor,
  hslToHex,
  ICON_COLOR_PRESETS,
  ICON_RING_L,
  ICON_RING_S,
  resolveIconHue,
  resolveM3ThemeMode,
} from "../../styles/m3";
import { resolveIconStyle } from "../../styles/iconStyleStore";
import { GripGlyph } from "../../components/TextareaResizeGrip";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import { useTextareaGripStyle } from "../../hooks/useTextareaHeightLock";
import {
  compileCss,
  sanitizeScopeSlug,
  trimCssWs,
} from "../../libs/compileCss";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSelect,
} from "./SettingsCard";

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

// 色相滑轨样式（导出供测试锁定）：forced-colors 域丢弃 background 渐变且
// track 永久隐藏，MUI 默认 rail 的 currentColor 兜底被渐变覆盖而失效——
// 该域改用系统色 CanvasText 保持轨道可见（中性轨道语义；Highlight 属
// 选中语义不用）。
export function buildHueSliderSx(trackStops) {
  return {
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
    // 同选择器兜底须后置于基础规则：同特异性靠源码顺序胜出。opacity 须
    // 显式归一——MUI rail 基础样式自带 opacity: 0.38（@mui/material/Slider
    // Slider.js:144），forced-colors 域不接管 opacity，38% alpha 下
    // CanvasText 对比跌破 WCAG 1.4.11 非文本 3:1。
    "@media (forced-colors: active)": {
      "& .MuiSlider-rail": { background: "CanvasText", opacity: 1 },
    },
  };
}

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
  // 会话终止兜底的强卸载代际：TouchEvent/Touch 构造器缺失或合成派发抛错
  // 的旧引擎上无法合成会话终止 touchend，递增 key 强制 Slider 重挂——
  // 卸载 effect 摘除 ownerDocument 上的拖动会话监听，新实例 touchId
  // 归零，残留会话终止。重挂发生在 touchcancel 之后（系统已终结手势），
  // 无打断进行中手势的语义问题。
  const [sliderEpoch, setSliderEpoch] = useState(0);

  const draggingRef = useRef(false);
  // touchcancel 派发合成 touchend 与受控提交的互斥标记：置真窗口覆盖
  // 同步派发全程，finally 复位（见 handleSliderCommitted/handleSliderCancel）。
  const cancelingRef = useRef(false);

  useEffect(() => {
    // 拖动进行中外部 value 变化（存储回写等）不同步：此刻回灌会把滑轨
    // 从拖动位置打回，造成跳动；onChangeCommitted 在指针释放与键盘变更
    // 两条链路必然触发，拖动标记保证复位，拖动结束后外部同步照常生效。
    if (draggingRef.current) return;
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
    draggingRef.current = true;
    setDraft(Number(next));
    setActivePresetId(null);
  };

  const handleSliderCommitted = (_event, next) => {
    // touchcancel 派发的合成 touchend 会走 useSlider 的正常释放分支并触发
    // onChangeCommitted：见取消标记直接 return，不把中断时的拖动位置当
    // 提交写回存储。标记由 handleSliderCancel 的 finally 统一复位。
    if (cancelingRef.current) return;
    draggingRef.current = false;
    const hue = Number(next);
    const hex = hslToHex(hue, ICON_RING_S, ICON_RING_L);
    setDraft(hue);
    // 与外部 useEffect 的 matchPresetId(value) 同语义：提交 Hex 经同色相反解
    // 后若命中预设窗则保留高亮，避免"提交同值预设高亮被清空"的回归。
    setActivePresetId(matchPresetId(resolveIconHue(hex)));
    onChange(hex);
  };

  const handleSliderCancel = (event) => {
    // touchcancel（来电/手势劫持等系统中断）不经 onChangeCommitted：不处理
    // 会有两重残留——组件侧拖动标记钉死拦截外部回灌；useSlider 侧挂在
    // ownerDocument 上的 touchmove/touchend 监听与 touchId 不摘，后续其他
    // 区域手势复用同一 identifier 时继续驱动 onChange 并在 touchend 提交。
    // 终止内部会话：以每个被中断触点的 identifier 与末次坐标合成 touchend
    // 派发到挂载域文档，让 useSlider 走正常释放分支；该释放会附带触发
    // onChangeCommitted，由 cancelingRef 拦截（取消不提交草稿）。派发后
    // 的 setDraft 双写无害。useSlider 的 touchId 持末次触点，多点同时取消
    // 时只派 changedTouches[0] 不命中 touchId，必须逐触点派发。
    draggingRef.current = false;
    setDraft(value);
    setActivePresetId(matchPresetId(value));
    const cancelledTouches = event?.changedTouches
      ? Array.from(event.changedTouches)
      : [];
    if (
      typeof TouchEvent !== "function" ||
      typeof Touch !== "function" ||
      cancelledTouches.length === 0
    ) {
      // 构造器不可用的旧引擎（无会话终止派发通道）：递增 key 重挂 Slider，
      // 卸载 effect 摘文档级会话监听、新实例 touchId 归零，兜底终止残留
      // 会话。草稿复位已由上方双写完成。
      setSliderEpoch((epoch) => epoch + 1);
      return;
    }
    cancelingRef.current = true;
    try {
      const doc = event.currentTarget.ownerDocument || document;
      // 构造器存在但不可构造的旧引擎上 new 会抛错：转入重挂兜底，
      // 不吞 cancelingRef 复位。
      for (const touch of cancelledTouches) {
        doc.dispatchEvent(
          new TouchEvent("touchend", {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [
              new Touch({
                identifier: touch.identifier,
                target: event.currentTarget,
                clientX: touch.clientX,
                clientY: touch.clientY,
              }),
            ],
          })
        );
      }
    } catch {
      // 构造失败仅放弃会话终止派发，转重挂兜底。
      setSliderEpoch((epoch) => epoch + 1);
    } finally {
      cancelingRef.current = false;
    }
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
          key={sliderEpoch}
          value={draft}
          min={0}
          max={ICON_HUE_SLIDER_MAX}
          step={0.5}
          aria-label={label}
          onChange={handleSliderChange}
          onChangeCommitted={handleSliderCommitted}
          onTouchCancel={handleSliderCancel}
          sx={buildHueSliderSx(trackStops)}
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
 * 样式化「译文」演示 span：previewCode 非空（内置模板）时编译预览代码
 * 并注入动画样式；空 previewCode（空白样式/自定义）→ 无样式纯文本。
 */
function StyleDemoSpan({ styleSlug, previewCode, children }) {
  return (
    <ClassNames>
      {({ css }) => (
        <span
          className={
            previewCode
              ? css(previewCode, PREVIEW_ANIMATION_STYLES[styleSlug])
              : undefined
          }
        >
          {children}
        </span>
      )}
    </ClassNames>
  );
}

// 安全 CSS 编译解析器已上收至 libs/compileCss.js：卡片演示与本页 Rules
// 下拉的 custom 项预览共用同一作用域编译与校验口径。

/**
 * 自绘样式卡片：header 恒定 46px（名字区 + 「译文」演示 + 箭头钮）+
 * body（代码框 + 底部按钮行）。展开/收起仅由箭头钮触发（onToggle），互斥
 * 单开由主组件 activeEditSlug 裁决（isActive）；「译文」演示为唯一实时样式
 * 载体（compileCss 按卡片作用域实时编译草稿）。
 *
 * @param {Object} props.customStyle - 样式对象配置（useAllTextStyles 归一化形态）
 * @param {Object} props.draft - 主组件提升的草稿（drafts[styleSlug]，未编辑时缺省）
 * @param {boolean} props.isActive - 本卡是否为当前展开卡
 * @param {Function} props.onToggle - 箭头钮切换回调
 * @param {Function} props.onDelete - 删除回调（主组件侧接 deleteStyle 并复位激活态）
 * @param {Function} props.onUpdate - 保存回调（主组件侧接 updateStyle）
 */
function StyleCard({
  customStyle,
  draft,
  isActive,
  onToggle,
  onDelete,
  onUpdate,
  onDraftChange,
}) {
  const i18n = useI18n();
  const confirm = useConfirm();
  const scopeClass = `kt-scope-${sanitizeScopeSlug(customStyle.styleSlug)}`;
  // 通用拉伸手柄接线（与 Prompts/TranForm 等五个接入视图同一体系）：
  // 会话高度锁按卡片 slug 隔离，hidden 样式切换时自动释放。
  const gripStyle = useTextareaGripStyle();
  const codeHeightLock = useTextareaHeightLock(
    `options-style-code:${customStyle.styleSlug}`
  );
  useReleaseOnGripHidden(gripStyle, codeHeightLock.releaseHeight);
  // 草稿状态提升至主组件（drafts[styleSlug]）：本组件改为受控渲染，
  // 持久化变更重置草稿的快照对比同步由主组件统一承接（同步 effect）。
  // useMemo 定引用：cardDraft 进 isModified 的依赖数组，裸逻辑表达式
  // 会每渲染换引用触发 exhaustive-deps 警告（CI 构建视为错误）。
  const cardDraft = useMemo(
    () => draft || customStyle || {},
    [draft, customStyle]
  );

  const isModified = useMemo(
    () => JSON.stringify(customStyle || {}) !== JSON.stringify(cardDraft),
    [customStyle, cardDraft]
  );
  // 内容（styleCode）是否被编辑：保存闸收窄判据——仅改名不拦、预览作用
  // 域策略拒绝（unsupported，译文侧按原文注入原生嵌套类壳、语义安全）
  // 不拦，真语法错误的内容变更仍拦
  const styleCodeChanged = cardDraft.styleCode !== customStyle.styleCode;

  const { styleName = "", styleCode = "" } = cardDraft;
  // 编辑器安全显示值：导入的 styleCode 可为非字符串（123/null）——编辑框
  // 与 trim 判断只用字符串值，避免 styleCode.trim() 抛 TypeError；编译
  // 仍按原值（compileCss 对非字符串判 invalid），无效导入值在用户修正前
  // 保持 invalid 形态。
  const editableStyleCode = typeof styleCode === "string" ? styleCode : "";
  const compiled = useMemo(
    () => compileCss(scopeClass, styleCode),
    [scopeClass, styleCode]
  );

  // 表单字段输入改变处理：上抛主组件 drafts[styleSlug]
  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    onDraftChange((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // 触发样式规则更新
  const handleSave = () => {
    onUpdate(customStyle.styleSlug, toPersistedCustomStyle(cardDraft));
  };

  // 二次确认删除自定义样式
  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      onDelete(customStyle.styleSlug);
    }
  };

  return (
    <Box
      className={`kt-style-card ${scopeClass} ${isActive ? "is-expanded" : ""}`}
    >
      <Box className="kt-style-card__header">
        {isActive ? (
          /* 名称类字段沿用项目既定家族（同 Apis apiName / Prompts
              prompt_name）：TextField size="small" + filled 形态（显式
              声明——无主题的测试环境缺省 outlined、应用主题 filled，显式
              才双侧一致）+ label 上浮；手柄体系仅接多行代码框，名称框
              天然无手柄 */
          <TextField
            className="kt-style-card__name-input"
            variant="filled"
            size="small"
            label={i18n("style_name")}
            value={styleName}
            name="styleName"
            onChange={handleChange}
            sx={{ width: 160 }}
          />
        ) : (
          <Typography className="kt-style-card__name-text">
            {customStyle.styleName}
          </Typography>
        )}
        {/* 「译文」演示：唯一实时样式载体；contain:paint 沙箱容器由
            .kt-style-card__demo 在 styles.js 中声明（position:fixed 类
            危险声明被裁剪在演示框内） */}
        <Box
          className={`kt-style-card__demo ${
            compiled.valid ? "" : "is-invalid"
          }`}
          title={
            compiled.valid
              ? compiled.css
                ? i18n("style_active")
                : undefined
              : i18n(
                  compiled.reason === "unsupported"
                    ? "css_unsupported"
                    : "css_invalid"
                )
          }
        >
          <style>{compiled.css}</style>
          <span className="kt-style-demo">{i18n("translated_text")}</span>
        </Box>
        {/* 展开/收起：仅此钮触发；点击名字区、演示区及其他区域均不触发展开
            （反向断言锁定，回归防护）；180° 旋转与 aria-expanded 同步
            （is-expanded 类） */}
        <button
          type="button"
          className="kt-style-card__toggle"
          aria-expanded={isActive}
          aria-controls={
            isActive ? `kt-style-body-${customStyle.styleSlug}` : undefined
          }
          aria-label={`${i18n(
            isActive ? "style_card_collapse" : "style_card_expand"
          )}: ${customStyle.styleName}`}
          onClick={onToggle}
        >
          <ExpandMoreIcon />
          <span className="m3-state-layer" />
        </button>
      </Box>
      {isActive && (
        <Box
          className="kt-style-card__body"
          id={`kt-style-body-${customStyle.styleSlug}`}
        >
          {/* 代码框：CodeField（multiline）+ 通用拉伸手柄（endAdornment），
              hidden 样式时手柄早退、textarea 回退原生 resize:vertical */}
          <CodeField
            className="kt-style-card__code-field"
            size="small"
            name="styleCode"
            value={editableStyleCode}
            onChange={handleChange}
            inputRef={codeHeightLock.textareaRef}
            minRows={1}
            maxRows={12}
            // 失败原因就近可达：仅靠预览 title 与禁用保存钮时，键盘/读屏
            // 用户拿不到无效反馈——错误文本渲染在编辑器旁并经 MUI 的
            // aria-describedby/aria-invalid 关联输入框
            error={!compiled.valid && compiled.reason !== "unsupported"}
            helperText={
              compiled.valid
                ? undefined
                : i18n(
                    compiled.reason === "unsupported"
                      ? "css_unsupported"
                      : "css_invalid"
                  )
            }
            InputProps={{
              ...codeHeightLock.rootProps,
              endAdornment:
                trimCssWs(editableStyleCode) ||
                codeHeightLock.lockedHeight != null ? (
                  <TextareaResizeGrip
                    target={codeHeightLock.textareaRef}
                    onResize={codeHeightLock.applyHeight}
                    value={codeHeightLock.lockedHeight}
                    label={i18n("field_resize_height")}
                    variant={gripStyle}
                    onRelease={codeHeightLock.releaseHeight}
                    unlockHint={i18n("field_resize_unlock_hint")}
                  />
                ) : null,
            }}
            inputProps={{
              className: "kt-resizable-textarea",
              style: {
                resize: gripStyle === "hidden" ? "vertical" : "none",
              },
            }}
            sx={{ "& .MuiInputBase-root": { overflow: "visible" } }}
          />
          <Box className="kt-style-card__footer">
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleDelete}
            >
              {i18n("delete")}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={
                !isModified ||
                (styleCodeChanged &&
                  !compiled.valid &&
                  compiled.reason !== "unsupported")
              }
            >
              {i18n("save")}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * 模板选择模态：添加按钮 → 「选即创建」的一次性动作菜单。弹窗复用 MUI
 * Dialog（焦点圈闭/遮罩/aria-modal 由 MUI 承载）；选项行语义按动作菜单裁决（role=menu/menuitem，无选中染色、无勾选标记）；列表滚动
 * overscroll-behavior:contain 物理隔离（滚动不得误关）；Escape/遮罩关闭
 * 后焦点回退添加按钮本体（关闭后焦点回到触发源）。
 *
 * @param {boolean} props.open - 模态开关
 * @param {Function} props.onClose - 关闭回调（MUI onClose 原样透传）
 * @param {Function} props.onSelect - 选中回调（接收所选模板 styleCode）
 * @param {Array} props.templates - 模板清单（useAllTextStyles().builtinStyles 单一事实源）
 */
// 初始焦点入内哨兵：MUI Modal 的 Portal 容器在其自身 effect 中延迟
// 挂载，外层 effect 取不到对话框 DOM；本哨兵渲染于 DialogContent 内，随
// Portal 内容二次提交后执行——对对话框 Paper 显式聚焦（MUI FocusTrap 在
// jsdom 下不自动落焦点；真实浏览器其自动聚焦先于此执行，本调用幂等）。
// Paper 无 tabindex 时按 FocusTrap 同款规则补 -1。
function ModalInitialFocus() {
  useEffect(() => {
    const dialogEl = document
      .getElementById("kt-template-modal-title")
      ?.closest('[role="dialog"]');
    if (dialogEl) {
      // role="menu" 模式下焦点应落首个 menuitem（WAI-ARIA menu 打开即聚焦
      // 首项）；列表缺席或未及挂载时回退对话框 Paper 兜底。
      const firstItem = dialogEl.querySelector('[role="menuitem"]');
      const target = firstItem || dialogEl;
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
      }
      // 经 scriptFocus 唯一入口：指针打开时静默（焦点环配对法则），键盘
      // 打开时环照常出；幂等性不受影响。
      scriptFocus(target);
    }
  }, []);
  return null;
}

function TemplateSelectModal({ open, onClose, onSelect, templates }) {
  const i18n = useI18n();
  const theme = useTheme();
  const titleId = "kt-template-modal-title";

  // Escape/遮罩/✕ 统一路径：关闭即收口；焦点回退挂在 Dialog 过渡 exited
  // 的 TransitionProps.onExited（见 JSX 处注释）
  const handleClose = (...args) => {
    onClose(...args);
  };

  // 焦点恢复守卫的取消令牌：open 生效（新周期）或重关/卸载时递增，在途
  // 重试链每轮比对，失配即终止——旧链不得把焦点写进新周期或已卸载视图
  const focusRestoreEpochRef = useRef(0);
  useEffect(() => {
    if (open) focusRestoreEpochRef.current += 1;
    return () => {
      focusRestoreEpochRef.current += 1;
    };
  }, [open]);

  // 菜单键盘巡航：menuitem 为非按钮节点且
  // tabIndex=-1（menu 语义按箭头键巡航设计、不入 Tab 序），keydown 委托
  // 至 Dialog 层（React 合成事件沿组件树冒泡，Portal 内容同样触达）：
  // 巡航项从 event.currentTarget（Dialog 挂载本元素）作用域向下查询，
  // 杜绝误捞本对话框之外其他浮层的 menuitem；ArrowUp/ArrowDown 在选项间
  // 循环巡航，Enter/Space 激活当前聚焦项；焦点在菜单外（对话框本体）时
  // ArrowDown 进入首项、ArrowUp 进入末项。✕ 按钮等原生可激活节点不经此
  // 劫持（currentIndex=-1 时 Enter/Space 直通）。
  const handleDialogKeyDown = (event) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll('[role="menuitem"]')
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? event.key === "ArrowDown"
            ? 0
            : items.length - 1
          : (currentIndex + delta + items.length) % items.length;
      // 经 scriptFocus 唯一入口；preventScroll:false 允许长列表滚动露出
      // 目标项（与 PopupCont radiogroup 巡航同一口径）。
      scriptFocus(items[nextIndex], { preventScroll: false });
    } else if (currentIndex !== -1) {
      event.preventDefault();
      items[currentIndex].click();
    }
  };

  // 「空白样式」首项：i18n 就地取用（hook 内构造）
  const blankTemplate = {
    styleSlug: "blank",
    styleName: i18n("blank_style"),
    styleCode: "",
    source: "custom",
    isBuiltin: false,
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onKeyDown={handleDialogKeyDown}
      aria-labelledby={titleId}
      // 禁用 FocusTrap 的自带焦点恢复（FocusTrap.js:122-135 cleanup 在
      // open=false 瞬间执行——弹窗仍挂载、ModalManager 的 aria-hidden 仍在
      // #root 上，此时 nodeToRestore（= opener，FocusTrap.js:239-242 经
      // focus 事件 relatedTarget 捕获，jsdom 无 relatedTarget 故测试不可
      // 见）原生聚焦会把焦点放回 aria-hidden 子树，触发 chrome Blocked
      // aria-hidden 告警）。回退改由下方 onExited 的 aria-hidden 守卫承担：
      // 等 Modal 卸载提交清除 aria-hidden 后再聚焦 opener（透传口径：
      // disableRestoreFocus 非 Dialog 具名 prop，随 other 展开到 Modal）。
      disableRestoreFocus
      TransitionProps={{
        onExited: () => {
          // 卸载后守卫回退：逐帧/逐宏任务检查 #root 的
          // aria-hidden 是否已被 Modal 卸载提交清除，清除后才聚焦 opener。
          // 不赌任何任务队列序——备选时序方案（handleClose 定时器 FIFO、
          // 同步聚焦、rAF、onExited 后 0ms 定时器）均不可用：
          // aria-hidden 在场时聚焦 opener 即触发 chrome Blocked
          // aria-hidden 告警（focus-opener@dialogOpen:true）。守卫使该窗口
          // 结构性不可能：aria-hidden 在场时只重试、永不聚焦。测试环境
          // （jsdom 的 rAF 走真实时钟不受 fake timers 接管）用 0ms 定时器
          // 同一守卫，由两段式 advance 驱动。聚焦目标实时取活跃节点：
          // 重渲染会重建按钮节点，卸载前捕获的引用是游离旧节点。
          // 重试封顶 100 次（约 1.6s 生产 / 100 次宏任务测试）：封顶且
          // aria-hidden 仍在场即放弃聚焦——异常场景下宁可不动焦点，也不
          // 兜底聚焦进隐藏子树；取消令牌失配（重开/卸载）即终止陈旧链。
          const armedEpoch = focusRestoreEpochRef.current;
          const restoreFocus = (attempt) => {
            if (focusRestoreEpochRef.current !== armedEpoch) {
              return;
            }
            if (document.getElementById("root")?.getAttribute("aria-hidden")) {
              // 在场：未封顶则重试；封顶即放弃（永不聚焦进隐藏子树）
              if (attempt >= 100) return;
              const retry = () => restoreFocus(attempt + 1);
              if (process.env.NODE_ENV === "test") {
                setTimeout(retry, 0);
              } else {
                requestAnimationFrame(retry);
              }
              return;
            }
            document.getElementById("add-style-button")?.focus?.();
          };
          restoreFocus(0);
        },
      }}
      PaperProps={{
        // MUI v5 Dialog 的顶层 aria-* 落在 Modal 根而非 role=dialog 的
        // Paper；aria-modal 按 M3 合规要求经 PaperProps 补声明到对话框
        // 本体。
        "aria-modal": true,
        sx: {
          width: 440,
          maxHeight: "72vh",
          borderRadius: "12px",
          // ✕ 关闭钮的定位锚点=Paper 本体（浏览器实测：锚在 Title 时右缘
          // 超出 Paper 4px，Paper 的 overflow-x:auto 画出 4px 横向滚动条）
          position: "relative",
          // 定尺寸壳绝不自滚：内部滚动已委托 .kt-template-list，
          // 壳层 overflow hidden 吃掉任何残余溢出（4px 级别的绝对定位
          // 越缘被裁剪而非画滚动条）
          overflow: "hidden",
          // Portal 挂载于 .kt-m3-root 之外，:root 级 --kt-* 变量不可解析
          // （口径同 OptionsTheme dropdownPaper：Portal 内改用 theme 解析
          // 值）——在 Paper 根重定模板项所需变量，OPTIONS_STYLES 的
          // .kt-template-item 规则（主色环/文字色）在 Portal 内恢复解析。
          "--kt-pri": theme.palette.primary.main,
          "--kt-on": theme.palette.text.primary,
        },
      }}
    >
      {/* ✕ 为标题行 flex 常规子项（space-between）——弃用绝对定位：
          abspos 落点存在 +12px 的 containing block 盲区、右缘越出 Paper
          4px（浏览器实测）；流内元素被内容盒约束，越缘结构性不可能 */}
      <DialogTitle
        id={titleId}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {i18n("choose_style_template")}
        <IconButton
          aria-label={i18n("close")}
          onClick={handleClose}
          edge="end"
          className="kt-template-modal__close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      {/* 横向溢出钳制在内容壳；滚动权（长列表 max-height 280 + 纵向
          滚动 + overscroll contain）收归 .kt-template-list 列表本体 */}
      <DialogContent sx={{ overflowX: "hidden" }}>
        <ModalInitialFocus />
        <Box
          role="menu"
          className="kt-template-list"
          aria-label={i18n("choose_style_template")}
        >
          {[blankTemplate, ...templates].map((style) => (
            <Box
              key={style.styleSlug}
              role="menuitem"
              className="kt-template-item"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(style.styleCode);
              }}
            >
              <Typography className="kt-template-item__name">
                {style.styleName}
              </Typography>
              <StyleDemoSpan
                styleSlug={style.styleSlug}
                previewCode={style.styleCode}
              >
                {i18n("translated_text")}
              </StyleDemoSpan>
              <span className="m3-state-layer" />
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
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
    "settings_custom_css",
    "style_name",
    "style_code",
  ]);
  useRevealSearchTarget(setHasOpenedStyleManager, [
    "settings_style_library",
    "settings_custom_css",
    "style_name",
    "style_code",
  ]);
  // 自定义 CSS 列表 Hook
  const { addStyle, deleteStyle, updateStyle } = useStyleList();
  // 系统内置的只读样式配置列表
  const { builtinStyles, customStyles, allTextStyles } = useAllTextStyles();
  const styleNames = new Map(
    allTextStyles.map(({ styleSlug, styleName }) => [styleSlug, styleName])
  );

  const handleStyleCycleChange = (nextCycle) => {
    const added = nextCycle.find((slug) => !setting.styleCycle.includes(slug));
    const removed = setting.styleCycle.find(
      (slug) => !nextCycle.includes(slug)
    );
    updateSetting(({ styleCycle }) => ({
      styleCycle: added
        ? [...styleCycle, added]
        : styleCycle.filter((slug) => slug !== removed),
    }));
  };

  // 互斥单开：同一时刻仅一张卡展开；null＝全收起。
  const [activeEditSlug, setActiveEditSlug] = useState(null);
  // 搜索命中 style 锚键（style_name/style_code）：激活数据序第一张卡。
  // 揭示收敛在主组件——per-card 上抛在双列瀑布流的树序下"最后上抛者
  // 胜出"（3 卡树序 a,c,b，会激活数据序中间卡），与搜索意图不符。
  // 揭示后仍可手动收起，与既有面板行为一致。
  useRevealSearchTarget(
    useCallback(
      (open) => {
        if (open && customStyles.length) {
          setActiveEditSlug(customStyles[0].styleSlug);
        }
      },
      [customStyles]
    ),
    ["style_name", "style_code"]
  );
  // 草稿按 styleSlug 提升到主组件：卡片奇偶分列在头部 unshift 新卡时翻转
  // 列位 → 跨父级卸载重挂，实例内草稿会丢；提升后草稿随主组件存活。
  const [drafts, setDrafts] = useState({});
  const syncedSnapshotsRef = useRef({});
  // 保存提交瞬间的草稿版本与提交内容：同步 effect 清稿前比对——保存 echo
  // 窗口内的新键入（草稿对象已换引用）不属本次提交版本，保留不清；提交
  // 内容用于识别本次提交的回写：匹配即消费标记，非匹配快照（外部变更/
  // 迟到旧值）在途期间持稿不动，避免陈旧标记让草稿对外部同步永久粘滞。
  // 无原型字典：slug 来自同步数据（存储链零校验），直索引读写不得走继承
  // 链——constructor 等继承键不当在途标记，__proto__ 赋值不得突变原型
  const submittedDraftsRef = useRef(Object.create(null));
  // 本地待确认删除登记：slug → 删除令牌。乐观移除在途期间，同步 effect
  // 的失效清扫不得清掉该 slug 的草稿与快照（删除失败回滚 base 后卡片
  // 复现、未保存草稿保留）；写确认到达后由删除回调收口清理。
  const pendingDeletesRef = useRef(Object.create(null));
  // 持久化内容变更才清对应草稿（回落 customStyle），引用抖动不清稿：
  // 快照与上次同步一致即跳过；初始渲染时 drafts 为空、清删为 no-op。
  useEffect(() => {
    // 清理已消失 slug 的草稿与快照：外部同步删除样式后，残留草稿会在同
    // slug 恢复时陈稿复现（回落 customStyle 失效）；快照残留则让恢复场景
    // 误判"快照一致"跳过清稿。正在编辑的卡因同步暂时消失，清草稿是正确
    // 行为——卡已不在列表。本地待确认删除的 slug 让位：乐观移除在途期
    // 间不清草稿与快照，删除失败回滚后卡片复现、草稿保留。
    const liveSlugs = new Set(customStyles.map((style) => style.styleSlug));
    setDrafts((prev) => {
      const stale = Object.keys(prev).filter(
        (slug) =>
          !liveSlugs.has(slug) && pendingDeletesRef.current[slug] === undefined
      );
      if (stale.length === 0) return prev;
      const rest = { ...prev };
      stale.forEach((slug) => {
        delete rest[slug];
      });
      return rest;
    });
    Object.keys(syncedSnapshotsRef.current).forEach((slug) => {
      if (
        !liveSlugs.has(slug) &&
        pendingDeletesRef.current[slug] === undefined
      ) {
        delete syncedSnapshotsRef.current[slug];
      }
    });
    Object.keys(submittedDraftsRef.current).forEach((slug) => {
      if (!liveSlugs.has(slug)) {
        delete submittedDraftsRef.current[slug];
      }
    });
    customStyles.forEach((style) => {
      const slug = style.styleSlug;
      const nextSnapshot = JSON.stringify(toPersistedCustomStyle(style || {}));
      if (syncedSnapshotsRef.current[slug] === nextSnapshot) {
        return;
      }
      const pending = submittedDraftsRef.current[slug];
      if (pending !== undefined) {
        if (nextSnapshot === pending.submittedJSON) {
          // 乐观回写在途：echo 是投机状态——不入快照账、不清稿、不消费
          // 标记，转正由写结果回调承载（成功清稿、失败持稿可重试）。
          // echo 若先入账，回滚 base 会被误判为外部变更而清掉未保存草稿
          return;
        }
        // 外部变更或回滚 base：真实持久态入账，提交在途继续持稿
        syncedSnapshotsRef.current[slug] = nextSnapshot;
        return;
      }
      syncedSnapshotsRef.current[slug] = nextSnapshot;
      setDrafts((prev) => {
        if (!Object.hasOwn(prev, slug)) return prev;
        const { [slug]: _removed, ...rest } = prev;
        return rest;
      });
    });
  }, [customStyles]);
  // 模板选择模态开关。
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  // 模板选择一次性消费：关闭走 Dialog 异步过渡，过渡期 menuitem 仍在 DOM
  // 可点，二次激活会重复 addStyle 产生两张脏卡；每个 open 周期只放行一次
  // 激活，周期起点（重新打开）复位。消费标记只拦「已选择后再激活」；
  // 未消费的取消路径（Escape/遮罩关闭）由关闭态闸兜住——过渡期激活
  // 一律拒绝，保证 Escape/遮罩仅关闭不创建。
  const templateConsumedRef = useRef(false);
  // 模板弹窗周期令牌：每次打开递增。创建写入的收口回调（成功关闭、失败
  // 解锁）只在仍属发起时的周期才执行——否则「写确认晚于用户关闭并重开」
  // 会让旧周期的成功回调关掉新弹窗、或旧失败回调误复位新周期的消费锁。
  const templateCycleRef = useRef(0);
  // 选模板即创建：置顶新建 + 预填所选代码 + 新卡自动展开（互斥单开下
  // 旧卡自动收起——activeEditSlug 被覆盖即旧卡失活）。
  const handleCreateFromTemplate = (initialCode) => {
    if (templateConsumedRef.current || !templateModalOpen) return;
    templateConsumedRef.current = true;
    const cycle = templateCycleRef.current;
    const created = addStyle(initialCode);
    // 乐观 UX 不推迟：新卡立即可编辑（置顶 + 预填 + 互斥单开自动展开），
    // 弹窗关闭改由持久化确认回调承载——落库结果未知前保留创建入口，
    // 写失败时乐观卡随回滚消失、消费标记复位，同弹窗内可重选模板重试
    setActiveEditSlug(created.styleSlug);
    Promise.resolve(created.promise)
      .then(() => {
        // 旧周期（用户已关闭并重开）的成功回调不得关闭当前弹窗
        if (cycle !== templateCycleRef.current) return;
        setTemplateModalOpen(false);
      })
      .catch(() => {
        // 旧周期的失败回调不得复位当前周期的消费锁，否则重开后旧失败
        // 解锁使新弹窗可被同一陈旧请求重复创建
        if (cycle !== templateCycleRef.current) return;
        templateConsumedRef.current = false;
      });
  };

  // 添加新 CSS 样式：创建流程改由模板选择模态承接（选即创建）。leading 现
  // 常驻样式库行（不再受 hasOpenedStyleManager 挂载门约束）——新建须先揭示
  // 抽屉，否则首屏直接点 leading 落库的卡渲染进未挂载的抽屉、静默不可见，
  // 重试即产生多张脏卡。
  const handleClick = (e) => {
    e.preventDefault();
    // 开侧焦点让位（事件时点，早于任何提交）：弹窗挂载时 ModalManager 会向
    // #root 施加 aria-hidden——若此刻 opener 仍持焦点（键盘 Enter 激活后
    // 焦点留在按钮上），chrome 打印 Blocked aria-hidden 告警（拒绝生效）。
    // 先行 blur 使 aria-hidden 施加时 activeElement=body（非 #root 后代），
    // 无「聚焦于隐藏子树」前提；随后 FocusTrap 自动聚焦对话框（既有行为）。
    // 关闭侧由 TransitionProps.onExited 的 aria-hidden 守卫承担。
    e.currentTarget.blur();
    setStyleManagerVisibility(true);
    templateConsumedRef.current = false;
    // 进入新周期：递增令牌，使上一周期在途的创建收口回调失效
    templateCycleRef.current += 1;
    setTemplateModalOpen(true);
  };

  const setStyleManagerVisibility = (visible) => {
    if (visible) setHasOpenedStyleManager(true);
    setShowStyleManager(visible);
  };

  const darkMode = setting.darkMode || "auto";
  const systemPrefersDark = useSystemDarkPreference();
  // 与 M3Theme 消费同一解析单源，预设色点与读数徽章跟随同一模式口径。
  const resolvedThemeMode = resolveM3ThemeMode(darkMode, systemPrefersDark);
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
            label={i18n("settings_style_cycle")}
            description={i18n("settings_style_cycle_description")}
            stacked
          >
            <SettingsSelect
              label={i18n("settings_style_cycle")}
              value={setting.styleCycle}
              onChange={handleStyleCycleChange}
              options={[...styleNames].map(([value, label]) => ({
                value,
                label,
              }))}
              renderValue={(selected) =>
                selected.map((slug) => styleNames.get(slug)).join(" → ") || "—"
              }
              multiple
              fullWidth
              hiddenLabel
              data-settings-search-id="settings_style_cycle"
            />
          </SettingsRow>
          <SettingsRow
            className="kt-settings-row--inline-control"
            label={i18n("settings_style_library")}
            description={i18n("settings_style_library_description")
              .replace("{0}", String(customStyles.length))
              .replace("{1}", String(builtinStyles.length))}
          >
            <Box
              role="group"
              aria-label={i18n("settings_style_library")}
              className="kt-style-split-group"
            >
              <Button
                size="small"
                variant="outlined"
                id="add-style-button"
                className="kt-style-split-group__leading"
                aria-label={i18n("settings_custom_css")}
                aria-haspopup="dialog"
                startIcon={<AddIcon />}
                onClick={handleClick}
              >
                <span className="kt-style-split-group__label">
                  {i18n("settings_custom_css")}
                </span>
              </Button>
              <Button
                size="small"
                variant="outlined"
                className="kt-style-split-group__trailing"
                aria-expanded={showStyleManager}
                aria-controls="kt-style-manager-panel"
                aria-label={i18n(
                  showStyleManager
                    ? "style_library_collapse"
                    : "style_library_expand"
                )}
                onClick={() => setStyleManagerVisibility(!showStyleManager)}
              >
                <ExpandMoreIcon />
              </Button>
            </Box>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {hasOpenedStyleManager && (
        <Stack
          id="kt-style-manager-panel"
          className="kt-style-manager"
          spacing={3}
          hidden={!showStyleManager}
          sx={{ display: showStyleManager ? "flex" : "none" }}
        >
          <section>
            <Typography component="h2" className="kt-options-section-title">
              {i18n("custom_styles")}
            </Typography>
            {/* 确定性双列瀑布流：显式双列按数据序对半切分分布（前 ⌈n/2⌉ 入
                左列、余入右列），既杜绝 CSS 多列平衡在 ≤2 项时的顺序堆叠退化，
                又保证窄屏列容器 display:contents 展平后 DOM 文档序＝数据序
                （视觉序＝Tab 序＝读屏序）；≤620px 折叠单列。 */}
            <Box className="kt-style-grid">
              {/* 按数据序对半切分（非奇偶轮转）：col0=[0,mid)、col1=[mid,len)。
                  使两列 DOM 文档序恒等于 customStyles 数据序——窄屏 display:contents
                  展平后视觉序＝Tab 序＝读屏序＝数据序，杜绝 CSS order 的焦点序尾债。 */}
              {[0, 1].map((columnIndex) => (
                <Box className="kt-style-grid__column" key={columnIndex}>
                  {customStyles
                    .slice(
                      columnIndex === 0
                        ? 0
                        : Math.ceil(customStyles.length / 2),
                      columnIndex === 0
                        ? Math.ceil(customStyles.length / 2)
                        : customStyles.length
                    )
                    .map((customStyle) => (
                      <StyleCard
                        key={customStyle.styleSlug}
                        customStyle={customStyle}
                        draft={
                          Object.hasOwn(drafts, customStyle.styleSlug)
                            ? drafts[customStyle.styleSlug]
                            : undefined
                        }
                        isActive={customStyle.styleSlug === activeEditSlug}
                        onToggle={() =>
                          setActiveEditSlug((prev) =>
                            prev === customStyle.styleSlug
                              ? null
                              : customStyle.styleSlug
                          )
                        }
                        onDraftChange={(updater) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [customStyle.styleSlug]:
                              typeof updater === "function"
                                ? updater(
                                    Object.hasOwn(prev, customStyle.styleSlug)
                                      ? prev[customStyle.styleSlug] ||
                                          customStyle ||
                                          {}
                                      : customStyle || {}
                                  )
                                : updater,
                          }))
                        }
                        onDelete={(styleSlug) => {
                          // 本地待确认删除登记：乐观移除在途期间失效清扫
                          // 让位；写确认到达后再收口草稿与激活态——删除
                          // 失败回滚 base 后卡片复现、未保存草稿保留
                          const token = Object.create(null);
                          pendingDeletesRef.current[styleSlug] = token;
                          Promise.resolve(deleteStyle(styleSlug))
                            .then(() => {
                              if (
                                pendingDeletesRef.current[styleSlug] === token
                              ) {
                                delete pendingDeletesRef.current[styleSlug];
                              }
                              delete syncedSnapshotsRef.current[styleSlug];
                              setDrafts((prev) => {
                                if (!Object.hasOwn(prev, styleSlug)) {
                                  return prev;
                                }
                                const { [styleSlug]: _removed, ...rest } = prev;
                                return rest;
                              });
                              // 删除激活卡：按 slug 相等复位，避免悬空激活引用
                              setActiveEditSlug((prev) =>
                                prev === styleSlug ? null : prev
                              );
                            })
                            .catch(() => {
                              if (
                                pendingDeletesRef.current[styleSlug] === token
                              ) {
                                delete pendingDeletesRef.current[styleSlug];
                              }
                            });
                        }}
                        onUpdate={(styleSlug, persisted) => {
                          // 草稿对象每次键入都换引用，引用不等即「echo 窗口内
                          // 有新键入」；drafts 取自当前渲染闭包，键入触发的
                          // 重渲染保证保存点击时闭包即最新草稿。提交内容随
                          // 标记登记，供同步 effect 识别匹配回写
                          const marker = {
                            draftRef: Object.hasOwn(drafts, styleSlug)
                              ? drafts[styleSlug]
                              : undefined,
                            submittedJSON: JSON.stringify(persisted || {}),
                          };
                          submittedDraftsRef.current[styleSlug] = marker;
                          Promise.resolve(updateStyle(styleSlug, persisted))
                            .then(() => {
                              // 写确认到达：echo 由投机转事实——入快照账并
                              // 清提交版本草稿（echo 窗口内的新键入草稿对象
                              // 已换引用，保留不清）；旧请求的确认迟到时
                              // 不得动较新提交的标记
                              if (
                                submittedDraftsRef.current[styleSlug] === marker
                              ) {
                                delete submittedDraftsRef.current[styleSlug];
                                syncedSnapshotsRef.current[styleSlug] =
                                  marker.submittedJSON;
                                setDrafts((prev) => {
                                  if (!Object.hasOwn(prev, styleSlug)) {
                                    return prev;
                                  }
                                  if (prev[styleSlug] !== marker.draftRef) {
                                    return prev;
                                  }
                                  const { [styleSlug]: _removed, ...rest } =
                                    prev;
                                  return rest;
                                });
                              }
                            })
                            .catch(() => {
                              // 存储写失败：仅当登记的仍是本方标记才释放
                              //（旧请求的拒绝迟到到达时不得删除较新提交的
                              // 标记）；echo 未入快照账，回滚 base 后未保存
                              // 草稿原样保留可重试
                              if (
                                submittedDraftsRef.current[styleSlug] === marker
                              ) {
                                delete submittedDraftsRef.current[styleSlug];
                              }
                            });
                        }}
                      />
                    ))}
                </Box>
              ))}
            </Box>
          </section>
        </Stack>
      )}

      <TemplateSelectModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={handleCreateFromTemplate}
        // style_none（无样式）的内置代码为空串，与「空白样式」同语义：
        // 从模板清单剔除，避免同义重复项
        templates={builtinStyles.filter(
          (style) => style.styleSlug !== OPT_STYLE_NONE
        )}
      />
    </Box>
  );
}
