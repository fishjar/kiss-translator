import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TranslateIcon from "@mui/icons-material/Translate";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Fab from "@mui/material/Fab";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import ThemeProvider from "../../hooks/M3Theme";
import Draggable from "./Draggable";
import { SettingProvider } from "../../hooks/Setting";
import {
  MSG_OPEN_OPTIONS,
  MSG_OPEN_TRANBOX,
  MSG_POPUP_TOGGLE,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
} from "../../config";
import { useI18n } from "../../hooks/I18n";
import { isExt } from "../../libs/client";
import { sendBgMsg } from "../../libs/msg";
import useWindowSize from "../../hooks/WindowSize";
import { useFullscreenDetect } from "../../hooks/useFullscreenDetect";
import { ACTION_STYLES } from "./styles";

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
  fabConfig: { x: fabX, y: fabY, edge: fabEdge, fabClickAction = 0 } = {},
  processActions,
}) {
  const i18n = useI18n();
  const fabWidth = 56; // Material 3 regular FAB size.
  const opensMenu = fabClickAction !== 1;
  const windowSize = useWindowSize();
  const [moved, setMoved] = useState(false); // Track whether a drag occurred.
  const [showFab, setShowFab] = useState(true);
  const [open, setOpen] = useState(false); // Action menu visibility.
  const anchorRef = useRef(null);
  const { isVideoFullscreen } = useFullscreenDetect();

  useEffect(() => {
    setShowFab(!isVideoFullscreen);
    // Close the menu when video fullscreen hides the FAB,
    // preventing an orphaned panel that cannot be reached or dismissed.
    if (isVideoFullscreen) {
      setOpen(false);
    }
  }, [isVideoFullscreen]);

  // Handle the start of a drag.
  const handleStart = useCallback(() => {
    setMoved(false);
  }, []);

  // Handle movement during a drag.
  const handleMove = useCallback(() => {
    setMoved(true);
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) anchorRef.current?.focus();
  }, []);

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
    if (isExt) {
      sendBgMsg(MSG_OPEN_OPTIONS);
    } else {
      window.open(
        process.env.REACT_APP_OPTIONSPAGE,
        "_blank",
        "noopener,noreferrer"
      );
    }
    closeMenu(true);
  }, [closeMenu]);

  // Ignore clicks after dragging to prevent accidental activation.
  const handleClick = useCallback(() => {
    if (moved) {
      return;
    }
    // fabClickAction === 1 keeps the legacy direct translation action.
    if (!opensMenu) {
      runAction(MSG_TRANS_TOGGLE);
      return;
    }
    setOpen((current) => !current);
  }, [moved, opensMenu, runAction]);

  // Close the menu and return focus to the FAB before menu items unmount.
  const handleMenuKeyDown = useCallback(
    (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      event.preventDefault();
      closeMenu(true);
    },
    [closeMenu]
  );

  // Position the FAB at the viewport edge and vertical center on first load.
  const fabProps = useMemo(
    () => ({
      windowSize,
      width: fabWidth,
      height: fabWidth,
      left: fabX ?? -fabWidth,
      top: fabY ?? windowSize.h / 2,
      edge: fabEdge,
    }),
    [windowSize, fabWidth, fabX, fabY, fabEdge]
  );

  const items = [
    {
      label: i18n("popup_translate_page"),
      icon: TranslateRoundedIcon,
      action: () => runAction(MSG_TRANS_TOGGLE),
    },
    {
      label: i18n("text_style_alt"),
      icon: PaletteRoundedIcon,
      action: () => runAction(MSG_TRANS_TOGGLE_STYLE),
    },
    {
      label: i18n("selection_translate"),
      icon: SelectAllRoundedIcon,
      action: () => runAction(MSG_OPEN_TRANBOX),
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
  ];

  return (
    <Draggable
      key="fab"
      snapEdge // Keep the idle FAB partially hidden at the viewport edge.
      fitContent // The fixed menu must not be constrained by the 56px FAB wrapper.
      expanded={opensMenu && open} // Keep the anchor fully revealed while the menu is open.
      {...fabProps}
      show={showFab}
      onStart={handleStart}
      onMove={handleMove}
      handler={
        <Fab
          id="kt-content-fab-button"
          ref={anchorRef}
          className="kt-content-fab"
          aria-expanded={opensMenu ? open : undefined}
          aria-haspopup={opensMenu ? "menu" : undefined}
          aria-controls={opensMenu && open ? "kt-content-fab-menu" : undefined}
          aria-label={i18n("translate")}
          onClick={handleClick}
        >
          {opensMenu ? (
            <SpeedDialIcon
              icon={<TranslateIcon />}
              openIcon={<CloseRoundedIcon />}
              open={open}
            />
          ) : (
            <TranslateIcon />
          )}
        </Fab>
      }
    >
      <Popper
        open={opensMenu && open && Boolean(anchorRef.current)}
        anchorEl={anchorRef.current}
        placement="top-end"
        // Render inside the content page's shadow root to retain M3Theme styles;
        // a portal to document.body would escape that root.
        disablePortal
        popperOptions={{ strategy: "fixed" }}
        modifiers={FAB_POPPER_MODIFIERS}
      >
        <ClickAwayListener
          onClickAway={(event) => {
            // Let handleClick handle clicks on the FAB itself;
            // otherwise this closes the menu before handleClick reopens it.
            if (anchorRef.current?.contains(event.target)) {
              return;
            }
            setOpen(false);
          }}
        >
          <Paper className="kt-content-fab-menu" elevation={6}>
            <MenuList
              id="kt-content-fab-menu"
              aria-labelledby="kt-content-fab-button"
              autoFocusItem
              onKeyDown={handleMenuKeyDown}
            >
              {items.map(({ label, icon: Icon, action }) => (
                <MenuItem
                  className="kt-content-fab-menu__item"
                  onClick={action}
                  key={label}
                >
                  <ListItemIcon>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText>{label}</ListItemText>
                </MenuItem>
              ))}
            </MenuList>
          </Paper>
        </ClickAwayListener>
      </Popper>
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
