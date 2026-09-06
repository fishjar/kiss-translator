import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";

/**
 * Floating trigger shown next to a page selection.
 *
 * @param {Object} props
 * @param {Function} props.onTrigger - Translation trigger callback.
 * @param {string} props.btnEvent - React event prop used for activation.
 * @param {Object} props.position - Final viewport coordinates as { x, y }.
 * @param {string} props.label - Accessible button label.
 */
export default function TranBtn({
  onTrigger,
  btnEvent,
  position,
  label = "Translate selection",
}) {
  const dynamicTriggerProps =
    btnEvent === "onClick" ? {} : { [btnEvent]: onTrigger };

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
