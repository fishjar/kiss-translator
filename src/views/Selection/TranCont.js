import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { apiTranslate } from "../../apis";
import { API_SPE_TYPES } from "../../config";
import { useI18n } from "../../hooks/I18n";
import CopyBtn from "./CopyBtn";

/**
 * 判断划词翻译结果是否允许进行可见的流式渲染。
 *
 * @param {Object} apiSetting 翻译接口配置。
 * @returns {boolean} 当前接口是否应把增量 chunk 直接写入划词翻译输出框。
 */
const canRenderStream = (apiSetting) =>
  Boolean(
    apiSetting?.useStream &&
      API_SPE_TYPES.stream.has(apiSetting.apiType) &&
      (apiSetting.streamRenderMode || "disabled") !== "disabled"
  );

/**
 * 归一化流式回调中的文本载荷。
 *
 * @param {string|string[]} text 流式回调返回的局部文本或最终翻译结果。
 * @returns {string} 可直接写入 UI 的译文字符串。
 */
const normalizeChunkText = (text) => {
  if (Array.isArray(text)) {
    return text[0] || "";
  }

  return text || "";
};

/**
 * 单个划词翻译结果组件，负责发起指定服务商的翻译请求并渲染译文。
 *
 * @param {Object} props 组件参数。
 * @param {string} props.text 需要翻译的原始文本。
 * @param {string} props.fromLang 源语言代码。
 * @param {string} props.toLang 目标语言代码。
 * @param {string} props.apiSlug 选用的翻译 API 唯一标识。
 * @param {Array<Object>} props.transApis 可用翻译 API 配置列表。
 * @param {boolean} [props.simpleStyle=false] 是否使用极简文本样式渲染。
 * @returns {JSX.Element|null} 单个翻译服务商的结果视图。
 */
export default function TranCont({
  text,
  fromLang,
  toLang,
  apiSlug,
  transApis,
  simpleStyle = false,
}) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 根据 slug 找到当前组件实例负责调用的翻译接口配置。
  const apiSetting = useMemo(
    () => transApis.find((api) => api.apiSlug === apiSlug),
    [transApis, apiSlug]
  );

  useEffect(() => {
    if (!text?.trim() || !apiSetting) {
      setTrText("");
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    const controller = new AbortController();
    const enableStreamRender = canRenderStream(apiSetting);

    /**
     * 接收底层翻译队列吐出的流式增量文本，并同步到当前输出框。
     *
     * @param {Object} chunk 流式翻译分块。
     * @param {string|string[]} chunk.text 当前分块中已经解析出的译文。
     */
    const handleStreamChunk = enableStreamRender
      ? ({ text: chunkText }) => {
          // 旧请求被切换或取消后，晚到的流式分块不能再覆盖当前划词结果。
          if (!active || controller.signal.aborted) {
            return;
          }

          const nextText = normalizeChunkText(chunkText);
          if (nextText) {
            setTrText(nextText);
          }
        }
      : undefined;

    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");

        const { trText } = await apiTranslate({
          text,
          fromLang,
          toLang,
          apiSetting,
          onStreamChunk: handleStreamChunk,
          // 将组件生命周期的取消信号下传，避免划词内容变化后旧请求继续占用网络与回写 UI。
          signal: controller.signal,
        });

        if (active) {
          setTrText(trText);
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
      // 组件卸载或依赖变化时主动中止请求，确保后台流式连接不会继续为旧划词结果推送数据。
      controller.abort();
    };
  }, [text, fromLang, toLang, apiSetting]);

  if (!apiSetting) {
    return null;
  }

  if (simpleStyle) {
    return (
      <Box>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : trText ? (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            {loading && (
              <CircularProgress
                size={12}
                sx={{ flex: "0 0 auto", mt: "0.35em" }}
              />
            )}
            <Typography style={{ whiteSpace: "pre-line" }}>{trText}</Typography>
          </Stack>
        ) : loading ? (
          <CircularProgress size={16} />
        ) : null}
      </Box>
    );
  }

  return (
    <Box>
      <TextField
        size="small"
        label={`${i18n("translated_text")} - ${apiSetting.apiName}`}
        fullWidth
        multiline
        maxRows={10}
        sx={{
          "& textarea": {
            resize: "vertical",
          },
        }}
        value={trText}
        helperText={error}
        InputProps={{
          startAdornment: loading ? <CircularProgress size={16} /> : null,
          endAdornment: (
            <Stack
              direction="row"
              sx={{
                position: "absolute",
                right: 0,
                top: 0,
              }}
            >
              {/* 复制当前译文；流式渲染期间复制到的是已经到达的部分文本。 */}
              <CopyBtn text={trText} title={i18n("copy")} />
            </Stack>
          ),
        }}
      />
    </Box>
  );
}
