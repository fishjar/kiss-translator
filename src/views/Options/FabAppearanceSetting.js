import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import FormHelperText from "@mui/material/FormHelperText";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import TranBtn from "../Selection/TranBtn";
import { SELECTION_STYLES } from "../Selection/styles";
import {
  normalizeTranbtnAppearance,
  TRANBTN_MIN_SIZE,
  TRANBTN_MAX_SIZE,
  DEFAULT_TRANBTN,
} from "../../config/tranbtn";
import FloatingButton from "../../components/FloatingButton";
import { FLOATING_BUTTON_STYLES } from "../../components/FloatingButton.styles";
import {
  FAB_MIN_OPACITY,
  FAB_MIN_SIZE,
  FAB_MAX_SIZE,
  FAB_CLICK_ACTION_TRANSLATE,
  FAB_CLICK_ACTION_POPUP,
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

export default function FabAppearanceSetting({
  fab,
  onChange,
  selection = false,
}) {
  const i18n = useI18n();
  const selectionAppearance = normalizeTranbtnAppearance(fab);
  const { opacity, size } = selection
    ? {
        opacity: selectionAppearance.btnOpacity,
        size: selectionAppearance.btnSize,
      }
    : normalizeFabAppearance(fab);
  const prefix = selection ? "tranbtn" : "fab";
  const minSize = selection ? TRANBTN_MIN_SIZE : FAB_MIN_SIZE;
  const maxSize = selection ? TRANBTN_MAX_SIZE : FAB_MAX_SIZE;
  const defaultSize = selection ? DEFAULT_TRANBTN.btnSize : DEFAULT_FAB.size;
  const PreviewButton = selection ? TranBtn : FloatingButton;
  const commitOpacity = (value) =>
    onChange(
      selection ? { btnOpacity: value / 100 } : { opacity: value / 100 }
    );
  const commitSize = (value) =>
    onChange(selection ? { btnSize: value } : { size: value });
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
      sx={selection ? { mt: 2 } : undefined}
      data-settings-search-id={`${prefix}_appearance`}
      aria-labelledby={`${prefix}-appearance-title`}
    >
      <style>{selection ? SELECTION_STYLES : FLOATING_BUTTON_STYLES}</style>
      <style>{FAB_APPEARANCE_STYLES}</style>
      <Typography
        component="h2"
        id={`${prefix}-appearance-title`}
        className="kt-fab-appearance-title"
      >
        {i18n(`${prefix}_appearance`)}
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
              <PreviewButton
                {...(selection
                  ? {
                      preview: true,
                      position: { x: 0, y: 0 },
                      btnSize: sizePixels,
                      btnOpacity: 1,
                      btnEvent: "onClick",
                      onTrigger: togglePreviewTheme,
                      label: i18n("fab_preview_dark"),
                    }
                  : {})}
                {...(!selection
                  ? {
                      size: sizePixels,
                      opensMenu:
                        fab?.fabClickAction !== FAB_CLICK_ACTION_TRANSLATE &&
                        fab?.fabClickAction !== FAB_CLICK_ACTION_POPUP,
                    }
                  : {})}
                className="kt-fab-preview-button"
                aria-label={i18n("fab_preview_dark")}
                aria-pressed={previewTheme === "dark"}
                aria-describedby={`${prefix}-preview-theme-hint`}
                onClick={selection ? undefined : togglePreviewTheme}
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
            id={`${prefix}-preview-theme-hint`}
            className="kt-fab-preview-hint"
          >
            {i18n("fab_preview_theme_hint")}
          </Typography>
        </Box>
        <Box className="kt-fab-appearance-controls">
          <Box data-settings-search-id={`${prefix}_opacity`}>
            <Box className="kt-fab-appearance-label-row">
              <Typography
                component="label"
                id={`${prefix}-opacity-label`}
                htmlFor={`${prefix}-opacity-input`}
              >
                {i18n(`${prefix}_opacity`)}
              </Typography>
              <Typography id={`${prefix}-opacity-value`} component="output">
                {opacityPercent}%
              </Typography>
            </Box>
            <Slider
              name="opacity"
              aria-labelledby={`${prefix}-opacity-label`}
              componentsProps={{
                input: {
                  id: `${prefix}-opacity-input`,
                  "aria-describedby": `${prefix}-opacity-helper`,
                },
              }}
              value={opacityPercent}
              min={FAB_MIN_OPACITY * 100}
              max={100}
              step={5}
              getAriaValueText={(value) => `${value}%`}
              onChange={(_event, value) => setOpacityPercent(value)}
              onChangeCommitted={(_event, value) => commitOpacity(value)}
            />
            <FormHelperText
              id={`${prefix}-opacity-helper`}
              className="kt-fab-appearance-helper"
            >
              {i18n("fab_opacity_helper")}
            </FormHelperText>
          </Box>
          <Box data-settings-search-id={`${prefix}_size`}>
            <Box className="kt-fab-appearance-label-row">
              <Typography
                component="label"
                id={`${prefix}-size-label`}
                htmlFor={`${prefix}-size-input`}
              >
                {i18n(`${prefix}_size`)}
              </Typography>
              <Typography id={`${prefix}-size-value`} component="output">
                {sizePixels} px
              </Typography>
            </Box>
            <Slider
              name="size"
              aria-labelledby={`${prefix}-size-label`}
              componentsProps={{
                input: {
                  id: `${prefix}-size-input`,
                  "aria-describedby": `${prefix}-size-helper`,
                },
              }}
              value={sizePixels}
              min={minSize}
              max={maxSize}
              step={selection ? 1 : 4}
              getAriaValueText={(value) => `${value} px`}
              onChange={(_event, value) => setSizePixels(value)}
              onChangeCommitted={(_event, value) => commitSize(value)}
            />
            <FormHelperText
              id={`${prefix}-size-helper`}
              className="kt-fab-appearance-helper"
            >
              {i18n("fab_size_helper")
                .replace("{min}", minSize)
                .replace("{max}", maxSize)
                .replace("{default}", defaultSize)}
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
