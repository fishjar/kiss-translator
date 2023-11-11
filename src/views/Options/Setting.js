import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import InputLabel from "@mui/material/InputLabel";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import Link from "@mui/material/Link";
import FormHelperText from "@mui/material/FormHelperText";
import { useSetting } from "../../hooks/Setting";
import { limitNumber } from "../../libs/utils";
import { useI18n } from "../../hooks/I18n";
import { useAlert } from "../../hooks/Alert";
import { isExt } from "../../libs/client";
import Grid from "@mui/material/Grid";
import {
  UI_LANGS,
  TRANS_NEWLINE_LENGTH,
  CACHE_NAME,
  OPT_MOUSEKEY_ALL,
  OPT_MOUSEKEY_DISABLE,
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
} from "../../config";
import { useShortcut } from "../../hooks/Shortcut";
import ShortcutInput from "./ShortcutInput";
import { useFab } from "../../hooks/Fab";

function ShortcutItem({ action, label }) {
  const { shortcut, setShortcut } = useShortcut(action);
  return (
    <ShortcutInput value={shortcut} onChange={setShortcut} label={label} />
  );
}

export default function Settings() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const alert = useAlert();
  const { fab, updateFab } = useFab();

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    switch (name) {
      case "fetchLimit":
        value = limitNumber(value, 1, 100);
        break;
      case "fetchInterval":
        value = limitNumber(value, 0, 5000);
        break;
      case "minLength":
        value = limitNumber(value, 1, 100);
        break;
      case "maxLength":
        value = limitNumber(value, 100, 10000);
        break;
      case "newlineLength":
        value = limitNumber(value, 1, 1000);
        break;
      case "touchTranslate":
        value = limitNumber(value, 0, 3);
        break;
      default:
    }
    updateSetting({
      [name]: value,
    });
  };

  const handleClearCache = () => {
    try {
      caches.delete(CACHE_NAME);
      alert.success(i18n("clear_success"));
    } catch (err) {
      console.log("[clear cache]", err);
    }
  };

  const {
    uiLang,
    fetchLimit,
    fetchInterval,
    minLength,
    maxLength,
    clearCache,
    newlineLength = TRANS_NEWLINE_LENGTH,
    mouseKey = OPT_MOUSEKEY_DISABLE,
    detectRemote = false,
    touchTranslate = 2,
  } = setting;
  const { isHide = false } = fab || {};

  return (
    <Box>
      <Stack spacing={3}>
        <FormControl size="small">
          <InputLabel>{i18n("ui_lang")}</InputLabel>
          <Select
            name="uiLang"
            value={uiLang}
            label={i18n("ui_lang")}
            onChange={handleChange}
          >
            {UI_LANGS.map(([lang, name]) => (
              <MenuItem key={lang} value={lang}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label={i18n("fetch_limit")}
          type="number"
          name="fetchLimit"
          defaultValue={fetchLimit}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("fetch_interval")}
          type="number"
          name="fetchInterval"
          defaultValue={fetchInterval}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("min_translate_length")}
          type="number"
          name="minLength"
          defaultValue={minLength}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("max_translate_length")}
          type="number"
          name="maxLength"
          defaultValue={maxLength}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("num_of_newline_characters")}
          type="number"
          name="newlineLength"
          defaultValue={newlineLength}
          onChange={handleChange}
        />

        <FormControl size="small">
          <InputLabel>{i18n("mouseover_translation")}</InputLabel>
          <Select
            name="mouseKey"
            value={mouseKey}
            label={i18n("mouseover_translation")}
            onChange={handleChange}
          >
            {OPT_MOUSEKEY_ALL.map((item) => (
              <MenuItem key={item} value={item}>
                {i18n(item)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small">
          <InputLabel>{i18n("touch_translate_shortcut")}</InputLabel>
          <Select
            name="touchTranslate"
            value={touchTranslate}
            label={i18n("touch_translate_shortcut")}
            onChange={handleChange}
          >
            {[0, 2, 3].map((item) => (
              <MenuItem key={item} value={item}>
                {i18n(`touch_tap_${item}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small">
          <InputLabel>{i18n("hide_fab_button")}</InputLabel>
          <Select
            name="isHide"
            value={isHide}
            label={i18n("hide_fab_button")}
            onChange={(e) => {
              updateFab({ isHide: e.target.value });
            }}
          >
            <MenuItem value={false}>{i18n("show")}</MenuItem>
            <MenuItem value={true}>{i18n("hide")}</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small">
          <InputLabel>{i18n("detect_lang_remote")}</InputLabel>
          <Select
            name="detectRemote"
            value={detectRemote}
            label={i18n("detect_lang_remote")}
            onChange={handleChange}
          >
            <MenuItem value={false}>{i18n("disable")}</MenuItem>
            <MenuItem value={true}>{i18n("enable")}</MenuItem>
          </Select>
          <FormHelperText>{i18n("detect_lang_remote_help")}</FormHelperText>
        </FormControl>

        {isExt ? (
          <FormControl size="small">
            <InputLabel>{i18n("if_clear_cache")}</InputLabel>
            <Select
              name="clearCache"
              value={clearCache}
              label={i18n("if_clear_cache")}
              onChange={handleChange}
            >
              <MenuItem value={false}>{i18n("clear_cache_never")}</MenuItem>
              <MenuItem value={true}>{i18n("clear_cache_restart")}</MenuItem>
            </Select>
            <FormHelperText>
              <Link component="button" onClick={handleClearCache}>
                {i18n("clear_all_cache_now")}
              </Link>
            </FormHelperText>
          </FormControl>
        ) : (
          <>
            <Box>
              <Grid container spacing={2} columns={12}>
                <Grid item xs={12} sm={12} md={3} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_TRANSLATE}
                    label={i18n("toggle_translate_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={3} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_STYLE}
                    label={i18n("toggle_style_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={3} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_POPUP}
                    label={i18n("toggle_popup_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={3} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_SETTING}
                    label={i18n("open_setting_shortcut")}
                  />
                </Grid>
              </Grid>
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
