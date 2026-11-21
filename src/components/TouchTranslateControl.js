import { supportsTouch } from "../libs/touchCapability";
import { useMemo, useRef } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useTouchState } from "../hooks/useTouchTranslateState";
import { useI18n } from "../hooks/I18n";
import { createMenuKeyDownHandler } from "../libs/menuFocus";

function ConnectedTouchControl({
  processActions,
  inlineFeedback = false,
  compact = false,
}) {
  const fieldRef = useRef(null);
  const navigateMenu = useMemo(
    () => createMenuKeyDownHandler({ shadowOnly: true, disableListWrap: true }),
    []
  );
  const i18n = useI18n();
  const { state, failed, saveFailed, pending, change } =
    useTouchState(processActions);
  if (!state || (!state.supported && state.mode === "off")) return null;
  return (
    <Stack
      spacing={compact ? 0 : 1}
      sx={compact ? { display: "contents" } : { p: 1 }}
      data-kiss-touch-ui
    >
      <TextField
        ref={fieldRef}
        sx={
          compact
            ? {
                minWidth: 0,
                "& .MuiSelect-select": {
                  py: 0,
                  pl: 1,
                  pr: "24px !important",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
                "& fieldset": { border: 0 },
              }
            : undefined
        }
        InputProps={
          compact
            ? {
                sx: {
                  height: 40,
                  minHeight: 40,
                  boxSizing: "border-box",
                  borderRadius: "12px",
                  background: "var(--kt-sf2)",
                  fontSize: 12,
                },
              }
            : undefined
        }
        SelectProps={{
          inputProps: {
            "aria-label": i18n("touch_paragraph"),
            title: i18n(
              state.mode === "off"
                ? "touch_off"
                : state.mode === "tap"
                  ? "touch_tap"
                  : state.direction === "left"
                    ? "touch_left"
                    : "touch_right"
            ),
          },
          MenuProps: {
            "data-kiss-touch-ui": true,
            // Keep styles in the shadow tree, outside the draggable transform.
            container: () =>
              fieldRef.current?.closest(".kt-m3-root") ||
              fieldRef.current?.ownerDocument.body,
            disableScrollLock: true,
            disableAutoFocus: true,
            disableEnforceFocus: true,
            MenuListProps: { onKeyDownCapture: navigateMenu },
            sx: { zIndex: 2147483647 },
            PaperProps: { "data-kiss-touch-ui": true },
          },
        }}
        select
        size="small"
        fullWidth
        label={compact ? undefined : i18n("touch_paragraph")}
        value={
          state.mode === "swipe"
            ? `swipe-${state.direction === "left" ? "left" : "right"}`
            : state.mode
        }
        disabled={
          pending ||
          ((!state.supported || state.blocked) && state.mode === "off")
        }
        onChange={(event) => {
          const [mode, direction] = event.target.value.split("-");
          change(mode, direction);
        }}
      >
        <MenuItem value="off">{i18n("touch_off")}</MenuItem>
        <MenuItem value="tap" disabled={!state.supported || state.blocked}>
          {i18n("touch_tap")}
        </MenuItem>
        {["right", "left"].map((direction) => (
          <MenuItem
            key={direction}
            value={`swipe-${direction}`}
            disabled={!state.supported || state.blocked}
          >
            {i18n(direction === "left" ? "touch_left" : "touch_right")}
          </MenuItem>
        ))}
      </TextField>
      {(failed || saveFailed || !state.supported || state.blocked) &&
        (inlineFeedback ? (
          <span
            role="status"
            className="kt-popup-action-error"
            style={compact ? { gridColumn: "1 / -1" } : undefined}
          >
            {i18n(
              saveFailed
                ? "touch_save_failed"
                : failed
                  ? "touch_failed"
                  : state.blocked
                    ? "touch_blocked"
                    : "touch_unsupported"
            )}
          </span>
        ) : (
          <Alert severity="info">
            {i18n(
              saveFailed
                ? "touch_save_failed"
                : failed
                  ? "touch_failed"
                  : state.blocked
                    ? "touch_blocked"
                    : "touch_unsupported"
            )}
          </Alert>
        ))}
    </Stack>
  );
}

export default function TouchTranslateControl(props) {
  return supportsTouch() ? <ConnectedTouchControl {...props} /> : null;
}
