import { useCallback, useEffect, useMemo, useState } from "react";
import { MSG_MENUS_PROGRESSED, MSG_MENUS_UPDATEFORM } from "../config";

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

function MenuItem({ children, onClick, disabled = false, title }) {
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
      title={title}
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

function Button({ label, onClick, disabled, title }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    onClick();
  }, [disabled, onClick]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled} title={title}>
      <Label>{label}</Label>
    </MenuItem>
  );
}

function RetranslateButton({ label, onClick, title }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(() => {
    if (isLoading) return;

    setIsLoading(true);
    onClick();
    setTimeout(() => setIsLoading(false), 1500);
  }, [isLoading, onClick]);

  return (
    <MenuItem onClick={handleClick} disabled={isLoading} title={title}>
      <Label>{label}</Label>
      {isLoading && (
        <span
          style={{
            display: "inline-block",
            animation: "kiss-spin 1s linear infinite",
          }}
        >
          ↻
        </span>
      )}
      <style>{`
        @keyframes kiss-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </MenuItem>
  );
}

function DropdownSelect({ label, name, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = useCallback(
    (optValue) => {
      onChange({ name, value: optValue });
      setIsOpen(false);
    },
    [name, onChange]
  );

  return (
    <div style={{ position: "relative" }}>
      <MenuItem onClick={() => setIsOpen(!isOpen)}>
        <Label>{label}</Label>
        <div
          style={{
            maxWidth: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.8,
            fontSize: 14,
          }}
        >
          {selectedOption?.label || "-"}
        </div>
      </MenuItem>
      {isOpen && (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: "100%",
            marginBottom: 4,
            background: "rgba(0,0,0,.9)",
            borderRadius: 5,
            padding: 4,
            minWidth: 120,
            maxHeight: 200,
            overflowY: "auto",
            zIndex: 10,
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                background:
                  opt.value === value ? "rgba(32,156,238,.6)" : "transparent",
                borderRadius: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              onMouseEnter={(e) =>
                (e.target.style.background =
                  opt.value === value
                    ? "rgba(32,156,238,.8)"
                    : "rgba(255,255,255,.1)")
              }
              onMouseLeave={(e) =>
                (e.target.style.background =
                  opt.value === value ? "rgba(32,156,238,.6)" : "transparent")
              }
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Menus({
  i18n,
  initData,
  updateSetting,
  downloadSubtitle,
  retranslate,
  hasSegApi,
  hasAiApi,
  tones = [],
  eventName,
}) {
  const [formData, setFormData] = useState(initData);
  const [progressed, setProgressed] = useState(0);

  const handleChange = useCallback(
    ({ name, value }) => {
      setFormData((pre) => ({ ...pre, [name]: value }));
      updateSetting({ name, value });
    },
    [updateSetting]
  );

  useEffect(() => {
    const handler = (e) => {
      const { action, data } = e.detail || {};
      if (action === MSG_MENUS_PROGRESSED) {
        setProgressed(data);
      } else if (action === MSG_MENUS_UPDATEFORM) {
        setFormData((pre) => ({ ...pre, ...data }));
      }
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventName]);

  const status = useMemo(() => {
    if (progressed === 0) return i18n("waiting_subtitles");
    if (progressed === 100) return i18n("download_subtitles");
    return i18n("processing_subtitles");
  }, [progressed, i18n]);

  const { isAISegment, skipAd, isBilingual, showOrigin, activeToneId } =
    formData;

  const toneOptions = useMemo(
    () => tones.map((t) => ({ value: t.id, label: t.name })),
    [tones]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 100,
        background: "rgba(0,0,0,.6)",
        width: 200,
        lineHeight: "40px",
        fontSize: 16,
        padding: 8,
        borderRadius: 5,
      }}
    >
      <Switch
        onChange={handleChange}
        name="isAISegment"
        value={isAISegment}
        label={i18n("ai_segmentation")}
        disabled={!hasSegApi}
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
      {hasAiApi && toneOptions.length > 0 && (
        <DropdownSelect
          onChange={handleChange}
          name="activeToneId"
          value={activeToneId}
          options={toneOptions}
          label={i18n("tones")}
        />
      )}
      <RetranslateButton
        label={i18n("retranslate_subtitle")}
        onClick={retranslate}
      />
      <Button
        label={`${status} [${progressed}%] `}
        onClick={downloadSubtitle}
        disabled={progressed !== 100}
      />
    </div>
  );
}
