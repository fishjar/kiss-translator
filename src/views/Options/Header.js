import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import Logo from "../../components/Logo";
import IconButton from "@mui/material/IconButton";
import { useI18n } from "../../hooks/I18n";
import DarkModeButton from "./DarkModeButton";

export default function Header({ onDrawerToggle, navigationOpen }) {
  const i18n = useI18n();
  return (
    <header className="kt-options-mobile-header">
      <IconButton
        onClick={onDrawerToggle}
        aria-label={i18n("options_open_navigation")}
        aria-controls="kt-options-navigation"
        aria-expanded={navigationOpen}
      >
        <MenuRoundedIcon />
      </IconButton>
      <Logo size={25} />
      <span className="kt-options-mobile-header__name">{i18n("app_name")}</span>
      <DarkModeButton />
    </header>
  );
}
