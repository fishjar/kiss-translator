import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import FormHelperText from "@mui/material/FormHelperText";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import FloatingButton from "../../components/FloatingButton";
import { FLOATING_BUTTON_STYLES } from "../../components/FloatingButton.styles";
import {
  FAB_MIN_OPACITY,
  FAB_MIN_SIZE,
  FAB_MAX_SIZE,
  DEFAULT_FAB,
  normalizeFabAppearance,
} from "../../config/fab";
import { useI18n } from "../../hooks/I18n";
import { createM3CssVariables, resolveM3Colors } from "../../styles/m3";

const FAB_APPEARANCE_STYLES = String.raw`
.kt-fab-appearance {
  padding: 24px;
  border: 1px solid var(--kt-linev);
  border-radius: 16px;
  background: var(--kt-sf0);
}
.kt-fab-appearance .kt-fab-appearance-title {
  margin: 0 0 22px;
  color: var(--kt-on);
  font-size: 16px;
  line-height: 1.4;
  font-weight: 600;
}
.kt-fab-appearance .kt-fab-appearance-layout {
  display: grid;
  grid-template-columns: clamp(112px, 28%, 176px) minmax(0, 1fr);
  align-items: center;
  gap: 26px;
}
.kt-fab-appearance .kt-fab-preview,
.kt-fab-appearance .kt-fab-appearance-controls { min-width: 0; }
.kt-fab-appearance .kt-fab-preview-stage {
  position: relative;
  display: grid;
  place-items: center;
  height: 184px;
  border-radius: 12px;
}
.kt-fab-appearance .kt-fab-preview-label,
.kt-fab-appearance .kt-fab-preview-dimensions {
  position: absolute;
  left: 4px;
  right: 4px;
  color: var(--kt-onv);
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  pointer-events: none;
}
.kt-fab-appearance .kt-fab-preview-label { top: 12px; }
.kt-fab-appearance .kt-fab-preview-dimensions {
  bottom: 11px;
  font-variant-numeric: tabular-nums;
}
.kt-fab-appearance .kt-fab-preview-opacity {
  display: grid;
  place-items: center;
  transition: opacity 160ms ease;
}
.kt-fab-appearance .kt-fab-preview-hint {
  margin: 10px 0 0;
  color: var(--kt-onv);
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.kt-fab-appearance .kt-fab-appearance-controls { display: grid; gap: 24px; }
.kt-fab-appearance .kt-fab-appearance-label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.kt-fab-appearance .kt-fab-appearance-label-row > label {
  min-width: 0;
  color: var(--kt-on);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.kt-fab-appearance .kt-fab-appearance-label-row > output {
  flex: none;
  color: var(--kt-on);
  font-size: 14px;
  line-height: 1.5;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.kt-fab-appearance .MuiSlider-root { display: block; width: 100%; }
.kt-fab-appearance .kt-fab-appearance-helper {
  margin: 0;
  color: var(--kt-onv);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.kt-fab-appearance .kt-fab-appearance-refresh {
  margin: 16px 0 0;
  color: var(--kt-onv);
  font-size: 12px;
  line-height: 1.55;
}
@media (max-width: 600px) {
  .kt-fab-appearance { padding: 12px; }
  .kt-fab-appearance .kt-fab-appearance-title { margin-bottom: 18px; }
  .kt-fab-appearance .kt-fab-appearance-layout { gap: 12px; }
  .kt-fab-appearance .kt-fab-preview-stage { height: 168px; }
  .kt-fab-appearance .kt-fab-appearance-controls { gap: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .kt-fab-appearance .kt-fab-preview-opacity { transition: none; }
}
`;

export default function FabAppearanceSetting({ fab, onChange }) {
  const i18n = useI18n();
  const { opacity, size } = normalizeFabAppearance(fab);
  const [opacityPercent, setOpacityPercent] = useState(
    Math.round(opacity * 100)
  );
  const [sizePixels, setSizePixels] = useState(size);
  const [previewTheme, setPreviewTheme] = useState("light");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = resolveM3Colors(previewTheme);

  useEffect(() => {
    setOpacityPercent(Math.round(opacity * 100));
  }, [opacity]);

  useEffect(() => {
    setSizePixels(size);
  }, [size]);

  const togglePreviewTheme = (event) => {
    setPreviewTheme((current) => (current === "light" ? "dark" : "light"));
    if (event.detail > 0) event.currentTarget.blur();
  };

  return (
    <Box
      component="section"
      className="kt-fab-appearance"
      aria-labelledby="fab-appearance-title"
    >
      <style>{FLOATING_BUTTON_STYLES}</style>
      <style>{FAB_APPEARANCE_STYLES}</style>
      <Typography
        component="h2"
        id="fab-appearance-title"
        className="kt-fab-appearance-title"
      >
        {i18n("fab_appearance")}
      </Typography>
      <Box className="kt-fab-appearance-layout">
        <Box className="kt-fab-preview">
          <Box
            className="kt-fab-preview-stage kt-m3-root"
            data-theme={previewTheme}
            style={{
              ...createM3CssVariables(colors),
              backgroundColor:
                previewTheme === "light" ? colors.surface : colors.background,
              colorScheme: previewTheme,
            }}
          >
            <Typography component="span" className="kt-fab-preview-label">
              {i18n(
                previewTheme === "light"
                  ? "fab_preview_light"
                  : "fab_preview_dark"
              )}
            </Typography>
            <Box
              className="kt-fab-preview-opacity"
              style={{ opacity: hovered || focused ? 1 : opacityPercent / 100 }}
            >
              <FloatingButton
                size={sizePixels}
                opensMenu={fab?.fabClickAction !== 1}
                className="kt-fab-preview-button"
                aria-label={i18n("fab_preview_dark")}
                aria-pressed={previewTheme === "dark"}
                aria-describedby="fab-preview-theme-hint"
                onClick={togglePreviewTheme}
                onPointerEnter={() => setHovered(true)}
                onPointerLeave={() => setHovered(false)}
                onPointerCancel={() => setHovered(false)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
            </Box>
            <Typography
              component="span"
              className="kt-fab-preview-dimensions"
              aria-hidden="true"
            >
              {sizePixels} × {sizePixels} px
            </Typography>
          </Box>
          <Typography
            id="fab-preview-theme-hint"
            className="kt-fab-preview-hint"
          >
            {i18n("fab_preview_theme_hint")}
          </Typography>
        </Box>
        <Box className="kt-fab-appearance-controls">
          <Box>
            <Box className="kt-fab-appearance-label-row">
              <Typography
                component="label"
                id="fab-opacity-label"
                htmlFor="fab-opacity-input"
              >
                {i18n("fab_opacity")}
              </Typography>
              <Typography id="fab-opacity-value" component="output">
                {opacityPercent}%
              </Typography>
            </Box>
            <Slider
              name="opacity"
              aria-labelledby="fab-opacity-label"
              componentsProps={{
                input: {
                  id: "fab-opacity-input",
                  "aria-describedby": "fab-opacity-helper",
                },
              }}
              value={opacityPercent}
              min={FAB_MIN_OPACITY * 100}
              max={100}
              step={5}
              getAriaValueText={(value) => `${value}%`}
              onChange={(_event, value) => setOpacityPercent(value)}
              onChangeCommitted={(_event, value) =>
                onChange({ opacity: value / 100 })
              }
            />
            <FormHelperText
              id="fab-opacity-helper"
              className="kt-fab-appearance-helper"
            >
              {i18n("fab_opacity_helper")}
            </FormHelperText>
          </Box>
          <Box>
            <Box className="kt-fab-appearance-label-row">
              <Typography
                component="label"
                id="fab-size-label"
                htmlFor="fab-size-input"
              >
                {i18n("fab_size")}
              </Typography>
              <Typography id="fab-size-value" component="output">
                {sizePixels} px
              </Typography>
            </Box>
            <Slider
              name="size"
              aria-labelledby="fab-size-label"
              componentsProps={{
                input: {
                  id: "fab-size-input",
                  "aria-describedby": "fab-size-helper",
                },
              }}
              value={sizePixels}
              min={FAB_MIN_SIZE}
              max={FAB_MAX_SIZE}
              step={4}
              getAriaValueText={(value) => `${value} px`}
              onChange={(_event, value) => setSizePixels(value)}
              onChangeCommitted={(_event, value) => onChange({ size: value })}
            />
            <FormHelperText
              id="fab-size-helper"
              className="kt-fab-appearance-helper"
            >
              {i18n("fab_size_helper")
                .replace("{min}", FAB_MIN_SIZE)
                .replace("{max}", FAB_MAX_SIZE)
                .replace("{default}", DEFAULT_FAB.size)}
            </FormHelperText>
          </Box>
        </Box>
      </Box>
      <FormHelperText className="kt-fab-appearance-refresh">
        {i18n("fab_preview_refresh_helper")}
      </FormHelperText>
    </Box>
  );
}
