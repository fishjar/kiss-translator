import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import { DEFAULT_TRANS_APIS, OPT_TRANS_BAIDU } from "../../config";
import { useEffect, useState } from "react";
import { apiTranslate } from "../../apis";
import { isValidWord } from "../../libs/utils";

const exchangeMap = {
  word_third: "第三人称单数",
  word_ing: "现在分词",
  word_done: "过去式",
  word_past: "过去分词",
  word_pl: "复数",
  word_proto: "原词",
};

function DictCont({ dictResult }) {
  if (!dictResult) {
    return;
  }

  return (
    <Box>
      <div style={{ fontWeight: "bold" }}>
        {dictResult.simple_means?.word_name}
      </div>
      {dictResult.simple_means?.symbols?.map(({ ph_en, ph_am, parts }, idx) => (
        <div key={idx}>
          <div>{`英[${ph_en}] 美[${ph_am}]`}</div>
          <ul style={{ margin: "0.5em 0" }}>
            {parts.map(({ part, means }, idx) => (
              <li key={idx}>
                {part ? `[${part}] ${means.join("; ")}` : means.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        {Object.entries(dictResult.simple_means?.exchange || {})
          .map(([key, val]) => `${exchangeMap[key] || key}: ${val.join(", ")}`)
          .join("; ")}
      </div>
      <Stack direction="row" spacing={1}>
        {Object.values(dictResult.simple_means?.tags || {})
          .flat()
          .filter((item) => item)
          .map((item) => (
            <Chip label={item} size="small" />
          ))}
      </Stack>
    </Box>
  );
}

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

        const apis = { ...transApis, ...DEFAULT_TRANS_APIS };
        const apiSetting = apis[translator];
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
              apiSetting: apis[OPT_TRANS_BAIDU],
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
          fullWidth
          multiline
          value={trText}
        />
      </Box>

      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
      {dictResult && <DictCont dictResult={dictResult} />}
    </>
  );
}
