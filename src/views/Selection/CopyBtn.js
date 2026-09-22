import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import { useEffect, useRef, useState } from "react";

const VISUALLY_HIDDEN_STYLE = {
  width: 1,
  height: 1,
  position: "absolute",
  overflow: "hidden",
  padding: 0,
  margin: -1,
  border: 0,
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

/**
 * Icon-only copy action with accessible success feedback.
 *
 * @param {Object} props
 * @param {string} props.text Text written to the clipboard.
 * @param {string} [props.title="copy"] Accessible action label.
 * @param {string} [props.copiedLabel="Copied"] Live success message.
 */
export default function CopyBtn({
  text,
  title = "copy",
  copiedLabel = "Copied",
}) {
  // Keep the transient icon state separate from the button's action name.
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleClick = async (e) => {
    e.stopPropagation();
    const requestId = ++requestIdRef.current;
    await navigator.clipboard.writeText(text);
    if (!mountedRef.current || requestId !== requestIdRef.current) return;

    setCopied(true);

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = null;
    }, 500);
  };

  return (
    <>
      <IconButton
        size="small"
        sx={{
          opacity: 0.72,
          transition:
            "background-color .3s, color .3s, opacity 160ms ease, transform .15s",
          "&.Mui-focusVisible": {
            opacity: 1,
          },
          "@media (hover: hover)": {
            "&:hover": { opacity: 1 },
          },
        }}
        onClick={handleClick}
        title={title}
        aria-label={title}
      >
        {copied ? (
          <LibraryAddCheckIcon fontSize="inherit" />
        ) : (
          <ContentCopyIcon fontSize="inherit" />
        )}
      </IconButton>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={VISUALLY_HIDDEN_STYLE}
      >
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
