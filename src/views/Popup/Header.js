import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import KeyboardRoundedIcon from "@mui/icons-material/KeyboardRounded";
import MouseRoundedIcon from "@mui/icons-material/MouseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RateReviewRoundedIcon from "@mui/icons-material/RateReviewRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import VolunteerActivismRoundedIcon from "@mui/icons-material/VolunteerActivismRounded";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import { useEffect, useRef, useState } from "react";
import Logo from "../../components/Logo";
import { useI18n } from "../../hooks/I18n";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";
import PopupMenu from "./PopupMenu";
import { usePopupFeatureToggles } from "./usePopupFeatureToggles";

const FEATURE_LABELS = {
  selection: "selection_translate",
  hover: "popup_hover_translation",
  input: "input_translate",
};

const FEATURE_ICONS = {
  selection: SelectAllRoundedIcon,
  hover: MouseRoundedIcon,
  input: KeyboardRoundedIcon,
};

function GlobalMenuTitle({ children }) {
  return <div className="kt-popup-global-title">{children}</div>;
}

GlobalMenuTitle.muiSkipListHighlight = true;

export default function Header({
  onClose,
  openSeparateWindow,
  openSettings,
  children,
  setting,
  capabilities,
  processActions,
  targetTab,
  documentInfo,
  isDisabledPage = false,
  isVisible = true,
  onPageUnavailable,
}) {
  const i18n = useI18n();
  const appName = process.env.REACT_APP_NAME || "KISS Translator";
  const [supportAnchor, setSupportAnchor] = useState(null);
  const [globalAnchor, setGlobalAnchor] = useState(null);
  const headerRef = useRef(null);
  const {
    features,
    enabledCount,
    handleTransboxToggle,
    handleMouseHoverToggle,
    handleInputToggle,
  } = usePopupFeatureToggles({
    setting,
    capabilities,
    processActions,
    targetTab,
    documentInfo,
    isDisabledPage,
    isVisible,
    onPageUnavailable,
  });
  const featureActions = {
    selection: handleTransboxToggle,
    hover: handleMouseHoverToggle,
    input: handleInputToggle,
  };

  useEffect(() => {
    if (!features.length || !isVisible) setGlobalAnchor(null);
  }, [features.length, isVisible]);

  const menuPosition = globalAnchor
    ? {
        top: headerRef.current.getBoundingClientRect().top + 46,
        left: headerRef.current.getBoundingClientRect().right - 8,
      }
    : undefined;

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
      ref={headerRef}
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
            {features.length > 0 && (
              <IconButton
                className="kt-popup-header__global"
                data-open={Boolean(globalAnchor)}
                title={i18n("popup_global_features_hint")}
                aria-label={i18n("popup_global_features")}
                aria-controls={
                  globalAnchor ? "kt-popup-global-menu" : undefined
                }
                aria-expanded={Boolean(globalAnchor)}
                aria-haspopup="menu"
                onClick={(event) => {
                  setSupportAnchor(null);
                  setGlobalAnchor(globalAnchor ? null : event.currentTarget);
                }}
              >
                <TuneRoundedIcon />
                {enabledCount > 0 && (
                  <span className="kt-popup-header__badge" aria-hidden="true">
                    {enabledCount}
                  </span>
                )}
              </IconButton>
            )}
            <IconButton
              className="kt-popup-header__sponsor"
              title={i18n("popup_support")}
              aria-label={i18n("popup_support")}
              aria-controls={
                supportAnchor ? "kt-popup-support-menu" : undefined
              }
              aria-expanded={supportAnchor ? "true" : undefined}
              aria-haspopup="menu"
              onClick={(event) => {
                setGlobalAnchor(null);
                setSupportAnchor(event.currentTarget);
              }}
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
          <PopupMenu
            id="kt-popup-global-menu"
            anchorEl={globalAnchor}
            open={Boolean(globalAnchor)}
            onClose={() => setGlobalAnchor(null)}
            className="kt-popup-global-menu"
            position={menuPosition}
            align="right"
            estimatedHeight={180}
            ariaLabel={i18n("popup_global_features")}
          >
            <GlobalMenuTitle>
              <TuneRoundedIcon aria-hidden="true" />
              {i18n("popup_global_features")}
            </GlobalMenuTitle>
            {features.map((feature) => {
              const FeatureIcon = FEATURE_ICONS[feature.name];
              return (
                <MenuItem
                  key={feature.name}
                  className="kt-popup-global-row"
                  role="menuitemcheckbox"
                  aria-checked={feature.enabled}
                  aria-label={i18n(FEATURE_LABELS[feature.name])}
                  aria-busy={feature.pending}
                  disabled={feature.pending}
                  onClick={() =>
                    void featureActions[feature.name](!feature.enabled)
                  }
                >
                  <FeatureIcon aria-hidden="true" />
                  <span className="kt-popup-global-row__label">
                    {i18n(FEATURE_LABELS[feature.name])}
                  </span>
                  {feature.failed && (
                    <span className="kt-popup-global-error" role="status">
                      {i18n("popup_global_toggle_failed")}
                    </span>
                  )}
                  <span
                    className="kt-popup-switch"
                    data-checked={feature.enabled}
                    aria-hidden="true"
                  >
                    <span className="kt-popup-switch__thumb" />
                  </span>
                </MenuItem>
              );
            })}
          </PopupMenu>
        </>
      )}
    </header>
  );
}
