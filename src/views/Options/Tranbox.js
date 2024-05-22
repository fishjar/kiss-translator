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
  OPT_DICT_BAIDU,
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
      case "btnOffsetY":
      case "boxOffsetX":
      case "boxOffsetY":
        value = limitNumber(value, -200, 200);
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
    boxOffsetX = 0,
    boxOffsetY = 10,
    hideTranBtn = false,
    hideClickAway = false,
    simpleStyle = false,
    followSelection = false,
    triggerMode = OPT_TRANBOX_TRIGGER_CLICK,
    extStyles = "",
    enDict = OPT_DICT_BAIDU,
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
          select
          size="small"
          name="enDict"
          value={enDict}
          label={i18n("english_dict")}
          onChange={handleChange}
        >
          <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
          <MenuItem value={OPT_DICT_BAIDU}>{OPT_DICT_BAIDU}</MenuItem>
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
          size="small"
          label={i18n("tranbox_offset_x")}
          type="number"
          name="boxOffsetX"
          defaultValue={boxOffsetX}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("tranbox_offset_y")}
          type="number"
          name="boxOffsetY"
          defaultValue={boxOffsetY}
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
          name="followSelection"
          value={followSelection}
          label={i18n("follow_selection")}
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

        <TextField
          size="small"
          label={i18n("extend_styles")}
          name="extStyles"
          defaultValue={extStyles}
          onChange={handleChange}
          maxRows={10}
          multiline
        />

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
