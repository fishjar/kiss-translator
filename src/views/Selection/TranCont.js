import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import { DEFAULT_API_SETTING } from "../../config";
import { useEffect, useState } from "react";
import { apiTranslate } from "../../apis";
import CopyBtn from "./CopyBtn";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { tryDetectLang } from "../../libs";

export default function TranCont({
  text,
  apiSlug,
  fromLang,
  toLang,
  toLang2 = "en",
  transApis,
  simpleStyle,
  langDetector,
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
        if (fromLang === "auto" && toLang !== toLang2 && toLang2 !== "none") {
          const detectLang = await tryDetectLang(text, true, langDetector);
          if (detectLang === toLang) {
            to = toLang2;
          }
        }

        const apiSetting =
          transApis.find((api) => api.apiSlug === apiSlug) ||
          DEFAULT_API_SETTING;
        const [trText] = await apiTranslate({
          text,
          apiSlug,
          fromLang,
          toLang: to,
          apiSetting,
        });
        setTrText(trText);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [text, apiSlug, fromLang, toLang, toLang2, transApis, langDetector]);

  if (simpleStyle) {
    return (
      <Box className="KT-transbox-target KT-transbox-target_simple">
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : loading ? (
          <CircularProgress size={16} />
        ) : (
          <Typography style={{ whiteSpace: "pre-line" }}>{trText}</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box className="KT-transbox-target KT-transbox-target_default">
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
