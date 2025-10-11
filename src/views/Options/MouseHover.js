import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import ShortcutInput from "./ShortcutInput";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useMouseHoverSetting } from "../../hooks/MouseHover";
import { useCallback } from "react";
import Grid from "@mui/material/Grid";
import { DEFAULT_MOUSEHOVER_KEY } from "../../config";

export default function MouseHoverSetting() {
  const i18n = useI18n();
  const { mouseHoverSetting, updateMouseHoverSetting } = useMouseHoverSetting();

  const handleShortcutInput = useCallback(
    (val) => {
      updateMouseHoverSetting({ mouseHoverKey: val });
    },
    [updateMouseHoverSetting]
  );

  const { useMouseHover = true, mouseHoverKey = DEFAULT_MOUSEHOVER_KEY } =
    mouseHoverSetting;

  return (
    <Box>
      <Stack spacing={3}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              name="useMouseHover"
              checked={useMouseHover}
              onChange={() => {
                updateMouseHoverSetting({ useMouseHover: !useMouseHover });
              }}
            />
          }
          label={i18n("use_mousehover_translation")}
          sx={{ width: "fit-content" }}
        />

        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={4} lg={4}>
              <ShortcutInput
                value={mouseHoverKey}
                onChange={handleShortcutInput}
                label={i18n("trigger_trans_shortcut")}
                helperText={i18n("mousehover_key_help")}
              />
            </Grid>
          </Grid>
        </Box>
      </Stack>
    </Box>
  );
}
