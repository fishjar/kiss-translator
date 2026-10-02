import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RateReviewRoundedIcon from "@mui/icons-material/RateReviewRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import VolunteerActivismRoundedIcon from "@mui/icons-material/VolunteerActivismRounded";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import { useState } from "react";
import Logo from "../../components/Logo";
import { useI18n } from "../../hooks/I18n";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";
import PopupMenu from "./PopupMenu";

export default function Header({
  onClose,
  openSeparateWindow,
  openSettings,
  children,
}) {
  const i18n = useI18n();
  const appName = process.env.REACT_APP_NAME || "KISS Translator";
  const [supportAnchor, setSupportAnchor] = useState(null);

  const handleHomepage = () => {
    window.open(
      process.env.REACT_APP_HOMEPAGE,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const openSupportLink = (url) => {
    setSupportAnchor(null);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <header
      className={`kt-popup-header${onClose ? " kt-popup-header--content" : ""}`}
    >
      {onClose && (
        <span className="kt-popup-header__drag" aria-hidden="true">
          <DragIndicatorRoundedIcon fontSize="small" />
        </span>
      )}
      <button
        type="button"
        className="kt-popup-brand-button"
        onClick={handleHomepage}
        aria-label={appName}
        title={`${appName} v${process.env.REACT_APP_VERSION}`}
      >
        <Logo size={26} className="kt-popup-header__logo" />
      </button>
      {onClose && (
        <span className="kt-popup-header__identity">
          <span className="kt-popup-header__title">{appName}</span>
          <span className="kt-popup-header__version">
            v{process.env.REACT_APP_VERSION}
          </span>
        </span>
      )}
      {children}
      {onClose && <span className="kt-popup-header__spacer" />}
      {onClose ? (
        <IconButton onClick={onClose} aria-label={i18n("close")}>
          <CloseRoundedIcon />
        </IconButton>
      ) : (
        <>
          <span className="kt-popup-header__actions">
            <IconButton
              className="kt-popup-header__sponsor"
              title={i18n("popup_support")}
              aria-label={i18n("popup_support")}
              aria-controls={
                supportAnchor ? "kt-popup-support-menu" : undefined
              }
              aria-expanded={supportAnchor ? "true" : undefined}
              aria-haspopup="menu"
              onClick={(event) => setSupportAnchor(event.currentTarget)}
            >
              <VolunteerActivismRoundedIcon />
            </IconButton>
            <IconButton
              onClick={openSeparateWindow}
              aria-label={i18n("open_separate_window")}
              title={i18n("open_separate_window")}
            >
              <OpenInNewRoundedIcon />
            </IconButton>
            <IconButton
              onClick={openSettings}
              aria-label={i18n("setting")}
              title={i18n("setting")}
            >
              <SettingsRoundedIcon />
            </IconButton>
          </span>
          <PopupMenu
            id="kt-popup-support-menu"
            anchorEl={supportAnchor}
            open={Boolean(supportAnchor)}
            onClose={() => setSupportAnchor(null)}
            ariaLabel={i18n("popup_support")}
            align="right"
            estimatedHeight={96}
          >
            <MenuItem onClick={() => openSupportLink(REVIEW_URL)}>
              <ListItemIcon>
                <RateReviewRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{i18n("comment_support")}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => openSupportLink(SUPPORT_URL)}>
              <ListItemIcon>
                <VolunteerActivismRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{i18n("appreciate_support")}</ListItemText>
            </MenuItem>
          </PopupMenu>
        </>
      )}
    </header>
  );
}
