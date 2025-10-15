import { useState, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import { sendBgMsg, sendTabMsg, getCurTab } from "../../libs/msg";
import { browser } from "../../libs/browser";
import { isExt } from "../../libs/client";
import { useI18n } from "../../hooks/I18n";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import Header from "./Header";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_OPEN_OPTIONS,
  MSG_SAVE_RULE,
  MSG_COMMAND_SHORTCUTS,
  MSG_TRANSBOX_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_STYLE_ALL,
} from "../../config";
import { sendIframeMsg } from "../../libs/iframe";
import { saveRule } from "../../libs/rules";
import { tryClearCaches } from "../../libs/cache";
import { kissLog } from "../../libs/log";
import { parseUrlPattern } from "../../libs/utils";

// 插件popup没有参数
// 网页弹框有
export default function Popup({ setShowPopup, translator }) {
  const i18n = useI18n();
  const [rule, setRule] = useState(translator?.rule);
  const [setting, setSetting] = useState(translator?.setting);
  const [commands, setCommands] = useState({});

  const handleOpenSetting = () => {
    if (!translator) {
      browser?.runtime.openOptionsPage();
    } else if (isExt) {
      sendBgMsg(MSG_OPEN_OPTIONS);
    } else {
      window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank");
    }
    setShowPopup && setShowPopup(false);
  };

  const handleTransToggle = async (e) => {
    try {
      setRule({ ...rule, transOpen: e.target.checked ? "true" : "false" });

      if (!translator) {
        await sendTabMsg(MSG_TRANS_TOGGLE);
      } else {
        translator.toggle();
        sendIframeMsg(MSG_TRANS_TOGGLE);
      }
    } catch (err) {
      kissLog("toggle trans", err);
    }
  };

  const handleTransboxToggle = async (e) => {
    try {
      setSetting((pre) => ({
        ...pre,
        tranboxSetting: { ...pre.tranboxSetting, transOpen: e.target.checked },
      }));

      if (!translator) {
        await sendTabMsg(MSG_TRANSBOX_TOGGLE);
      } else {
        translator.toggleTransbox();
        sendIframeMsg(MSG_TRANSBOX_TOGGLE);
      }
    } catch (err) {
      kissLog("toggle transbox", err);
    }
  };

  const handleMousehoverToggle = async (e) => {
    try {
      setSetting((pre) => ({
        ...pre,
        mouseHoverSetting: {
          ...pre.mouseHoverSetting,
          useMouseHover: e.target.checked,
        },
      }));

      if (!translator) {
        await sendTabMsg(MSG_MOUSEHOVER_TOGGLE);
      } else {
        translator.toggleMouseHover();
        sendIframeMsg(MSG_MOUSEHOVER_TOGGLE);
      }
    } catch (err) {
      kissLog("toggle mousehover", err);
    }
  };

  const handleInputTransToggle = async (e) => {
    try {
      setSetting((pre) => ({
        ...pre,
        inputRule: {
          ...pre.inputRule,
          transOpen: e.target.checked,
        },
      }));

      if (!translator) {
        await sendTabMsg(MSG_TRANSINPUT_TOGGLE);
      } else {
        translator.toggleInputTranslate();
        sendIframeMsg(MSG_TRANSINPUT_TOGGLE);
      }
    } catch (err) {
      kissLog("toggle inputtrans", err);
    }
  };

  const handleChange = async (e) => {
    try {
      const { name, value } = e.target;
      setRule((pre) => ({ ...pre, [name]: value }));

      if (!translator) {
        await sendTabMsg(MSG_TRANS_PUTRULE, { [name]: value });
      } else {
        translator.updateRule({ [name]: value });
        sendIframeMsg(MSG_TRANS_PUTRULE, { [name]: value });
      }
    } catch (err) {
      kissLog("update rule", err);
    }
  };

  const handleClearCache = () => {
    tryClearCaches();
  };

  const handleSaveRule = async () => {
    try {
      let href = "";
      if (!translator) {
        const tab = await getCurTab();
        href = tab.url;
      } else {
        href = window.location?.href;
      }

      if (!href || typeof href !== "string") {
        return;
      }

      const pattern = parseUrlPattern(href);
      const curRule = { ...rule, pattern };
      if (isExt && translator) {
        sendBgMsg(MSG_SAVE_RULE, curRule);
      } else {
        saveRule(curRule);
      }
    } catch (err) {
      kissLog("save rule", err);
    }
  };

  useEffect(() => {
    if (translator) {
      return;
    }
    (async () => {
      try {
        const res = await sendTabMsg(MSG_TRANS_GETRULE);
        if (!res.error) {
          setRule(res.rule);
          setSetting(res.setting);
        }
      } catch (err) {
        kissLog("query rule", err);
      }
    })();
  }, [translator]);

  useEffect(() => {
    (async () => {
      try {
        const commands = {};
        if (isExt) {
          const res = await sendBgMsg(MSG_COMMAND_SHORTCUTS);
          res.forEach(({ name, shortcut }) => {
            commands[name] = shortcut;
          });
        } else {
          const shortcuts = translator.setting.shortcuts;
          if (shortcuts) {
            Object.entries(shortcuts).forEach(([key, val]) => {
              commands[key] = val.join("+");
            });
          }
        }
        setCommands(commands);
      } catch (err) {
        kissLog("query cmds", err);
      }
    })();
  }, [translator]);

  const optApis = useMemo(
    () =>
      setting?.transApis
        .filter((api) => !api.isDisabled)
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [setting]
  );

  const tranboxEnabled = setting?.tranboxSetting.transOpen;
  const mouseHoverEnabled = setting?.mouseHoverSetting.useMouseHover;
  const inputTransEnabled = setting?.inputRule.transOpen;

  if (!rule) {
    return (
      <Box minWidth={300}>
        {!translator && (
          <>
            <Header />
            <Divider />
          </>
        )}
        <Stack sx={{ p: 2 }} spacing={3}>
          <Button variant="text" onClick={handleOpenSetting}>
            {i18n("setting")}
          </Button>
        </Stack>
      </Box>
    );
  }

  const {
    transOpen,
    apiSlug,
    fromLang,
    toLang,
    textStyle,
    autoScan,
    transOnly,
    hasRichText,
    hasShadowroot,
  } = rule;

  return (
    <Box width={360}>
      {!translator && (
        <>
          <Header />
          <Divider />
        </>
      )}
      <Stack sx={{ p: 2 }} spacing={2}>
        <Grid container columns={12} spacing={1}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={transOpen === "true"}
                  onChange={handleTransToggle}
                />
              }
              label={
                commands["toggleTranslate"]
                  ? `${i18n("translate_alt")}(${commands["toggleTranslate"]})`
                  : i18n("translate_alt")
              }
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="autoScan"
                  value={autoScan === "true" ? "false" : "true"}
                  checked={autoScan === "true"}
                  onChange={handleChange}
                />
              }
              label={i18n("autoscan_alt")}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="hasShadowroot"
                  value={hasShadowroot === "true" ? "false" : "true"}
                  checked={hasShadowroot === "true"}
                  onChange={handleChange}
                />
              }
              label={i18n("shadowroot_alt")}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="hasRichText"
                  value={hasRichText === "true" ? "false" : "true"}
                  checked={hasRichText === "true"}
                  onChange={handleChange}
                />
              }
              label={i18n("richtext_alt")}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="transOnly"
                  value={transOnly === "true" ? "false" : "true"}
                  checked={transOnly === "true"}
                  onChange={handleChange}
                />
              }
              label={i18n("transonly_alt")}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="tranboxEnabled"
                  value={!tranboxEnabled}
                  checked={tranboxEnabled}
                  onChange={handleTransboxToggle}
                />
              }
              label={i18n("selection_translate")}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="mouseHoverEnabled"
                  value={!mouseHoverEnabled}
                  checked={mouseHoverEnabled}
                  onChange={handleMousehoverToggle}
                />
              }
              label={i18n("mousehover_translate")}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  name="inputTransEnabled"
                  value={!inputTransEnabled}
                  checked={inputTransEnabled}
                  onChange={handleInputTransToggle}
                />
              }
              label={i18n("input_translate")}
            />
          </Grid>
        </Grid>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={apiSlug}
          name="apiSlug"
          label={i18n("translate_service")}
          onChange={handleChange}
        >
          {optApis.map(({ key, name }) => (
            <MenuItem key={key} value={key}>
              {name}
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
          label={
            commands["toggleStyle"]
              ? `${i18n("text_style_alt")}(${commands["toggleStyle"]})`
              : i18n("text_style_alt")
          }
          onChange={handleChange}
        >
          {OPT_STYLE_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {i18n(item)}
            </MenuItem>
          ))}
        </TextField>

        {/* {OPT_STYLE_USE_COLOR.includes(textStyle) && (
          <TextField
            size="small"
            name="bgColor"
            value={bgColor}
            label={i18n("bg_color")}
            onChange={handleChange}
          />
        )} */}

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          spacing={2}
        >
          <Button variant="text" onClick={handleSaveRule}>
            {i18n("save_rule")}
          </Button>
          <Button variant="text" onClick={handleClearCache}>
            {i18n("clear_cache")}
          </Button>
          <Button variant="text" onClick={handleOpenSetting}>
            {i18n("setting")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
