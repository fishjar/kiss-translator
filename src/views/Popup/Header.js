import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import CropRoundedIcon from "@mui/icons-material/CropRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import IconButton from "@mui/material/IconButton";
import SupportButton from "./SupportButton";
import Logo from "../../components/Logo";
import { useI18n } from "../../hooks/I18n";
import { sendTabMsg } from "../../libs/msg";
import { MSG_IMAGE_SCREENSHOT } from "../../config/msg";
import { checkScreenshotSupport } from "../../libs/imageTranslate/screenshotSupport";
import { isExt } from "../../libs/client";
import { openFileTranslatePage } from "../../libs/navigation";

export default function Header({
  onClose,
  openSeparateWindow,
  openSettings,
  processActions,
  children,
}) {
  const i18n = useI18n();
  const appName = process.env.REACT_APP_NAME || "KISS Translator";

  const handleHomepage = () => {
    window.open(process.env.REACT_APP_SITEURL, "_blank", "noopener,noreferrer");
  };

  const handleScreenshot = async () => {
    if (!(await checkScreenshotSupport(i18n))) return;
    if (onClose) {
      onClose();
      await processActions({ action: MSG_IMAGE_SCREENSHOT });
      return;
    }
    try {
      await sendTabMsg(MSG_IMAGE_SCREENSHOT);
    } finally {
      if (isExt) {
        window.close();
      }
    }
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
        </span>
      )}
      {children}
      {onClose && <span className="kt-popup-header__spacer" />}
      <span className="kt-popup-header__actions">
        <SupportButton />
        <IconButton
          onClick={() => void openFileTranslatePage()}
          aria-label={i18n("file_translate_title", "文件翻译")}
          title={i18n("file_translate_title", "文件翻译")}
        >
          <InsertDriveFileRoundedIcon />
        </IconButton>
        <IconButton
          onClick={handleScreenshot}
          aria-label={i18n("image_screenshot_translate", "截图翻译")}
          title={i18n("image_screenshot_translate", "截图翻译")}
        >
          <CropRoundedIcon />
        </IconButton>
        {!onClose && (
          <IconButton
            onClick={openSeparateWindow}
            aria-label={i18n("open_separate_window")}
            title={i18n("open_separate_window")}
          >
            <OpenInNewRoundedIcon />
          </IconButton>
        )}
        <IconButton
          onClick={openSettings}
          aria-label={i18n("setting")}
          title={i18n("setting")}
        >
          <SettingsRoundedIcon />
        </IconButton>
        {onClose && (
          <IconButton
            onClick={onClose}
            aria-label={i18n("close")}
            title={i18n("close")}
          >
            <CloseRoundedIcon />
          </IconButton>
        )}
      </span>
    </header>
  );
}
