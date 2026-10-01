import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { getFileClient } from "../../fileTranslation/client";
import { DEFAULT_FILE_TRANSLATE_SETTING } from "../../config/setting";
import { I18N } from "../../config/i18n";
import { OPT_STYLE_ALL } from "../../config/styles";
import { builtinStylesMap } from "../../libs/style";
import { useHomepageSettings } from "../../homepage/useHomepageSettings";

const Context = createContext(null);
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
  const language =
    session && context.uiLang
      ? context.uiLang
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
  const clientRef = useRef(null);
  const writes = useRef(Promise.resolve());
  const active = useRef(false);
  const refresh = useCallback(async () => {
    const client = clientRef.current;
    const sessionId = client?.session?.sessionId;
    if (!sessionId) return;
    const next = await client.request("getContext");
    if (
      active.current &&
      client === clientRef.current &&
      sessionId === client.session?.sessionId
    )
      setContext(next);
  }, []);
  const connect = useCallback(
    async (extensionId) => {
      setConnecting(true);
      setError("");
      const client = clientRef.current;
      try {
        const next = await client.connect(extensionId);
        if (!active.current || client !== clientRef.current) return;
        setSession(next);
        setExtensions([]);
        await refresh();
      } catch (failure) {
        if (!active.current || client !== clientRef.current || client.disposed)
          return;
        setError(failure.message);
        if (failure.extensions) {
          setExtensions(failure.extensions);
          setSelectedExtension(failure.extensions[0]);
        }
      } finally {
        if (active.current && client === clientRef.current)
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
        setError(event.error.message);
      }
      if (event.type === "reconnecting") setConnecting(true);
      if (event.type === "reconnectFailed") {
        setConnecting(false);
        setError(event.error.message);
      }
      if (event.type === "connected" && event.reconnecting) {
        setSession(event.session);
        setConnecting(false);
        setError("");
        setExtensions([]);
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
      ? "连接中…"
      : "Connecting…"
    : session
      ? `${chinese ? "已连接" : "Connected"} · ${session.extensionVersion}`
      : chinese
        ? "未连接"
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
    <Box sx={{ px: 1.5, pt: 1.5, flexShrink: 0 }}>
      <Alert
        severity="info"
        action={
          <Button
            disabled={connecting}
            onClick={() => connect(selectedExtension || undefined)}
          >
            {connecting
              ? chinese
                ? "连接中…"
                : "Connecting…"
              : chinese
                ? "连接扩展"
                : "Connect extension"}
          </Button>
        }
      >
        {chinese
          ? "翻译需要连接 Edge、Chrome 或 Firefox 扩展。Safari、油猴和 Thunderbird 暂不支持；未连接时可解析和预览文件。"
          : "Connect an Edge, Chrome or Firefox extension to translate. Safari, userscripts and Thunderbird are not supported yet. Files can be parsed and previewed while disconnected."}
      </Alert>
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
        <Alert severity="warning" sx={{ mt: 1 }}>
          {error || context.modelError}
        </Alert>
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
