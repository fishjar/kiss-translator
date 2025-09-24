import {
  useState,
  useContext,
  createContext,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@mui/material/Button";
import { useI18n } from "./I18n";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialogConfig, setDialogConfig] = useState(null);
  const resolveRef = useRef(null);
  const i18n = useI18n();

  const translatedDefaults = useMemo(
    () => ({
      title: i18n("confirm_title", "Confirm"),
      message: i18n("confirm_message", "Are you sure you want to proceed?"),
      confirmText: i18n("confirm_action", "Confirm"),
      cancelText: i18n("cancel_action", "Cancel"),
    }),
    [i18n]
  );

  const confirm = useCallback(
    (config) => {
      return new Promise((resolve) => {
        setDialogConfig({ ...translatedDefaults, ...config });
        resolveRef.current = resolve;
      });
    },
    [translatedDefaults]
  );

  const handleClose = () => {
    if (resolveRef.current) {
      resolveRef.current(false);
    }
    setDialogConfig(null);
  };

  const handleConfirm = () => {
    if (resolveRef.current) {
      resolveRef.current(true);
    }
    setDialogConfig(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Dialog
        open={!!dialogConfig}
        onClose={handleClose}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        {dialogConfig && (
          <>
            <DialogTitle id="confirm-dialog-title">
              {dialogConfig.title}
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="confirm-dialog-description">
                {dialogConfig.message}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose}>{dialogConfig.cancelText}</Button>
              <Button onClick={handleConfirm} color="primary" autoFocus>
                {dialogConfig.confirmText}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
