import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import { sendTabMsg } from "../../libs/msg";
import { browser } from "../../libs/browser";
import { useI18n } from "../../hooks/I18n";
import Divider from "@mui/material/Divider";
import Header from "./Header";
import { MSG_TRANS_GETRULE } from "../../config";
import { kissLog } from "../../libs/log";
import PopupCont from "./PopupCont";

export default function Popup() {
  const i18n = useI18n();
  const [rule, setRule] = useState(null);
  const [setting, setSetting] = useState(null);

  const handleOpenSetting = useCallback(() => {
    browser?.runtime.openOptionsPage();
  }, []);

  useEffect(() => {
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
  }, []);

  return (
    <Box width={360}>
      <Header />
      <Divider />
      {rule && setting ? (
        <PopupCont
          rule={rule}
          setting={setting}
          setRule={setRule}
          setSetting={setSetting}
          handleOpenSetting={handleOpenSetting}
        />
      ) : (
        <Stack sx={{ p: 2 }} spacing={3}>
          <Button variant="text" onClick={handleOpenSetting}>
            {i18n("setting")}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
