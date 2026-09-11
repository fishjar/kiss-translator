import { useEffect } from "react";
import { MSG_UPDATE_SEPARATE_WINDOW_BOUNDS } from "../config/msg";
import { browser } from "../libs/browser";
import { sendBgMsg } from "../libs/msg";

const BOUNDS_CHECK_INTERVAL = 250;

const readWindowGeometry = () => [
  window.screenX,
  window.screenY,
  window.outerWidth,
  window.outerHeight,
];

/**
 * Keep the background's saved bounds current while a separate popup is mounted.
 * The background reads the real browser window bounds instead of trusting page
 * dimensions, which can differ because of zoom and platform window decorations.
 */
export function useSeparateWindowBounds(enabled) {
  useEffect(() => {
    if (!enabled || typeof browser?.windows?.getCurrent !== "function") {
      return undefined;
    }

    let active = true;
    let windowId;
    let pollTimer;
    let lastGeometry = readWindowGeometry();
    let updateInFlight = false;
    let updatePending = false;

    const updateBounds = async () => {
      if (!active || windowId === undefined) return;
      if (updateInFlight) {
        updatePending = true;
        return;
      }

      updateInFlight = true;
      try {
        await sendBgMsg(MSG_UPDATE_SEPARATE_WINDOW_BOUNDS, { windowId });
      } catch {
        // A closing window or restarting background can reject this request.
      } finally {
        updateInFlight = false;
        if (active && updatePending) {
          updatePending = false;
          void updateBounds();
        }
      }
    };

    const checkBounds = () => {
      if (!active) return;
      const geometry = readWindowGeometry();
      if (geometry.every((value, index) => value === lastGeometry[index]))
        return;
      lastGeometry = geometry;
      void updateBounds();
    };

    const initialize = async () => {
      try {
        const currentWindow = await browser.windows.getCurrent();
        if (
          !active ||
          currentWindow?.type !== "popup" ||
          !Number.isInteger(currentWindow.id) ||
          currentWindow.id < 0
        ) {
          return;
        }

        windowId = currentWindow.id;
        window.addEventListener("resize", checkBounds);
        if (
          typeof browser.windows.onBoundsChanged?.addListener !== "function"
        ) {
          // Older browsers need polling to notice moves without resize events.
          pollTimer = window.setInterval(checkBounds, BOUNDS_CHECK_INTERVAL);
        }
        checkBounds();
      } catch {
        // Previews and discarded extension contexts may lack a usable window.
      }
    };

    void initialize();

    return () => {
      active = false;
      updatePending = false;
      window.removeEventListener("resize", checkBounds);
      window.clearInterval(pollTimer);
    };
  }, [enabled]);
}
