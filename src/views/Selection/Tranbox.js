import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "../../hooks/Theme";
import DraggableResizable from "./DraggableResizable";
import Header from "../Popup/Header";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import { useI18n } from "../../hooks/I18n";
import { OPT_TRANS_ALL, OPT_LANGS_FROM, OPT_LANGS_TO } from "../../config";

function TranForm({ tranboxSetting }) {
  const i18n = useI18n();

  const {
    transOpen,
    translator,
    fromLang,
    toLang,
    tranboxShortcut,
    btnOffsetX,
    btnOffsetY,
  } = tranboxSetting;

  return (
    <Stack sx={{ p: 2 }} spacing={2}>
      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={4} sm={4} md={4} lg={4}>
            <TextField
              select
              SelectProps={{ MenuProps: { disablePortal: true } }}
              fullWidth
              size="small"
              name="fromLang"
              value={fromLang}
              label={i18n("from_lang")}
              //   onChange={handleChange}
            >
              {OPT_LANGS_FROM.map(([lang, name]) => (
                <MenuItem key={lang} value={lang}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={4} sm={4} md={4} lg={4}>
            <TextField
              select
              SelectProps={{ MenuProps: { disablePortal: true } }}
              fullWidth
              size="small"
              name="toLang"
              value={toLang}
              label={i18n("to_lang")}
              //   onChange={handleChange}
            >
              {OPT_LANGS_TO.map(([lang, name]) => (
                <MenuItem key={lang} value={lang}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={4} sm={4} md={4} lg={4}>
            <TextField
              select
              SelectProps={{ MenuProps: { disablePortal: true } }}
              fullWidth
              size="small"
              value={translator}
              name="translator"
              label={i18n("translate_service")}
              // onChange={handleChange}
            >
              {OPT_TRANS_ALL.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Box>
    </Stack>
  );
}

export default function TranBox({ position, setShowBox, tranboxSetting }) {
  return (
    <SettingProvider>
      <ThemeProvider>
        <DraggableResizable
          defaultPosition={position}
          header={<Header setShowPopup={setShowBox} />}
        >
          <Divider />
          <TranForm tranboxSetting={tranboxSetting} />
        </DraggableResizable>
      </ThemeProvider>
    </SettingProvider>
  );
}
