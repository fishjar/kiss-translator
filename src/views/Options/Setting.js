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
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
  DEFAULT_BLACKLIST,
  DEFAULT_CSPLIST,
  MSG_CONTEXT_MENUS,
  MSG_UPDATE_CSP,
} from "../../config";
import { useShortcut } from "../../hooks/Shortcut";
import ShortcutInput from "./ShortcutInput";
import { useFab } from "../../hooks/Fab";
import { sendBgMsg } from "../../libs/msg";
import { kissLog } from "../../libs/log";
import UploadButton from "./UploadButton";
import DownloadButton from "./DownloadButton";

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
      case "transInterval":
        value = limitNumber(value, 100, 5000);
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
        value = limitNumber(value, 0, 4);
        break;
      case "contextMenuType":
        isExt && sendBgMsg(MSG_CONTEXT_MENUS, value);
        break;
      case "csplist":
        isExt && sendBgMsg(MSG_UPDATE_CSP, value);
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
      kissLog(err, "clear cache");
    }
  };

  const handleImport = async (data) => {
    try {
      await updateSetting(JSON.parse(data));
    } catch (err) {
      kissLog(err, "import setting");
    }
  };

  const {
    uiLang,
    minLength,
    maxLength,
    clearCache,
    newlineLength = TRANS_NEWLINE_LENGTH,
    contextMenuType = 1,
    touchTranslate = 2,
    blacklist = DEFAULT_BLACKLIST.join(",\n"),
    csplist = DEFAULT_CSPLIST.join(",\n"),
    transInterval = 500,
  } = setting;
  const { isHide = false } = fab || {};

  return (
    <Box>
      <Stack spacing={3}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          <UploadButton text={i18n("import")} handleImport={handleImport} />
          <DownloadButton
            handleData={() => JSON.stringify(setting, null, 2)}
            text={i18n("export")}
            fileName={`kiss-setting_${Date.now()}.json`}
          />
        </Stack>

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

        <TextField
          size="small"
          label={i18n("translate_interval")}
          type="number"
          name="transInterval"
          defaultValue={transInterval}
          onChange={handleChange}
        />

        <FormControl size="small">
          <InputLabel>{i18n("touch_translate_shortcut")}</InputLabel>
          <Select
            name="touchTranslate"
            value={touchTranslate}
            label={i18n("touch_translate_shortcut")}
            onChange={handleChange}
          >
            {[0, 2, 3, 4].map((item) => (
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
          <InputLabel>{i18n("context_menus")}</InputLabel>
          <Select
            name="contextMenuType"
            value={contextMenuType}
            label={i18n("context_menus")}
            onChange={handleChange}
          >
            <MenuItem value={0}>{i18n("hide_context_menus")}</MenuItem>
            <MenuItem value={1}>{i18n("simple_context_menus")}</MenuItem>
            <MenuItem value={2}>{i18n("secondary_context_menus")}</MenuItem>
          </Select>
        </FormControl>

        {isExt ? (
          <>
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

            <TextField
              size="small"
              label={i18n("disabled_csplist")}
              helperText={
                i18n("pattern_helper") + " " + i18n("disabled_csplist_helper")
              }
              name="csplist"
              defaultValue={csplist}
              onChange={handleChange}
              multiline
            />
          </>
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

        <TextField
          size="small"
          label={i18n("translate_blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          defaultValue={blacklist}
          onChange={handleChange}
          maxRows={10}
          multiline
        />
      </Stack>
    </Box>
  );
}
