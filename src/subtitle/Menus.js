import { useCallback, useMemo, useState } from "react";
import { API_SPE_TYPES } from "../config";

/**
 * Label 组件 - 单行文本溢出省略包装标签
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - 标签子节点文本内容
 */
function Label({ children }) {
  return (
    <div
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/**
 * MenuItem 组件 - 菜单单项卡片包装器
 * 支持鼠标悬浮 (hover) 时的背景色渐变高亮与不透明度过渡过渡效果
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - 子元素内容
 * @param {Function} props.onClick - 点击事件回调
 * @param {boolean} [props.disabled=false] - 是否禁用点击
 */
function MenuItem({ children, onClick, disabled = false }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          onClick?.();
        }
      }}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px 8px",
        opacity: disabled ? 0.45 : hover ? 1 : 0.8,
        background: `rgba(255, 255, 255, ${hover ? 0.1 : 0})`,
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.2s, opacity 0.2s",
        borderRadius: 5,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </div>
  );
}

/**
 * Switch 组件 - 开关 (Toggle Switch) 菜单组件
 *
 * @param {object} props
 * @param {string} props.label - 开关文本标题
 * @param {string} props.name - 配置表单中的字段 Key 名
 * @param {boolean} props.value - 当前开关状态值 (true 为开启，false 为关闭)
 * @param {Function} props.onChange - 开关改变时的回调通知
 * @param {boolean} props.disabled - 是否禁用该开关
 */
function Switch({ label, name, value, onChange, disabled }) {
  // REVIEW: 这里的 handleClick 依赖了 value。当每次开关被点击切换时，value 会随之改变，
  // 导致该 useCallback 重新生成并返回新的函数引用，使得 useCallback 并没有起到缓存函数引用的效果。
  const handleClick = useCallback(() => {
    if (disabled) return;

    // 点击时状态取反派发
    onChange({ name, value: !value });
  }, [disabled, onChange, name, value]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
      {/* 开关轨道 (Track) */}
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          background: value ? "rgba(32,156,238,.8)" : "rgba(255,255,255,.3)",
          position: "relative",
        }}
      >
        {/* 开关滑块 (Thumb) */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            position: "absolute",
            left: 2,
            top: 2,
            background: "rgba(255,255,255,.9)",
            transform: `translateX(${value ? 16 : 0}px)`,
          }}
        ></div>
      </div>
    </MenuItem>
  );
}

/**
 * DropdownPanel 组件 - 下拉浮动面板容器
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
function DropdownPanel({ children }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        background: "rgba(0,0,0,.8)",
        borderRadius: 5,
        maxHeight: 200,
        overflow: "auto",
        zIndex: 1000,
        marginTop: 4,
        padding: "4px 0",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

/**
 * DropdownOption 组件 - 单个下拉选项行
 *
 * @param {object} props
 * @param {*} props.value - 选项对应的值
 * @param {boolean} props.selected - 是否为选中状态
 * @param {string} [props.label] - 选项标签文本（未传入 children 时直接作为文本节点渲染）
 * @param {Function} props.onClick - 点击选项的回调
 * @param {Function} [props.onClose] - 按 Esc 关闭浮层的回调
 * @param {React.ReactNode} [props.children] - 自定义子节点
 */
function DropdownOption({
  value,
  selected,
  label,
  onClick,
  onClose,
  children,
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onClick(value);
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose?.();
        }
      }}
      onClick={() => onClick(value)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxSizing: "border-box",
        padding: "4px 14px",
        minHeight: 26,
        fontSize: 12,
        lineHeight: "18px",
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        background: selected
          ? hover
            ? "rgba(32,156,238,.4)"
            : "rgba(32,156,238,.3)"
          : hover
            ? "rgba(255,255,255,.1)"
            : "transparent",
        opacity: selected ? 1 : 0.8,
        transition: "all 0.2s",
      }}
    >
      {children || label}
    </div>
  );
}

/**
 * DropdownEmpty 组件 - 下拉选项为空时的占位显示
 */
function DropdownEmpty({ i18n }) {
  return (
    <div
      style={{
        padding: "4px 14px",
        fontSize: 12,
        opacity: 0.6,
        textAlign: "center",
        boxSizing: "border-box",
      }}
    >
      {i18n ? i18n("none", "无") : "无"}
    </div>
  );
}

/**
 * Select 组件 - 下拉选择菜单组件 (Select Component)
 *
 * @param {object} props
 * @param {string} props.label - 下拉标题文本
 * @param {string} props.name - 表单字段 Key 名
 * @param {*} props.value - 当前选中的值
 * @param {Array<object>} props.options - 下拉选项数组，每一项为 { value, label }
 * @param {Function} props.onChange - 选项改变时的回调
 * @param {boolean} props.disabled - 是否禁用下拉框
 */
function Select({ label, name, value, options, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false); // 控制下拉菜单面板的展开/收起状态

  // 查找当前被选中的选项，若没匹配到则回退至第一个可选项以做安全兜底
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || options[0],
    [options, value]
  );

  // 切换下拉菜单展开收起
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  // 选中下拉具体选项时，派发 onChange 事件，随后关闭下拉选择面板
  const handleSelect = useCallback(
    (optionValue) => {
      onChange({ name, value: optionValue });
      setIsOpen(false);
    },
    [onChange, name]
  );

  return (
    <div style={{ position: "relative" }}>
      <MenuItem onClick={handleToggle} disabled={disabled}>
        <Label>{label}</Label>
        <div
          style={{
            fontSize: 12,
            opacity: 0.8,
            maxWidth: 130,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selectedOption?.label || ""}
        </div>
      </MenuItem>
      {/* 下拉浮出面板 */}
      {isOpen && (
        <DropdownPanel>
          {options.map((option) => (
            <DropdownOption
              key={option.value}
              value={option.value}
              selected={option.value === value}
              label={option.label}
              onClick={handleSelect}
              onClose={() => setIsOpen(false)}
            />
          ))}
        </DropdownPanel>
      )}
    </div>
  );
}

/**
 * MultiSelect 组件 - 多选下拉菜单组件
 *
 * @param {object} props
 * @param {string} props.label - 下拉标题文本
 * @param {string} props.name - 表单字段 Key 名
 * @param {Array<string>} [props.value=[]] - 当前选中的 ID 数组
 * @param {Array<object>} props.options - 下拉选项数组，每一项为 { value, label }
 * @param {Function} props.onChange - 选项改变时的回调
 * @param {boolean} [props.disabled=false] - 是否禁用下拉框
 * @param {Function} props.i18n - 国际化函数
 */
function MultiSelect({
  label,
  name,
  value = [],
  options = [],
  onChange,
  disabled = false,
  i18n,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedValues = useMemo(
    () => (Array.isArray(value) ? value : []),
    [value]
  );

  const summary = useMemo(() => {
    if (!selectedValues.length) return i18n ? i18n("none", "无") : "无";
    const labels = selectedValues
      .map((id) => options.find((opt) => opt.value === id)?.label || id)
      .filter(Boolean);
    if (!labels.length) return i18n ? i18n("none", "无") : "无";
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
    return i18n
      ? `${i18n("selected", "已选")} ${labels.length}`
      : `已选 ${labels.length}`;
  }, [selectedValues, options, i18n]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const handleItemClick = useCallback(
    (optionValue) => {
      const exists = selectedValues.includes(optionValue);
      const next = exists
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange({ name, value: next });
    },
    [onChange, name, selectedValues]
  );

  return (
    <div style={{ position: "relative" }}>
      <MenuItem onClick={handleToggle} disabled={disabled}>
        <Label>{label}</Label>
        <div
          style={{
            fontSize: 12,
            opacity: 0.8,
            maxWidth: 130,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </div>
      </MenuItem>
      {isOpen && (
        <DropdownPanel>
          {options.length === 0 ? (
            <DropdownEmpty i18n={i18n} />
          ) : (
            options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <DropdownOption
                  key={option.value}
                  value={option.value}
                  selected={isSelected}
                  onClick={handleItemClick}
                  onClose={() => setIsOpen(false)}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      marginRight: 8,
                    }}
                  >
                    {option.label}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: "bold",
                      lineHeight: 1,
                      color: isSelected ? "#209cee" : "transparent",
                      userSelect: "none",
                    }}
                  >
                    ✓
                  </span>
                </DropdownOption>
              );
            })
          )}
        </DropdownPanel>
      )}
    </div>
  );
}

/**
 * Button 组件 - 简单按钮菜单项组件
 *
 * @param {object} props
 * @param {string} props.label - 按钮上的文本内容
 * @param {Function} props.onClick - 点击按钮的回调事件
 * @param {boolean} props.disabled - 是否禁用按钮
 */
function Button({ label, onClick, disabled }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    onClick();
  }, [disabled, onClick]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
    </MenuItem>
  );
}

/**
 * Menus 组件 - 视频字幕设置快捷快捷菜单浮动面板组件
 * 用于在视频网页播放器上层叠展示，控制 AI 智能分句、AI 上下文增强、双语显示等配置项
 *
 * @param {object} props
 * @param {Function} props.i18n - 国际化翻译转换函数
 * @param {object} props.formData - 表单绑定配置数据对象
 * @param {number} [props.progressed=0] - 字幕处理/下载进度百分比数值 (0 - 100)
 * @param {Function} props.updateSetting - 更新全局/字幕配置项的回调函数
 * @param {Function} props.downloadSubtitle - 点击触发下载双语字幕的回调函数
 * @param {Array<object>} props.transApis - 系统当前配置的翻译 API 列表
 */
export function Menus({
  i18n,
  formData,
  progressed = 0,
  updateSetting,
  downloadSubtitle,
  transApis,
  canDownload = false,
  asr,
  asrActions,
  onClose,
  terminologyDirectory = [],
}) {
  // 当快捷菜单的任何子选项发生更改时，统一向上层派发更新事件
  const handleChange = useCallback(
    ({ name, value }) => {
      updateSetting({ name, value });
    },
    [updateSetting]
  );

  // 过滤并计算出当前所有未禁用的翻译 API 列表，用于 UI 下拉列表展示
  const enabledApis = useMemo(
    () => (transApis || []).filter((api) => !api.isDisabled),
    [transApis]
  );

  // 进一步过滤出其中属于 AI 大语言模型翻译类型的 API
  const aiEnabledApis = useMemo(
    () => enabledApis.filter((api) => API_SPE_TYPES.ai.has(api.apiType)),
    [enabledApis]
  );

  // 构造字幕翻译服务下拉列表，只展示当前启用的接口
  const transApiOptions = useMemo(
    () =>
      enabledApis.map((api) => ({
        value: api.apiSlug,
        label: api.apiName,
      })),
    [enabledApis]
  );

  // 构造 AI 智能断句服务下拉列表选项 (若没有启用的 AI 接口，则下拉项仅有禁用)
  const segOptions = useMemo(() => {
    const options = [{ value: "-", label: i18n("disable", "禁用") }];
    aiEnabledApis.forEach((api) => {
      options.push({ value: api.apiSlug, label: api.apiName });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  // 构造 AI 视频上下文增强服务下拉列表选项 (若没有启用的 AI 接口，则下拉项仅有禁用)
  const aiContextOptions = useMemo(() => {
    const options = [{ value: "-", label: i18n("disable", "禁用") }];
    aiEnabledApis.forEach((api) => {
      options.push({ value: api.apiSlug, label: api.apiName });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  // 构造专业术语（术语表）多选列表选项
  const terminologyOptions = useMemo(
    () =>
      (terminologyDirectory || []).map((table) => ({
        value: table.id,
        label: table.name || table.id,
      })),
    [terminologyDirectory]
  );

  // 从表单配置对象中解构出字幕交互相关的控制值
  const {
    apiSlug, // 当前页面使用的字幕翻译服务 apiSlug
    segSlug, // 选中的智能断句大模型 apiSlug
    skipAd, // 是否开启自动跳过广告
    isBilingual, // 是否采用双语对照视图显示
    blurTranslation, // 是否启用模糊隐藏译文，悬浮时显示的背词模式
    autoTranslate, // 当前视频是否开启字幕翻译
    aiContextSlug, // 选中的上下文增强服务 apiSlug
    termsList = [], // 当前视频临时选中的术语表 ID 列表
  } = formData || {};

  return (
    <div
      role="dialog"
      aria-label={i18n("enable_subtitle_translate")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose?.();
        }
      }}
      style={{
        position: "absolute",
        left: 0,
        bottom: 48,
        background: "rgba(0,0,0,.6)",
        width: 250,
        lineHeight: "40px",
        fontSize: 16,
        padding: 8,
        borderRadius: 5,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "min(70vh, 520px)",
        overflowY: "auto",
      }}
    >
      {/* 当前视频的翻译开关 */}
      <Switch
        onChange={handleChange}
        name="autoTranslate"
        value={autoTranslate}
        label={i18n("enable_subtitle_translate")}
      />
      {asr && (
        <>
          <Switch
            label={i18n("youtube_asr_start")}
            name="asrEnabled"
            value={asr.active}
            onChange={({ value }) =>
              value ? asrActions?.start?.() : asrActions?.stop?.()
            }
            disabled={!autoTranslate || !asr.available}
          />
        </>
      )}
      {/* 当前页面的字幕翻译服务，不修改持久化默认设置 */}
      <Select
        onChange={handleChange}
        name="apiSlug"
        value={apiSlug}
        options={transApiOptions}
        label={i18n("translate_service")}
        disabled={transApiOptions.length === 0}
      />
      {/* 当前页面的专业术语临时选项，不修改持久化默认设置 */}
      <MultiSelect
        onChange={handleChange}
        name="termsList"
        value={termsList || []}
        options={terminologyOptions}
        label={i18n("terminology_tables", "术语表")}
        i18n={i18n}
        disabled={
          terminologyOptions.length === 0 &&
          (!termsList || termsList.length === 0)
        }
      />
      {/* 智能断句下拉项：若可用 AI 大模型数量为 0 时禁用下拉 */}
      <Select
        onChange={handleChange}
        name="segSlug"
        value={segSlug || "-"}
        options={segOptions}
        label={i18n("ai_segmentation")}
        disabled={
          segOptions.length <= 1 ||
          (asr?.active && asr.timingSource === "audio-chunk")
        }
      />
      {/* 视频上下文增强下拉项：通过 AI 预分析视频内容，帮助更准确地进行专业词汇翻译 */}
      <Select
        onChange={handleChange}
        name="aiContextSlug"
        value={aiContextSlug || "-"}
        options={aiContextOptions}
        label={i18n("ai_enhanced_context")}
        disabled={aiContextOptions.length <= 1}
      />
      {/* 双语对照显示开关 */}
      <Switch
        onChange={handleChange}
        name="isBilingual"
        value={isBilingual}
        label={i18n("is_bilingual_view")}
      />
      {/* 译文模糊背词开关 */}
      <Switch
        onChange={handleChange}
        name="blurTranslation"
        value={blurTranslation}
        label={i18n("is_blur_translation")}
      />
      {/* 广告跳过开关 */}
      <Switch
        onChange={handleChange}
        name="skipAd"
        value={skipAd}
        label={i18n("is_skip_ad")}
      />
      {/* 字幕下载动作按钮：按需 AI 断句下允许下载当前已处理的字幕 */}
      <Button
        label={i18n(
          canDownload && progressed < 100
            ? "youtube_caption_download_partial"
            : "download_subtitles"
        )}
        onClick={downloadSubtitle}
        disabled={!canDownload}
      />
      {!canDownload && (
        <div style={{ fontSize: 12, lineHeight: "20px", padding: "0 8px" }}>
          {i18n("youtube_caption_no_download")}
        </div>
      )}
    </div>
  );
}
