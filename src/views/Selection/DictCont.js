import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";
import AudioBtn from "./AudioBtn";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { OPT_TRANS_BAIDU } from "../../config";
import { apiTranslate } from "../../apis";
import { isValidWord } from "../../libs/utils";

const phonicMap = {
  en_phonic: ["英", "uk"],
  us_phonic: ["美", "en"],
};

export default function DictCont({ text }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dictResult, setDictResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        setDictResult(null);

        if (!isValidWord(text)) {
          return;
        }

        const dictRes = await apiTranslate({
          text,
          translator: OPT_TRANS_BAIDU,
          fromLang: "en",
          toLang: "zh-CN",
        });

        if (dictRes[2]?.type === 1) {
          setDictResult(JSON.parse(dictRes[2].result));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [text]);

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (loading) {
    return <CircularProgress size={16} />;
  }

  if (!text || !dictResult) {
    return;
  }

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
          {dictResult.src}
        </Typography>
        <FavBtn word={dictResult.src} />
      </Stack>

      <Typography component="div">
        <Stack direction="row">
          {dictResult.voice
            ?.map(Object.entries)
            .map((item) => item[0])
            .map(([key, val]) => (
              <span key={key}>
                <span>{`${phonicMap[key]?.[0] || key} ${val}`}</span>
                <AudioBtn text={dictResult.src} lan={phonicMap[key]?.[1]} />
              </span>
            ))}
        </Stack>
        <ul style={{ margin: "0.5em 0" }}>
          {dictResult.content[0].mean.map(({ pre, cont }, idx) => (
            <li key={idx}>
              {pre && `[${pre}] `}
              {Object.keys(cont).join("; ")}
            </li>
          ))}
        </ul>
      </Typography>
    </Box>
  );
}
