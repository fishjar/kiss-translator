import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Link from "@mui/material/Link";
import { useSetting } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import { useAlert } from "../../hooks/Alert";
import { isExt } from "../../libs/client";
import Grid from "@mui/material/Grid";
import Alert from "@mui/material/Alert";
import {
  UI_LANGS,
  TRANS_NEWLINE_LENGTH,
  CACHE_NAME,
  OPT_LANGDETECTOR_ALL,
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
  DEFAULT_BLACKLIST,
  DEFAULT_CSPLIST,
  DEFAULT_ORILIST,
  MSG_CONTEXT_MENUS,
  MSG_UPDATE_CSP,
  DEFAULT_HTTP_TIMEOUT,
  OPT_LANGS_TO,
} from "../../config";
import { useShortcut } from "../../hooks/Shortcut";
import ShortcutInput from "./ShortcutInput";
import { useFab } from "../../hooks/Fab";
import { sendBgMsg } from "../../libs/msg";
import { kissLog, LogLevel } from "../../libs/log";
import UploadButton from "./UploadButton";
import DownloadButton from "./DownloadButton";
import { getSettingOld } from "../../libs/storage";
import ValidationInput from "../../hooks/ValidationInput";

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
      case "contextMenuType":
        isExt && sendBgMsg(MSG_CONTEXT_MENUS, value);
        break;
      case "csplist":
        isExt && sendBgMsg(MSG_UPDATE_CSP, { csplist: value });
        break;
      case "orilist":
        isExt && sendBgMsg(MSG_UPDATE_CSP, { orilist: value });
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
      kissLog("clear cache", err);
    }
  };

  const handleImport = async (data) => {
    try {
      updateSetting(JSON.parse(data));
    } catch (err) {
      kissLog("import setting", err);
    }
  };

  const {
    uiLang,
    minLength,
    maxLength,
    clearCache,
    newlineLength = TRANS_NEWLINE_LENGTH,
    httpTimeout = DEFAULT_HTTP_TIMEOUT,
    contextMenuType = 1,
    touchTranslate = 2,
    blacklist = DEFAULT_BLACKLIST.join(",\n"),
    csplist = DEFAULT_CSPLIST.join(",\n"),
    orilist = DEFAULT_ORILIST.join(",\n"),
    transInterval = 100,
    langDetector = "-",
    logLevel = 1,
    preInit = true,
    skipLangs = [],
    // detectRemote = true,
    transAllnow = false,
  } = setting;
  const { isHide = false, fabClickAction = 0 } = fab || {};

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("setting_helper")}</Alert>

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
            fileName={`kiss-setting_v2_${Date.now()}.json`}
          />
          <DownloadButton
            handleData={async () =>
              JSON.stringify(await getSettingOld(), null, 2)
            }
            text={i18n("export_old")}
            fileName={`kiss-setting_v1_${Date.now()}.json`}
          />
        </Stack>

        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
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
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="preInit"
                value={preInit}
                label={i18n("if_pre_init")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="isHide"
                value={isHide}
                label={i18n("hide_fab_button")}
                onChange={(e) => {
                  updateFab({ isHide: e.target.value });
                }}
              >
                <MenuItem value={false}>{i18n("show")}</MenuItem>
                <MenuItem value={true}>{i18n("hide")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="fabClickAction"
                value={fabClickAction}
                label={i18n("fab_click_action")}
                onChange={(e) => updateFab({ fabClickAction: e.target.value })}
              >
                <MenuItem value={0}>{i18n("fab_click_menu")}</MenuItem>
                <MenuItem value={1}>{i18n("fab_click_translate")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("min_translate_length")}
                type="number"
                name="minLength"
                value={minLength}
                onChange={handleChange}
                min={1}
                max={100}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("max_translate_length")}
                type="number"
                name="maxLength"
                value={maxLength}
                onChange={handleChange}
                min={100}
                max={100000}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("num_of_newline_characters")}
                type="number"
                name="newlineLength"
                value={newlineLength}
                onChange={handleChange}
                min={1}
                max={1000}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("translate_interval")}
                type="number"
                name="transInterval"
                value={transInterval}
                onChange={handleChange}
                min={10}
                max={2000}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("http_timeout")}
                type="number"
                name="httpTimeout"
                value={httpTimeout}
                onChange={handleChange}
                min={5000}
                max={60000}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
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
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="contextMenuType"
                value={contextMenuType}
                label={i18n("context_menus")}
                onChange={handleChange}
              >
                <MenuItem value={0}>{i18n("hide_context_menus")}</MenuItem>
                <MenuItem value={1}>{i18n("simple_context_menus")}</MenuItem>
                <MenuItem value={2}>{i18n("secondary_context_menus")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="transAllnow"
                value={transAllnow}
                label={i18n("trigger_mode")}
                onChange={handleChange}
              >
                <MenuItem value={false}>{i18n("mk_pagescroll")}</MenuItem>
                <MenuItem value={true}>{i18n("mk_pageopen")}</MenuItem>
              </TextField>
            </Grid>
            {/* <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                size="small"
                fullWidth
                name="detectRemote"
                value={detectRemote}
                label={i18n("detect_lang_remote")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid> */}
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="langDetector"
                value={langDetector}
                label={i18n("detected_lang")}
                onChange={handleChange}
              >
                <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                {OPT_LANGDETECTOR_ALL.map((item) => (
                  <MenuItem value={item} key={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="logLevel"
                value={logLevel}
                label={i18n("log_level")}
                onChange={handleChange}
              >
                {Object.values(LogLevel).map(({ value, name }) => (
                  <MenuItem value={value} key={value}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Box>

        <TextField
          select
          size="small"
          label={i18n("skip_langs")}
          helperText={i18n("skip_langs_helper")}
          name="skipLangs"
          value={skipLangs}
          onChange={handleChange}
          SelectProps={{
            multiple: true,
          }}
        >
          {OPT_LANGS_TO.map(([langKey, langName]) => (
            <MenuItem key={langKey} value={langKey}>
              {langName}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label={i18n("translate_blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          value={blacklist}
          onChange={handleChange}
          maxRows={10}
          multiline
        />

        {isExt ? (
          <>
            <TextField
              select
              fullWidth
              size="small"
              name="clearCache"
              value={clearCache}
              label={i18n("if_clear_cache")}
              onChange={handleChange}
              helperText={
                <Link component="button" onClick={handleClearCache}>
                  {i18n("clear_all_cache_now")}
                </Link>
              }
            >
              <MenuItem value={false}>{i18n("clear_cache_never")}</MenuItem>
              <MenuItem value={true}>{i18n("clear_cache_restart")}</MenuItem>
            </TextField>

            <TextField
              size="small"
              label={i18n("disabled_orilist")}
              helperText={i18n("pattern_helper")}
              name="orilist"
              value={orilist}
              onChange={handleChange}
              multiline
            />
            <TextField
              size="small"
              label={i18n("disabled_csplist")}
              helperText={
                i18n("pattern_helper") + " " + i18n("disabled_csplist_helper")
              }
              name="csplist"
              value={csplist}
              onChange={handleChange}
              multiline
            />
          </>
        ) : (
          <>
            <Box>
              <Grid container spacing={2} columns={12}>
                <Grid item xs={12} sm={12} md={6} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_TRANSLATE}
                    label={i18n("toggle_translate_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_STYLE}
                    label={i18n("toggle_style_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={3}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_POPUP}
                    label={i18n("toggle_popup_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={3}>
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
