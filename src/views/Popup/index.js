import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import { sendTabMsg } from "../../libs/msg";
import browser from "../../libs/browser";
import { useI18n } from "../../hooks/I18n";
import TextField from "@mui/material/TextField";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  OPT_TRANS_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_STYLE_ALL,
} from "../../config";

export default function Popup() {
  const i18n = useI18n();
  const [rule, setRule] = useState(null);

  const handleOpenSetting = () => {
    browser?.runtime.openOptionsPage();
  };

  const handleTransToggle = async (e) => {
    try {
      setRule({ ...rule, transOpen: e.target.checked });
      await sendTabMsg(MSG_TRANS_TOGGLE);
    } catch (err) {
      console.log("[toggle trans]", err);
    }
  };

  const handleChange = async (e) => {
    try {
      const { name, value } = e.target;
      setRule((pre) => ({ ...pre, [name]: value }));
      await sendTabMsg(MSG_TRANS_PUTRULE, { [name]: value });
    } catch (err) {
      console.log("[update rule]", err);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await sendTabMsg(MSG_TRANS_GETRULE);
        if (!res.error) {
          setRule(res.data);
        }
      } catch (err) {
        console.log("[query rule]", err);
      }
    })();
  }, []);

  if (!rule) {
    return (
      <Box minWidth={300} sx={{ p: 2 }}>
        <Stack spacing={3}>
          <Button variant="text" onClick={handleOpenSetting}>
            {i18n("setting")}
          </Button>
        </Stack>
      </Box>
    );
  }

  const { transOpen, translator, fromLang, toLang, textStyle } = rule;

  return (
    <Box minWidth={300} sx={{ p: 2 }}>
      <Stack spacing={3}>
        <FormControlLabel
          control={<Switch checked={transOpen} onChange={handleTransToggle} />}
          label={i18n("translate")}
        />

        <TextField
          select
          size="small"
          value={translator}
          name="translator"
          label={i18n("translate_service")}
          onChange={handleChange}
        >
          {OPT_TRANS_ALL.map((item) => (
            <MenuItem key={item} value={item}>{item}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          value={fromLang}
          name="fromLang"
          label={i18n("from_lang")}
          onChange={handleChange}
        >
          {OPT_LANGS_FROM.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>{name}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          value={toLang}
          name="toLang"
          label={i18n("to_lang")}
          onChange={handleChange}
        >
          {OPT_LANGS_TO.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>{name}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          value={textStyle}
          name="textStyle"
          label={i18n("text_style")}
          onChange={handleChange}
        >
          {OPT_STYLE_ALL.map((item) => (
            <MenuItem key={item} value={item}>{i18n(item)}</MenuItem>
          ))}
        </TextField>

        <Button variant="text" onClick={handleOpenSetting}>
          {i18n("setting")}
        </Button>
      </Stack>
    </Box>
  );
}
