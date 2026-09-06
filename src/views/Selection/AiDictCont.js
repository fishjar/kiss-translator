import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiDict } from "../../apis";
import { useI18n } from "../../hooks/I18n";
import { BrowserTtsBtn } from "./AudioBtn";
import CopyBtn from "./CopyBtn";

const pendingRequests = new Map();

/**
 * Build a deduplication key for AI dictionary requests.
 *
 * React rerenders or StrictMode can trigger duplicate requests in one panel.
 * Include the complete input, language, API settings, and context to avoid reusing unrelated results.
 */
function getRequestKey({ text, fromLang, toLang, apiSettingKey, context }) {
  return JSON.stringify({
    text,
    fromLang,
    toLang,
    apiSettingKey,
    context,
  });
}

/**
 * AI dictionary result view.
 *
 * Handles request deduplication, streaming Markdown, errors, copying, and speech.
 * Delegates dictionary generation to `apiDict` so the UI only manages display state.
 */
export default function AiDictCont({
  text,
  fromLang,
  speechLang,
  toLang,
  apiSetting,
  context = "",
}) {
  const i18n = useI18n();
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const apiSettingKey = JSON.stringify(apiSetting || {});

  useEffect(() => {
    if (!text?.trim() || !apiSetting?.apiSlug) {
      setMarkdown("");
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    const requestKey = getRequestKey({
      text,
      fromLang,
      toLang,
      apiSettingKey,
      context,
    });

    const handleStreamChunk = ({ markdown: chunkMarkdown }) => {
      if (active && chunkMarkdown) {
        setMarkdown(chunkMarkdown);
      }
    };

    (async () => {
      try {
        setLoading(true);
        setMarkdown("");
        setError("");

        // Identical component instances share an in-flight request to avoid duplicate API calls.
        let pending = pendingRequests.get(requestKey);
        if (!pending) {
          pending = {
            subscribers: new Set(),
            promise: null,
          };
          pending.promise = apiDict({
            text,
            fromLang,
            toLang,
            apiSetting,
            context,
            onStreamChunk: (chunk) => {
              pending.subscribers.forEach((subscriber) => subscriber(chunk));
            },
          }).finally(() => {
            pendingRequests.delete(requestKey);
          });
          pendingRequests.set(requestKey, pending);
        }

        pending.subscribers.add(handleStreamChunk);
        const result = await pending.promise;

        if (active) {
          setMarkdown(result);
        }
      } catch (err) {
        if (err?.name === "AbortError") {
          return;
        }

        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      pendingRequests.get(requestKey)?.subscribers.delete(handleStreamChunk);
    };
  }, [text, fromLang, toLang, apiSettingKey, context]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (loading && !markdown) {
    return <CircularProgress size={16} />;
  }

  if (!markdown) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "relative",
        pr: 8,
        "& > :first-of-type": { mt: 0 },
        "& > :last-child": { mb: 0 },
        "& h1, & h2, & h3, & h4, & h5, & h6": {
          fontSize: "1em",
          fontWeight: 700,
          lineHeight: 1.55,
          mt: 1.25,
          mb: 0.75,
        },
        "& p": { my: 1 },
        "& ul, & ol": { pl: 3, my: 1 },
        "& blockquote": {
          m: 0,
          pl: 1.5,
          borderLeft: "3px solid",
          borderColor: "divider",
          color: "text.secondary",
        },
        "& code": {
          px: 0.5,
          py: 0.1,
          borderRadius: "4px",
          bgcolor: "action.hover",
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <BrowserTtsBtn
          text={text}
          lang={speechLang || fromLang || "en-US"}
          title={i18n("read_aloud")}
        />
        <CopyBtn
          text={markdown}
          title={i18n("copy")}
          copiedLabel={i18n("copy_success", "Copied")}
        />
      </Box>
      {loading && (
        <CircularProgress
          size={12}
          sx={{ position: "absolute", top: 6, right: 72 }}
        />
      )}
      <Typography component="div">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </Typography>
    </Box>
  );
}
