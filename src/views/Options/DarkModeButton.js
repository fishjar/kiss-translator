import BrightnessAutoRoundedIcon from "@mui/icons-material/BrightnessAutoRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import IconButton from "@mui/material/IconButton";
import { useDarkMode } from "../../hooks/ColorMode";
import { useI18n } from "../../hooks/I18n";

export default function DarkModeButton() {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const i18n = useI18n();
  const Icon =
    darkMode === "dark"
      ? DarkModeRoundedIcon
      : darkMode === "light"
        ? LightModeRoundedIcon
        : BrightnessAutoRoundedIcon;

  return (
    <IconButton
      onClick={toggleDarkMode}
      aria-label={i18n("settings_appearance_mode")}
    >
      <Icon />
    </IconButton>
  );
}
