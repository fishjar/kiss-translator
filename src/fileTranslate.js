import React from "react";
import ReactDOM from "react-dom/client";
import FileTranslatePage from "./views/FileTranslate";
import { registerI18n } from "./config/i18n";
import { FILE_TRANSLATE_I18N } from "./config/locales/fileTranslate";
import { LOCAL_AI_I18N } from "./config/locales/localAi";

registerI18n(FILE_TRANSLATE_I18N);
registerI18n(LOCAL_AI_I18N);

// 标记当前上下文为 "fileTranslate"
globalThis.__KISS_CONTEXT__ = "fileTranslate";

const root = ReactDOM.createRoot(document.getElementById("root"));
// 本入口只承载页面本体：页面视图树不含分发器图标（图标直连 MUI 静态导入），
// 仅依赖用户主题色；主题色写入点在 FileTranslationProvider（State.js），
// 不挂全页 SettingProvider。
root.render(
  <React.StrictMode>
    <FileTranslatePage />
  </React.StrictMode>
);
