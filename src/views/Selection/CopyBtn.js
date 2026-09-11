import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import { useEffect, useRef, useState } from "react";

/**
 * 复制文本内容按钮组件
 *
 * @param {Object} props
 * @param {string} props.text - 需要复制的纯文本内容
 * @param {string} props.title - 悬浮提示文案（本地化），所有调用方必须显式传入
 */
export default function CopyBtn({ text, title }) {
  // copied 状态标识是否刚刚成功执行了复制操作
  const [copied, setCopied] = useState(false);
  // 复制成功状态的定时器引用，覆盖与卸载时统一清理，避免卸载后仍触发 setState
  const timerRef = useRef(null);
  // 卸载守卫：卸载可能发生在 writeText 的 await 期间——此时既有 cleanup 先跑
  // （定时器尚不存在），await 返回后必须先判定再 setState，否则会把
  // setCopied 打在已卸载 fiber 上并新建 500ms 幽灵定时器（无人清理）。
  const mountedRef = useRef(true);
  // 代际 token：每次点击复制递增。慢的旧复制 Promise 晚于新复制完成返回时，
  // 不得覆盖较新的 copied 视觉状态、不得残留旧 timer。
  const generationRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // StrictMode 开发环境会双调 effect：setup → cleanup → setup。cleanup 会把
  // mountedRef 翻为 false；必须在每次 setup 恢复 true，否则挂载后点击永远被
  // mountedRef.current === false 拦截，复制完成图标永不出现。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  const handleClick = async (e) => {
    e.stopPropagation();
    // 剪贴板能力守卫：非安全上下文或未实现该 API 的环境直接降级为无操作
    if (typeof navigator.clipboard?.writeText !== "function") {
      return;
    }
    // 每次点击进入新一代，旧代返回不得覆盖新代状态
    const generation = ++generationRef.current;
    try {
      await navigator.clipboard.writeText(text);
      // await 期间可能已卸载，或已被更新的复制取代：先判定再 setState
      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }
      setCopied(true);
      // 新复制发生时替换上一个定时器
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, 500);
    } catch {
      // 剪贴板不可用或权限被拒绝：静默降级，不翻转 copied 状态
    }
  };

  return (
    <IconButton
      size="small"
      aria-label={title}
      // 鼠标按下时阻止默认行为，避免所在 TextField 因 mousedown 先失焦而卸载按钮，
      // 与提交按钮同一套 blur/click 竞态修复模式，保证 onClick 正常触发。
      onMouseDown={(e) => e.preventDefault()}
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
