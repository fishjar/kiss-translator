import { supportsTouch } from "../libs/touchCapability";
import { useCallback, useEffect, useState } from "react";
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

function useTouchState(processActions) {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
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
  return { state, failed, dispatch };
}

function ConnectedTouchControl({ processActions }) {
  const i18n = useI18n();
  const { state, failed, dispatch } = useTouchState(processActions);
  const { updateMouseHoverSetting } = useMouseHoverSetting();
  const [pending, setPending] = useState(false);
  const change = async (mode) => {
    setPending(true);
    try {
      const result = await dispatch(MSG_TOUCH_TRANSLATE_MODE_SET, { mode });
      if (mode !== "off" && result?.mode === mode)
        await updateMouseHoverSetting({ touchMode: mode });
    } finally {
      setPending(false);
    }
  };
  if (!state || (!state.supported && state.mode === "off")) return null;
  return (
    <Stack spacing={1} sx={{ p: 1 }} data-kiss-touch-ui>
      <TextField
        SelectProps={{
          MenuProps: { PaperProps: { "data-kiss-touch-ui": true } },
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
      {(failed || !state.supported || state.blocked) && (
        <Alert severity="info">
          {i18n(
            failed
              ? "touch_failed"
              : state.blocked
                ? "touch_blocked"
                : "touch_unsupported"
          )}
        </Alert>
      )}
    </Stack>
  );
}

export default function TouchTranslateControl(props) {
  return supportsTouch() ? <ConnectedTouchControl {...props} /> : null;
}

function Status({ processActions }) {
  const i18n = useI18n();
  const { state, dispatch, failed } = useTouchState(processActions);
  if (!state || state.mode === "off") return null;
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
            state.mode === "tap"
              ? "touch_tap"
              : state.direction === "left"
                ? "touch_left"
                : "touch_right"
          )}
        </span>
        <Button
          onClick={() =>
            dispatch(MSG_TOUCH_TRANSLATE_MODE_SET, { mode: "off" })
          }
        >
          {i18n("touch_exit")}
        </Button>
      </Stack>
      {failed && <Alert severity="error">{i18n("touch_failed")}</Alert>}
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
