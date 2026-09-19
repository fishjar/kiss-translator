import { Routes, Route, HashRouter, useLocation } from "react-router-dom";
import About from "./About";
import Rules from "./Rules";
import Setting from "./Setting";
import Layout from "./Layout";
import SyncSetting from "./SyncSetting";
import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "./OptionsTheme";
import { useEffect, useRef, useState } from "react";
import { isGm } from "../../libs/client";
import { STOKEY_SETTING } from "../../config";
import { AlertProvider } from "../../hooks/Alert";
import { ConfirmProvider } from "../../hooks/Confirm";
import Link from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Apis from "./Apis";
import Prompts from "./Prompts";
import InputSetting from "./InputSetting";
import Tranbox from "./Tranbox";
import FavWords from "./FavWords";
import Playgound from "./Playground";
import MouseHoverSetting from "./MouseHover";
import SubtitleSetting from "./Subtitle";
import StylesSetting from "./StylesSetting";
import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";
import InteractionLock from "./InteractionLock";
import {
  createOptionsStartup,
  getRequiredOptionsSyncKeys,
  OPTIONS_SYNC_KEYS,
} from "./startup";

export { normalizeOptionsPath as normalizeOptionsHashPath } from "./paths";

function SyncBackdrop({ open }) {
  return (
    <Backdrop
      data-testid="options-sync-backdrop"
      aria-label="syncing required data"
      role="status"
      open={open}
      sx={(theme) => ({
        color: "#fff",
        zIndex: theme.zIndex.modal + 1,
      })}
    >
      <CircularProgress color="inherit" size={72} />
    </Backdrop>
  );
}

function OptionsContent({ pendingKeys, children }) {
  const { pathname } = useLocation();
  const syncing = getRequiredOptionsSyncKeys(pathname).some((key) =>
    pendingKeys.includes(key)
  );

  return (
    <>
      <InteractionLock data-testid="options-content" locked={syncing}>
        {children}
      </InteractionLock>
      <SyncBackdrop open={syncing} />
    </>
  );
}

export default function Options() {
  const [error, setError] = useState("");
  const [localStorageReady, setLocalStorageReady] = useState(false);
  const [pendingKeys, setPendingKeys] = useState(OPTIONS_SYNC_KEYS);
  const startupRef = useRef(null);

  useEffect(() => {
    let active = true;
    // Reuse the work when StrictMode subscribes to this effect a second time.
    if (!startupRef.current) startupRef.current = createOptionsStartup();
    const reportError = (err) => {
      if (active) setError(err?.message || String(err));
    };

    startupRef.current.localReady.then(() => {
      if (active) setLocalStorageReady(true);
    }, reportError);
    Object.entries(startupRef.current.completed).forEach(([key, completed]) => {
      completed.then(() => {
        if (active) {
          setPendingKeys((pending) => pending.filter((item) => item !== key));
        }
      }, reportError);
    });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <center>
        <Divider>
          <Link
            href={process.env.REACT_APP_HOMEPAGE}
          >{`KISS Translator v${process.env.REACT_APP_VERSION}`}</Link>
        </Divider>
        <Alert severity="error">{error}</Alert>
        {isGm && (
          <Stack spacing={2}>
            <Link href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}>
              Install/Update Userscript for Tampermonkey/Violentmonkey
            </Link>
            <Link href={process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL}>
              Install/Update Userscript for iOS Safari
            </Link>
          </Stack>
        )}
      </center>
    );
  }

  if (!localStorageReady) return <SyncBackdrop open />;

  return (
    <SettingProvider context="options">
      <ThemeProvider>
        <HashRouter>
          <OptionsContent pendingKeys={pendingKeys}>
            <AlertProvider>
              <ConfirmProvider>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Setting />} />
                    <Route path="rules" element={<Rules />} />
                    <Route path="styles" element={<StylesSetting />} />
                    <Route path="input" element={<InputSetting />} />
                    <Route path="tranbox" element={<Tranbox />} />
                    <Route path="mousehover" element={<MouseHoverSetting />} />
                    <Route path="subtitle" element={<SubtitleSetting />} />
                    <Route path="apis" element={<Apis />} />
                    <Route path="prompts" element={<Prompts />} />
                    <Route path="sync" element={<SyncSetting />} />
                    <Route path="words" element={<FavWords />} />
                    <Route
                      path="playground"
                      element={
                        <Playgound
                          initialSettingsReady={
                            !pendingKeys.includes(STOKEY_SETTING)
                          }
                        />
                      }
                    />
                    <Route path="about" element={<About />} />
                  </Route>
                </Routes>
              </ConfirmProvider>
            </AlertProvider>
          </OptionsContent>
        </HashRouter>
      </ThemeProvider>
    </SettingProvider>
  );
}
