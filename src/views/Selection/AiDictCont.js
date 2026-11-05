import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
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
  // 操作区实测宽高：undefined＝尚未测得，Typography 不预留 end padding、
  // 操作区走流内布局；测得后 Typography 预留实测宽度+8px、操作区绝对定位，
  // 容器以实测高度兜底 minHeight（绝对定位脱离高度计算）。
  const actionsRef = useRef(null);
  const [actionsWidth, setActionsWidth] = useState(undefined);
  const [actionsHeight, setActionsHeight] = useState(undefined);
  // Tagged with the request key that produced it, so the retry sync below can
  // tell a stale failure of a replaced request from one of the current request.
  const [error, setError] = useState(null);
  const [attemptRevision, setAttemptRevision] = useState(requestRevision);
  const apiSettingKey = JSON.stringify(apiSetting || {});

  // 测量操作区实际宽度并跟随变化（loading 圈出现/消失、按钮态切换均触发）；
  // 宽度 + 8px 余量作为文本 end padding。操作区仅在 markdown 就绪且无 error
  // 时入树（error→Alert、loading&&!markdown→Spinner、!markdown→null 时均不在
  // 树），故以挂载状态为观察器连接条件，避免流式每片段重建观察器。
  const actionsMounted = Boolean(markdown) && !error;
  useEffect(() => {
    const actionsEl = actionsRef.current;
    if (!actionsEl || typeof ResizeObserver !== "function") {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      // 取 borderBoxSize 的布局尺寸（不受祖先 transform 缩放影响）：
      // getBoundingClientRect 在祖先 scale 后测得视觉尺寸，预留
      // padding/minHeight 会跟着缩放走，按钮与文本重叠或留大缝。
      // 无 borderBoxSize 的旧实现回退 getBoundingClientRect。
      const entry = entries[entries.length - 1];
      const box =
        entry.borderBoxSize &&
        (Array.isArray(entry.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry.borderBoxSize);
      setActionsWidth(
        box ? box.inlineSize : actionsEl.getBoundingClientRect().width
      );
      setActionsHeight(
        box ? box.blockSize : actionsEl.getBoundingClientRect().height
      );
    });
    observer.observe(actionsEl);
    return () => observer.disconnect();
  }, [actionsMounted]);

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
        gridTemplateColumns: "minmax(0, 1fr)",
        position: "relative",
        // 操作区绝对定位脱离容器高度计算：以实测操作区高度兜底 minHeight，
        // 单行内容矮于操作区时不溢出容器、不遮挡容器后的兄弟内容。
        minHeight:
          typeof actionsHeight === "number" ? `${actionsHeight}px` : undefined,
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
        data-testid="ai-dict-actions"
        ref={actionsRef}
        sx={
          typeof actionsWidth === "number"
            ? {
                position: "absolute",
                insetInlineEnd: 0,
                top: 0,
                display: "flex",
                gap: 1,
                alignItems: "center",
              }
            : {
                position: "relative",
                justifySelf: "end",
                display: "flex",
                gap: 1,
                alignItems: "center",
              }
        }
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
          stopTitle={i18n("stop_speaking")}
        />
      </Box>
      <Typography
        component="div"
        sx={{
          gridColumn: 1,
          gridRow: typeof actionsWidth === "number" ? 1 : 2,
          minWidth: 0,
          ...(typeof actionsWidth === "number"
            ? { paddingInlineEnd: `${actionsWidth + 8}px` }
            : {}),
        }}
      >
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </Typography>
    </Box>
  );
}
