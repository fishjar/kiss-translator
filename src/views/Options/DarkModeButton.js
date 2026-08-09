import BrightnessAutoRoundedIcon from "@mui/icons-material/BrightnessAutoRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import IconButton from "@mui/material/IconButton";
import { useDarkMode } from "../../hooks/ColorMode";

export default function DarkModeButton() {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const Icon =
    darkMode === "dark"
      ? DarkModeRoundedIcon
      : darkMode === "light"
        ? LightModeRoundedIcon
        : BrightnessAutoRoundedIcon;

  return (
    <IconButton onClick={toggleDarkMode} aria-label="Change color theme">
      <Icon />
    </IconButton>
  );
}
