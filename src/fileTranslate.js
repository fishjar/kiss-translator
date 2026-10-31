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
root.render(
  <React.StrictMode>
    <FileTranslatePage />
  </React.StrictMode>
);
