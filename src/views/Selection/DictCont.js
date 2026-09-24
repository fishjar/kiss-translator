import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CopyBtn from "./CopyBtn";
import { useAsyncNow } from "../../hooks/Fetch";
import { dictHandlers } from "./DictHandler";
import { useI18n } from "../../hooks/I18n";

/**
 * Dictionary definition view.
 *
 * @param {Object} props
 * @param {string} props.text - Word to look up.
 * @param {Function} props.setCopyText - Callback to update the text to copy.
 * @param {Function} props.setRealWord - Callback to record the resolved headword.
 * @param {Object} props.dict - Selected dictionary handler settings.
 */
function DictBody({ text, setCopyText, setRealWord, dict }) {
  // Start an immediate asynchronous dictionary lookup with useAsyncNow.
  const { loading, error, data } = useAsyncNow(dict.apiFn, text);

  // Update the headword and copy text when dictionary data arrives.
  useEffect(() => {
    if (!data) {
      return;
    }

    // REVIEW: Changes to text or dict may apply stale data while the next lookup is loading.
    // Confirm that data belongs to the current query before merging it with text.
    const realWord = dict.reWord(data) || text;
    const copyText = [realWord, dict.toText(data).join("\n")].join("\n");
    setRealWord(realWord);
    setCopyText(copyText);
  }, [data, text, dict, setCopyText, setRealWord]);

  // Build the audio and definition nodes.
  const uiAudio = useMemo(() => dict.uiAudio(data), [data, dict]);
  const uiTrans = useMemo(() => dict.uiTrans(data), [data, dict]);

  if (loading) {
    return <CircularProgress size={16} />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return <Typography>Not found!</Typography>;
  }

  return (
    <Typography component="div">
      {uiAudio}
      {uiTrans}
    </Typography>
  );
}

/**
 * Dictionary container with copy, favorite, and headword controls.
 *
 * @param {Object} props
 * @param {string} props.text - Word or text to look up.
 * @param {string} props.enDict - Dictionary service identifier, such as "bing" or "youdao".
 */
export default function DictCont({ text, enDict }) {
  const i18n = useI18n();
  const [copyText, setCopyText] = useState(text);
  const [realWord, setRealWord] = useState(text);
  // Resolve the selected dictionary handler.
  const dict = dictHandlers[enDict];

  useLayoutEffect(() => {
    setCopyText(text);
    setRealWord(text);
  }, [enDict, text]);

  return (
    <Stack spacing={1}>
      {text && (
        <Stack direction="row" justifyContent="space-between">
          {/* Display the resolved headword. */}
          <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
            {realWord}
          </Typography>
          <Stack direction="row" justifyContent="space-between">
            {/* Copy action. */}
            <CopyBtn
              text={copyText}
              title={i18n("copy")}
              copiedLabel={i18n("copy_success", "Copied")}
            />
            {/* Favorite word action. */}
            <FavBtn word={realWord} title={i18n("collect")} />
          </Stack>
        </Stack>
      )}

      <Divider />

      {/* Dictionary content. */}
      {dict && (
        <DictBody
          text={text}
          setCopyText={setCopyText}
          setRealWord={setRealWord}
          dict={dict}
        />
      )}
    </Stack>
  );
}
