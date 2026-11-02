import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Link from "@mui/material/Link";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import { useSetting } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import { supportsApiCapability } from "../../config/serviceSelection";
import { isApiConfigured } from "../../config/serviceSelection";
import { useAlert } from "../../hooks/Alert";
import { isAutoTranslateClipboardSupported, isExt } from "../../libs/client";
import { browser } from "../../libs/browser";
import {
  CLIPBOARD_READ_PERMISSION,
  hasClipboardReadPermission,
  requestClipboardReadPermission,
} from "../../libs/clipboard";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import {
  UI_LANGS,
  TRANS_NEWLINE_LENGTH,
  OPT_LANGDETECTOR_ALL,
  OPT_SHORTCUT_TRANSLATE,
  OPT_SHORTCUT_TRANSONLY,
  OPT_SHORTCUT_STYLE,
  OPT_SHORTCUT_POPUP,
  OPT_SHORTCUT_SETTING,
  DEFAULT_BLACKLIST,
  DEFAULT_CSPLIST,
  DEFAULT_ORILIST,
  OPT_POPUP_DEFAULT_VIEW_PAGE,
  OPT_POPUP_DEFAULT_VIEW_TEXT,
  OPT_POPUP_DEFAULT_VIEW_ALL,
  MSG_CONTEXT_MENUS,
  MSG_UPDATE_CSP,
  DEFAULT_HTTP_TIMEOUT,
  getSettingVersion,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";
import { useShortcut } from "../../hooks/Shortcut";
import ShortcutInput from "./ShortcutInput";
import { useFab } from "../../hooks/Fab";
import {
  FAB_CLICK_ACTION_MENU,
  FAB_CLICK_ACTION_TRANSLATE,
  FAB_CLICK_ACTION_POPUP,
  normalizeFabAppearance,
} from "../../config/fab";
import { sendBgMsg } from "../../libs/msg";
import { tryClearCaches } from "../../libs/cache";
import { LogLevel, logger } from "../../libs/log";
import UploadButton from "./UploadButton";
import DownloadButton from "./DownloadButton";
import ValidationInput from "../../hooks/ValidationInput";
import OverviewHero from "./OverviewHero";
import FabAppearanceSetting from "./FabAppearanceSetting";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "./SettingsCard";
import {
  getRedactionStatus,
  readModelStatus,
  requestModelReset,
  requestModelRetry,
  subscribeModelStatus,
} from "../../libs/aifw";

/**
 * 读取隐私脱敏引擎状态。
 *
 * 状态是当前上下文进程内的：选项页尚未触发脱敏初始化时恒为 idle，因此页面
 * 只在挂载时读取一次，仅用于判断当前环境是否支持本地脱敏（如油猴脚本）。
 */
function readRedactionStatus() {
  try {
    const status = getRedactionStatus?.();
    return status && typeof status === "object"
      ? status
      : { enabled: false, state: "unavailable" };
  } catch (error) {
    return {
      enabled: false,
      state: "error",
      error: String(error?.message || error),
    };
  }
}

/** 模型缓存大小展示：小于 1MB 用 KB，否则保留 1 位小数的 MB。 */
function formatModelBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return null;
  const KB = 1024;
  const MB = 1024 * 1024;
  return value < MB
    ? `${Math.round(value / KB)} KB`
    : `${(value / MB).toFixed(1)} MB`;
}

/** 下载速度展示：B/s、KB/s、MB/s；缺失或非正数显示 —。 */
function formatModelSpeed(bytesPerSecond) {
  const value = Number(bytesPerSecond);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const KB = 1024;
  const MB = 1024 * 1024;
  if (value < KB) return `${Math.round(value)} B/s`;
  if (value < MB) return `${(value / KB).toFixed(1)} KB/s`;
  return `${(value / MB).toFixed(1)} MB/s`;
}

/** 单个模型文件的进度文本；已完成时优先显示实际下载大小。 */
function formatModelFileProgress(file) {
  const downloaded = formatModelBytes(file?.downloadedBytes);
  const total = formatModelBytes(file?.totalBytes);
  if (file?.done) return downloaded || total;
  if (downloaded && total) return `${downloaded} / ${total}`;
  return downloaded || total;
}

/** 文件名/链接单行省略样式（完整地址通过 title 展示）。 */
const MODEL_FILE_LINK_SX = {
  display: "inline-block",
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  verticalAlign: "bottom",
};

const MODEL_STATE_LABEL_KEYS = {
  loading: "privacy_mask_state_loading",
  ready: "privacy_mask_state_ready",
  error: "privacy_mask_state_error",
};

/**
 * 本地隐私脱敏设置项：开关 + 不可用环境提示 + 模型下载/缓存状态。
 * 不可用（如油猴脚本）时禁止开启，但已开启的配置仍允许用户关闭。
 */
export function PrivacyMaskSetting({ value, onChange }) {
  const i18n = useI18n();
  // 挂载时读取一次：脱敏能力状态不会在选项页内变化，无需轮询。
  const [status] = useState(readRedactionStatus);
  // 模型状态：先订阅变更，再读取当前快照（readModelStatus 可能返回 Promise）。
  const [modelStatus, setModelStatus] = useState(null);
  const [resetPending, setResetPending] = useState(false);
  const [resetNotice, setResetNotice] = useState(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryNotice, setRetryNotice] = useState(null);
  const unavailable = status.state === "unavailable";

  useEffect(() => {
    let active = true;
    let unsubscribe;
    const applyStatus = (next) => {
      if (!active) return;
      setModelStatus(
        next && typeof next === "object" && typeof next.then !== "function"
          ? next
          : null
      );
    };

    try {
      unsubscribe = subscribeModelStatus?.(applyStatus);
    } catch (error) {
      // 订阅失败时仍保留一次快照读取的结果。
      unsubscribe = undefined;
    }

    try {
      const initial = readModelStatus?.();
      if (initial && typeof initial.then === "function") {
        initial.then(applyStatus, () => applyStatus(null));
      } else {
        applyStatus(initial);
      }
    } catch (error) {
      applyStatus(null);
    }

    return () => {
      active = false;
      try {
        unsubscribe?.();
      } catch (error) {
        // 取消订阅失败不影响设置页。
      }
    };
  }, []);

  const modelState = modelStatus?.state;
  const downloading = modelState === "loading";
  // 重试只在下载中/失败时有意义；idle/ready 无需重试。
  const retryable = downloading || modelState === "error";
  const polling =
    resetPending ||
    retryPending ||
    downloading ||
    resetNotice === "pending" ||
    retryNotice === "pending";

  // Edge 等环境下 storage.onChanged 可能不触发；重载/下载期间轮询状态兜底，
  // 保证点击「重新下载/重试」后界面最终能显示下载进度。
  useEffect(() => {
    if (!polling) return undefined;
    let active = true;
    const tick = async () => {
      try {
        const next = await readModelStatus?.();
        if (active && next) setModelStatus(next);
      } catch (error) {
        // 轮询失败忽略，下一次再试。
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [polling]);

  useEffect(() => {
    if (modelState && modelState !== "idle") {
      setResetNotice((prev) => (prev === "pending" ? null : prev));
      setRetryNotice((prev) => (prev === "pending" ? null : prev));
    }
  }, [modelState]);
  const modelStateLabelKey =
    MODEL_STATE_LABEL_KEYS[modelState] || "privacy_mask_state_idle";

  const downloadedBytes = Number(modelStatus?.downloadedBytes) || 0;
  const totalBytes = Number(modelStatus?.totalBytes) || 0;
  const hasTotal = totalBytes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : 0;
  const downloadedText = formatModelBytes(downloadedBytes);
  const totalText = formatModelBytes(totalBytes);
  const cachedText = formatModelBytes(modelStatus?.sizeBytes);

  let sizeText = null;
  if (modelState === "ready" && cachedText) {
    sizeText = `${i18n("privacy_mask_size")}: ${cachedText}`;
  } else if (downloading) {
    const sizeParts = [downloadedText, totalText].filter(Boolean);
    const segments = [];
    if (sizeParts.length > 0) {
      segments.push(`${i18n("privacy_mask_size")}: ${sizeParts.join(" / ")}`);
    }
    // 下载中展示实时速度；缺失或为 0 时显示 —。
    segments.push(
      `${i18n("privacy_mask_speed")}: ${formatModelSpeed(modelStatus?.speedBps)}`
    );
    sizeText = segments.join(" · ");
  }

  const files = Array.isArray(modelStatus?.files)
    ? modelStatus.files.filter((file) => file && typeof file === "object")
    : [];
  const currentFile = downloading
    ? files.find((file) => !file.done) || null
    : null;

  const origin = modelStatus?.origin;
  const errorText = modelState === "error" ? modelStatus?.error : null;
  let noticeKey = null;
  if (retryNotice === "pending") noticeKey = "privacy_mask_retry_pending";
  else if (retryNotice === "hint") {
    // 重试失败时复用“后台服务不可用”的提示文案。
    noticeKey = "privacy_mask_redownload_hint";
  } else if (resetNotice === "hint") {
    noticeKey = "privacy_mask_redownload_hint";
  } else if (resetNotice === "pending") {
    noticeKey = "privacy_mask_redownload_pending";
  }
  const showDetail = Boolean(
    sizeText || origin || errorText || noticeKey || files.length > 0
  );

  const handleRedownload = async () => {
    if (resetPending || retryPending || unavailable || downloading) return;
    setResetPending(true);
    setResetNotice("pending");
    try {
      const result = await requestModelReset?.();
      // 后台宿主已受理时返回 { tabs: 1, delivered: 1 }，模型状态会通过
      // storage.onChanged 自动更新，无需提示；delivered===0 表示后台宿主不可用
      // 或调用失败，此时提示用户稍后重试。
      // delivered=1 后保持“正在请求后台重新下载…”提示，直到宿主写入新状态
      // （轮询/订阅会把界面切到加载中或就绪）。
      setResetNotice(result?.delivered === 0 ? "hint" : "pending");
    } catch (error) {
      setResetNotice(null);
    } finally {
      setResetPending(false);
    }
  };

  const handleRetry = async () => {
    if (retryPending || resetPending || unavailable || !retryable) return;
    setRetryPending(true);
    setRetryNotice("pending");
    try {
      const result = await requestModelRetry?.();
      // 宿主受理时由 storage.onChanged 推送下载进度，无需提示；
      // delivered===0 表示后台宿主不可用或调用失败。
      setRetryNotice(result?.delivered === 0 ? "hint" : "pending");
    } catch (error) {
      setRetryNotice(null);
    } finally {
      setRetryPending(false);
    }
  };

  return (
    <SettingsSection>
      <SettingsCard>
        <SettingsRow
          label={i18n("privacy_mask")}
          description={i18n("privacy_mask_helper")}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {unavailable && (
              <Typography
                component="span"
                variant="caption"
                className="kt-privacy-mask-unavailable"
                aria-label={i18n("privacy_mask_status")}
                sx={{ color: "text.secondary" }}
              >
                {i18n("privacy_mask_status_unavailable")}
              </Typography>
            )}
            <SettingsSwitch
              checked={Boolean(value)}
              disabled={unavailable && !value}
              label={i18n("privacy_mask")}
              onChange={onChange}
            />
          </Stack>
        </SettingsRow>
        <SettingsRow
          label={i18n(modelStateLabelKey)}
          className="kt-privacy-mask-model"
          description={
            showDetail ? (
              <Box component="span" className="kt-privacy-mask-model-detail">
                {sizeText && (
                  <Box component="span" className="kt-privacy-mask-model-size">
                    {sizeText}
                  </Box>
                )}
                {origin && (
                  <Box
                    component="span"
                    className="kt-privacy-mask-model-origin"
                  >
                    {`${i18n("privacy_mask_origin")}: ${origin}`}
                  </Box>
                )}
                {errorText && (
                  <Box component="span" className="kt-privacy-mask-model-error">
                    {String(errorText)}
                  </Box>
                )}
                {noticeKey && (
                  <Box
                    component="span"
                    className="kt-privacy-mask-model-notice"
                  >
                    {i18n(noticeKey)}
                  </Box>
                )}
                {currentFile && (
                  <Box
                    component="span"
                    className="kt-privacy-mask-current-file"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    {`${i18n("privacy_mask_current_file")}: `}
                    <Link
                      href={currentFile.url}
                      target="_blank"
                      rel="noreferrer"
                      title={currentFile.url}
                      sx={MODEL_FILE_LINK_SX}
                    >
                      {currentFile.name}
                    </Link>
                  </Box>
                )}
                {files.length > 0 && (
                  <Box
                    component="span"
                    className="kt-privacy-mask-files"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    <Box
                      component="span"
                      className="kt-privacy-mask-files-title"
                      sx={{ display: "block", fontWeight: 600, mb: 0.25 }}
                    >
                      {i18n("privacy_mask_files")}
                    </Box>
                    <Box
                      component="span"
                      className="kt-privacy-mask-file-list"
                      sx={{
                        display: "block",
                        maxHeight: 160,
                        overflowY: "auto",
                      }}
                    >
                      {files.map((file, index) => {
                        const fileProgress = formatModelFileProgress(file);
                        const progressText = file.done
                          ? fileProgress || i18n("privacy_mask_done")
                          : fileProgress || "—";
                        return (
                          <Box
                            component="span"
                            className="kt-privacy-mask-file"
                            key={`${file.url || file.name || index}-${index}`}
                            data-done={file.done ? "true" : "false"}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              py: 0.25,
                              color: file.done
                                ? "text.secondary"
                                : "text.primary",
                            }}
                          >
                            <Link
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              title={file.url}
                              sx={{ ...MODEL_FILE_LINK_SX, flex: 1 }}
                            >
                              {file.name}
                            </Link>
                            <Box
                              component="span"
                              className="kt-privacy-mask-file-size"
                              sx={{ flexShrink: 0 }}
                            >
                              {progressText}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </Box>
            ) : null
          }
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {downloading && (
              <Box className="kt-privacy-mask-progress" sx={{ width: 120 }}>
                <LinearProgress
                  variant={hasTotal ? "determinate" : "indeterminate"}
                  value={hasTotal ? percent : undefined}
                  aria-label={i18n("privacy_mask_state_loading")}
                />
              </Box>
            )}
            {downloading && hasTotal && (
              <Typography
                component="span"
                variant="caption"
                className="kt-privacy-mask-percent"
              >
                {`${percent}%`}
              </Typography>
            )}
            <Button
              size="small"
              variant="outlined"
              disabled={
                resetPending || retryPending || unavailable || !retryable
              }
              onClick={handleRetry}
            >
              {i18n("privacy_mask_retry")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={
                resetPending || retryPending || unavailable || downloading
              }
              onClick={handleRedownload}
            >
              {i18n("privacy_mask_redownload")}
            </Button>
          </Stack>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

/**
 * 包装单个快捷键录入表单项组件
 */
function ShortcutItem({ action, label }) {
  const { shortcut, setShortcut } = useShortcut(action);
  return (
    <ShortcutInput value={shortcut} onChange={setShortcut} label={label} />
  );
}

/**
 * 展示扩展版快捷键的组件 (仅 Extension 模式)
 */
export function ExtCommands() {
  const [commands, setCommands] = useState([]);
  const i18n = useI18n();
  const alert = useAlert();

  useEffect(() => {
    if (browser?.commands?.getAll) {
      browser.commands
        .getAll()
        .then((cmds) => {
          if (cmds) {
            setCommands(cmds.filter((c) => c.description));
          }
        })
        .catch((err) => {
          logger.child("options").error("fetch commands error:", err);
        });
    }
  }, []);

  if (!commands || commands.length === 0) return null;

  const handleEdit = () => {
    let url = "chrome://extensions/shortcuts";
    const ua = navigator.userAgent;
    if (ua.includes("Firefox/")) {
      alert.info(i18n("firefox_shortcut_edit_hint"));
      return;
    }
    if (ua.includes("Edg/")) {
      url = "edge://extensions/shortcuts";
    } else if (ua.includes("OPR/")) {
      url = "opera://extensions/shortcuts";
    } else if (ua.includes("Brave/")) {
      url = "brave://extensions/shortcuts";
    }

    if (browser?.tabs?.create) {
      browser.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <Box>
      <Grid container spacing={2} columns={12}>
        {commands.map((cmd) => (
          <Grid item xs={12} sm={12} md={6} lg={6} key={cmd.name}>
            <Stack direction="row" alignItems="flex-start">
              <TextField
                size="small"
                label={cmd.description}
                value={cmd.shortcut || ""}
                fullWidth
                disabled
              />
              <IconButton
                onClick={handleEdit}
                aria-label={i18n("edit")}
                title={i18n("edit")}
              >
                <EditIcon />
              </IconButton>
            </Stack>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export function AutoTranslateClipboardSetting({ value, onChange }) {
  const i18n = useI18n();
  const alert = useAlert();
  const [hasPermission, setHasPermission] = useState(null);

  const refreshPermission = useCallback(async () => {
    setHasPermission(await hasClipboardReadPermission());
  }, []);

  useEffect(() => {
    refreshPermission();

    const handlePermissionChange = (permissions) => {
      if (permissions?.permissions?.includes(CLIPBOARD_READ_PERMISSION)) {
        refreshPermission();
      }
    };
    browser?.permissions?.onAdded?.addListener?.(handlePermissionChange);
    browser?.permissions?.onRemoved?.addListener?.(handlePermissionChange);

    return () => {
      browser?.permissions?.onAdded?.removeListener?.(handlePermissionChange);
      browser?.permissions?.onRemoved?.removeListener?.(handlePermissionChange);
    };
  }, [refreshPermission]);

  const enableAutoTranslate = async () => {
    const granted = await requestClipboardReadPermission();
    setHasPermission(granted);
    if (granted) {
      onChange(true);
      alert.success(i18n("clipboard_permission_granted"));
    } else {
      onChange(false);
      alert.warning(i18n("clipboard_permission_denied"));
    }
  };

  const handleChange = async (event) => {
    if (event.target.value) {
      await enableAutoTranslate();
    } else {
      onChange(false);
    }
  };

  return (
    <Grid item xs={12} sm={12} md={6} lg={3}>
      <TextField
        select
        fullWidth
        size="small"
        name="autoTranslateClipboard"
        value={value}
        label={i18n("auto_translate_clipboard")}
        onChange={handleChange}
        helperText={
          value && hasPermission === false ? (
            <Link
              component="button"
              type="button"
              onClick={enableAutoTranslate}
            >
              {i18n("clipboard_permission_required")}
            </Link>
          ) : (
            i18n("auto_translate_clipboard_helper")
          )
        }
      >
        <MenuItem value={true}>{i18n("enable")}</MenuItem>
        <MenuItem value={false}>{i18n("disable")}</MenuItem>
      </TextField>
    </Grid>
  );
}

/**
 * 基本查词/运行设置中心页面 (Settings)
 */
export default function Settings() {
  const i18n = useI18n();
  // 设置 Hook
  const { setting, updateSetting } = useSetting();
  const alert = useAlert();
  // 悬浮查词 FAB 浮球设置 Hook
  const { fab, updateFab } = useFab();

  // 基础表单输入状态更改回调
  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;

    // 特定联动：若是浏览器扩展模式，且修改了右键菜单或CSP规则列表，立即向后台 content script / background 发送同步消息
    switch (name) {
      case "contextMenuType":
        isExt && sendBgMsg(MSG_CONTEXT_MENUS, value);
        break;
      case "csplist":
        isExt && sendBgMsg(MSG_UPDATE_CSP, { csplist: value });
        break;
      case "orilist":
        isExt && sendBgMsg(MSG_UPDATE_CSP, { orilist: value });
        break;
      default:
    }
    updateSetting({
      [name]: value,
    });
  };

  // Report cache clearing only after the local or background operation completes.
  const handleClearCache = async () => {
    if (await tryClearCaches()) {
      alert.success(i18n("clear_success"));
    } else {
      alert.error(i18n("clear_failed"));
    }
  };

  // Resolve the backup schema before merging with the current settings.
  const handleImport = async (data) => {
    try {
      const imported = JSON.parse(data);
      updateSetting({ ...imported, version: getSettingVersion(imported) });
    } catch (err) {
      logger.child("options").error("import setting", err);
    }
  };

  // 解构当前基础查词偏好设置
  const {
    uiLang,
    minLength,
    maxLength,
    clearCache,
    newlineLength = TRANS_NEWLINE_LENGTH,
    httpTimeout = DEFAULT_HTTP_TIMEOUT,
    contextMenuType = 1,
    touchModes = [2],
    blacklist = DEFAULT_BLACKLIST.join(",\n"),
    csplist = DEFAULT_CSPLIST.join(",\n"),
    orilist = DEFAULT_ORILIST.join(",\n"),
    transInterval = 100,
    langDetector = "-",
    logLevel = 1,
    preInit = true,
    skipLangs = [],
    translateVariants = true,
    parseLatex = false,
    autoTranslateClipboard = false,
    checkUpdate = true,
    privacyMask = false,
    popupDefaultView = OPT_POPUP_DEFAULT_VIEW_PAGE,
  } = setting;
  const normalizedPopupDefaultView = OPT_POPUP_DEFAULT_VIEW_ALL.includes(
    popupDefaultView
  )
    ? popupDefaultView
    : OPT_POPUP_DEFAULT_VIEW_PAGE;
  // 解构 FAB 悬浮球的显隐状态及点击后的默认交互行为
  const {
    isHide = false,
    fabClickAction = FAB_CLICK_ACTION_MENU,
    hideExceptionList = "",
  } = fab || {};
  const { halfHide } = normalizeFabAppearance(fab);

  return (
    <Box>
      <OverviewHero />
      <Stack spacing={3}>
        {/* 数据导入导出控制条 */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          <UploadButton text={i18n("import")} handleImport={handleImport} />
          <DownloadButton
            handleData={() => JSON.stringify(setting, null, 2)}
            text={i18n("export")}
            fileName={`kiss-setting_v2_${Date.now()}.json`}
          />
        </Stack>

        {/* 基础参数网格配置区 */}
        <Box className="kt-overview-settings">
          <Typography className="kt-options-section-title">
            {i18n("general")}
          </Typography>
          <Grid container columns={12}>
            {/* 设置面板用户界面语言 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="uiLang"
                value={uiLang}
                label={i18n("ui_lang")}
                onChange={handleChange}
              >
                {UI_LANGS.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 工具栏弹窗打开时默认显示的界面 (仅 Extension 模式) */}
            {isExt && (
              <Grid item xs={12} sm={12} md={6} lg={6}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="popupDefaultView"
                  value={normalizedPopupDefaultView}
                  label={i18n("popup_default_view")}
                  onChange={handleChange}
                >
                  <MenuItem value={OPT_POPUP_DEFAULT_VIEW_PAGE}>
                    {i18n("popup_default_view_page")}
                  </MenuItem>
                  <MenuItem value={OPT_POPUP_DEFAULT_VIEW_TEXT}>
                    {i18n("popup_default_view_text")}
                  </MenuItem>
                </TextField>
              </Grid>
            )}
            {/* 页面打开时是否预先初始化运行环境 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="preInit"
                value={preInit}
                label={i18n("if_pre_init")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            {isAutoTranslateClipboardSupported && (
              <AutoTranslateClipboardSetting
                value={autoTranslateClipboard}
                onChange={(value) =>
                  updateSetting({ autoTranslateClipboard: value })
                }
              />
            )}
            {/* Choose the action triggered by clicking the floating button. */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="fabClickAction"
                value={fabClickAction}
                label={i18n("fab_click_action")}
                onChange={(e) => updateFab({ fabClickAction: e.target.value })}
              >
                <MenuItem value={FAB_CLICK_ACTION_MENU}>
                  {i18n("fab_click_menu")}
                </MenuItem>
                <MenuItem value={FAB_CLICK_ACTION_TRANSLATE}>
                  {i18n("fab_click_translate")}
                </MenuItem>
                <MenuItem value={FAB_CLICK_ACTION_POPUP}>
                  {i18n("fab_click_popup")}
                </MenuItem>
              </TextField>
            </Grid>
            {/* 单个 DOM 文本块触发网页翻译的最小有效文本长度 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("min_translate_length")}
                type="number"
                name="minLength"
                value={minLength}
                onChange={handleChange}
                min={1}
                max={100}
              />
            </Grid>
            {/* 允许发起单次网页段落翻译的最长文本限制 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("max_translate_length")}
                type="number"
                name="maxLength"
                value={maxLength}
                onChange={handleChange}
                min={100}
                max={100000}
              />
            </Grid>
            {/* 网页中单个纯文本换行符被当作真换行截断句子的数量 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("num_of_newline_characters")}
                type="number"
                name="newlineLength"
                value={newlineLength}
                onChange={handleChange}
                min={1}
                max={1000}
              />
            </Grid>
            {/* DOM 段落网页翻译扫描定时查询轮询间隔时间 (ms) */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("translate_interval")}
                type="number"
                name="transInterval"
                value={transInterval}
                onChange={handleChange}
                min={1}
                max={2000}
              />
            </Grid>
            {/* 全局接口 HTTP 网络请求超时阈值 (s) */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ValidationInput
                fullWidth
                size="small"
                label={i18n("http_timeout")}
                type="number"
                name="httpTimeout"
                value={httpTimeout}
                onChange={handleChange}
                min={1}
                max={600}
              />
            </Grid>
            {/* 移动端/触屏端特定的触摸手势快捷翻译触发方式 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="touchModes"
                value={touchModes}
                label={i18n("touch_translate_shortcut")}
                onChange={handleChange}
                SelectProps={{
                  multiple: true,
                }}
              >
                {[0, 2, 3, 4, 5, 6, 7].map((item) => (
                  <MenuItem key={item} value={item}>
                    {i18n(`touch_tap_${item}`)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 浏览器右键上下文菜单的展示层级 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="contextMenuType"
                value={contextMenuType}
                label={i18n("context_menus")}
                onChange={handleChange}
              >
                <MenuItem value={0}>{i18n("hide_context_menus")}</MenuItem>
                <MenuItem value={1}>{i18n("simple_context_menus")}</MenuItem>
                <MenuItem value={2}>{i18n("secondary_context_menus")}</MenuItem>
              </TextField>
            </Grid>
            {/* 网页首选的语言自动检测服务组件 (如 Chrome Builtin, FastText 或 API) */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="langDetector"
                value={langDetector}
                label={i18n("detected_lang")}
                onChange={handleChange}
              >
                <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                {OPT_LANGDETECTOR_ALL.map((item) => (
                  <MenuItem value={item} key={item}>
                    {item}
                  </MenuItem>
                ))}
                {!OPT_LANGDETECTOR_ALL.includes(langDetector) &&
                  langDetector !== "-" &&
                  !(setting.transApis || []).some(
                    (api) =>
                      api.apiSlug === langDetector &&
                      !api.isDisabled &&
                      isApiConfigured(api) &&
                      supportsApiCapability(api, "detectLanguage")
                  ) && (
                    <MenuItem value={langDetector}>
                      {i18n("service_configured_unavailable")}
                    </MenuItem>
                  )}
                {(setting.transApis || [])
                  .filter(
                    (api) =>
                      !api.isDisabled &&
                      isApiConfigured(api) &&
                      supportsApiCapability(api, "detectLanguage")
                  )
                  .map((api) => (
                    <MenuItem key={api.apiSlug} value={api.apiSlug}>
                      {api.apiName}
                    </MenuItem>
                  ))}
              </TextField>
            </Grid>
            {/* Translate variants of the same language, such as Simplified and Traditional Chinese. */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="translateVariants"
                value={translateVariants}
                label={i18n("translate_variants")}
                helperText={i18n("translate_variants_helper")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            {/* Render inline LaTeX as Unicode only when explicitly enabled. */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="parseLatex"
                value={parseLatex}
                label={i18n("parse_latex")}
                helperText={i18n("parse_latex_helper")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
            {/* 日志记录详细层级 (Error/Info/Debug 等) */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="logLevel"
                value={logLevel}
                label={i18n("log_level")}
                helperText={i18n("diagnostics_console_hint")}
                onChange={handleChange}
              >
                {Object.values(LogLevel).map(({ value, name }) => (
                  <MenuItem value={value} key={value}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* 是否在进入设置页时自动检查更新 */}
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="checkUpdate"
                value={checkUpdate}
                label={i18n("check_update")}
                helperText={i18n("check_update_helper")}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* 本地隐私脱敏：请求前对 PII 做本机脱敏，返回译文后再还原 */}
        <PrivacyMaskSetting
          value={privacyMask}
          onChange={(checked) => updateSetting({ privacyMask: checked })}
        />

        {/* 翻译跳过语言：遇到选中的目标语言时跳过自动网页翻译 */}
        <TextField
          select
          size="small"
          label={i18n("skip_langs")}
          helperText={i18n("skip_langs_helper")}
          name="skipLangs"
          value={skipLangs}
          onChange={handleChange}
          SelectProps={{
            multiple: true,
          }}
        >
          {OPT_LANGS_TO.map(([langKey, langName]) => (
            <MenuItem key={langKey} value={langKey}>
              {langName}
            </MenuItem>
          ))}
        </TextField>

        {/* 是否全局隐藏内容页面右侧的悬浮查词小图标 FAB */}
        <TextField
          select
          fullWidth
          size="small"
          name="isHide"
          value={isHide}
          label={i18n("hide_fab_button")}
          onChange={(e) => {
            updateFab({ isHide: e.target.value });
          }}
        >
          <MenuItem value={false}>{i18n("show")}</MenuItem>
          <MenuItem value={true}>{i18n("hide")}</MenuItem>
        </TextField>

        <TextField
          select
          fullWidth
          size="small"
          name="halfHide"
          value={halfHide}
          label={i18n("fab_half_hide")}
          helperText={i18n("fab_half_hide_helper")}
          onChange={(e) => updateFab({ halfHide: e.target.value })}
        >
          <MenuItem value={true}>{i18n("enable")}</MenuItem>
          <MenuItem value={false}>{i18n("disable")}</MenuItem>
        </TextField>

        <FabAppearanceSetting fab={fab} onChange={updateFab} />

        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={10}
          name="hideExceptionList"
          value={hideExceptionList}
          label={i18n("fab_exception_list")}
          helperText={i18n("fab_exception_list_helper")}
          onChange={(e) => updateFab({ hideExceptionList: e.target.value })}
        />

        {/* 网页翻译的黑名单域名正则排除列表 (一行一条) */}
        <TextField
          size="small"
          label={i18n("translate_blacklist")}
          helperText={i18n("pattern_helper")}
          name="blacklist"
          value={blacklist}
          onChange={handleChange}
          maxRows={10}
          multiline
        />

        {/* 扩展专属的高级网络设置 (只在 Extension 模式下展示) */}
        {isExt ? (
          <>
            {/* 是否在浏览器关闭/重启时自动清空网页翻译的已缓存译文 */}
            <TextField
              select
              fullWidth
              size="small"
              name="clearCache"
              value={clearCache}
              label={i18n("if_clear_cache")}
              onChange={handleChange}
              helperText={
                <Link component="button" onClick={handleClearCache}>
                  {i18n("clear_all_cache_now")}
                </Link>
              }
            >
              <MenuItem value={false}>{i18n("clear_cache_never")}</MenuItem>
              <MenuItem value={true}>{i18n("clear_cache_restart")}</MenuItem>
            </TextField>

            {/* 跨域安全 CSP 旁路加载白名单与 Ori 白名单 */}
            <TextField
              size="small"
              label={i18n("disabled_orilist")}
              helperText={i18n("pattern_helper")}
              name="orilist"
              value={orilist}
              onChange={handleChange}
              multiline
            />
            <TextField
              size="small"
              label={i18n("disabled_csplist")}
              helperText={
                i18n("pattern_helper") + " " + i18n("disabled_csplist_helper")
              }
              name="csplist"
              value={csplist}
              onChange={handleChange}
              multiline
            />

            <ExtCommands />
          </>
        ) : (
          // 油猴脚本环境运行：渲染脚本侧注册的全局热键录入面板
          <>
            <Box>
              <Grid container spacing={2} columns={12}>
                <Grid item xs={12} sm={12} md={6} lg={6}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_TRANSLATE}
                    label={i18n("toggle_translate_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={6}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_TRANSONLY}
                    label={i18n("toggle_transonly_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={6}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_STYLE}
                    label={i18n("toggle_style_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={6}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_POPUP}
                    label={i18n("toggle_popup_shortcut")}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={6} lg={6}>
                  <ShortcutItem
                    action={OPT_SHORTCUT_SETTING}
                    label={i18n("open_setting_shortcut")}
                  />
                </Grid>
              </Grid>
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
