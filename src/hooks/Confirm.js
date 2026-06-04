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

// 创建确认弹窗的全局 Context，用于在子组件中拉起确认弹窗并获取其点击结果
const ConfirmContext = createContext(null);

/**
 * 确认弹窗 Provider，用于为整个应用提供编程式的 Promise 弹窗机制
 */
export function ConfirmProvider({ children }) {
  // 控制当前弹窗的配置数据，为 null 时表示弹窗关闭
  const [dialogConfig, setDialogConfig] = useState(null);

  // 使用 ref 保存当前弹窗 Promise 的 resolve 回调函数，以便在点击确定/取消时触发
  const resolveRef = useRef(null);
  const i18n = useI18n();

  // 根据语言本地化函数，计算确认框的各种默认文字
  const translatedDefaults = useMemo(
    () => ({
      title: i18n("confirm_title", "Confirm"),
      message: i18n("confirm_message", "Are you sure you want to proceed?"),
      confirmText: i18n("confirm_action", "Confirm"),
      cancelText: i18n("cancel_action", "Cancel"),
    }),
    [i18n]
  );

  /**
   * 调起确认对话框的主入口，返回一个 Promise，用户点击确认时 resolve(true)，取消/关闭时 resolve(false)
   * @param {object} config 外部传入的对话框配置，可覆盖默认的 title, message, confirmText, cancelText 等
   * @returns {Promise<boolean>}
   */
  const confirm = useCallback(
    (config) => {
      return new Promise((resolve) => {
        // 合并默认本地化翻译和外部自定义配置
        setDialogConfig({ ...translatedDefaults, ...config });
        // 保存 resolve 句柄，等待用户交互触发
        resolveRef.current = resolve;
      });
    },
    [translatedDefaults]
  );

  // 处理关闭/取消操作
  const handleClose = () => {
    if (resolveRef.current) {
      resolveRef.current(false);
    }
    setDialogConfig(null);
  };

  // 处理确认操作
  const handleConfirm = () => {
    if (resolveRef.current) {
      resolveRef.current(true);
    }
    setDialogConfig(null);
  };

  // REVIEW: 如果在 Dialog 打开的情况下，ConfirmProvider 组件突然被卸载(Unmount)（例如用户关闭弹出页或切换视图），
  // 则 resolveRef.current 对应的 Promise 将保持在永远 pending 的状态。
  // 建议增加 useEffect 监听卸载事件，并在 cleanup 时执行：
  // if (resolveRef.current) resolveRef.current(false);
  // 以妥善完成外部可能正在 await 的异步任务。

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

// 导出 Hook，方便子组件直接通过 const confirm = useConfirm() 拉起对话框并 await 结果
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
