import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import { useI18n } from "../../hooks/I18n";
import { OPT_LANGS_TO } from "../../config";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import { useSubtitle } from "../../hooks/Subtitle";
import { useApiList } from "../../hooks/Api";
import ValidationInput from "../../hooks/ValidationInput";

export default function SubtitleSetting() {
  const i18n = useI18n();
  const { subtitleSetting, updateSubtitle } = useSubtitle();
  const { enabledApis, aiEnabledApis } = useApiList();

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;
    updateSubtitle({
      [name]: value,
    });
  };

  const {
    enabled,
    apiSlug,
    segSlug,
    chunkLength,
    toLang,
    isBilingual,
    windowStyle,
    originStyle,
    translationStyle,
  } = subtitleSetting;

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">
          {i18n("subtitle_helper_1")}
          <br />
          {i18n("subtitle_helper_2")}
          <br />
          {i18n("subtitle_helper_3")}
        </Alert>

        <FormControlLabel
          control={
            <Switch
              size="small"
              name="enabled"
              checked={enabled}
              onChange={() => {
                updateSubtitle({ enabled: !enabled });
              }}
            />
          }
          label={i18n("toggle_subtitle_translate")}
          sx={{ width: "fit-content" }}
        />

        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="apiSlug"
                value={apiSlug}
                label={i18n("translate_service")}
                onChange={handleChange}
              >
                {enabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="segSlug"
                value={segSlug}
                label={i18n("ai_segmentation")}
                onChange={handleChange}
              >
                <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                {aiEnabledApis.map((api) => (
                  <MenuItem key={api.apiSlug} value={api.apiSlug}>
                    {api.apiName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("ai_chunk_length")}
                type="number"
                name="chunkLength"
                value={chunkLength}
                onChange={handleChange}
                min={200}
                max={20000}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
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
            </Grid>

            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                fullWidth
                select
                size="small"
                name="isBilingual"
                value={isBilingual}
                label={i18n("is_bilingual_view")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Box>

        <TextField
          size="small"
          label={i18n("origin_styles")}
          name="originStyle"
          value={originStyle}
          onChange={handleChange}
          maxRows={10}
          multiline
          fullWidth
        />
        <TextField
          size="small"
          label={i18n("translation_styles")}
          name="translationStyle"
          value={translationStyle}
          onChange={handleChange}
          maxRows={10}
          multiline
          fullWidth
        />
        <TextField
          size="small"
          label={i18n("background_styles")}
          name="windowStyle"
          value={windowStyle}
          onChange={handleChange}
          maxRows={10}
          multiline
          fullWidth
        />
      </Stack>
    </Box>
  );
}
