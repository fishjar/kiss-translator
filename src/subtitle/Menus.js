import { useCallback, useMemo, useState } from "react";
import { API_SPE_TYPES } from "../config";

// 单行文本溢出省略标签组件
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

// 菜单单项组件，支持鼠标 hover 时的背景高亮和透明度变化过渡效果
function MenuItem({ children, onClick, disabled = false }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px 8px",
        opacity: hover ? 1 : 0.8,
        background: `rgba(255, 255, 255, ${hover ? 0.1 : 0})`,
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.2s, opacity 0.2s",
        borderRadius: 5,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// 开关 (Toggle Switch) 菜单组件
function Switch({ label, name, value, onChange, disabled }) {
  // REVIEW: 这里的 handleClick 依赖了 value。当每次开关被点击切换时，value 会随之改变，
  // 导致该 useCallback 重新生成并返回新的函数引用，使得 useCallback 并没有起到缓存函数引用的效果。
  const handleClick = useCallback(() => {
    if (disabled) return;

    onChange({ name, value: !value });
  }, [disabled, onChange, name, value]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
      {/* 轨道 */}
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          background: value ? "rgba(32,156,238,.8)" : "rgba(255,255,255,.3)",
          position: "relative",
        }}
      >
        {/* 滑块 */}
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

// 下拉选择菜单组件 (Select Component)
function Select({ label, name, value, options, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false); // 下拉框是否展开

  // 查找当前被选中的选项，若没匹配到则回退至第一个选项
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || options[0],
    [options, value]
  );

  // 切换下拉菜单的显示/收起
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  // 选择具体选项并向外派发 onChange 事件，随后关闭下拉面板
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
      {isOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            background: "rgba(0,0,0,.8)",
            borderRadius: 5,
            minWidth: 250,
            maxHeight: 200,
            overflow: "auto",
            zIndex: 1000,
            marginTop: 4,
          }}
        >
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleSelect(option.value)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                background:
                  option.value === value
                    ? "rgba(32,156,238,.3)"
                    : "transparent",
                opacity: option.value === value ? 1 : 0.8,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  option.value === value
                    ? "rgba(32,156,238,.3)"
                    : "transparent";
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 简单按钮点击项组件
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
 * 视频字幕设置快捷菜单面板组件（用于在视频网页内浮现，控制 AI 翻译和分句选项）
 */
export function Menus({
  i18n,
  formData,
  progressed = 0,
  updateSetting,
  downloadSubtitle,
  transApis,
}) {
  // 处理任何字段选项的变化
  const handleChange = useCallback(
    ({ name, value }) => {
      updateSetting({ name, value });
    },
    [updateSetting]
  );

  // 过滤出未禁用的翻译 API
  const enabledApis = useMemo(
    () => (transApis || []).filter((api) => !api.isDisabled),
    [transApis]
  );

  // 过滤出 AI 大模型翻译类型的 API 列表
  const aiEnabledApis = useMemo(
    () => enabledApis.filter((api) => API_SPE_TYPES.ai.has(api.apiType)),
    [enabledApis]
  );

  // 构建 AI 断句服务下拉选项（仅加载已启用的 AI 类型接口）
  const segOptions = useMemo(() => {
    const options = [{ value: "-", label: i18n("disable") || "禁用" }];
    aiEnabledApis.forEach((api) => {
      options.push({ value: api.apiSlug, label: api.apiName });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  // 构建 AI 上下文增强服务下拉选项（仅加载已启用的 AI 类型接口）
  const aiContextOptions = useMemo(() => {
    const options = [{ value: "-", label: i18n("disable") || "禁用" }];
    aiEnabledApis.forEach((api) => {
      options.push({ value: api.apiSlug, label: api.apiName });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  // 计算当前的字幕处理/下载状态描述语
  const status = useMemo(() => {
    if (progressed === 0) return i18n("waiting_subtitles");
    if (progressed === 100) return i18n("download_subtitles");
    return i18n("processing_subtitles");
  }, [progressed, i18n]);

  // 解构字幕相关的表单值数据
  const {
    segSlug,
    skipAd,
    isBilingual,
    blurTranslation,
    showOrigin,
    aiContextSlug,
  } = formData;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 100,
        background: "rgba(0,0,0,.6)",
        width: 250,
        lineHeight: "40px",
        fontSize: 16,
        padding: 8,
        borderRadius: 5,
      }}
    >
      <Select
        onChange={handleChange}
        name="segSlug"
        value={segSlug || "-"}
        options={segOptions}
        label={i18n("ai_segmentation")}
        disabled={segOptions.length <= 1}
      />
      <Select
        onChange={handleChange}
        name="aiContextSlug"
        value={aiContextSlug || "-"}
        options={aiContextOptions}
        label={i18n("ai_enhanced_context")}
        disabled={aiContextOptions.length <= 1}
      />
      <Switch
        onChange={handleChange}
        name="isBilingual"
        value={isBilingual}
        label={i18n("is_bilingual_view")}
      />
      <Switch
        onChange={handleChange}
        name="blurTranslation"
        value={blurTranslation}
        label={i18n("is_blur_translation")}
      />
      <Switch
        onChange={handleChange}
        name="showOrigin"
        value={showOrigin}
        label={i18n("show_origin_subtitle")}
      />
      <Switch
        onChange={handleChange}
        name="skipAd"
        value={skipAd}
        label={i18n("is_skip_ad")}
      />
      <Button
        label={`${status} [${progressed}%] `}
        onClick={downloadSubtitle}
        disabled={progressed !== 100}
      />
    </div>
  );
}
