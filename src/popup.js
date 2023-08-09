import React from "react";
import ReactDOM from "react-dom/client";
import { StoragesProvider } from "./hooks/Storage";
import ThemeProvider from "./hooks/Theme";
import Popup from "./views/Popup";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <StoragesProvider>
      <ThemeProvider>
        <Popup />
      </ThemeProvider>
    </StoragesProvider>
  </React.StrictMode>
);
