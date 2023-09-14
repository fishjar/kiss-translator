import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { limitNumber } from "../../libs/utils";
import { useI18n } from "../../hooks/I18n";
import { OPT_TRANS_ALL, OPT_LANGS_FROM, OPT_LANGS_TO } from "../../config";
import ShortcutInput from "./ShortcutInput";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useInputRule } from "../../hooks/InputRule";
import { useCallback } from "react";
import Grid from "@mui/material/Grid";
import Alert from "@mui/material/Alert";

export default function InputSetting() {
  const i18n = useI18n();
  const { inputRule, updateInputRule } = useInputRule();

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    console.log({ name, value });
    switch (name) {
      case "triggerCount":
        value = limitNumber(value, 1, 3);
        break;
      default:
    }
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
    translator,
    fromLang,
    toLang,
    triggerShortcut,
    triggerCount,
  } = inputRule;

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("input_translation_help")}</Alert>

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
          label={i18n("input_box_translation")}
        />

        <TextField
          select
          size="small"
          name="translator"
          value={translator}
          label={i18n("translate_service")}
          onChange={handleChange}
        >
          {OPT_TRANS_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
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

        <TextField
          select
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

        <Box>
          <Grid container rowSpacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ShortcutInput
                value={triggerShortcut}
                onChange={handleShortcutInput}
                label={i18n("trigger_trans_shortcut")}
                helperText={i18n("trigger_trans_shortcut_help")}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                size="small"
                fullWidth
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
          </Grid>
        </Box>
      </Stack>
    </Box>
  );
}
