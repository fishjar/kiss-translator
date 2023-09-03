import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import { sendTabMsg } from "../../libs/msg";
import { browser } from "../../libs/browser";
import { isExt } from "../../libs/client";
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
  OPT_STYLE_USE_COLOR,
  CACHE_NAME,
} from "../../config";
import { sendIframeMsg } from "../../libs/iframe";

export default function Popup({ setShowPopup, translator: tran }) {
  const i18n = useI18n();
  const [rule, setRule] = useState(tran?.rule);

  const handleOpenSetting = () => {
    if (isExt) {
      browser?.runtime.openOptionsPage();
    } else {
      window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank");
    }
    setShowPopup && setShowPopup(false);
  };

  const handleTransToggle = async (e) => {
    try {
      setRule({ ...rule, transOpen: e.target.checked ? "true" : "false" });

      if (isExt) {
        await sendTabMsg(MSG_TRANS_TOGGLE);
      } else {
        tran.toggle();
        sendIframeMsg(MSG_TRANS_TOGGLE);
      }
    } catch (err) {
      console.log("[toggle trans]", err);
    }
  };

  const handleChange = async (e) => {
    try {
      const { name, value } = e.target;
      setRule((pre) => ({ ...pre, [name]: value }));

      if (isExt) {
        await sendTabMsg(MSG_TRANS_PUTRULE, { [name]: value });
      } else {
        tran.updateRule({ [name]: value });
        sendIframeMsg(MSG_TRANS_PUTRULE, { [name]: value });
      }
    } catch (err) {
      console.log("[update rule]", err);
    }
  };

  const handleClearCache = () => {
    try {
      caches.delete(CACHE_NAME);
    } catch (err) {
      console.log("[clear cache]", err);
    }
  };

  useEffect(() => {
    if (!isExt) {
      return;
    }
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

  const { transOpen, translator, fromLang, toLang, textStyle, bgColor } = rule;

  return (
    <Box minWidth={300} sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          spacing={2}
        >
          <FormControlLabel
            control={
              <Switch
                checked={transOpen === "true"}
                onChange={handleTransToggle}
              />
            }
            label={i18n("translate_alt")}
          />
          {!isExt && (
            <Button variant="text" onClick={handleClearCache}>
              {i18n("clear_cache")}
            </Button>
          )}
        </Stack>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={translator}
          name="translator"
          label={i18n("translate_service")}
          onChange={handleChange}
        >
          {OPT_TRANS_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={fromLang}
          name="fromLang"
          label={i18n("from_lang")}
          onChange={handleChange}
        >
          {OPT_LANGS_FROM.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>
              {name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={toLang}
          name="toLang"
          label={i18n("to_lang")}
          onChange={handleChange}
        >
          {OPT_LANGS_TO.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>
              {name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={textStyle}
          name="textStyle"
          label={i18n("text_style_alt")}
          onChange={handleChange}
        >
          {OPT_STYLE_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {i18n(item)}
            </MenuItem>
          ))}
        </TextField>

        {OPT_STYLE_USE_COLOR.includes(textStyle) && (
          <TextField
            size="small"
            name="bgColor"
            value={bgColor}
            label={i18n("bg_color")}
            onChange={handleChange}
          />
        )}

        <Button variant="text" onClick={handleOpenSetting}>
          {i18n("setting")}
        </Button>
      </Stack>
    </Box>
  );
}
