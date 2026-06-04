import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import { useState } from "react";

/**
 * 复制文本内容按钮组件
 *
 * @param {Object} props
 * @param {string} props.text - 需要复制的纯文本内容
 * @param {string} [props.title="copy"] - 悬浮提示文案
 */
export default function CopyBtn({ text, title = "copy" }) {
  // copied 状态标识是否刚刚成功执行了复制操作
  const [copied, setCopied] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    // 写入系统剪贴板
    await navigator.clipboard.writeText(text);
    setCopied(true);

    // REVIEW: 1. setTimeout 内部执行 clearTimeout(timer) 逻辑属于冗余操作。
    // REVIEW: 2. 如果组件在 500ms 内卸载，此时定时器未被注销依然会触发异步 setState 导致潜在的 React warning，建议在组件卸载时进行定时器的清理。
    const timer = setTimeout(() => {
      clearTimeout(timer);
      setCopied(false);
    }, 500);
  };

  return (
    <IconButton
      size="small"
      sx={{
        opacity: 0.5,
        "&:hover": {
          opacity: 1,
        },
      }}
      onClick={handleClick}
      title={title}
    >
      {copied ? (
        <LibraryAddCheckIcon fontSize="inherit" />
      ) : (
        <ContentCopyIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}
