import { supportsTouch } from "../libs/touchCapability";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import {
  EVENT_KISS_INNER,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
} from "../config";
import { sendTabMsg } from "../libs/msg";
import { useMouseHoverSetting } from "../hooks/MouseHover";
import { useI18n } from "../hooks/I18n";
import { SettingProvider } from "../hooks/Setting";
import ThemeProvider from "../hooks/M3Theme";
import { createMenuKeyDownHandler } from "../libs/menuFocus";

function useTouchState(processActions) {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const { updateMouseHoverSetting } = useMouseHoverSetting();
  const dispatch = useCallback(
    async (action, args) => {
      try {
        const result = processActions
          ? await processActions({ action, args })
          : await sendTabMsg(action, args, { frameId: 0 });
        if (!result?.touchTranslate)
          throw new Error("Missing touch translation state");
        if (
          action === MSG_TOUCH_TRANSLATE_MODE_SET &&
          result.touchTranslate.mode !== args.mode
        )
          throw new Error("Page rejected touch mode");
        setState(result.touchTranslate);
        setFailed(false);
        return result.touchTranslate;
      } catch {
        if (action === MSG_TOUCH_TRANSLATE_MODE_SET) setFailed(true);
        return null;
      }
    },
    [processActions]
  );
  useEffect(() => {
    dispatch(MSG_TOUCH_TRANSLATE_STATE);
    const update = (event) => {
      if (
        event.detail?.action === MSG_TOUCH_TRANSLATE_STATE &&
        event.detail?.touchTranslate
      ) {
        setState(event.detail.touchTranslate);
      }
    };
    document.addEventListener(EVENT_KISS_INNER, update);
    return () => document.removeEventListener(EVENT_KISS_INNER, update);
  }, [dispatch]);
  const change = async (mode) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setSaveFailed(false);
    try {
      const result = await dispatch(MSG_TOUCH_TRANSLATE_MODE_SET, { mode });
      if (result?.mode === mode) {
        try {
          await updateMouseHoverSetting({ touchMode: mode });
        } catch {
          setSaveFailed(true);
        }
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  return { state, failed, saveFailed, pending, change };
}

function ConnectedTouchControl({ processActions, inlineFeedback = false }) {
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
    <Stack spacing={1} sx={{ p: 1 }} data-kiss-touch-ui>
      <TextField
        ref={fieldRef}
        SelectProps={{
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
        label={i18n("touch_paragraph")}
        value={state.mode}
        disabled={
          pending ||
          ((!state.supported || state.blocked) && state.mode === "off")
        }
        onChange={(event) => change(event.target.value)}
      >
        <MenuItem value="off">{i18n("touch_off")}</MenuItem>
        <MenuItem value="tap" disabled={!state.supported || state.blocked}>
          {i18n("touch_tap")}
        </MenuItem>
        <MenuItem value="swipe" disabled={!state.supported || state.blocked}>
          {i18n(state.direction === "left" ? "touch_left" : "touch_right")}
        </MenuItem>
      </TextField>
      {(failed || saveFailed || !state.supported || state.blocked) &&
        (inlineFeedback ? (
          <span role="status" className="kt-popup-action-error">
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

function Status({ processActions }) {
  const i18n = useI18n();
  const { state, change, failed, saveFailed, pending } =
    useTouchState(processActions);
  if (!state || (state.mode === "off" && !pending && !saveFailed)) return null;
  return (
    <Paper
      role="status"
      data-kiss-touch-ui
      elevation={3}
      sx={{
        position: "fixed",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        zIndex: 2147483647,
        left: "50%",
        transform: "translateX(-50%)",
        p: 1,
        borderRadius: 3,
        maxWidth: "calc(100vw - 24px)",
        width: "max-content",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <span>
          {i18n(
            state.mode === "off"
              ? "touch_off"
              : state.mode === "tap"
                ? "touch_tap"
                : state.direction === "left"
                  ? "touch_left"
                  : "touch_right"
          )}
        </span>
        <Button disabled={pending} onClick={() => change("off")}>
          {i18n("touch_exit")}
        </Button>
      </Stack>
      {failed && <Alert severity="error">{i18n("touch_failed")}</Alert>}
      {saveFailed && (
        <Alert severity="error">{i18n("touch_save_failed")}</Alert>
      )}
    </Paper>
  );
}

export function TouchTranslateStatus(props) {
  return (
    <SettingProvider context="touchStatus">
      <ThemeProvider>
        <Status {...props} />
      </ThemeProvider>
    </SettingProvider>
  );
}
