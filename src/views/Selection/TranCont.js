import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import { DEFAULT_TRANS_APIS, OPT_TRANS_BAIDU } from "../../config";
import { useEffect, useState } from "react";
import { apiTranslate } from "../../apis";
import { isValidWord } from "../../libs/utils";
import CopyBtn from "./CopyBtn";
import DictCont from "./DictCont";

export default function TranCont({
  text,
  translator,
  fromLang,
  toLang,
  transApis,
}) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dictResult, setDictResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");
        setDictResult(null);

        const apiSetting =
          transApis[translator] || DEFAULT_TRANS_APIS[translator];
        const tranRes = await apiTranslate({
          text,
          translator,
          fromLang,
          toLang,
          apiSetting,
        });
        setTrText(tranRes[0]);

        // 词典
        if (isValidWord(text) && toLang.startsWith("zh")) {
          if (fromLang === "en" && translator === OPT_TRANS_BAIDU) {
            setDictResult(tranRes[2].dict_result);
          } else {
            const dictRes = await apiTranslate({
              text,
              translator: OPT_TRANS_BAIDU,
              fromLang: "en",
              toLang: "zh-CN",
            });
            setDictResult(dictRes[2].dict_result);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [text, translator, fromLang, toLang, transApis]);

  return (
    <>
      <Box>
        <TextField
          label={i18n("translated_text")}
          // disabled
          fullWidth
          multiline
          value={trText}
          InputProps={{
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

      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
      {dictResult && <DictCont dictResult={dictResult} />}
    </>
  );
}
