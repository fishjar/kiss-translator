import React from "react";
import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "../../hooks/M2Theme";
import { AlertProvider } from "../../hooks/Alert";
import { ConfirmProvider } from "../../hooks/Confirm";
import FileTranslateView from "./FileTranslateView";

/**
 * 独立的文件翻译页面根组件，注入全局设置、明暗主题与提示上下文
 */
export default function FileTranslatePage() {
  return (
    <SettingProvider context="options">
      <ThemeProvider>
        <AlertProvider>
          <ConfirmProvider>
            <FileTranslateView />
          </ConfirmProvider>
        </AlertProvider>
      </ThemeProvider>
    </SettingProvider>
  );
}
