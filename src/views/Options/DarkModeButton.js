import IconButton from "@mui/material/IconButton";
import { useDarkMode } from "../../hooks/ColorMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";

export default function DarkModeButton() {
  const { darkMode, toggleDarkMode } = useDarkMode();
  return (
    <IconButton onClick={toggleDarkMode} color="inherit">
      {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
    </IconButton>
  );
}
