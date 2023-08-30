import { createContext, useContext, useState, forwardRef } from "react";
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
  const [message, setMessage] = useState("");

  const showAlert = (msg, type) => {
    setOpen(true);
    setMessage(msg);
    setSeverity(type);
  };

  const handleClose = (_, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  const error = (msg) => showAlert(msg, "error");
  const warning = (msg) => showAlert(msg, "warning");
  const info = (msg) => showAlert(msg, "info");
  const success = (msg) => showAlert(msg, "success");

  return (
    <AlertContext.Provider value={{ error, warning, info, success }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={3000}
        onClose={handleClose}
        anchorOrigin={{ vertical, horizontal }}
      >
        <Alert onClose={handleClose} severity={severity} sx={{ width: "100%" }}>
          {message}
        </Alert>
      </Snackbar>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  return useContext(AlertContext);
}
