import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CopyBtn from "./CopyBtn";
import { useAsyncNow } from "../../hooks/Fetch";
import { DICT_MAP } from "./DictMap";

function DictBody({ text, setCopyText, dict }) {
  const { loading, error, data } = useAsyncNow(dict.apiFn, text);

  useEffect(() => {
    if (!data) {
      return;
    }

    const copyText = [text, dict.toText(data)].join("\n");
    setCopyText(copyText);
  }, [data, text, dict, setCopyText]);

  const uiAudio = useMemo(() => dict.uiAudio(data), [data, dict]);
  const uiTrans = useMemo(() => dict.uiTrans(data), [data, dict]);

  if (loading) {
    return <CircularProgress size={16} />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return <Typography>Empty result</Typography>;
  }

  return (
    <Typography component="div">
      {uiAudio}
      {uiTrans}
    </Typography>
  );
}

export default function DictCont({ text, enDict }) {
  const [copyText, setCopyText] = useState(text);
  const dict = DICT_MAP[enDict];

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

      {dict && <DictBody text={text} setCopyText={setCopyText} dict={dict} />}
    </Stack>
  );
}
