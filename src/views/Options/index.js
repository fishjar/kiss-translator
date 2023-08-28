import { Routes, Route, HashRouter } from "react-router-dom";
import About from "./About";
import Rules from "./Rules";
import Setting from "./Setting";
import Layout from "./Layout";
import SyncSetting from "./SyncSetting";
import { StoragesProvider } from "../../hooks/Storage";
import ThemeProvider from "../../hooks/Theme";
import { useEffect, useState } from "react";
import { isGm } from "../../libs/browser";
import { sleep } from "../../libs/utils";
import CircularProgress from "@mui/material/CircularProgress";
import { trySyncAll } from "../../libs/sync";
import { AlertProvider } from "../../hooks/Alert";

export default function Options() {
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (isGm) {
        // 等待GM注入
        let i = 0;
        for (;;) {
          if (window.APP_NAME === process.env.REACT_APP_NAME) {
            setReady(true);
            break;
          }

          if (++i > 8) {
            setError(true);
            break;
          }

          await sleep(1000);
        }
      }

      // 同步数据
      trySyncAll();
    })();
  }, []);

  if (error) {
    return (
      <center>
        <h2>
          Please confirm whether to install or enable{" "}
          <a href={process.env.REACT_APP_HOMEPAGE}>KISS Translator</a>{" "}
          GreaseMonkey script?
        </h2>
        <h2>
          <a href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}>Click here</a>{" "}
          to install, or <a href={process.env.REACT_APP_HOMEPAGE}>click here</a>{" "}
          for help.
        </h2>
      </center>
    );
  }

  if (isGm && !ready) {
    return (
      <center>
        <p>{`KISS Translator v${process.env.REACT_APP_VERSION}`}</p>
        <CircularProgress />
      </center>
    );
  }

  return (
    <StoragesProvider>
      <ThemeProvider>
        <AlertProvider>
          <HashRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Setting />} />
                <Route path="rules" element={<Rules />} />
                <Route path="sync" element={<SyncSetting />} />
                <Route path="about" element={<About />} />
              </Route>
            </Routes>
          </HashRouter>
        </AlertProvider>
      </ThemeProvider>
    </StoragesProvider>
  );
}
