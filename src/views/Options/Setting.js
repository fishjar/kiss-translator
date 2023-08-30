import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import InputLabel from "@mui/material/InputLabel";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { useSetting } from "../../hooks/Setting";
import { limitNumber, debounce } from "../../libs/utils";
import { useI18n } from "../../hooks/I18n";
import { UI_LANGS } from "../../config";
import { useMemo } from "react";

export default function Settings() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();

  const handleChange = useMemo(
    () =>
      debounce((e) => {
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
          default:
        }
        updateSetting({
          [name]: value,
        });
      }, 500),
    [updateSetting]
  );

  if (!setting) {
    return;
  }

  const {
    uiLang,
    googleUrl,
    fetchLimit,
    fetchInterval,
    minLength,
    maxLength,
    openaiUrl,
    openaiKey,
    openaiModel,
    openaiPrompt,
    clearCache,
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

        <FormControl size="small">
          <InputLabel>{i18n("clear_cache")}</InputLabel>
          <Select
            name="clearCache"
            value={clearCache}
            label={i18n("clear_cache")}
            onChange={handleChange}
          >
            <MenuItem value={false}>{i18n("clear_cache_never")}</MenuItem>
            <MenuItem value={true}>{i18n("clear_cache_restart")}</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          label={i18n("google_api")}
          name="googleUrl"
          defaultValue={googleUrl}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("openai_api")}
          name="openaiUrl"
          defaultValue={openaiUrl}
          onChange={handleChange}
        />

        <TextField
          size="small"
          type="password"
          label={i18n("openai_key")}
          name="openaiKey"
          defaultValue={openaiKey}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("openai_model")}
          name="openaiModel"
          defaultValue={openaiModel}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("openai_prompt")}
          name="openaiPrompt"
          defaultValue={openaiPrompt}
          onChange={handleChange}
          multiline
        />
      </Stack>
    </Box>
  );
}
