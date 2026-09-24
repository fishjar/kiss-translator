import BrightnessAutoRoundedIcon from "@mui/icons-material/BrightnessAutoRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import IconButton from "@mui/material/IconButton";
import { useDarkMode } from "../../hooks/ColorMode";
import { useI18n } from "../../hooks/I18n";

export default function DarkModeButton() {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const i18n = useI18n();
  const normalizedMode = ["light", "dark", "auto"].includes(darkMode)
    ? darkMode
    : "auto";
  const nextMode = {
    light: "dark",
    dark: "auto",
    auto: "light",
  }[normalizedMode];
  const modeLabels = {
    light: i18n("settings_theme_light", "Light"),
    dark: i18n("settings_theme_dark", "Dark"),
    auto: i18n("settings_theme_system", "System"),
  };
  const accessibleLabel = i18n(
    "settings_appearance_mode_transition",
    "Appearance mode: current {0}; next {1}"
  )
    .replace("{0}", modeLabels[normalizedMode])
    .replace("{1}", modeLabels[nextMode]);
  const Icon =
    normalizedMode === "dark"
      ? DarkModeRoundedIcon
      : normalizedMode === "light"
        ? LightModeRoundedIcon
        : BrightnessAutoRoundedIcon;

  return (
    <IconButton
      onClick={toggleDarkMode}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <Icon />
    </IconButton>
  );
}
