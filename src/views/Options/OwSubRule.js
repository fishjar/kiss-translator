import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  GLOBAL_KEY,
  REMAIN_KEY,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_STYLE_ALL,
  OPT_STYLE_DIY,
  OPT_STYLE_USE_COLOR,
} from "../../config";
import { useI18n } from "../../hooks/I18n";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import { useOwSubRule } from "../../hooks/SubRules";
import { useApiList } from "../../hooks/Api";

export default function OwSubRule() {
  const i18n = useI18n();
  const { owSubrule, updateOwSubrule } = useOwSubRule();
  const { enabledApis } = useApiList();

  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    updateOwSubrule({ [name]: value });
  };

  const {
    apiSlug,
    fromLang,
    toLang,
    textStyle,
    transOpen,
    bgColor,
    textDiyStyle,
  } = owSubrule;

  const RemainItem = (
    <MenuItem key={REMAIN_KEY} value={REMAIN_KEY}>
      {i18n("remain_unchanged")}
    </MenuItem>
  );

  const GlobalItem = (
    <MenuItem key={GLOBAL_KEY} value={GLOBAL_KEY}>
      {GLOBAL_KEY}
    </MenuItem>
  );

  return (
    <Stack spacing={2}>
      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField
              select
              size="small"
              fullWidth
              name="transOpen"
              value={transOpen}
              label={i18n("translate_switch")}
              onChange={handleChange}
            >
              {RemainItem}
              {GlobalItem}
              <MenuItem value={"true"}>{i18n("default_enabled")}</MenuItem>
              <MenuItem value={"false"}>{i18n("default_disabled")}</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField
              select
              size="small"
              fullWidth
              name="apiSlug"
              value={apiSlug}
              label={i18n("translate_service")}
              onChange={handleChange}
            >
              {RemainItem}
              {GlobalItem}
              {enabledApis.map((api) => (
                <MenuItem key={api.apiSlug} value={api.apiSlug}>
                  {api.apiName}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField
              select
              size="small"
              fullWidth
              name="fromLang"
              value={fromLang}
              label={i18n("from_lang")}
              onChange={handleChange}
            >
              {RemainItem}
              {GlobalItem}
              {OPT_LANGS_FROM.map(([lang, name]) => (
                <MenuItem key={lang} value={lang}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField
              select
              size="small"
              fullWidth
              name="toLang"
              value={toLang}
              label={i18n("to_lang")}
              onChange={handleChange}
            >
              {RemainItem}
              {GlobalItem}
              {OPT_LANGS_TO.map(([lang, name]) => (
                <MenuItem key={lang} value={lang}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField
              select
              size="small"
              fullWidth
              name="textStyle"
              value={textStyle}
              label={i18n("text_style")}
              onChange={handleChange}
            >
              {RemainItem}
              {GlobalItem}
              {OPT_STYLE_ALL.map((item) => (
                <MenuItem key={item} value={item}>
                  {i18n(item)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          {OPT_STYLE_USE_COLOR.includes(textStyle) && (
            <Grid item xs={12} sm={6} md={3} lg={2}>
              <TextField
                size="small"
                fullWidth
                name="bgColor"
                value={bgColor}
                label={i18n("bg_color")}
                onChange={handleChange}
              />
            </Grid>
          )}
        </Grid>
      </Box>

      {textStyle === OPT_STYLE_DIY && (
        <TextField
          size="small"
          label={i18n("diy_style")}
          helperText={i18n("diy_style_helper")}
          name="textDiyStyle"
          value={textDiyStyle}
          onChange={handleChange}
          multiline
        />
      )}
    </Stack>
  );
}
