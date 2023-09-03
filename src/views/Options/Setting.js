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
import { apiTranslate } from "../../apis";
import { useAlert } from "../../hooks/Alert";
import {
  UI_LANGS,
  URL_KISS_PROXY,
  TRANS_NEWLINE_LENGTH,
  CACHE_NAME,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_DEEPL,
  OPT_TRANS_OPENAI,
} from "../../config";

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

  const handleApiTest = async (translator) => {
    try {
      const [text] = await apiTranslate({
        translator,
        q: "hello world",
        fromLang: "en",
        toLang: "zh-CN",
        setting,
      });
      if (!text) {
        throw new Error("empty reault");
      }
      alert.success(i18n("test_success"));
    } catch (err) {
      alert.error(`${i18n("test_failed")}: ${err.message}`);
    }
  };

  const {
    uiLang,
    googleUrl,
    fetchLimit,
    fetchInterval,
    minLength,
    maxLength,
    openaiUrl,
    deeplUrl = "",
    deeplKey = "",
    openaiKey,
    openaiModel,
    openaiPrompt,
    clearCache,
    newlineLength = TRANS_NEWLINE_LENGTH,
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
          label={
            <>
              {i18n("google_api")}
              {googleUrl && (
                <Link
                  sx={{ marginLeft: "1em" }}
                  component="button"
                  onClick={() => {
                    handleApiTest(OPT_TRANS_GOOGLE);
                  }}
                >
                  {i18n("click_test")}
                </Link>
              )}
            </>
          }
          name="googleUrl"
          value={googleUrl}
          onChange={handleChange}
          helperText={
            <Link href={URL_KISS_PROXY}>{i18n("about_api_proxy")}</Link>
          }
        />

        <TextField
          size="small"
          label={
            <>
              {i18n("deepl_api")}
              {deeplUrl && (
                <Link
                  sx={{ marginLeft: "1em" }}
                  component="button"
                  onClick={() => {
                    handleApiTest(OPT_TRANS_DEEPL);
                  }}
                >
                  {i18n("click_test")}
                </Link>
              )}
            </>
          }
          name="deeplUrl"
          value={deeplUrl}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("deepl_key")}
          name="deeplKey"
          value={deeplKey}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={
            <>
              {i18n("openai_api")}
              {openaiUrl && openaiPrompt && (
                <Link
                  sx={{ marginLeft: "1em" }}
                  component="button"
                  onClick={() => {
                    handleApiTest(OPT_TRANS_OPENAI);
                  }}
                >
                  {i18n("click_test")}
                </Link>
              )}
            </>
          }
          name="openaiUrl"
          value={openaiUrl}
          onChange={handleChange}
          helperText={
            <Link href={URL_KISS_PROXY}>{i18n("about_api_proxy")}</Link>
          }
        />

        <TextField
          size="small"
          type="password"
          label={i18n("openai_key")}
          name="openaiKey"
          value={openaiKey}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("openai_model")}
          name="openaiModel"
          value={openaiModel}
          onChange={handleChange}
        />

        <TextField
          size="small"
          label={i18n("openai_prompt")}
          name="openaiPrompt"
          value={openaiPrompt}
          onChange={handleChange}
          multiline
        />
      </Stack>
    </Box>
  );
}
