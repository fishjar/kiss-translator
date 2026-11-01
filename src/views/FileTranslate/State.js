import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ReaderAlert from "./ReaderAlert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { getFileClient } from "../../fileTranslation/client";
import { DEFAULT_FILE_TRANSLATE_SETTING } from "../../config/setting";
import { useHomepageIconColor } from "../../homepage/useHomepageIconColor";
import { I18N, UI_LANGS } from "../../config/i18n";
import { OPT_STYLE_ALL } from "../../config/styles";
import { builtinStylesMap } from "../../libs/style";
import { useHomepageSettings } from "../../homepage/useHomepageSettings";
import {
  calculateAdaptiveAccentFamilies,
  calculateAdaptivePrimaryFamily,
  getIconColorSnapshot,
  resolveIconHue,
  setIconColorSnapshot,
  subscribeIconColor,
} from "../../styles/m3";

const Context = createContext(null);
const LANGUAGE_STORAGE_KEY = "kiss-file-translate-lang";
const validLanguage = (language) =>
  UI_LANGS.some(([code]) => code === language);
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
  // 图标主题色快照：与 M3Theme 同源（m3.js 快照 store，零重依赖）。
  // 本页视图树不含分发器图标（页面图标直连 MUI 静态导入），故不挂
  // SettingProvider、不同步 iconStyle；下方 effect 读取 homepage 本地
  // iconColor 后写入共享快照（本地回退写入点；扩展连接后由 refresh()
  // 的权威值覆盖，见下）。homepage 无
  // browser.storage 访问权，与扩展 Setting 解耦——数据源为 localStorage
  // （useHomepageIconColor），主色随色相管线派生，不再硬编码。
  // 预接线（PR #17 评审闭环）：扩展连接后 getContext 携带权威 iconColor，
  // refresh() 送达即覆盖快照；未连接/旧版无字段时维持本地回退值。
  const iconColor = useSyncExternalStore(
    subscribeIconColor,
    getIconColorSnapshot
  );
  const { iconColor: homepageIconColor } = useHomepageIconColor();
  useEffect(() => {
    setIconColorSnapshot(homepageIconColor);
  }, [homepageIconColor]);
  // refresh/disconnect 处于 [] 依赖回调内，经 ref 取 homepage 回退最新值。
  const homepageIconColorRef = useRef(homepageIconColor);
  homepageIconColorRef.current = homepageIconColor;
  const [context, setContext] = useState(EMPTY);
  const [session, setSession] = useState(null);
  const [cachedLanguage, setCachedLanguage] = useState(readLanguage);
  const language = cachedLanguage
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
  const [saveError, setSaveError] = useState("");
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
        active.current &&
        client === clientRef.current &&
        sessionId === client.session?.sessionId
      )
        throw failure;
      return;
    }
    if (
      active.current &&
      client === clientRef.current &&
      sessionId === client.session?.sessionId
    ) {
      setContext(next);
      // 预接线消费点：新版 backend 随 context 投影 iconColor（已归一），
      // 送达即写共享快照。无该字段（旧版扩展/用户脚本）时恢复 homepage
      // localStorage 本地回退值，不被 undefined 打回默认档，也不沿用
      // 前一个扩展投递的颜色。
      if (typeof next.iconColor === "string") {
        setIconColorSnapshot(next.iconColor);
      } else {
        setIconColorSnapshot(homepageIconColorRef.current);
      }
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
          !active.current ||
          client !== clientRef.current ||
          version !== client.connectionVersion
        )
          return;
        setSession(next);
        setConnecting(false);
        setReconnectAt(null);
        setExtensions([]);
        setSelectedExtension(next.extensionId);
        await refresh();
      } catch (failure) {
        if (
          !active.current ||
          client !== clientRef.current ||
          client.disposed ||
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
          active.current &&
          client === clientRef.current &&
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
        // 断开后共享快照不再沿用已断开扩展投递的颜色，恢复 homepage 回退值。
        setIconColorSnapshot(homepageIconColorRef.current);
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
          if (
            active.current &&
            client === clientRef.current &&
            sessionId === client.session?.sessionId
          )
            setSaveError("");
        })
        .catch((failure) => {
          if (
            active.current &&
            client === clientRef.current &&
            sessionId === client.session?.sessionId
          ) {
            setSaveError(failure.message);
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
  const accentFamily = useMemo(
    () =>
      calculateAdaptivePrimaryFamily(
        resolveIconHue(iconColor),
        preferences.themeMode
      ),
    [iconColor, preferences.themeMode]
  );
  const secondaryFamily = useMemo(
    () =>
      calculateAdaptiveAccentFamilies(
        resolveIconHue(iconColor),
        preferences.themeMode
      ),
    [iconColor, preferences.themeMode]
  );
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: preferences.themeMode,
          primary: { main: accentFamily.primary },
          secondary: {
            // main 用可读的次强调色（前景语义），容器色以扩展键暴露，
            // 背景用途（ImageViewerDialog 选中态药丸）走 secondaryContainer。
            main: secondaryFamily.secondary,
            contrastText: secondaryFamily.onSecondary,
            secondaryContainer: secondaryFamily.secondaryContainer,
            onSecondaryContainer: secondaryFamily.onSecondaryContainer,
          },
        },
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
    [preferences.themeMode, accentFamily, secondaryFamily]
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
      ? reconnecting
        ? "正在重连…"
        : "连接中…"
      : reconnecting
        ? "Reconnecting…"
        : "Connecting…"
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
        saveError ||
        context.modelError ||
        (session
          ? `${session.development ? (chinese ? "开发构建 · " : "Development build · ") : ""}${chinese ? "点击刷新配置" : "Click to refresh settings"}`
          : statusLabel)
      }
      color={
        session
          ? error || saveError || context.modelError
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
                ? reconnecting
                  ? "正在重连…"
                  : "连接中…"
                : reconnecting
                  ? "Reconnecting…"
                  : "Connecting…"
              : chinese
                ? reconnectAt
                  ? "立即重连"
                  : "连接扩展"
                : reconnectAt
                  ? "Reconnect now"
                  : "Connect extension"}
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
      {(error || saveError || context.modelError) && (
        <ReaderAlert severity="warning" sx={{ mt: 0.75, borderRadius: 1 }}>
          {error || saveError || context.modelError}
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
