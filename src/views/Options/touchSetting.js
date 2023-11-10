import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
} from "../../config";
import Grid from "@mui/material/Grid";
import { limitNumber } from "../../libs/utils";
import { useTouch } from "../../hooks/Touch";

function TouchItem({ action, name }) {
  const i18n = useI18n();
  const { touchOperation, setTouchOperation } = useTouch(action);
  const [triggerShortcut, triggerCount, triggerTime] = touchOperation;

  const handleChangeShortcut = (e) => {
    const value = limitNumber(e.target.value, 0, 3);
    setTouchOperation(value, 0);
  };

  const handleChangeCount = (e) => {
    const value = limitNumber(e.target.value, 1, 3);
    setTouchOperation(value, 2);
  };

  const handleChangeTime = (e) => {
    const value = limitNumber(e.target.value, 100, 1000);
    setTouchOperation(value, 3);
  };

  return (
    <Box>
      <Grid container spacing={2} columns={12}>
        <Grid item xs={12} sm={12} md={4} lg={4}>
          <TextField
            select
            fullWidth
            size="small"
            name="triggerShortcut"
            value={triggerShortcut}
            label={i18n(name)}
            onChange={handleChangeShortcut}
          >
            {[0, 2, 3].map((val) => (
              <MenuItem key={val} value={val}>
                {i18n(`touch_tap_${val}`)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={12} md={4} lg={4}>
          <TextField
            select
            fullWidth
            size="small"
            name="triggerCount"
            value={triggerCount}
            label={i18n("shortcut_press_count")}
            onChange={handleChangeCount}
          >
            {[1, 2, 3].map((val) => (
              <MenuItem key={val} value={val}>
                {val}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={12} md={4} lg={4}>
          <TextField
            fullWidth
            size="small"
            label={i18n("combo_timeout")}
            type="number"
            name="triggerTime"
            defaultValue={triggerTime}
            onChange={handleChangeTime}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default function TouchSetting() {
  return (
    <Box>
      <Stack spacing={3}>
        <TouchItem
          action={OPT_SHORTCUT_TRANSLATE}
          name="toggle_translate_shortcut"
        />
        <TouchItem action={OPT_SHORTCUT_STYLE} name="toggle_style_shortcut" />
        <TouchItem action={OPT_SHORTCUT_POPUP} name="toggle_popup_shortcut" />
        <TouchItem action={OPT_SHORTCUT_SETTING} name="open_setting_shortcut" />
      </Stack>
    </Box>
  );
}
