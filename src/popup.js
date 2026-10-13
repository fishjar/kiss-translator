import React from "react";
import ReactDOM from "react-dom/client";
import { SettingProvider } from "./hooks/Setting";
import ThemeProvider from "./views/Popup/PopupTheme";
import Popup from "./views/Popup";
import "./styles/popupDocument.css";

// Identify the popup context for shared libraries.
globalThis.__KISS_CONTEXT__ = "popup";

// Establish the toolbar's intrinsic width before asynchronous settings load.
// A separate translation window follows its native window dimensions.
if (window.location.hash.slice(1) !== "tranbox") {
  document.documentElement.classList.add("kt-toolbar-popup");
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {/* Provide global settings and theme contexts. */}
    <SettingProvider context="popup">
      <ThemeProvider>
        <Popup />
      </ThemeProvider>
    </SettingProvider>
  </React.StrictMode>
);
