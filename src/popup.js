import React from "react";
import ReactDOM from "react-dom/client";
import { SettingProvider } from "./hooks/Setting";
import ThemeProvider from "./hooks/Theme";
import Popup from "./views/Popup";

// 标记当前上下文为 "popup"，方便其他共享库得知当前处于浏览器插件弹窗面板环境
globalThis.__KISS_CONTEXT__ = "popup";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {/* 注入全局设置 Context 和主题 Context */}
    <SettingProvider context="popup">
      <ThemeProvider>
        <Popup />
      </ThemeProvider>
    </SettingProvider>
  </React.StrictMode>
);
