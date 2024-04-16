import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_TRANS_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_TRANBOX_TRIGGER_CLICK,
  OPT_TRANBOX_TRIGGER_ALL,
} from "../../config";
import ShortcutInput from "./ShortcutInput";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useCallback } from "react";
import { limitNumber } from "../../libs/utils";
import { useTranbox } from "../../hooks/Tranbox";
import { isExt } from "../../libs/client";

export default function Tranbox() {
  const i18n = useI18n();
  const { tranboxSetting, updateTranbox } = useTranbox();

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    switch (name) {
      case "btnOffsetX":
        value = limitNumber(value, 0, 100);
        break;
      case "btnOffsetY":
        value = limitNumber(value, 0, 100);
        break;
      default:
    }
    updateTranbox({
      [name]: value,
    });
  };

  const handleShortcutInput = useCallback(
    (val) => {
      updateTranbox({ tranboxShortcut: val });
    },
    [updateTranbox]
  );

  const {
    transOpen,
    translator,
    fromLang,
    toLang,
    toLang2 = "en",
    tranboxShortcut,
    btnOffsetX,
    btnOffsetY,
    hideTranBtn = false,
    hideClickAway = false,
    simpleStyle = false,
    triggerMode = OPT_TRANBOX_TRIGGER_CLICK,
  } = tranboxSetting;

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
                updateTranbox({ transOpen: !transOpen });
              }}
            />
          }
          label={i18n("toggle_selection_translate")}
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

        <TextField
          select
          size="small"
          name="toLang2"
          value={toLang2}
          label={i18n("to_lang2")}
          helperText={i18n("to_lang2_helper")}
          onChange={handleChange}
        >
          {[["none", "None"], ...OPT_LANGS_TO].map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>
              {name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label={i18n("tranbtn_offset_x")}
          type="number"
          name="btnOffsetX"
          defaultValue={btnOffsetX}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("tranbtn_offset_y")}
          type="number"
          name="btnOffsetY"
          defaultValue={btnOffsetY}
          onChange={handleChange}
        />

        <TextField
          select
          size="small"
          name="hideTranBtn"
          value={hideTranBtn}
          label={i18n("hide_tran_button")}
          onChange={handleChange}
        >
          <MenuItem value={false}>{i18n("show")}</MenuItem>
          <MenuItem value={true}>{i18n("hide")}</MenuItem>
        </TextField>

        <TextField
          select
          size="small"
          name="hideClickAway"
          value={hideClickAway}
          label={i18n("hide_click_away")}
          onChange={handleChange}
        >
          <MenuItem value={false}>{i18n("disable")}</MenuItem>
          <MenuItem value={true}>{i18n("enable")}</MenuItem>
        </TextField>

        <TextField
          select
          size="small"
          name="simpleStyle"
          value={simpleStyle}
          label={i18n("use_simple_style")}
          onChange={handleChange}
        >
          <MenuItem value={false}>{i18n("disable")}</MenuItem>
          <MenuItem value={true}>{i18n("enable")}</MenuItem>
        </TextField>

        <TextField
          select
          size="small"
          name="triggerMode"
          value={triggerMode}
          label={i18n("trigger_mode")}
          onChange={handleChange}
        >
          {OPT_TRANBOX_TRIGGER_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {i18n(`trigger_${item}`)}
            </MenuItem>
          ))}
        </TextField>

        {!isExt && (
          <ShortcutInput
            value={tranboxShortcut}
            onChange={handleShortcutInput}
            label={i18n("trigger_tranbox_shortcut")}
          />
        )}
      </Stack>
    </Box>
  );
}
