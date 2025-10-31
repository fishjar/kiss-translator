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
    setOpen(true);
    setMessage(msg);
    setSeverity(type);
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
        autoHideDuration={10000}
        onClose={handleClose}
        anchorOrigin={{ vertical, horizontal }}
      >
        <Alert
          onClose={handleClose}
          severity={severity}
          sx={{ minWidth: "300px", maxWidth: "80%" }}
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
