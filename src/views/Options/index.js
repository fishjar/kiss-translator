import { Routes, Route, HashRouter } from "react-router-dom";
import About from "./About";
import Rules from "./Rules";
import Setting from "./Setting";
import Layout from "./Layout";
import SyncSetting from "./SyncSetting";
import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "../../hooks/Theme";
import { useEffect, useState } from "react";
import { isGm } from "../../libs/client";
import { sleep } from "../../libs/utils";
import CircularProgress from "@mui/material/CircularProgress";
import { trySyncSettingAndRules } from "../../libs/sync";
import { AlertProvider } from "../../hooks/Alert";
import Link from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";

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
            // 同步数据
            await trySyncSettingAndRules();
            setReady(true);
            break;
          }

          if (++i > 8) {
            setError(true);
            break;
          }

          await sleep(1000);
        }
      } else {
        // 同步数据
        await trySyncSettingAndRules();
        setReady(true);
      }
    })();
  }, []);

  if (error) {
    return (
      <center>
        <Divider>
          <Link
            href={process.env.REACT_APP_HOMEPAGE}
          >{`KISS Translator v${process.env.REACT_APP_VERSION}`}</Link>
        </Divider>
        <h2>
          Please confirm whether to install or enable KISS Translator
          GreaseMonkey script?
        </h2>
        <Stack spacing={2}>
          <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}>
            Install Userscript 1
          </Link>
          <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL2}>
            Install Userscript 2
          </Link>
          <Link href={process.env.REACT_APP_OPTIONSPAGE}>
            Open Options Page 1
          </Link>
          <Link href={process.env.REACT_APP_OPTIONSPAGE2}>
            Open Options Page 2
          </Link>
        </Stack>
      </center>
    );
  }

  if (!ready) {
    return (
      <center>
        <Divider>
          <Link
            href={process.env.REACT_APP_HOMEPAGE}
          >{`KISS Translator v${process.env.REACT_APP_VERSION}`}</Link>
        </Divider>
        <CircularProgress />
      </center>
    );
  }

  return (
    <SettingProvider>
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
    </SettingProvider>
  );
}
