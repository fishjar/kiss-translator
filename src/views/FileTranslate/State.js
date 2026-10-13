import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReaderAlert from "./ReaderAlert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { getFileClient } from "../../fileTranslation/client";
import { DEFAULT_FILE_TRANSLATE_SETTING } from "../../config/setting";
import { I18N, UI_LANGS } from "../../config/i18n";
import { OPT_STYLE_ALL } from "../../config/styles";
import { builtinStylesMap } from "../../libs/style";
import { useHomepageSettings } from "../../homepage/useHomepageSettings";

const Context = createContext(null);
const LANGUAGE_STORAGE_KEY = "kiss-file-translate-lang";
const validLanguage = (language) => UI_LANGS.some(([code]) => code === language);
const readLanguage = () => {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return validLanguage(stored) ? stored : "";
  } catch {
    return "";
  }
};
const EMPTY = {
  scenes: DEFAULT_FILE_TRANSLATE_SETTING,
  services: [],
  prompts: [],
  styles: [],
  models: [],
  ocrModels: [],
};

export function useFileTranslation() {
  return useContext(Context);
}

export function FileTranslationProvider({ children }) {
  const preferences = useHomepageSettings();
  const [context, setContext] = useState(EMPTY);
  const [session, setSession] = useState(null);
  const [cachedLanguage, setCachedLanguage] = useState(readLanguage);
  const language =
    cachedLanguage
      ? cachedLanguage
      : preferences.language === "zh_CN"
        ? "zh"
        : preferences.language;
  const chinese = language.startsWith("zh");
  const i18n = useCallback(
    (key, fallback = key) => I18N[key]?.[language] ?? fallback,
    [language]
  );
  useEffect(() => {
    document.documentElement.lang =
      language === "zh" ? "zh-CN" : language.replace("_", "-");
  }, [language]);
  const [error, setError] = useState("");
  const [extensions, setExtensions] = useState([]);
  const [selectedExtension, setSelectedExtension] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAt, setReconnectAt] = useState(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!reconnectAt) return;
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [reconnectAt]);
  const clientRef = useRef(null);
  const writes = useRef(Promise.resolve());
  const active = useRef(false);
  const refresh = useCallback(async () => {
    const client = clientRef.current;
    const sessionId = client?.session?.sessionId;
    if (!sessionId) return;
    let next;
    try {
      next = await client.request("getContext");
    } catch (failure) {
      if (
        active.current && client === clientRef.current &&
        sessionId === client.session?.sessionId
      ) throw failure;
      return;
    }
    if (
      active.current &&
      client === clientRef.current &&
      sessionId === client.session?.sessionId
    ) {
      setContext(next);
      if (validLanguage(next.uiLang)) {
        setCachedLanguage(next.uiLang);
        try {
          window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next.uiLang);
        } catch {
          // Keep the current language even when persistent storage is unavailable.
        }
      }
    }
  }, []);
  const connect = useCallback(
    async (extensionId) => {
      setConnecting(true);
      setReconnectAt(null);
      setError("");
      const client = clientRef.current;
      const version = client.connectionVersion;
      try {
        const next = await client.connect(extensionId);
        if (
          !active.current || client !== clientRef.current ||
          version !== client.connectionVersion
        ) return;
        setSession(next);
        setConnecting(false);
        setReconnectAt(null);
        setExtensions([]);
        setSelectedExtension(next.extensionId);
        await refresh();
      } catch (failure) {
        if (
          !active.current || client !== clientRef.current || client.disposed ||
          version !== client.connectionVersion
        )
          return;
        setError(failure.message);
        if (failure.extensions) {
          setExtensions(failure.extensions);
          setSelectedExtension(failure.extensions[0]);
        }
      } finally {
        if (
          active.current && client === clientRef.current &&
          version === client.connectionVersion
        )
          setConnecting(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    active.current = true;
    const client = getFileClient();
    clientRef.current = client;
    let refreshTimer;
    const unsubscribe = client.subscribe((event) => {
      if (!active.current || client !== clientRef.current) return;
      if (event.type === "disconnected") {
        setSession(null);
        setConnecting(false);
        setReconnectAt(null);
        setError(event.error.message);
      }
      if (event.type === "connecting" || event.type === "reconnecting") {
        setConnecting(true);
        setReconnecting(event.type === "reconnecting" || event.reconnecting);
        setReconnectAt(null);
      }
      if (event.type === "reconnectScheduled") {
        setReconnectAt(event.reconnectAt);
        setNow(Date.now());
      }
      if (event.type === "reconnectFailed") {
        setConnecting(false);
        setError(event.error.message);
        if (event.error.extensions) {
          setExtensions(event.error.extensions);
          setSelectedExtension(event.error.extensions[0]);
        }
      }
      if (event.type === "connected" && event.reconnecting) {
        setSession(event.session);
        setConnecting(false);
        setReconnectAt(null);
        setError("");
        setExtensions([]);
        setSelectedExtension(event.session.extensionId);
        refresh().catch((failure) => {
          if (active.current && client === clientRef.current)
            setError(failure.message);
        });
      }
      if (event.type === "contextChanged") {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(
          () =>
            refresh().catch((failure) => {
              if (active.current && client === clientRef.current)
                setError(failure.message);
            }),
          150
        );
      }
    });
    connect();
    const restored = (event) => {
      if (event.persisted) {
        client.disconnect();
        connect();
      }
    };
    window.addEventListener("pageshow", restored);
    return () => {
      active.current = false;
      clearTimeout(refreshTimer);
      unsubscribe();
      client.dispose();
      window.removeEventListener("pageshow", restored);
    };
  }, [connect, refresh]);

  const patchScene = useCallback(
    (kind, patch) => {
      if (!clientRef.current?.session) {
        setError("请先连接扩展再保存设置");
        return;
      }
      setContext((previous) => ({
        ...previous,
        scenes: {
          ...previous.scenes,
          [kind]: { ...previous.scenes[kind], ...patch },
        },
      }));
      const client = clientRef.current;
      const sessionId = client.session.sessionId;
      writes.current = writes.current
        .catch(() => {})
        .then(async () => {
          if (
            client !== clientRef.current ||
            sessionId !== client.session?.sessionId
          )
            return;
          await client.request("patchScene", { kind, patch });
        })
        .catch((failure) => {
          if (
            active.current &&
            client === clientRef.current &&
            sessionId === client.session?.sessionId
          ) {
            setError(failure.message);
            refresh().catch(() => {});
          }
        });
    },
    [refresh]
  );

  const allTextStyles = useMemo(
    () => [
      ...OPT_STYLE_ALL.map((styleSlug) => ({
        styleSlug,
        styleName: i18n(styleSlug),
        styleCode: builtinStylesMap[styleSlug] || "",
      })),
      ...context.styles,
    ],
    [context.styles, i18n]
  );
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: preferences.themeMode, primary: { main: "#0B57D0" } },
        shape: { borderRadius: 4 },
        typography: { button: { textTransform: "none" } },
        components: {
          MuiTextField: {
            defaultProps: { size: "small", variant: "outlined" },
          },
          MuiButton: {
            defaultProps: { size: "small" },
            styleOverrides: {
              root: ({ theme, ownerState }) =>
                theme.palette.mode === "dark" &&
                ownerState.color === "primary" &&
                ownerState.variant !== "contained"
                  ? {
                      "&:not(.Mui-disabled)": {
                        color: theme.palette.common.white,
                        ...(ownerState.variant === "outlined" && {
                          borderColor: "rgba(255, 255, 255, 0.5)",
                        }),
                      },
                    }
                  : {},
            },
          },
          MuiChip: {
            styleOverrides: {
              root: ({ theme, ownerState }) =>
                theme.palette.mode === "dark" &&
                ownerState.color === "primary" &&
                ownerState.variant === "outlined"
                  ? {
                      color: theme.palette.common.white,
                      borderColor: "rgba(255, 255, 255, 0.5)",
                      "& .MuiChip-icon, & .MuiChip-deleteIcon": {
                        color: "inherit",
                      },
                    }
                  : {},
            },
          },
        },
      }),
    [preferences.themeMode]
  );
  const openSettings = useCallback((path = "") => {
    const page = path.includes("local-ai")
      ? "models"
      : path.includes("prompts")
        ? "prompts"
        : "services";
    clientRef.current
      .request("openSettings", { page })
      .catch((failure) => setError(failure.message));
  }, []);
  const statusLabel = connecting
    ? chinese
      ? reconnecting ? "正在重连…" : "连接中…"
      : reconnecting ? "Reconnecting…" : "Connecting…"
    : session
      ? `${chinese ? "已连接" : "Connected"} · ${session.extensionVersion}`
      : chinese
        ? reconnectAt
          ? `未连接 · ${Math.max(0, Math.ceil((reconnectAt - now) / 1000))} 秒后重连`
          : "未连接"
        : reconnectAt
          ? `Disconnected · Reconnecting in ${Math.max(0, Math.ceil((reconnectAt - now) / 1000))}s`
          : "Disconnected";
  const connectionStatus = (
    <Button
      size="small"
      disabled={connecting}
      onClick={() => connect(selectedExtension || undefined)}
      aria-label={
        session
          ? chinese
            ? "刷新配置"
            : "Refresh settings"
          : chinese
            ? "连接扩展"
            : "Connect extension"
      }
      title={
        error ||
        context.modelError ||
        (session
          ? `${session.development ? (chinese ? "开发构建 · " : "Development build · ") : ""}${chinese ? "点击刷新配置" : "Click to refresh settings"}`
          : statusLabel)
      }
      color={
        session
          ? error || context.modelError
            ? "warning"
            : "success"
          : "inherit"
      }
      startIcon={
        <Box
          component="span"
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: "currentColor",
          }}
        />
      }
      sx={{ whiteSpace: "nowrap", minWidth: 0 }}
    >
      {statusLabel}
    </Button>
  );
  const connectionNotice = !session ? (
    <Box sx={{ px: 1.5, pt: 1.25, flexShrink: 0 }}>
      <ReaderAlert
        severity="info"
        sx={{ borderRadius: 1 }}
        action={
          <Button
            size="small"
            disabled={connecting}
            onClick={() => connect(selectedExtension || undefined)}
            sx={{
              py: 0.25,
              px: 1.25,
              fontSize: 12.5,
              lineHeight: 1.4,
              minWidth: "auto",
              textTransform: "none",
            }}
          >
            {connecting
              ? chinese
                ? reconnecting ? "正在重连…" : "连接中…"
                : reconnecting ? "Reconnecting…" : "Connecting…"
              : chinese
                ? reconnectAt ? "立即重连" : "连接扩展"
                : reconnectAt ? "Reconnect now" : "Connect extension"}
          </Button>
        }
      >
        {chinese
          ? "翻译需要连接 Edge、Chrome 或 Firefox 扩展。Safari、油猴和 Thunderbird 暂不支持；未连接时可解析和预览文件。"
          : "Connect an Edge, Chrome or Firefox extension to translate. Safari, userscripts and Thunderbird are not supported yet. Files can be parsed and previewed while disconnected."}
      </ReaderAlert>
      {!!extensions.length && (
        <Select
          size="small"
          value={selectedExtension}
          onChange={(event) => setSelectedExtension(event.target.value)}
        >
          {extensions.map((id) => (
            <MenuItem key={id} value={id}>
              {id}
            </MenuItem>
          ))}
        </Select>
      )}
      {(error || context.modelError) && (
        <ReaderAlert severity="warning" sx={{ mt: 0.75, borderRadius: 1 }}>
          {error || context.modelError}
        </ReaderAlert>
      )}
    </Box>
  ) : null;
  const value = {
    connectionNotice,
    connectionStatus,
    context,
    client: clientRef.current,
    connected: !!session,
    i18n,
    uiLang: language,
    patchScene,
    allTextStyles,
    openSettings,
    toggleTheme: preferences.toggleThemeMode,
  };

  return (
    <Context.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Context.Provider>
  );
}
