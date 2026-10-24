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
 * @param {number} [props.requestRevision=0] Explicit submission revision; followed only while retrying a failed dictionary request for the current input.
 */
export default function AiDictCont({
  text,
  fromLang,
  speechLang,
  toLang,
  apiSetting,
  context = "",
  ttsApiSlug = "",
  requestRevision = 0,
}) {
  const i18n = useI18n();
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  // Tagged with the request key that produced it, so the retry sync below can
  // tell a stale failure of a replaced request from one of the current request.
  const [error, setError] = useState(null);
  const [attemptRevision, setAttemptRevision] = useState(requestRevision);
  const apiSettingKey = JSON.stringify(apiSetting || {});

  useEffect(() => {
    if (!text?.trim() || !apiSetting?.apiSlug) {
      setMarkdown("");
      setLoading(false);
      setError(null);
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
        setError(null);

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
          setError({ key: requestKey, message: err.message });
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
  }, [text, fromLang, toLang, apiSettingKey, context, attemptRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Error-gated retry sync: follow requestRevision only while the failed
  // attempt belongs to the request this panel currently shows. `error` carries
  // the request key of its attempt; comparing it against the key rebuilt from
  // the current props rejects stale failures of a replaced request — its
  // submission already started a fresh request through the effect above, and
  // re-bumping attemptRevision there would run that effect a second time and
  // re-call apiDict when the new request settles between the two runs.
  // `error` is read from the closure, never listed as a dependency — otherwise
  // the error flip right after a failed retry would trigger an unauthorized
  // automatic retry. In-flight or successful attempts keep the panel
  // completely untouched.
  useEffect(() => {
    if (
      error &&
      error.key ===
        getRequestKey({ text, fromLang, toLang, apiSettingKey, context })
    ) {
      setAttemptRevision(requestRevision);
    }
  }, [requestRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
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
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        columnGap: 1,
        alignItems: "start",
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
          gridColumn: 2,
          gridRow: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        {loading && (
          <CircularProgress size={12} sx={{ mr: 0.5, flexShrink: 0 }} />
        )}
        <CopyBtn
          text={markdown}
          title={i18n("copy")}
          copiedLabel={i18n("copy_success", "Copied")}
        />
        <BrowserTtsBtn
          serviceId={ttsApiSlug}
          text={text}
          lang={speechLang || fromLang || "en-US"}
          title={i18n("read_aloud")}
        />
      </Box>
      <Typography
        component="div"
        sx={{ gridColumn: 1, gridRow: 1, minWidth: 0 }}
      >
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </Typography>
    </Box>
  );
}
