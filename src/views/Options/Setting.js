import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import InputLabel from "@mui/material/InputLabel";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { useSetting, useSettingUpdate } from "../../hooks/Setting";
import { limitNumber } from "../../libs/utils";
import { useI18n } from "../../hooks/I18n";
import { UI_LANGS } from "../../config";

export default function Settings() {
  const i18n = useI18n();
  const setting = useSetting();
  const updateSetting = useSettingUpdate();

  if (!setting) {
    return;
  }

  const {
    uiLang,
    googleUrl,
    fetchLimit,
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
            value={uiLang}
            label={i18n("ui_lang")}
            onChange={(e) => {
              updateSetting({
                uiLang: e.target.value,
              });
            }}
          >
            {UI_LANGS.map(([lang, name]) => (
              <MenuItem value={lang}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label={i18n("fetch_limit")}
          type="number"
          defaultValue={fetchLimit}
          onChange={(e) => {
            updateSetting({
              fetchLimit: limitNumber(e.target.value, 1, 10),
            });
          }}
        />

        <FormControl size="small">
          <InputLabel>{i18n("clear_cache")}</InputLabel>
          <Select
            value={clearCache}
            label={i18n("clear_cache")}
            onChange={(e) => {
              updateSetting({
                clearCache: e.target.value,
              });
            }}
          >
            <MenuItem value={false}>{i18n("clear_cache_never")}</MenuItem>
            <MenuItem value={true}>{i18n("clear_cache_restart")}</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          label={i18n("google_api")}
          defaultValue={googleUrl}
          onChange={(e) => {
            updateSetting({
              googleUrl: e.target.value,
            });
          }}
        />

        <TextField
          size="small"
          label={i18n("openai_api")}
          defaultValue={openaiUrl}
          onChange={(e) => {
            updateSetting({
              openaiUrl: e.target.value,
            });
          }}
        />

        <TextField
          size="small"
          label={i18n("openai_key")}
          defaultValue={openaiKey}
          onChange={(e) => {
            updateSetting({
              openaiKey: e.target.value,
            });
          }}
        />

        <TextField
          size="small"
          label={i18n("openai_model")}
          defaultValue={openaiModel}
          onChange={(e) => {
            updateSetting({
              openaiModel: e.target.value,
            });
          }}
        />

        <TextField
          size="small"
          label={i18n("openai_prompt")}
          defaultValue={openaiPrompt}
          onChange={(e) => {
            updateSetting({
              openaiPrompt: e.target.value,
            });
          }}
          multiline
          minRows={2}
          maxRows={10}
        />
      </Stack>
    </Box>
  );
}
