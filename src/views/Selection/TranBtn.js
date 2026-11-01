import { useEffect, useRef } from "react";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";

/**
 * Floating trigger shown next to a page selection.
 *
 * @param {Object} props
 * @param {Function} props.onTrigger - Translation trigger callback.
 * @param {string} props.btnEvent - React event prop used for activation.
 * @param {Object} props.position - Final viewport coordinates as { x, y }.
 * @param {string} props.label - Accessible button label.
 * @param {number} props.hoverDelay - Milliseconds the pointer must rest on
 *   the button before a hover trigger fires; 0 fires immediately.
 */
export default function TranBtn({
  onTrigger,
  btnEvent,
  position,
  label = "Translate selection",
  hoverDelay = 0,
}) {
  const hoverTimer = useRef(null);

  // A pending hover trigger never outlives the button.
  useEffect(() => {
    return () => {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
      }
    };
  }, []);

  const isHoverTrigger = btnEvent === "onMouseOver";
  const delayedHover = isHoverTrigger && hoverDelay > 0;

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const handleHoverEnter = (event) => {
    // A mouseover from an inner element re-enters without resetting the wait.
    if (hoverTimer.current) {
      return;
    }
    if (hoverDelay > 0) {
      // Only a pointer that stays on the button for the whole delay
      // triggers the translation, so passing over it does not.
      hoverTimer.current = setTimeout(() => {
        hoverTimer.current = null;
        onTrigger(event);
      }, hoverDelay);
    } else {
      onTrigger(event);
    }
  };

  const dynamicTriggerProps = delayedHover
    ? {
        onMouseOver: handleHoverEnter,
        onMouseOut: clearHoverTimer,
      }
    : btnEvent === "onClick"
      ? {}
      : { [btnEvent]: onTrigger };

  const handleClick = (event) => {
    if (btnEvent === "onClick" || event.detail === 0) {
      onTrigger(event);
    }
  };

  return (
    <button
      type="button"
      className="KT-tranbtn"
      aria-label={label}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
      }}
      // Preserve the page selection while activating the trigger.
      onMouseDown={(e) => e.preventDefault()}
      {...dynamicTriggerProps}
      onClick={handleClick}
    >
      <TranslateRoundedIcon aria-hidden="true" />
    </button>
  );
}
