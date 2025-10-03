import { useState, useEffect } from "react";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";
import AudioBtn from "./AudioBtn";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import { OPT_DICT_BAIDU, OPT_DICT_YOUDAO, PHONIC_MAP } from "../../config";
import CopyBtn from "./CopyBtn";
import { useAsyncNow } from "../../hooks/Fetch";
import { apiYoudaoDict } from "../../apis";

function DictBaidu({ text, setCopyText }) {
  // useEffect(() => {
  //   if (!data) {
  //     return;
  //   }

  //   const copyText = [
  //     data.src,
  //     data.voice
  //       ?.map(Object.entries)
  //       .map((item) => item[0])
  //       .map(([key, val]) => `${PHONIC_MAP[key]?.[0] || key} ${val}`)
  //       .join(" "),
  //     data.content[0].mean
  //       .map(({ pre, cont }) => {
  //         return `${pre ? `[${pre}] ` : ""}${Object.keys(cont).join("; ")}`;
  //       })
  //       .join("\n"),
  //   ].join("\n");

  //   setCopyText(copyText);
  // }, [data, setCopyText]);

  return <Typography>baidu dict not supported yet</Typography>;

  {
    /* {dictResult && (
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
      )} */
  }
}

function DictYoudao({ text, setCopyText }) {
  const { loading, error, data } = useAsyncNow(apiYoudaoDict, text);

  useEffect(() => {
    if (!data) {
      return;
    }

    const copyText = [
      text,
      data?.ec?.word?.trs
        ?.map(({ pos, tran }) => `${pos ? `[${pos}] ` : ""}${tran}`)
        .join("\n"),
    ].join("\n");

    setCopyText(copyText);
  }, [data, setCopyText]);

  if (loading) {
    return <CircularProgress size={16} />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return;
  }

  return (
    <Typography component="div">
      <Typography component="ul">
        {data?.ec?.word?.trs?.map(({ pos, tran }, idx) => (
          <Typography component="li" key={idx}>
            {pos && `[${pos}] `}
            {tran}
          </Typography>
        ))}
      </Typography>
    </Typography>
  );
}

export default function DictCont({ text, enDict }) {
  const [copyText, setCopyText] = useState(text);

  const dictMap = {
    [OPT_DICT_BAIDU]: <DictBaidu text={text} setCopyText={setCopyText} />,
    [OPT_DICT_YOUDAO]: <DictYoudao text={text} setCopyText={setCopyText} />,
  };

  return (
    <Stack spacing={1}>
      {text && (
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
            {text}
          </Typography>
          <Stack direction="row" justifyContent="space-between">
            <CopyBtn text={copyText} />
            <FavBtn word={text} />
          </Stack>
        </Stack>
      )}

      <Divider />

      {dictMap[enDict] || <Typography>Dict not support</Typography>}
    </Stack>
  );
}
