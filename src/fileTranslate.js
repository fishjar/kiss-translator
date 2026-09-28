import React from "react";
import ReactDOM from "react-dom/client";
import FileTranslatePage from "./views/FileTranslate";

// 标记当前上下文为 "fileTranslate"
globalThis.__KISS_CONTEXT__ = "fileTranslate";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <FileTranslatePage />
  </React.StrictMode>
);
