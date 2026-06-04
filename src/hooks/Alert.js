import {
  createContext,
  useContext,
  useState,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import Snackbar from "@mui/material/Snackbar";
import MuiAlert from "@mui/material/Alert";

// 包装 Material UI 的 Alert 组件，使用 forwardRef 以便 Snackbar 能够定位和控制它
const Alert = forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

// 创建全局 Alert 上下文，以便在子组件中快速调用提示弹窗
const AlertContext = createContext(null);

/**
 * 消息提示 Provider，注入 Context 后，方便在应用的任何地方全局调用消息提示弹窗
 * @param {*} param0
 * @returns
 */
export function AlertProvider({ children }) {
  // 设置 Snackbar 默认弹出的垂直和水平对齐位置（上方居中）
  const vertical = "top";
  const horizontal = "center";

  // 状态控制：Snackbar 是否显示
  const [open, setOpen] = useState(false);
  // 状态控制：提示类型 (error, warning, info, success)
  const [severity, setSeverity] = useState("info");
  // 状态控制：提示文本内容
  const [message, setMessage] = useState(null);

  // 显示提示的辅助函数
  const showAlert = useCallback((msg, type) => {
    // 先关闭当前的alert，然后再打开新的
    // 这样可以重置autoHideDuration计时器
    setOpen(false);
    // 使用setTimeout确保状态更新完成后再打开新的alert
    // REVIEW: 这里的 setTimeout(() => { ... }, 0) 在组件如果遭遇快速销毁/卸载（unmount）时，
    // 定时器回调仍会被触发并更新已卸载组件的状态。虽然 React 18+ 移除了卸载更新警告，但最好能在卸载时清理该定时器，以避免潜在问题。
    setTimeout(() => {
      setMessage(msg);
      setSeverity(type);
      setOpen(true);
    }, 0);
  }, []);

  // 处理 Snackbar 关闭事件
  const handleClose = useCallback((_, reason) => {
    // 如果用户点击 Snackbar 以外的区域，默认不关闭（防止用户误触导致提示消失）
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  }, []);

  // 缓存导出的接口对象，避免子组件因为 Context Value 的改变而产生不必要的重绘
  const value = useMemo(
    () => ({
      error: (msg) => showAlert(msg, "error"),
      warning: (msg) => showAlert(msg, "warning"),
      info: (msg) => showAlert(msg, "info"),
      success: (msg) => showAlert(msg, "success"),
    }),
    [showAlert]
  );

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={5000} // 自动隐藏时间为 5 秒
        onClose={handleClose}
        anchorOrigin={{ vertical, horizontal }}
      >
        <Alert
          onClose={handleClose}
          severity={severity}
          sx={{
            minWidth: 300,
            maxWidth: "80vw",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </AlertContext.Provider>
  );
}

// 导出 Hook，方便子组件获取 Alert 的 error, warning, info, success 触发方法
export function useAlert() {
  return useContext(AlertContext);
}
