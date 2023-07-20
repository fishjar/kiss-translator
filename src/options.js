import React from "react";
import ReactDOM from "react-dom/client";
import ThemeProvider from "./hooks/Theme";
import Options from "./views/Options";
import { HashRouter } from "react-router-dom";
import { StoragesProvider } from "./hooks/Storage";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <StoragesProvider>
      <ThemeProvider>
        <HashRouter>
          <Options />
        </HashRouter>
      </ThemeProvider>
    </StoragesProvider>
  </React.StrictMode>
);
