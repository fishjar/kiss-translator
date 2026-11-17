import { supportsTouch } from "../../libs/touchCapability";
import { useTouchState } from "../../hooks/useTouchTranslateState";
import { AdsClickIcon, ChevronLeftIcon } from "../../components/icons";
import Alert from "@mui/material/Alert";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import CropRoundedIcon from "@mui/icons-material/CropRounded";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import ThemeProvider from "../../hooks/M3Theme";
import Draggable from "./Draggable";
import { SettingProvider } from "../../hooks/Setting";
import {
  EVENT_KISS_INNER,
  MSG_OPEN_OPTIONS,
  MSG_OPEN_TRANBOX,
  MSG_POPUP_TOGGLE,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_IMAGE_SCREENSHOT,
} from "../../config";
import { useI18n } from "../../hooks/I18n";
import { useFab } from "../../hooks/Fab";
import { isExt } from "../../libs/client";
import { sendBgMsg } from "../../libs/msg";
import {
  createMenuKeyDownHandler,
  getMenuActiveElement,
} from "../../libs/menuFocus";
import { isFabHiddenOnPage } from "../../libs/fabVisibility";
import useWindowSize from "../../hooks/WindowSize";
import { useFullscreenDetect } from "../../hooks/useFullscreenDetect";
import { ACTION_STYLES } from "./styles";
import {
  FAB_CLICK_ACTION_MENU,
  FAB_CLICK_ACTION_TRANSLATE,
  FAB_CLICK_ACTION_POPUP,
  normalizeFabAppearance,
} from "../../config/fab";
import FloatingButton from "../../components/FloatingButton";

const selectionUnavailable = () => false;

// The selected row is the single source for the sequential tab stop, so the
// roving focus and the selection state cannot disagree.
function gestureSelectedMode(state) {
  if (state?.mode === "off" || state?.mode === "tap") return state.mode;
  if (state?.mode !== "swipe") return "";
  return state.direction === "left" || state.direction === "right"
    ? `swipe-${state.direction}`
    : "";
}

// A disabled row must never be the tab entry; "off" stays available in every
// state, so it is the fallback whenever the selected row cannot be used.
function gestureTabStopMode(state) {
  const selected = gestureSelectedMode(state);
  if (selected === "off") return "off";
  const usable = Boolean(state?.supported) && !state?.blocked;
  return usable && selected ? selected : "off";
}

function subscribeSelectionEnabled(onChange) {
  const handleChange = (event) => {
    if (event.detail?.action === MSG_TRANSBOX_TOGGLE) onChange();
  };
  document.addEventListener(EVENT_KISS_INNER, handleChange);
  return () => document.removeEventListener(EVENT_KISS_INNER, handleChange);
}

// Flip and shift the menu near viewport edges. The FAB can reach any corner,
// so fallback placements cover all sides to prevent clipping.
export const FAB_POPPER_MODIFIERS = [
  {
    name: "flip",
    enabled: true,
    options: {
      fallbackPlacements: [
        "top-start",
        "bottom-end",
        "bottom-start",
        "right",
        "left",
      ],
    },
  },
  {
    name: "preventOverflow",
    enabled: true,
    options: { padding: 12 },
  },
  { name: "offset", options: { offset: [0, 10] } },
];

/**
 * Floating translation action button for content pages.
 * Supports dragging, edge snapping, and a Material 3 action menu.
 */
export function ContentFabContent({
  fabConfig = {},
  processActions,
  getSelectionEnabled = selectionUnavailable,
  onClose,
  onVisibilityChange,
}) {
  const i18n = useI18n();
  const { fab, updateFab } = useFab();
  const hideOnPage = isFabHiddenOnPage(fab, window.location.href);
  const {
    x: fabX,
    y: fabY,
    edge: fabEdge,
    fabClickAction = FAB_CLICK_ACTION_MENU,
  } = fabConfig || {};
  const {
    halfHide,
    opacity,
    size: fabSize,
  } = normalizeFabAppearance(fabConfig);
  // Use the current tab's runtime state, which can differ from stored settings.
  const selectionEnabled = useSyncExternalStore(
    subscribeSelectionEnabled,
    getSelectionEnabled
  );
  const opensPopup = fabClickAction === FAB_CLICK_ACTION_POPUP;
  const opensMenu =
    fabClickAction !== FAB_CLICK_ACTION_TRANSLATE && !opensPopup;
  const windowSize = useWindowSize();
  const [moved, setMoved] = useState(false); // Track whether a drag occurred.
  const [showFab, setShowFab] = useState(true);
  const [open, setOpen] = useState(false); // Action menu visibility.
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [notice, setNotice] = useState("");
  const [gestureViewOpen, setGestureViewOpen] = useState(false);
  const [gestureTabStop, setGestureTabStop] = useState(null);
  const gestureReturnRef = useRef(false);
  const gestureListboxRef = useRef(null);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const popperRef = useRef(null);
  // Own menu navigation in both topologies so host pages never receive the
  // navigation keys and both roots share one roving implementation.
  const handleMenuNavigation = useMemo(
    () => createMenuKeyDownHandler({ shadowOnly: false }),
    []
  );
  const handleGestureNavigation = useMemo(
    () => createMenuKeyDownHandler({ shadowOnly: false }),
    []
  );
  const {
    state: touchState,
    failed: touchFailed,
    saveFailed: touchSaveFailed,
    pending: touchPending,
    change: changeTouchGesture,
  } = useTouchState(processActions);
  const selectedGestureMode = gestureSelectedMode(touchState);
  // While a save is in flight every option is disabled, so none of them may
  // hold the tab stop; it resumes on the usable row once the save settles.
  const gestureTabValue = touchPending
    ? null
    : (gestureTabStop ?? gestureTabStopMode(touchState));
  const gestureSummary = selectedGestureMode
    ? i18n(
        selectedGestureMode === "off"
          ? "touch_summary_off"
          : selectedGestureMode === "tap"
            ? "touch_summary_tap"
            : selectedGestureMode === "swipe-left"
              ? "touch_summary_left"
              : "touch_summary_right"
      )
    : "";
  // 提交失败反馈优先于静默：状态未到达只代表尚未拿到页面回报，
  // 但已发生的提交失败必须给出明确反馈；两者皆无才保持静默。
  const gestureFeedback = touchSaveFailed
    ? i18n("touch_save_failed")
    : touchFailed
      ? i18n("touch_failed")
      : !touchState
        ? ""
        : touchState.blocked
          ? i18n("touch_blocked")
          : touchState.supported
            ? ""
            : i18n("touch_unsupported");
  const { isVideoFullscreen } = useFullscreenDetect();

  useEffect(() => {
    setShowFab(!isVideoFullscreen);
    // Close the menu when video fullscreen hides the FAB,
    // preventing an orphaned panel that cannot be reached or dismissed.
    if (isVideoFullscreen) {
      setOpen(false);
    }
  }, [isVideoFullscreen]);

  const closeMenu = useCallback((restoreFocus = false) => {
    gestureReturnRef.current = false;
    setGestureViewOpen(false);
    setOpen(false);
    if (restoreFocus) anchorRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!opensMenu) closeMenu();
  }, [closeMenu, opensMenu]);

  // Every panel opening starts at the level 1 action menu.
  useEffect(() => {
    if (open) {
      gestureReturnRef.current = false;
      setGestureViewOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!opensMenu || !open) return;

    const ownerDocument = anchorRef.current.ownerDocument;
    let touchMoved = false;
    // Draggable surfaces stop bubbling events. Capture native events and use
    // their composed paths to identify the menu and FAB across shadow roots.
    const handleClickAway = (event) => {
      const path = event.composedPath();
      if (
        path.includes(menuRef.current) ||
        path.includes(anchorRef.current) ||
        path.some((node) => node.hasAttribute?.("data-kiss-touch-ui"))
      ) {
        return;
      }
      closeMenu();
    };
    const handleTouchStart = () => {
      touchMoved = false;
    };
    const handleTouchMove = () => {
      touchMoved = true;
    };
    const handleTouchEnd = (event) => {
      if (!touchMoved) handleClickAway(event);
      touchMoved = false;
    };

    ownerDocument.addEventListener("click", handleClickAway, true);
    ownerDocument.addEventListener("touchstart", handleTouchStart, true);
    ownerDocument.addEventListener("touchmove", handleTouchMove, true);
    ownerDocument.addEventListener("touchend", handleTouchEnd, true);
    return () => {
      ownerDocument.removeEventListener("click", handleClickAway, true);
      ownerDocument.removeEventListener("touchstart", handleTouchStart, true);
      ownerDocument.removeEventListener("touchmove", handleTouchMove, true);
      ownerDocument.removeEventListener("touchend", handleTouchEnd, true);
    };
  }, [closeMenu, open, opensMenu]);

  const syncContainerScroll = useCallback((element) => {
    const scroller = menuRef.current;
    if (!scroller || !element) return;
    const bounds = scroller.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.top < bounds.top) scroller.scrollTop += rect.top - bounds.top;
    else if (rect.bottom > bounds.bottom)
      scroller.scrollTop += rect.bottom - bounds.bottom;
  }, []);

  // Level 2 opens on the selected or first usable option; returning hands
  // focus back to the entry row. Rows are focused, containers never are.
  useEffect(() => {
    if (!gestureViewOpen) {
      if (!gestureReturnRef.current) return;
      gestureReturnRef.current = false;
      const entry = menuRef.current?.querySelector("#kt-fab-gesture-entry");
      if (!entry) return;
      entry.focus({ preventScroll: true });
      if (getMenuActiveElement(entry) === entry) syncContainerScroll(entry);
      return;
    }
    const listbox = gestureListboxRef.current;
    if (!listbox) return;
    const options = Array.from(
      listbox.querySelectorAll('[role="option"]')
    ).filter((option) => option.getAttribute("aria-disabled") !== "true");
    const target =
      options.find(
        (option) => option.getAttribute("aria-selected") === "true"
      ) || options[0];
    if (!target) {
      // 全部选项不可用（如保存 pending）时焦点不能掉回 body：交给返回按钮，
      // 保持键盘可继续退出本视图。找不到返回钮则不聚焦（宁缺勿错）。
      const back = listbox.parentElement?.querySelector(
        ".kt-content-fab-menu__back"
      );
      back?.focus({ preventScroll: true });
      if (back && getMenuActiveElement(back) === back) {
        syncContainerScroll(back);
      }
      return;
    }
    target.focus({ preventScroll: true });
    if (getMenuActiveElement(target) === target) syncContainerScroll(target);
    setGestureTabStop(target.dataset.mode ?? null);
  }, [gestureViewOpen, syncContainerScroll]);

  // A state pushed while the listbox is open can disable the current stop;
  // repair the stop back to "off" without stealing focus.
  useEffect(() => {
    if (!gestureViewOpen || !gestureTabStop) return;
    const listbox = gestureListboxRef.current;
    const option = listbox?.querySelector(
      `[role="option"][data-mode="${gestureTabStop}"]`
    );
    if (option?.getAttribute("aria-disabled") === "true") {
      setGestureTabStop("off");
    }
  }, [gestureTabStop, gestureViewOpen, touchState]);

  const closeGestureView = () => {
    gestureReturnRef.current = true;
    setGestureViewOpen(false);
  };

  const selectGestureOption = (value) => {
    // Disabled options stay unselectable from every path: pointer, keyboard
    // and programmatic clicks all funnel through here. A pending save gates
    // every option including off; the view stays open while a click is
    // rejected. Off remains selectable after a save finishes even when the
    // page is unsupported or blocked.
    if (
      touchPending ||
      (value !== "off" && (!touchState?.supported || touchState?.blocked))
    ) {
      return;
    }
    const [mode, direction] = value.split("-");
    changeTouchGesture(mode, direction);
    closeGestureView();
  };

  const handleMenuKeyDownCapture = (event) => {
    handleMenuNavigation(event);
    if (event.defaultPrevented) {
      syncContainerScroll(getMenuActiveElement(menuRef.current));
      return;
    }
    if (
      event.target?.closest?.("#kt-fab-gesture-entry") &&
      (event.key === "Enter" || event.key === " " || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      event.stopPropagation();
      setGestureViewOpen(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const item = event.target?.closest?.('[role^="menuitem"]');
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      // Disabled items swallow the key, mirroring the gesture option branch.
      if (item.getAttribute("aria-disabled") !== "true") {
        item.click();
      }
    }
  };

  const handleGestureKeyDownCapture = (event) => {
    const { key } = event;
    if (key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (key === "Escape" || key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      closeGestureView();
      return;
    }
    if (key === "Enter" || key === " ") {
      const option = event.target?.closest?.('[role="option"]');
      if (option?.dataset?.mode) {
        event.preventDefault();
        event.stopPropagation();
        if (option.getAttribute("aria-disabled") !== "true") {
          selectGestureOption(option.dataset.mode);
        }
        return;
      }
      if (event.target?.closest?.(".kt-content-fab-menu__back")) {
        event.preventDefault();
        event.stopPropagation();
        closeGestureView();
        return;
      }
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      // The back button is a plain button, not a listbox option. Keep it in
      // the same roving ring symmetrically: from the first option up, or from
      // the last option down, focus it; from it, arrow down resumes at the
      // first option and arrow up at the last. A single usable option keeps
      // the plain listbox wrap, where both arrow keys stay on that option.
      const listbox = gestureListboxRef.current;
      const active = getMenuActiveElement(listbox);
      const options = Array.from(
        listbox?.querySelectorAll('[role="option"]') || []
      ).filter((option) => option.getAttribute("aria-disabled") !== "true");
      const back = event.currentTarget.querySelector(
        ".kt-content-fab-menu__back"
      );
      if (options.length > 1) {
        const first = options[0];
        const last = options[options.length - 1];
        const focusBack = () => {
          event.preventDefault();
          event.stopPropagation();
          back?.focus({ preventScroll: true });
          if (back) syncContainerScroll(back);
        };
        if (active === first && key === "ArrowUp") {
          focusBack();
          return;
        }
        if (active === last && key === "ArrowDown") {
          focusBack();
          return;
        }
        if (active === back) {
          event.preventDefault();
          event.stopPropagation();
          const next = key === "ArrowDown" ? first : last;
          next?.focus({ preventScroll: true });
          if (next) {
            syncContainerScroll(next);
            if (next.dataset.mode) setGestureTabStop(next.dataset.mode);
          }
          return;
        }
      }
    }
    handleGestureNavigation(event);
    if (event.defaultPrevented) {
      const active = getMenuActiveElement(gestureListboxRef.current);
      syncContainerScroll(active);
      if (active?.dataset?.mode) setGestureTabStop(active.dataset.mode);
    }
  };

  // Popper does not observe the anchor's edge-reveal transform animation.
  const updateMenuPosition = useCallback(() => {
    popperRef.current?.update();
  }, []);

  // Handle the start of a drag without changing ordinary click behavior.
  const handleStart = useCallback(() => {
    setMoved(false);
  }, []);

  // Close the menu before its transformed anchor moves away from it.
  const handleMove = useCallback(() => {
    setMoved(true);
    closeMenu(true);
  }, [closeMenu]);

  // Run an action and close the menu.
  const runAction = useCallback(
    (action) => {
      processActions({ action });
      closeMenu(true);
    },
    [closeMenu, processActions]
  );

  // Open the extension options page in a new browser tab.
  const openSettings = useCallback(() => {
    // Navigation can synchronously deactivate this page. Do not restore focus
    // afterward, which would reveal the FAB again when returning to this tab.
    closeMenu();
    if (isExt) {
      sendBgMsg(MSG_OPEN_OPTIONS);
    } else {
      window.open(
        process.env.REACT_APP_OPTIONSPAGE,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }, [closeMenu]);

  const toggleVisibility = async () => {
    // Matching exceptions invert this global preference on the current page.
    const isHide = !fab?.isHide;
    const nextHideOnPage = !hideOnPage;
    setSavingVisibility(true);
    try {
      await updateFab({ isHide });
      onVisibilityChange?.(nextHideOnPage);
      closeMenu();
      if (nextHideOnPage) {
        setNotice("fab_hidden_shortcut_hint");
      }
    } catch (_error) {
      setNotice("popup_save_failed");
    } finally {
      setSavingVisibility(false);
    }
  };

  const closeNotice = () => {
    setNotice("");
    // Keep the host visible until its shortcut reminder has been dismissed.
    if (notice === "fab_hidden_shortcut_hint") onClose?.();
  };

  // Ignore clicks after dragging to prevent accidental activation.
  const handleClick = useCallback(() => {
    if (moved) {
      return;
    }
    if (opensPopup) {
      // Let the panel manage focus when it opens and closes.
      closeMenu();
      processActions({ action: MSG_POPUP_TOGGLE });
      return;
    }
    if (!opensMenu) {
      runAction(MSG_TRANS_TOGGLE);
      return;
    }
    setOpen((current) => !current);
  }, [closeMenu, moved, opensMenu, opensPopup, processActions, runAction]);

  // Close the menu and return focus to the FAB before menu items unmount.
  const handleMenuKeyDown = useCallback(
    (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    },
    [closeMenu]
  );

  // Position the FAB at the viewport edge and vertical center on first load.
  const fabProps = useMemo(
    () => ({
      windowSize,
      width: fabSize,
      height: fabSize,
      left: fabX ?? -fabSize,
      top: fabY ?? windowSize.h / 2,
      edge: fabEdge,
    }),
    [windowSize, fabSize, fabX, fabY, fabEdge]
  );

  const items = [
    {
      label: i18n("popup_translate_page"),
      icon: TranslateRoundedIcon,
      action: () => runAction(MSG_TRANS_TOGGLE),
    },
    {
      label: i18n("fab_toggle_style"),
      icon: PaletteRoundedIcon,
      action: () => runAction(MSG_TRANS_TOGGLE_STYLE),
    },
    {
      label: i18n("fab_open_translation"),
      icon: SelectAllRoundedIcon,
      action: () => runAction(MSG_OPEN_TRANBOX),
      disabled: !selectionEnabled,
    },
    {
      label: i18n("image_screenshot_translate", "截图翻译"),
      icon: CropRoundedIcon,
      action: () => runAction(MSG_IMAGE_SCREENSHOT),
    },
    {
      label: i18n("open_menu"),
      icon: TuneRoundedIcon,
      action: () => runAction(MSG_POPUP_TOGGLE),
    },
    {
      label: i18n("open_setting"),
      icon: SettingsRoundedIcon,
      action: openSettings,
    },
  ].filter((item) => !item.hidden);

  return (
    <Draggable
      key="fab"
      snapEdge // Keep edge snapping independent of the half-hide preference.
      halfHide={halfHide}
      idleOpacity={opacity}
      fitContent // The fixed menu must not be constrained by the FAB wrapper.
      expanded={opensMenu && open} // Keep the anchor fully revealed while the menu is open.
      {...fabProps}
      show={showFab}
      onStart={handleStart}
      onMove={handleMove}
      onDeactivate={closeMenu}
      onPositionTransitionEnd={updateMenuPosition}
      handler={
        <FloatingButton
          id="kt-content-fab-button"
          ref={anchorRef}
          size={fabSize}
          opensMenu={opensMenu}
          open={open}
          aria-expanded={opensMenu ? open : undefined}
          aria-haspopup={opensMenu ? "menu" : opensPopup ? "dialog" : undefined}
          aria-controls={opensMenu && open ? "kt-content-fab-menu" : undefined}
          aria-label={i18n(opensPopup ? "fab_click_popup" : "translate")}
          onClick={handleClick}
        />
      }
    >
      <Popper
        popperRef={popperRef}
        open={opensMenu && open && Boolean(anchorRef.current)}
        anchorEl={anchorRef.current}
        placement="top-end"
        // Render inside the content page's shadow root to retain M3Theme styles;
        // a portal to document.body would escape that root.
        disablePortal
        popperOptions={{ strategy: "fixed" }}
        modifiers={FAB_POPPER_MODIFIERS}
      >
        <Paper ref={menuRef} className="kt-content-fab-menu" elevation={6}>
          <MenuList
            id="kt-content-fab-menu"
            aria-labelledby="kt-content-fab-button"
            autoFocusItem
            hidden={gestureViewOpen}
            onKeyDownCapture={handleMenuKeyDownCapture}
            onKeyDown={handleMenuKeyDown}
          >
            {items.map(({ label, icon: Icon, action, disabled }) => (
              <MenuItem
                className="kt-content-fab-menu__item"
                disabled={disabled}
                onClick={disabled ? undefined : action}
                key={label}
              >
                <span className="kt-state-layer" aria-hidden="true" />
                <ListItemIcon>
                  <Icon />
                </ListItemIcon>
                <ListItemText>{label}</ListItemText>
              </MenuItem>
            ))}
            {supportsTouch() && (
              <MenuItem
                id="kt-fab-gesture-entry"
                className="kt-content-fab-menu__item"
                aria-haspopup="listbox"
                aria-expanded={gestureViewOpen}
                aria-controls="kt-fab-gesture-listbox"
                onClick={() => setGestureViewOpen(true)}
              >
                <span className="kt-state-layer" aria-hidden="true" />
                <ListItemIcon>
                  <AdsClickIcon />
                </ListItemIcon>
                <ListItemText>{i18n("touch_mode_short")}</ListItemText>
                <span className="kt-content-fab-menu__entry-summary">
                  {gestureSummary}
                </span>
              </MenuItem>
            )}
            {!supportsTouch() && (
              <MenuItem
                className="kt-content-fab-menu__item"
                role="menuitemcheckbox"
                aria-checked={!hideOnPage}
                disabled={savingVisibility}
                onClick={toggleVisibility}
              >
                <span className="kt-state-layer" aria-hidden="true" />
                <ListItemIcon>
                  {hideOnPage ? (
                    <VisibilityRoundedIcon />
                  ) : (
                    <VisibilityOffRoundedIcon />
                  )}
                </ListItemIcon>
                <ListItemText>
                  {i18n(hideOnPage ? "fab_always_show" : "fab_turn_off")}
                </ListItemText>
              </MenuItem>
            )}
          </MenuList>
          {supportsTouch() && (
            <div
              className="kt-content-fab-menu__gesture"
              hidden={!gestureViewOpen}
              onKeyDownCapture={handleGestureKeyDownCapture}
            >
              <button
                type="button"
                className="kt-content-fab-menu__item kt-content-fab-menu__back"
                aria-label={i18n("touch_gesture_back")}
                onClick={closeGestureView}
              >
                <span className="kt-state-layer" aria-hidden="true" />
                <ListItemIcon>
                  <ChevronLeftIcon />
                </ListItemIcon>
                <ListItemText>{i18n("touch_mode_short")}</ListItemText>
              </button>
              <div
                id="kt-fab-gesture-listbox"
                ref={gestureListboxRef}
                role="listbox"
                aria-label={i18n("touch_mode")}
                aria-busy={touchPending || undefined}
                className="kt-content-fab-menu__listbox"
              >
                <button
                  type="button"
                  role="option"
                  className="kt-content-fab-menu__option"
                  aria-selected={selectedGestureMode === "off"}
                  aria-disabled={touchPending || undefined}
                  tabIndex={gestureTabValue === "off" ? 0 : -1}
                  data-mode="off"
                  onClick={() => selectGestureOption("off")}
                >
                  <span className="kt-state-layer" aria-hidden="true" />
                  <span className="kt-content-fab-menu__option-label">
                    {i18n("touch_summary_off")}
                  </span>
                </button>
                <button
                  type="button"
                  role="option"
                  className="kt-content-fab-menu__option"
                  aria-selected={selectedGestureMode === "tap"}
                  aria-disabled={
                    touchPending ||
                    !touchState?.supported ||
                    touchState?.blocked
                  }
                  tabIndex={gestureTabValue === "tap" ? 0 : -1}
                  data-mode="tap"
                  onClick={() => selectGestureOption("tap")}
                >
                  <span className="kt-state-layer" aria-hidden="true" />
                  <span className="kt-content-fab-menu__option-label">
                    {i18n("touch_summary_tap")}
                  </span>
                </button>
                {["right", "left"].map((direction) => {
                  const value = `swipe-${direction}`;
                  const selected = selectedGestureMode === value;
                  return (
                    <button
                      key={direction}
                      type="button"
                      role="option"
                      className="kt-content-fab-menu__option"
                      aria-selected={selected}
                      aria-disabled={
                        touchPending ||
                        !touchState?.supported ||
                        touchState?.blocked
                      }
                      tabIndex={gestureTabValue === value ? 0 : -1}
                      data-mode={value}
                      onClick={() => selectGestureOption(value)}
                    >
                      <span className="kt-state-layer" aria-hidden="true" />
                      <span className="kt-content-fab-menu__option-label">
                        {i18n(
                          direction === "left"
                            ? "touch_summary_left"
                            : "touch_summary_right"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {supportsTouch() && gestureFeedback && (
            <Alert role="status" severity="info">
              {gestureFeedback}
            </Alert>
          )}
        </Paper>
      </Popper>
      <Dialog
        open={Boolean(notice)}
        // Retain shadow-root styles without inheriting the draggable transform.
        container={() => anchorRef.current?.closest(".kt-m3-root")}
        disableEnforceFocus
        disableRestoreFocus
        disableScrollLock
        onClose={closeNotice}
        aria-labelledby="kt-content-fab-notice-title"
        aria-describedby="kt-content-fab-notice-message"
        maxWidth="xs"
        fullWidth
        sx={{ zIndex: 2147483647 }}
      >
        <DialogTitle id="kt-content-fab-notice-title">
          {i18n("hide_fab_button")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="kt-content-fab-notice-message">
            {i18n(notice)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={closeNotice}>
            {i18n("close")}
          </Button>
        </DialogActions>
      </Dialog>
    </Draggable>
  );
}

export default function ContentFab(props) {
  return (
    <SettingProvider context="fab">
      <ThemeProvider>
        <style>{ACTION_STYLES}</style>
        <ContentFabContent {...props} />
      </ThemeProvider>
    </SettingProvider>
  );
}
