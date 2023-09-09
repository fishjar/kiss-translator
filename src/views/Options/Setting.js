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
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
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
} from "../../config";
import { useEffect, useState, useRef } from "react";
import { useShortcut } from "../../hooks/Shortcut";
import { shortcutListener } from "../../libs/shortcut";

function ShortcutItem({ action, label }) {
  const { shortcut, setShortcut } = useShortcut(action);
  const [disabled, setDisabled] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    if (disabled) {
      return;
    }

    inputRef.current.focus();
    setShortcut([]);

    const clearShortcut = shortcutListener((curkeys, allkeys) => {
      setShortcut(allkeys);
      if (curkeys.length === 0) {
        setDisabled(true);
      }
    }, inputRef.current);

    return () => {
      clearShortcut();
    };
  }, [disabled, setShortcut]);

  return (
    <Stack direction="row">
      <TextField
        size="small"
        label={label}
        name={label}
        value={shortcut.join(" + ")}
        fullWidth
        inputRef={inputRef}
        disabled={disabled}
        onBlur={() => {
          setDisabled(true);
        }}
      />
      <IconButton
        onClick={() => {
          setDisabled(false);
        }}
      >
        {<EditIcon />}
      </IconButton>
    </Stack>
  );
}

export default function Settings() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const alert = useAlert();

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
  } = setting;

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
          value={fetchLimit}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("fetch_interval")}
          type="number"
          name="fetchInterval"
          value={fetchInterval}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("min_translate_length")}
          type="number"
          name="minLength"
          value={minLength}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("max_translate_length")}
          type="number"
          name="maxLength"
          value={maxLength}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("num_of_newline_characters")}
          type="number"
          name="newlineLength"
          value={newlineLength}
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
          <Grid container rowSpacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={4} lg={4}>
              <ShortcutItem
                action={OPT_SHORTCUT_TRANSLATE}
                label={i18n("toggle_translate_shortcut")}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={4} lg={4}>
              <ShortcutItem
                action={OPT_SHORTCUT_STYLE}
                label={i18n("toggle_style_shortcut")}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={4} lg={4}>
              <ShortcutItem
                action={OPT_SHORTCUT_POPUP}
                label={i18n("toggle_popup_shortcut")}
              />
            </Grid>
          </Grid>
        )}
      </Stack>
    </Box>
  );
}
