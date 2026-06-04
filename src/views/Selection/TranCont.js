import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useI18n } from "../../hooks/I18n";
import { useEffect, useState, useMemo } from "react";
import { apiTranslate } from "../../apis";
import CopyBtn from "./CopyBtn";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

/**
 * 单项翻译内容展示组件 (负责发起单平台翻译请求并渲染译文)
 *
 * @param {Object} props
 * @param {string} props.text - 需要翻译的原始文本
 * @param {string} props.fromLang - 源语言
 * @param {string} props.toLang - 目标语言
 * @param {string} props.apiSlug - 选用的翻译 API 标识 (如 "baidu", "google", "microsoft")
 * @param {Array} props.transApis - 启用的翻译 API 配置列表
 * @param {boolean} [props.simpleStyle=false] - 是否以极简/纯文本样式渲染 (无输入框边框)
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
  // 翻译好的译文文本
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 获取当前 API 的配置参数
  const apiSetting = useMemo(
    () => transApis.find((api) => api.apiSlug === apiSlug),
    [transApis, apiSlug]
  );

  // 侦听文本或目标语言、接口服务改变，触发翻译请求
  useEffect(() => {
    if (!text?.trim() || !apiSetting) {
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");

        // 发起翻译请求
        // REVIEW: useEffect 在异步调用 apiTranslate 时未处理竞态条件。由于网络延迟不同，频繁更新输入文本或切换目标语言、翻译接口时，先发出的翻译请求有可能晚于后发出的请求返回，这会导致旧的翻译结果覆盖最新的译文。建议在此处引入 active 清理标记防范竞态覆盖。
        const { trText } = await apiTranslate({
          text,
          fromLang,
          toLang,
          apiSetting,
        });

        setTrText(trText);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [text, fromLang, toLang, apiSetting]);

  if (!apiSetting) {
    return null;
  }

  // 极简样式渲染：通常在划词浮层中启用，呈现为流畅的纯排版译文
  if (simpleStyle) {
    return (
      <Box>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : loading ? (
          <CircularProgress size={16} />
        ) : (
          <Typography style={{ whiteSpace: "pre-line" }}>{trText}</Typography>
        )}
      </Box>
    );
  }

  // 默认文本框样式渲染：通常在主动文本翻译框（如 Popup 页或独立翻译页）中启用
  return (
    <Box>
      <TextField
        size="small"
        label={`${i18n("translated_text")} - ${apiSetting.apiName}`}
        // disabled
        fullWidth
        multiline
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
              {/* 复制译文按钮 */}
              <CopyBtn text={trText} title={i18n("copy")} />
            </Stack>
          ),
        }}
      />
    </Box>
  );
}
