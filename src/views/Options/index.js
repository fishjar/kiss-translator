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
import InputSetting from "./InputSetting";

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
                `The version is inconsistent, please check whether the script(v${version}) is the latest version(v${process.env.REACT_APP_VERSION}). (版本不一致，请检查脚本(v${version})是否为最新版(v${process.env.REACT_APP_VERSION}))`
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
            setError("Time out. (连接超时)");
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
          GreaseMonkey script? (请检查是否安装或启用简约翻译油猴脚本)
        </h2>
        <Stack spacing={2}>
          <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}>
            Install Userscript for Tampermonkey/Violentmonkey 1 (油猴脚本
            安装地址 1)
          </Link>
          <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL2}>
            Install Userscript for Tampermonkey/Violentmonkey 2 (油猴脚本
            安装地址 2)
          </Link>
          <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL}>
            Install Userscript for iOS Safari 1 (油猴脚本 iOS Safari专用
            安装地址 1)
          </Link>
          <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL2}>
            Install Userscript for iOS Safari 2 (油猴脚本 iOS Safari专用
            安装地址 2)
          </Link>
          <Link href={process.env.REACT_APP_OPTIONSPAGE}>
            Open Options Page 1 (打开设置页面 1)
          </Link>
          <Link href={process.env.REACT_APP_OPTIONSPAGE2}>
            Open Options Page 2 (打开设置页面 2)
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
                <Route path="input" element={<InputSetting />} />
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
