import { useEffect, useRef } from "react";
import Logo from "../../components/Logo";
import { normalizeTranbtnAppearance } from "../../config/tranbtn";

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
  btnSize,
  btnOpacity,
  preview = false,
  ...buttonProps
}) {
  const appearance = normalizeTranbtnAppearance({ btnSize, btnOpacity });
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

  const handleHoverLeave = (event) => {
    // mouseout also fires when the pointer moves from the button onto one of
    // its children (the icon), and that child's mouseover bubbles back here;
    // cancelling on every internal move would restart the wait. Only a real
    // leave of the button cancels the pending trigger.
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }
    clearHoverTimer();
  };

  const dynamicTriggerProps = delayedHover
    ? {
        onMouseOver: handleHoverEnter,
        onMouseOut: handleHoverLeave,
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
      {...buttonProps}
      type="button"
      className="KT-tranbtn"
      aria-label={label}
      style={{
        position: preview ? "relative" : "fixed",
        "--kt-tranbtn-size": `${appearance.btnSize}px`,
        "--kt-tranbtn-opacity": appearance.btnOpacity,
        left: position.x,
        top: position.y,
        zIndex: preview ? undefined : 2147483646,
      }}
      // Preserve the page selection while activating the trigger.
      onMouseDown={(e) => e.preventDefault()}
      {...dynamicTriggerProps}
      onClick={handleClick}
    >
      <Logo
        size={appearance.btnSize}
        style={{ pointerEvents: "none", borderRadius: "inherit" }}
      />
    </button>
  );
}
