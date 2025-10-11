import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_INPUT_TRANS_SIGNS,
} from "../../config";
import ShortcutInput from "./ShortcutInput";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useInputRule } from "../../hooks/InputRule";
import { useCallback } from "react";
import Grid from "@mui/material/Grid";
import { useApiList } from "../../hooks/Api";
import ValidationInput from "../../hooks/ValidationInput";

export default function InputSetting() {
  const i18n = useI18n();
  const { inputRule, updateInputRule } = useInputRule();
  const { enabledApis } = useApiList();

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    updateInputRule({
      [name]: value,
    });
  };

  const handleShortcutInput = useCallback(
    (val) => {
      updateInputRule({ triggerShortcut: val });
    },
    [updateInputRule]
  );

  const {
    transOpen,
    apiSlug,
    fromLang,
    toLang,
    triggerShortcut,
    triggerCount,
    triggerTime,
    transSign,
  } = inputRule;

  return (
    <Box>
      <Stack spacing={3}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              name="transOpen"
              checked={transOpen}
              onChange={() => {
                updateInputRule({ transOpen: !transOpen });
              }}
            />
          }
          label={i18n("use_input_box_translation")}
          sx={{ width: "fit-content" }}
        />

        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="apiSlug"
                value={apiSlug}
                label={i18n("translate_service")}
                onChange={handleChange}
              >
                {enabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="fromLang"
                value={fromLang}
                label={i18n("from_lang")}
                onChange={handleChange}
              >
                {OPT_LANGS_FROM.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="toLang"
                value={toLang}
                label={i18n("to_lang")}
                onChange={handleChange}
              >
                {OPT_LANGS_TO.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="transSign"
                value={transSign}
                label={i18n("input_trans_start_sign")}
                onChange={handleChange}
                helperText={i18n("input_trans_start_sign_help")}
              >
                <MenuItem value={""}>{i18n("style_none")}</MenuItem>
                {OPT_INPUT_TRANS_SIGNS.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Box>

        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ShortcutInput
                value={triggerShortcut}
                onChange={handleShortcutInput}
                label={i18n("trigger_trans_shortcut")}
                helperText={i18n("trigger_trans_shortcut_help")}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="triggerCount"
                value={triggerCount}
                label={i18n("shortcut_press_count")}
                onChange={handleChange}
              >
                {[1, 2, 3, 4, 5].map((val) => (
                  <MenuItem key={val} value={val}>
                    {val}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("combo_timeout")}
                type="number"
                name="triggerTime"
                value={triggerTime}
                onChange={handleChange}
                min={10}
                max={1000}
              />
            </Grid>
          </Grid>
        </Box>
      </Stack>
    </Box>
  );
}
