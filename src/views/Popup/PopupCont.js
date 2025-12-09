import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import { sendBgMsg, sendTabMsg, getCurTab } from "../../libs/msg";
import { isExt } from "../../libs/client";
import { useI18n } from "../../hooks/I18n";
import TextField from "@mui/material/TextField";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_PUTRULE,
  MSG_SAVE_RULE,
  MSG_COMMAND_SHORTCUTS,
  MSG_TRANSBOX_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
} from "../../config";
import { saveRule } from "../../libs/rules";
import { tryClearCaches } from "../../libs/cache";
import { kissLog } from "../../libs/log";
import { parseUrlPattern } from "../../libs/utils";
import { useAllTextStyles } from "../../hooks/CustomStyles";

export default function PopupCont({
  rule,
  setting,
  setRule,
  setSetting,
  handleOpenSetting,
  processActions,
  isContent = false,
}) {
  const i18n = useI18n();
  const [commands, setCommands] = useState({});
  const { allTextStyles } = useAllTextStyles();

  const handleTransToggle = async (e) => {
    try {
      setRule({ ...rule, transOpen: e.target.checked ? "true" : "false" });

      if (!processActions) {
        await sendTabMsg(MSG_TRANS_TOGGLE);
      } else {
        processActions({ action: MSG_TRANS_TOGGLE });
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

      if (!processActions) {
        await sendTabMsg(MSG_TRANSBOX_TOGGLE);
      } else {
        processActions({ action: MSG_TRANSBOX_TOGGLE });
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

      if (!processActions) {
        await sendTabMsg(MSG_MOUSEHOVER_TOGGLE);
      } else {
        processActions({ action: MSG_MOUSEHOVER_TOGGLE });
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

      if (!processActions) {
        await sendTabMsg(MSG_TRANSINPUT_TOGGLE);
      } else {
        processActions({ action: MSG_TRANSINPUT_TOGGLE });
      }
    } catch (err) {
      kissLog("toggle inputtrans", err);
    }
  };

  const handleChange = async (e) => {
    try {
      let { name, value, checked } = e.target;
      if (name === "isPlainText") {
        value = checked;
      }
      setRule((pre) => ({ ...pre, [name]: value }));

      if (!processActions) {
        await sendTabMsg(MSG_TRANS_PUTRULE, { [name]: value });
      } else {
        processActions({ action: MSG_TRANS_PUTRULE, args: { [name]: value } });
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
      if (!isContent) {
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
      if (isExt && isContent) {
        sendBgMsg(MSG_SAVE_RULE, curRule);
      } else {
        saveRule(curRule);
      }
    } catch (err) {
      kissLog("save rule", err);
    }
  };

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
          const shortcuts = setting.shortcuts;
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
  }, [setting.shortcuts]);

  const optApis = useMemo(
    () =>
      setting.transApis
        .filter((api) => !api.isDisabled)
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [setting.transApis]
  );

  const tranboxEnabled = setting.tranboxSetting.transOpen;
  const mouseHoverEnabled = setting.mouseHoverSetting.useMouseHover;
  const inputTransEnabled = setting.inputRule.transOpen;

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
    isPlainText = false,
  } = rule;

  return (
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
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="isPlainText"
                value={!isPlainText}
                checked={isPlainText}
                onChange={handleChange}
              />
            }
            label={i18n("plain_text_translate")}
          />
        </Grid>
      </Grid>

      <Stack direction="row" spacing={2}>
        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={fromLang}
          name="fromLang"
          label={i18n("from_lang")}
          onChange={handleChange}
          fullWidth
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
          fullWidth
        >
          {OPT_LANGS_TO.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>
              {name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={apiSlug}
          name="apiSlug"
          label={i18n("translate_service")}
          onChange={handleChange}
          fullWidth
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
          value={textStyle}
          name="textStyle"
          label={
            commands["toggleStyle"]
              ? `${i18n("text_style_alt")}(${commands["toggleStyle"]})`
              : i18n("text_style_alt")
          }
          onChange={handleChange}
          fullWidth
        >
          {allTextStyles.map((item) => (
            <MenuItem key={item.styleSlug} value={item.styleSlug}>
              {item.styleName}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
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
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Button
            variant="text"
            onClick={() => {
              window.open(
                "https://chromewebstore.google.com/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof/reviews",
                "_blank"
              );
            }}
          >
            {i18n("comment_support")}
          </Button>
          <Button
            variant="text"
            onClick={() => {
              window.open(
                "https://github.com/fishjar/kiss-translator#%E8%B5%9E%E8%B5%8F",
                "_blank"
              );
            }}
          >
            {i18n("appreciate_support")}
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
