import ThemeProvider from "../Popup/PopupTheme";
import Draggable from "./Draggable";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { SettingProvider } from "../../hooks/Setting";
import Header from "../Popup/Header";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import useWindowSize from "../../hooks/WindowSize";
import {
  EVENT_KISS_INNER,
  MSG_OPEN_OPTIONS,
  MSG_POPUP_TOGGLE,
} from "../../config";
import PopupCont from "../Popup/PopupCont";
import { isExt } from "../../libs/client";
import { sendBgMsg } from "../../libs/msg";
import { POPUP_STYLES } from "../Popup/styles";

/**
 * Main view for the floating content-page control panel.
 * Opens PopupCont in the page center to manage options and translation state.
 */
export default function Action({ translator, processActions }) {
  const [showPopup, setShowPopup] = useState(true); // Panel visibility.
  const [rule, setRule] = useState(translator.rule); // Cached page translation rule.
  const [setting, setSetting] = useState(translator.setting); // Cached global settings.
  const headerRef = useRef(null);
  const clearPanelFocusRef = useRef(null);
  const windowSize = useWindowSize();

  const panelRef = useCallback((panel) => {
    clearPanelFocusRef.current?.();
    clearPanelFocusRef.current = null;
    if (!panel) return;

    let previousFocus = document.activeElement;
    while (previousFocus?.shadowRoot?.activeElement) {
      previousFocus = previousFocus.shadowRoot.activeElement;
    }
    const header = headerRef.current;
    const frameId = window.requestAnimationFrame(() => {
      panel.focus();
    });

    // Ref detachment runs before the focused panel is removed from the DOM.
    clearPanelFocusRef.current = () => {
      window.cancelAnimationFrame(frameId);
      if (!previousFocus?.isConnected) return;

      let activeElement = document.activeElement;
      while (activeElement) {
        if (panel.contains(activeElement) || header?.contains(activeElement)) {
          previousFocus.focus?.();
          return;
        }
        activeElement = activeElement.shadowRoot?.activeElement;
      }
    };
  }, []);

  // Open the extension options page in a new browser tab.
  const handleOpenSetting = useCallback(() => {
    if (isExt) {
      sendBgMsg(MSG_OPEN_OPTIONS);
    } else {
      window.open(
        process.env.REACT_APP_OPTIONSPAGE,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }, []);

  // Keep this panel's controls and portals inside the same click boundary.
  useEffect(() => {
    const handleWindowClick = (event) => {
      const popupRoot = headerRef.current?.closest(".kt-m3-root");
      // A menu opened on mousedown can move mouseup onto its backdrop, making
      // the browser dispatch click on their shared theme root instead.
      if (popupRoot && event.composedPath().includes(popupRoot)) return;
      setShowPopup(false);
    };
    window.addEventListener("click", handleWindowClick);
    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  // Subscribe to internal messages that toggle the panel.
  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_POPUP_TOGGLE) {
        setShowPopup((pre) => !pre);
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, []);

  // Refresh the active translation rule and settings when the panel opens.
  useEffect(() => {
    if (showPopup) {
      setRule(translator.rule);
      setSetting(translator.setting);
    }
  }, [showPopup, translator]);

  // Size and center the panel within the current viewport.
  const popProps = useMemo(() => {
    const width = Math.min(windowSize.w, 360);
    const height = Math.min(windowSize.h, 442);
    const left = (windowSize.w - width) / 2;
    const top = (windowSize.h - height) / 2;
    return {
      windowSize,
      width,
      height,
      left,
      top,
    };
  }, [windowSize]);

  return (
    <SettingProvider context="contentPopup">
      <ThemeProvider>
        <style>{POPUP_STYLES}</style>
        {showPopup && (
          <Draggable
            key="pop"
            {...popProps}
            usePaper // Use a paper background with a shadow.
            handler={
              // Drag the panel from its header.
              <Box ref={headerRef} style={{ cursor: "move" }}>
                <Header
                  onClose={() => {
                    setShowPopup(false);
                  }}
                />
                <Divider />
              </Box>
            }
          >
            <Box
              ref={panelRef}
              className="kt-popup-shell kt-popup-shell--content"
              role="dialog"
              aria-label={process.env.REACT_APP_NAME || "KISS Translator"}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowPopup(false);
                }
              }}
              style={{
                maxHeight: Math.max(0, popProps.height - 57),
                overflowY: "auto",
              }}
            >
              <PopupCont
                rule={rule}
                setting={setting}
                setRule={setRule}
                setSetting={setSetting}
                handleOpenSetting={handleOpenSetting}
                processActions={processActions}
                isContent={true} // Identify the panel embedded in the page content.
              />
            </Box>
          </Draggable>
        )}
      </ThemeProvider>
    </SettingProvider>
  );
}
