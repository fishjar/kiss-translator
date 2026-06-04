import React from "react";
import ReactDOM from "react-dom/client";
import Options from "./views/Options";

// 标记当前上下文为 "options"，方便其他共享库得知当前处于设置选项页环境
globalThis.__KISS_CONTEXT__ = "options";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
