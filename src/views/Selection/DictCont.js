import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";
import AudioBtn from "./AudioBtn";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { OPT_TRANS_BAIDU, PHONIC_MAP } from "../../config";
import { apiTranslate } from "../../apis";
import { isValidWord } from "../../libs/utils";
import CopyBtn from "./CopyBtn";

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

        // todo: 修复
        const dictRes = await apiTranslate({
          text,
          apiSlug: OPT_TRANS_BAIDU,
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

  const copyText = useMemo(() => {
    if (!dictResult) {
      return text;
    }

    return [
      dictResult.src,
      dictResult.voice
        ?.map(Object.entries)
        .map((item) => item[0])
        .map(([key, val]) => `${PHONIC_MAP[key]?.[0] || key} ${val}`)
        .join(" "),
      dictResult.content[0].mean
        .map(({ pre, cont }) => {
          return `${pre ? `[${pre}] ` : ""}${Object.keys(cont).join("; ")}`;
        })
        .join("\n"),
    ].join("\n");
  }, [text, dictResult]);

  if (loading) {
    return <CircularProgress size={16} />;
  }

  return (
    <Stack className="KT-transbox-dict" spacing={1}>
      {text && (
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
            {dictResult?.src || text}
          </Typography>
          <Stack direction="row" justifyContent="space-between">
            <CopyBtn text={copyText} />
            <FavBtn word={dictResult?.src || text} />
          </Stack>
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {dictResult && (
        <Typography component="div">
          <Typography component="div">
            {dictResult.voice
              ?.map(Object.entries)
              .map((item) => item[0])
              .map(([key, val]) => (
                <Typography
                  component="div"
                  key={key}
                  style={{ display: "inline-block" }}
                >
                  <Typography component="span">{`${PHONIC_MAP[key]?.[0] || key} ${val}`}</Typography>
                  <AudioBtn text={dictResult.src} lan={PHONIC_MAP[key]?.[1]} />
                </Typography>
              ))}
          </Typography>

          <Typography component="ul">
            {dictResult.content[0].mean.map(({ pre, cont }, idx) => (
              <Typography component="li" key={idx}>
                {pre && `[${pre}] `}
                {Object.keys(cont).join("; ")}
              </Typography>
            ))}
          </Typography>
        </Typography>
      )}
    </Stack>
  );
}
