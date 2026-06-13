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
 * 生成 AI 词典请求去重 Key。
 *
 * 同一翻译框在 React 重渲染或 StrictMode 下可能短时间触发重复请求。
 * 用完整输入、语言、接口配置和上下文共同参与去重，避免串用不同语境结果。
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
 * AI 词典结果展示组件。
 *
 * 组件负责请求去重、流式 Markdown 增量展示、错误提示、复制按钮和发音按钮。
 * 具体词典生成逻辑统一委托给 `apiDict`，保持 UI 层只处理展示状态。
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

        // 多个相同组件实例共享同一个进行中请求，减少 AI 接口重复调用。
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
          borderRadius: 0.5,
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
        <BrowserTtsBtn text={text} lang={speechLang || fromLang || "en-US"} />
        <CopyBtn text={markdown} title={i18n("copy")} />
      </Box>
      {loading && <CircularProgress size={12} sx={{ mr: 1 }} />}
      <Typography component="div">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </Typography>
    </Box>
  );
}
