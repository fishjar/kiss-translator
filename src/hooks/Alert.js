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

const Alert = forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

const AlertContext = createContext(null);

/**
 * 左下角提示，注入context后，方便全局调用
 * @param {*} param0
 * @returns
 */
export function AlertProvider({ children }) {
  const vertical = "top";
  const horizontal = "center";
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState("info");
  const [message, setMessage] = useState(null);

  const showAlert = useCallback((msg, type) => {
    // 先关闭当前的alert，然后再打开新的
    // 这样可以重置autoHideDuration计时器
    setOpen(false);
    // 使用setTimeout确保状态更新完成后再打开新的alert
    setTimeout(() => {
      setMessage(msg);
      setSeverity(type);
      setOpen(true);
    }, 0);
  }, []);

  const handleClose = useCallback((_, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  }, []);

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
        autoHideDuration={5000}
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

export function useAlert() {
  return useContext(AlertContext);
}
