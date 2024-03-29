import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import { DEFAULT_TRANS_APIS, OPT_TRANS_BAIDU } from "../../config";
import { useEffect, useState } from "react";
import { apiTranslate, apiBaiduLangdetect, apiBaiduSuggest } from "../../apis";
import { isValidWord } from "../../libs/utils";
import CopyBtn from "./CopyBtn";
import DictCont from "./DictCont";
import SugCont from "./SugCont";

export default function TranCont({
  text,
  translator,
  fromLang,
  toLang,
  toLang2 = "en",
  setToLang,
  setToLang2,
  transApis,
}) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dictResult, setDictResult] = useState(null);
  const [sugs, setSugs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");
        setDictResult(null);
        setSugs([]);

        // 互译
        if (toLang !== toLang2 && toLang2 !== "none") {
          const detectLang = await apiBaiduLangdetect(text);
          if (detectLang === toLang) {
            setToLang(toLang2);
            setToLang2(toLang);
            return;
          }
        }

        // 翻译
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
            tranRes[2].type === 1 &&
              setDictResult(JSON.parse(tranRes[2].result));
          } else {
            const dictRes = await apiTranslate({
              text,
              translator: OPT_TRANS_BAIDU,
              fromLang: "en",
              toLang: "zh-CN",
            });
            dictRes[2].type === 1 &&
              setDictResult(JSON.parse(dictRes[2].result));
          }
        }

        // 建议
        if (text.length < 20) {
          setSugs(await apiBaiduSuggest(text));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [
    text,
    translator,
    fromLang,
    toLang,
    toLang2,
    setToLang,
    setToLang2,
    transApis,
  ]);

  return (
    <>
      <Box>
        <TextField
          size="small"
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
      {sugs.length > 0 && <SugCont sugs={sugs} />}
    </>
  );
}
