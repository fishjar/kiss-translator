import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import { DEFAULT_TRANS_APIS } from "../../config";
import { useEffect, useState } from "react";
import { apiTranslate, apiBaiduLangdetect } from "../../apis";
import CopyBtn from "./CopyBtn";

export default function TranCont({
  text,
  translator,
  fromLang,
  toLang,
  toLang2 = "en",
  transApis,
}) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");

        let to = toLang;
        if (toLang !== toLang2 && toLang2 !== "none") {
          const detectLang = await apiBaiduLangdetect(text);
          if (detectLang === toLang) {
            to = toLang2;
          }
        }

        const apiSetting =
          transApis[translator] || DEFAULT_TRANS_APIS[translator];
        const tranRes = await apiTranslate({
          text,
          translator,
          fromLang,
          toLang: to,
          apiSetting,
        });
        setTrText(tranRes[0]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [text, translator, fromLang, toLang, toLang2, transApis]);

  return (
    <Box>
      <TextField
        size="small"
        label={i18n("translated_text")}
        // disabled
        fullWidth
        multiline
        value={trText}
        helperText={error}
        InputProps={{
          startAdornment: loading ? <CircularProgress size={16} /> : null,
          endAdornment: (
            <Stack
              direction="row"
              sx={{
                position: "absolute",
                right: 0,
                top: 0,
              }}
            >
              <CopyBtn text={trText} />
            </Stack>
          ),
        }}
      />
    </Box>
  );
}
