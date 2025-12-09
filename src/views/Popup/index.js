import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import { sendBgMsg, sendTabMsg } from "../../libs/msg";
import { browser } from "../../libs/browser";
import { useI18n } from "../../hooks/I18n";
import Divider from "@mui/material/Divider";
import Header from "./Header";
import { MSG_OPEN_SEPARATE_WINDOW, MSG_TRANS_GETRULE } from "../../config";
import { kissLog } from "../../libs/log";
import PopupCont from "./PopupCont";
import TranForm from "../Selection/TranForm";
import { useSetting } from "../../hooks/Setting";

function Trantab() {
  const [text, setText] = useState("");
  const { setting } = useSetting();

  const {
    tranboxSetting: { enDict, enSug, apiSlugs, fromLang, toLang, toLang2 },
    transApis,
    langDetector,
  } = setting;

  return (
    <Box sx={{ p: 2 }}>
      <TranForm
        text={text}
        setText={setText}
        apiSlugs={apiSlugs}
        fromLang={fromLang}
        toLang={toLang}
        toLang2={toLang2}
        transApis={transApis}
        simpleStyle={false}
        langDetector={langDetector}
        enDict={enDict}
        enSug={enSug}
      />
    </Box>
  );
}

export default function Popup() {
  const i18n = useI18n();
  const [rule, setRule] = useState(null);
  const [setting, setSetting] = useState(null);
  const [showTrantab, setShowTrantab] = useState(false);
  const [isSeparate, setIsSeparate] = useState(false);

  const handleOpenSetting = useCallback(() => {
    browser?.runtime.openOptionsPage();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cleanHash = window.location.hash.slice(1);
        if (cleanHash === "window") {
          setIsSeparate(true);
          return;
        }

        const res = await sendTabMsg(MSG_TRANS_GETRULE);
        if (!res.error) {
          setRule(res.rule);
          setSetting(res.setting);
        }
      } catch (err) {
        kissLog("query rule", err);
      }
    })();
  }, []);

  const toggleTab = useCallback(() => {
    setShowTrantab((pre) => !pre);
  }, []);

  const openSeparateWindow = useCallback(() => {
    sendBgMsg(MSG_OPEN_SEPARATE_WINDOW);
    window.close();
  }, []);

  if (isSeparate) {
    return (
      <Box>
        <Trantab />
      </Box>
    );
  }

  return (
    <Box width={360}>
      <Header toggleTab={toggleTab} openSeparateWindow={openSeparateWindow} />
      <Divider />
      <Box sx={{ overflowY: "auto", maxHeight: 500 }}>
        {showTrantab ? (
          <Trantab />
        ) : rule ? (
          <PopupCont
            rule={rule}
            setting={setting}
            setRule={setRule}
            setSetting={setSetting}
            handleOpenSetting={handleOpenSetting}
          />
        ) : (
          <Stack
            sx={{ p: 2 }}
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
            <Button variant="text" onClick={handleOpenSetting}>
              {i18n("setting")}
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
