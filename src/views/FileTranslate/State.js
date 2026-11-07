import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { I18N, UI_LANGS } from "../../config/i18n";
import { OPT_STYLE_ALL } from "../../config/styles";
import { builtinStylesMap } from "../../libs/style";
import { useHomepageSettings } from "../../homepage/useHomepageSettings";
import {
  FOCUS_SILENT_CSS,
  getIconStyleSnapshot,
  subscribeIconStyle,
} from "../../styles/m3";
import { installFocusModality } from "../../hooks/focusModality";

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
  // 焦点静默机制（对齐 M3Theme.js 挂载形态）：本域自建 ThemeProvider 不经
  // M3Theme，模态监听须在此对 ownerDocument 显式安装（幂等，per-document），
  // 否则指针路径上 MUI 脚本聚焦的菜单项会裸奔 :focus-visible 焦点框。
  useLayoutEffect(() => {
    installFocusModality(document);
    // 焦点静默作用域挂到 document.body：MUI Select 菜单经 Portal 挂在
    // body 直下，Portal 内容的祖先链不经过 #root 内任何 wrapper，
    // closest(".kt-m3-root, .kt-focus-silent-scope") 只有 body 挂类才能
    // 命中。本页为扩展自有整页文档，整文档入作用域语义正确。
    document.body.classList.add("kt-focus-silent-scope");
    return () => document.body.classList.remove("kt-focus-silent-scope");
  }, []);
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
  // 订阅保留使图标样式变化仍触发本组件重渲染（用户处方）；返回值本域不消费。
  useSyncExternalStore(
    subscribeIconStyle,
    getIconStyleSnapshot
  );
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: preferences.themeMode,
          primary: { main: "#0B57D0" },
          secondary: { main: "#E8DEF8", contrastText: "#1D192B" },
        },
        shape: { borderRadius: 4 },
        typography: { button: { textTransform: "none" } },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              // SettingsSelect 复用挂类 kt-settings-select（SettingsCard.js:204），
              // 但 OPTIONS_STYLES 不注入本域（仅 Options/Layout.js:316 注入），
              // 该类在此页原为死类：字号回落浏览器默认 16px。补对齐 Options 域
              // 的最小等价规则；本域无 --kt-on / --kt-settings-font-size 变量集，
              // 规则不得携带这些 var，font-weight 缺省回落主题默认，color 走继承。
              ".kt-settings-select .MuiSelect-select": {
                fontSize: "14px",
                textOverflow: "ellipsis",
              },
            },
          },
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
          MuiMenuItem: {
            styleOverrides: {
              root: ({ theme }) => ({
                paddingTop: theme.spacing(0.5),
                paddingBottom: theme.spacing(0.5),
                "&.Mui-selected": {
                  backgroundColor: theme.palette.secondary.main,
                  color: theme.palette.secondary.contrastText,
                },
                "&.Mui-selected:hover": {
                  backgroundColor: `color-mix(in srgb, ${theme.palette.secondary.contrastText} 12%, ${theme.palette.secondary.main})`,
                },
                // FileTranslate 域主题不继承 M3Theme 基槽：hover/focusVisible 恢复
                // State Layer（currentColor 半透明叠加，不依赖基槽注入），
                // 键盘焦点环挂 :focus-visible 键盘语境伪类＋inset 内嵌（同 M3Theme
                // MenuItem 双缺陷修复），HC 域 outline 内描兜底。
                "&:hover": {
                  backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
                },
                "&&:focus-visible": {
                  outline: "none",
                  boxShadow:
                    theme.palette.mode === "dark"
                      ? "inset 0 0 0 3px #A8C7FA"
                      : "inset 0 0 0 3px #0B57D0",
                  backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
                },
                "&&.Mui-selected:focus-visible": {
                  backgroundColor: `color-mix(in srgb, ${theme.palette.secondary.contrastText} 12%, ${theme.palette.secondary.main})`,
                },
                // 数据多选菜单（aria-multiselectable，本域经 TerminologySelect 的
                // multiple 形态 Select 进入）：持久选中染色禁令下选中行
                // 去底色（选中语义由勾号承载），但瞬时反馈必须保留
                // ——hover 8%、focus-visible 12% 叠加，后置规则在同特异度
                // 平手中胜出，focus-visible 配套规则 (0,5,0) 防去染色连带删除键盘反馈。
                '[aria-multiselectable="true"] &&.Mui-selected': {
                  backgroundColor: "transparent",
                  color: "inherit",
                },
                '[aria-multiselectable="true"] &&.Mui-selected:hover': {
                  backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
                },
                '[aria-multiselectable="true"] &&.Mui-selected:focus-visible': {
                  backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
                },
                // forced-colors 兜底（对齐 M3Theme forcedColorsFocusRing 配对模式）。
                "@media (forced-colors: active)": {
                  "&&:focus-visible": {
                    outline: "3px solid",
                    outlineOffset: -3,
                  },
                },
              }),
            },
          },
          MuiSwitch: {
            styleOverrides: {
              // 本地同值复刻现行 Switch 形态（52x32 几何档）：
              // themeStyles.getMuiSwitchStyleOverrides 虽已导出，但入参需
              // M3 令牌对象（outline/onSurface/onPrimary/surface/surfaceHigh），
              // State 域无该令牌集，伪造 shim 令牌的漂移风险高于字面量复刻；
              // 几何值由步骤 7 测试逐字钉死作漂移绊线。
              root: { width: 52, height: 32, padding: 0, overflow: "visible" },
              switchBase: ({ theme }) => ({
                // 整组布局键同值复刻现行 switchBase（themeStyles.js:15-25）：
                // 缺任意键都会让未选 thumb 脱离网格居中而垂直错位；
                // 颜色/悬停类键属颜色豁免域，按 State 域字面量口径取舍。
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center",
                top: 0,
                left: 0,
                padding: 0,
                transform: "none",
                "&.Mui-focusVisible": {
                  outline:
                    theme.palette.mode === "dark"
                      ? "3px solid #A8C7FA"
                      : "3px solid #0B57D0",
                  outlineOffset: 2,
                },
                "&.Mui-checked": {
                  padding: 0,
                  transform: "translateX(20px)",
                  // MUI thumb 取 currentColor（Switch.js:197）：未指定时 checked
                  // thumb 继承 primary.main，与 #0B57D0 轨道同色而不可见；
                  // 指定白色保证选中 thumb 在轨道上有对比度。
                  color: "#fff",
                  "& + .MuiSwitch-track": {
                    borderColor: "#0B57D0",
                    backgroundColor: "#0B57D0",
                    opacity: 1,
                  },
                  "& .MuiSwitch-thumb": { width: 24, height: 24 },
                  "& .MuiSwitch-input": { left: -20 },
                },
              }),
              input: {
                left: 0,
                width: 52,
                height: 32,
                borderRadius: 999,
              },
              thumb: { width: 16, height: 16 },
              track: {
                border: "2px solid rgba(128,128,128,.5)",
                // 未选轨道底色与边框同族半透明灰：随明暗底自适应合成（等价 MUI
                // 默认的轨道 opacity 语义），避免 opacity:1 时回退成实心黑/白；
                // 选中态由上方 Mui-checked 规则（优先级更高）覆盖为 #0B57D0。
                backgroundColor: "rgba(128,128,128,.5)",
                borderRadius: 999,
                opacity: 1,
              },
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
        <style>{FOCUS_SILENT_CSS}</style>
        <CssBaseline />
        {/* 焦点静默作用域类由上方 useLayoutEffect 统一挂到 document.body
            （MUI Portal 内容祖先链只到 body，wrapper 在 #root 内无法命中
            Portal 菜单项）；本域不挂 .kt-m3-root（避免 m3.js 根规则整体
            注入与本域主题 override 冲突）。 */}
        {children}
      </ThemeProvider>
    </Context.Provider>
  );
}
