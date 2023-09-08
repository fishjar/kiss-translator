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
import { adaptScript } from "../../libs/gm";
import Alert from "@mui/material/Alert";
import Apis from "./Apis";
import Webfix from "./Webfix";

export default function Options() {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (isGm) {
        // 等待GM注入
        let i = 0;
        for (;;) {
          if (window?.APP_INFO?.name === process.env.REACT_APP_NAME) {
            const { version, eventName } = window.APP_INFO;

            // 检查版本是否一致
            if (version !== process.env.REACT_APP_VERSION) {
              setError(
                `The version of the script(v${version}) and this page(v${process.env.REACT_APP_VERSION}) are inconsistent.`
              );
              break;
            }

            if (eventName) {
              // 注入GM接口
              adaptScript(eventName);
            }

            // 同步数据
            await trySyncSettingAndRules();
            setReady(true);
            break;
          }

          if (++i > 8) {
            setError("Time out.");
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
        <Alert severity="error">{error}</Alert>
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
          <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL}>
            Install Userscript Safari 1
          </Link>
          <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL2}>
            Install Userscript Safari 2
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
                <Route path="apis" element={<Apis />} />
                <Route path="sync" element={<SyncSetting />} />
                <Route path="webfix" element={<Webfix />} />
                <Route path="about" element={<About />} />
              </Route>
            </Routes>
          </HashRouter>
        </AlertProvider>
      </ThemeProvider>
    </SettingProvider>
  );
}
