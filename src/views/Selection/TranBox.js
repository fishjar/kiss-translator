import DraggableResizable from "./DraggableResizable";
import Box from "@mui/material/Box";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import IconButton from "@mui/material/IconButton";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CloseIcon from "@mui/icons-material/Close";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useI18n } from "../../hooks/I18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import TranForm from "./TranForm.js";
import { MSG_OPEN_SEPARATE_WINDOW } from "../../config/msg.js";
import { sendBgMsg } from "../../libs/msg.js";
import { isExt } from "../../libs/client.js";
import { useTheme, alpha } from "@mui/material/styles";
import Logo from "../../components/Logo";
import { isValidWord } from "../../libs/utils";
import { useDarkMode } from "../../hooks/ColorMode";

/**
 * Header navigation for the selection translation panel.
 *
 * @param {Object} props
 * @param {Function} props.setShowBox - React setter for panel visibility.
 * @param {boolean} props.simpleStyle - Whether minimal mode is enabled.
 * @param {Function} props.setSimpleStyle - React setter for minimal mode.
 * @param {boolean} props.hideClickAway - Whether outside clicks can hide the panel.
 * @param {Function} props.setHideClickAway - React setter for the outside-click lock.
 * @param {boolean} props.followSelection - Whether the panel follows the selection.
 * @param {Function} props.setFollowSelection - React setter for selection following.
 */
function TranBoxHeader({
  setShowBox,
  simpleStyle,
  setSimpleStyle,
  hideClickAway,
  setHideClickAway,
  followSelection,
  setFollowSelection,
}) {
  const i18n = useI18n();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [showMore, setShowMore] = useState(false);
  const menuId = useId();
  const menuButtonId = `${menuId}-button`;
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (showMore) {
      menuRef.current?.querySelector('[role^="menuitem"]')?.focus();
    }
  }, [showMore]);

  const handleMenuKeyDown = (event) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll('[role^="menuitem"]') || []
    ).filter((item) => !item.disabled);
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex;

    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1 + items.length) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      setShowMore(false);
      menuButtonRef.current?.focus();
      return;
    } else if (event.key === "Tab") {
      setShowMore(false);
      return;
    } else {
      return;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  // Request a separate borderless translation window.
  const openSeparateWindow = useCallback(() => {
    sendBgMsg(MSG_OPEN_SEPARATE_WINDOW);
    // REVIEW: Opening a separate window does not call setShowBox(false), so the page's translation panel remains visible. Hiding it could improve the experience.
  }, []);

  return (
    // Keep stopPropagation on mouseup: the header also starts drags, and bubbling
    // the release event would interfere with the page's selection handling.
    <div className="kt-tranbox-header" onMouseUp={(e) => e.stopPropagation()}>
      <span className="kt-tranbox-header__drag" aria-hidden="true">
        <DragIndicatorRoundedIcon />
      </span>

      {/* Left: logo and version. */}
      <span className="kt-tranbox-header__brand">
        <span className="kt-tranbox-header__logo">
          <Logo size={16} />
        </span>
        <span className="kt-tranbox-header__title">
          {`${process.env.REACT_APP_NAME} v${process.env.REACT_APP_VERSION}`}
        </span>
      </span>

      {/* Right: always-visible actions. */}
      <span className="kt-tranbox-header__actions">
        {/* Lock the panel against outside clicks. */}
        <IconButton
          title={i18n("btn_tip_click_away")}
          aria-pressed={hideClickAway}
          onClick={() => setHideClickAway((pre) => !pre)}
        >
          {hideClickAway ? <LockOpenIcon /> : <LockIcon />}
        </IconButton>

        {/* Keep less frequent controls in the overflow menu. */}
        <IconButton
          id={menuButtonId}
          ref={menuButtonRef}
          title={i18n("more")}
          aria-expanded={showMore}
          aria-haspopup="menu"
          aria-controls={showMore ? menuId : undefined}
          onClick={() => setShowMore((pre) => !pre)}
        >
          <MoreVertIcon />
        </IconButton>

        {/* Close the translation panel. */}
        <IconButton title={i18n("close")} onClick={() => setShowBox(false)}>
          <CloseIcon />
        </IconButton>
      </span>

      {showMore && (
        <ClickAwayListener onClickAway={() => setShowMore(false)}>
          <div
            ref={menuRef}
            id={menuId}
            className="kt-tranbox-header__menu"
            role="menu"
            aria-labelledby={menuButtonId}
            onKeyDown={handleMenuKeyDown}
          >
            {/* Open in a separate window. */}
            {isExt && (
              <button
                type="button"
                role="menuitem"
                onClick={openSeparateWindow}
              >
                <OpenInNewIcon />
                {i18n("open_separate_window")}
              </button>
            )}

            {/* Toggle the minimal collapsed style. */}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={simpleStyle}
              onClick={() => setSimpleStyle((pre) => !pre)}
            >
              {simpleStyle ? <UnfoldMoreIcon /> : <UnfoldLessIcon />}
              {i18n("btn_tip_simple_style")}
            </button>

            {/* Toggle between a fixed position and following the selection. */}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={followSelection}
              onClick={() => setFollowSelection((pre) => !pre)}
            >
              {followSelection ? <PushPinOutlinedIcon /> : <PushPinIcon />}
              {i18n("btn_tip_follow_selection")}
            </button>

            {/* Cycle through dark, light, and automatic themes. */}
            <button type="button" role="menuitem" onClick={toggleDarkMode}>
              {darkMode === "dark" ? (
                <DarkModeIcon />
              ) : darkMode === "auto" ? (
                <BrightnessAutoIcon />
              ) : (
                <LightModeIcon />
              )}
              {i18n("btn_tip_dark_mode")}
            </button>
          </div>
        </ClickAwayListener>
      )}
    </div>
  );
}

/**
 * Container for the selection translation form.
 */
function TranBoxContent({
  simpleStyle,
  text,
  setText,
  apiSlugs,
  fromLang,
  toLang,
  toLang2,
  transApis,
  langDetector,
  translateVariants,
  enDict,
  enSug,
  aiDictApiSlug,
  aiDictPromptSlug,
  prompts,
  selectionContext,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const scrollbarTrackColor =
    theme.palette.mode === "dark" ? "#1f1f23" : theme.palette.background.paper;
  const scrollbarThumbColor =
    theme.palette.mode === "dark"
      ? alpha(theme.palette.text.primary, 0.28)
      : alpha(theme.palette.text.primary, 0.24);

  return (
    <Box
      className="kt-tranbox-content"
      sx={{
        p: simpleStyle ? 1 : 2,
        backgroundColor: theme.palette.background.paper,

        "&::-webkit-scrollbar": {
          width: 10,
          height: 10,
        },
        "&::-webkit-scrollbar-track": {
          background: scrollbarTrackColor,
        },
        "&::-webkit-scrollbar-thumb": {
          backgroundColor: scrollbarThumbColor,
          borderRadius: "999px",
          border: `2px solid ${theme.palette.background.paper}`,
        },
        "&::-webkit-scrollbar-thumb:hover": {
          backgroundColor: alpha(theme.palette.text.primary, 0.36),
        },
        // Firefox
        scrollbarWidth: "thin",
        scrollbarColor: `${scrollbarThumbColor} ${scrollbarTrackColor}`,

        color: isDark
          ? "rgba(255,255,255,0.82)" // Soften white text on very dark backgrounds.
          : theme.palette.text.primary,

        lineHeight: 1.55,
      }}
    >
      {/* Embed the translation form. */}
      <TranForm
        text={text}
        setText={setText}
        apiSlugs={apiSlugs}
        fromLang={fromLang}
        toLang={toLang}
        toLang2={toLang2}
        transApis={transApis}
        prompts={prompts}
        simpleStyle={simpleStyle}
        langDetector={langDetector}
        translateVariants={translateVariants}
        enDict={enDict}
        enSug={enSug}
        aiDictApiSlug={aiDictApiSlug}
        aiDictPromptSlug={aiDictPromptSlug}
        selectionContext={selectionContext}
      />
    </Box>
  );
}

/**
 * Main selection translation panel, managing its draggable shell and settings.
 */
export default function TranBox(props) {
  const [mouseHover, setMouseHover] = useState(false);

  const simpleStyle = props.simpleStyle;
  const setSimpleStyle = props.setSimpleStyle;
  const hideClickAway = props.hideClickAway;
  const setHideClickAway = props.setHideClickAway;
  const followSelection = props.followSelection;
  const setFollowSelection = props.setFollowSelection;

  let realApiSlugs = props.tranboxSetting.apiSlugs;
  // Skip translation for single words when configured to show only dictionary results and suggestions.
  if (props.tranboxSetting.singleWordNoTrans && isValidWord(props.text)) {
    // Clear the translation engine API slugs.
    realApiSlugs = [];
  }

  return props.showBox ? (
    <DraggableResizable
      position={props.boxPosition}
      size={props.boxSize}
      setSize={props.setBoxSize}
      setPosition={props.setBoxPosition}
      autoHeight={props.tranboxSetting.autoHeight}
      header={
        <TranBoxHeader
          setShowBox={props.setShowBox}
          simpleStyle={simpleStyle}
          setSimpleStyle={setSimpleStyle}
          hideClickAway={hideClickAway}
          setHideClickAway={setHideClickAway}
          followSelection={followSelection}
          setFollowSelection={setFollowSelection}
          mouseHover={mouseHover}
        />
      }
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setMouseHover(true)}
      onMouseLeave={() => setMouseHover(false)}
    >
      <TranBoxContent
        simpleStyle={simpleStyle}
        text={props.text}
        setText={props.setText}
        apiSlugs={realApiSlugs}
        fromLang={props.tranboxSetting.fromLang}
        toLang={props.tranboxSetting.toLang}
        toLang2={props.tranboxSetting.toLang2}
        transApis={props.transApis}
        prompts={props.prompts}
        langDetector={props.langDetector}
        translateVariants={props.translateVariants}
        enDict={props.tranboxSetting.enDict}
        enSug={props.tranboxSetting.enSug}
        aiDictApiSlug={props.tranboxSetting.aiDictApiSlug}
        aiDictPromptSlug={props.tranboxSetting.aiDictPromptSlug}
        selectionContext={props.selectionContext}
      />
    </DraggableResizable>
  ) : null;
}
