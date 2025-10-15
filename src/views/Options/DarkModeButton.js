import IconButton from "@mui/material/IconButton";
import { useDarkMode } from "../../hooks/ColorMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";

export default function DarkModeButton() {
  const { darkMode, toggleDarkMode } = useDarkMode();
  return (
    <IconButton sx={{ ml: 1 }} onClick={toggleDarkMode} color="inherit">
      {darkMode === "dark" ? (
        <DarkModeIcon />
      ) : darkMode === "light" ? (
        <LightModeIcon />
      ) : (
        <BrightnessAutoIcon />
      )}
    </IconButton>
  );
}
