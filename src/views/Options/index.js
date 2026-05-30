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
import { trySyncSettingAndRules } from "../../libs/sync";
import { AlertProvider } from "../../hooks/Alert";
import { ConfirmProvider } from "../../hooks/Confirm";
import Link from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import { adaptScript } from "../../libs/gm";
import Alert from "@mui/material/Alert";
import Apis from "./Apis";
import InputSetting from "./InputSetting";
import Tranbox from "./Tranbox";
import FavWords from "./FavWords";
import Playgound from "./Playground";
import MouseHoverSetting from "./MouseHover";
import SubtitleSetting from "./Subtitle";
import Loading from "../../hooks/Loading";
import StylesSetting from "./StylesSetting";

/**
 * 选项设置中心 (Options) 根入口组件
 */
export default function Options() {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 检查油猴脚本版本与内置扩展打包版本的前两位主次版本号是否匹配
    const isValidVersion = (v1Str, v2Str) => {
      if (!v1Str || !v2Str) {
        return false;
      }

      const v1 = v1Str.split(".");
      const v2 = v2Str.split(".");

      return v1[0] === v2[0] && v1[1] === v2[1];
    };

    (async () => {
      if (isGm) {
        // 油猴脚本环境运行：轮询等待 GM_info 与 window.APP_INFO 被成功注入并初始化完毕
        let i = 0;
        for (;;) {
          if (window?.APP_INFO?.name === process.env.REACT_APP_NAME) {
            const { version, eventName } = window.APP_INFO;

            // 检查油猴端脚本版本是否需要更新升级
            if (!isValidVersion(version, process.env.REACT_APP_VERSION)) {
              setError(
                `The version of the local script(v${version}) is not the latest version(v${process.env.REACT_APP_VERSION}). 本地脚本之版本(v${version})非最新版(v${process.env.REACT_APP_VERSION})。`
              );
              return;
            }

            if (eventName) {
              // 绑定跨作用域油猴 GM 通信接口方法
              adaptScript(eventName);
            }

            break;
          }

          // 循环轮询 8 次 (共 8 秒) 后判定为连接油猴后台超时
          if (++i > 8) {
            setError(
              "Time out. Please confirm whether to install or enable KISS Translator GreaseMonkey script? 连接超时，请检查是否安装或启用简约翻译油猴脚本。"
            );
            return;
          }

          await sleep(1000);
        }
      }

      // 同步最新配置及过滤翻译规则数据 (例如 WebDAV)
      await trySyncSettingAndRules();
      setReady(true);
    })();
  }, []);

  // 展示版本不匹配或连接超时时的致命错误提示引导区
  if (error) {
    return (
      <center>
        <Divider>
          <Link
            href={process.env.REACT_APP_HOMEPAGE}
          >{`KISS Translator v${process.env.REACT_APP_VERSION}`}</Link>
        </Divider>
        <Alert severity="error">{error}</Alert>
        <Stack spacing={2}>
          <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}>
            Install/Update Userscript for Tampermonkey/Violentmonkey
          </Link>
          <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL}>
            Install/Update Userscript for iOS Safari
          </Link>
        </Stack>
      </center>
    );
  }

  // 加载数据尚未就绪状态，展示 Loading 动效组件
  if (!ready) {
    return <Loading />;
  }

  return (
    <SettingProvider context="options">
      <ThemeProvider>
        <AlertProvider>
          <ConfirmProvider>
            {/* React 页面端路由管理 */}
            <HashRouter>
              <Routes>
                <Route path="/" element={<Layout />}>
                  {/* 子页面路由注册 */}
                  <Route index element={<Setting />} />
                  <Route path="rules" element={<Rules />} />
                  <Route path="styles" element={<StylesSetting />} />
                  <Route path="input" element={<InputSetting />} />
                  <Route path="tranbox" element={<Tranbox />} />
                  <Route path="mousehover" element={<MouseHoverSetting />} />
                  <Route path="subtitle" element={<SubtitleSetting />} />
                  <Route path="apis" element={<Apis />} />
                  <Route path="sync" element={<SyncSetting />} />
                  <Route path="words" element={<FavWords />} />
                  <Route path="playground" element={<Playgound />} />
                  <Route path="about" element={<About />} />
                </Route>
              </Routes>
            </HashRouter>
          </ConfirmProvider>
        </AlertProvider>
      </ThemeProvider>
    </SettingProvider>
  );
}
