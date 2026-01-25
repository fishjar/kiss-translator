import { useCallback, useMemo, useState } from "react";
import { API_SPE_TYPES } from "../config";

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

function Switch({ label, name, value, onChange, disabled }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    onChange({ name, value: !value });
  }, [disabled, onChange, name, value]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          background: value ? "rgba(32,156,238,.8)" : "rgba(255,255,255,.3)",
          position: "relative",
        }}
      >
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

function Select({ label, name, value, options, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || options[0],
    [options, value]
  );

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

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

export function Menus({
  i18n,
  formData,
  progressed = 0,
  updateSetting,
  downloadSubtitle,
  transApis,
}) {
  const handleChange = useCallback(
    ({ name, value }) => {
      updateSetting({ name, value });
    },
    [updateSetting]
  );

  // 过滤启用的API
  const enabledApis = useMemo(
    () => (transApis || []).filter((api) => !api.isDisabled),
    [transApis]
  );

  // 过滤AI启用的API
  const aiEnabledApis = useMemo(
    () => enabledApis.filter((api) => API_SPE_TYPES.ai.has(api.apiType)),
    [enabledApis]
  );

  // 构建断句服务选项
  const segOptions = useMemo(() => {
    const options = [
      { value: "-", label: i18n("disable") || "禁用" },
    ];
    aiEnabledApis.forEach((api) => {
      options.push({ value: api.apiSlug, label: api.apiName });
    });
    return options;
  }, [aiEnabledApis, i18n]);

  const status = useMemo(() => {
    if (progressed === 0) return i18n("waiting_subtitles");
    if (progressed === 100) return i18n("download_subtitles");
    return i18n("processing_subtitles");
  }, [progressed, i18n]);

  const { segSlug, skipAd, isBilingual, showOrigin } = formData;

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
      <Switch
        onChange={handleChange}
        name="isBilingual"
        value={isBilingual}
        label={i18n("is_bilingual_view")}
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
