import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useI18n } from "../../hooks/I18n";
import { useSync } from "../../hooks/Sync";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import LoadingButton from "@mui/lab/LoadingButton";
import Button from "@mui/material/Button";
import {
  URL_KISS_WORKER,
  URL_GITHUB_GIST_TOKEN,
  OPT_SYNCTYPE_ALL,
  OPT_SYNCTYPE_WORKER,
  OPT_SYNCTYPE_WEBDAV,
  OPT_SYNCTYPE_GIST,
  OPT_SYNCTOKEN_PERFIX,
} from "../../config";
import { useState } from "react";
import { syncSettingAndRules } from "../../libs/sync";
import { useAlert } from "../../hooks/Alert";
import { useSetting } from "../../hooks/Setting";
import { kissLog } from "../../libs/log";
import SyncIcon from "@mui/icons-material/Sync";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";

/**
 * 云端备份与同步设置主面板组件 (SyncSetting)
 */
export default function SyncSetting() {
  const i18n = useI18n();
  // 全局同步数据状态 Hook
  const { sync, updateSync } = useSync();
  const alert = useAlert();
  // 数据同步过程中的 Loading 状态
  const [loading, setLoading] = useState(false);
  const { reloadSetting } = useSetting();

  // 同步配置选项字段更改处理
  const handleChange = async (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    await updateSync({
      [name]: value,
    });
  };

  // 触发物理网络数据上传/下载同步
  const handleSyncTest = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await syncSettingAndRules();
      reloadSetting();
      alert.success(i18n("sync_success"));
    } catch (err) {
      kissLog("sync all", err);
      alert.error(i18n("sync_failed"));
    } finally {
      setLoading(false);
    }
  };

  // 将当前同步服务的 Url、User、Key 生成一段 Base64 分享口令以支持跨设备一键同步导入
  const handleGenerateShareString = async () => {
    try {
      const base64Config = btoa(
        JSON.stringify({
          syncType: syncType,
          syncUrl: syncUrl,
          syncUser: syncUser,
          syncKey: syncKey,
        })
      );
      const shareString = `${OPT_SYNCTOKEN_PERFIX}${base64Config}`;
      await navigator.clipboard.writeText(shareString);
      kissLog("Share string copied to clipboard", shareString);
    } catch (error) {
      kissLog("Failed to copy share string to clipboard", error);
    }
  };

  // 从系统剪贴板中读取分享口令并进行解析，一键恢复同步服务连接
  const handleImportFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      kissLog("read_clipboard", text);
      if (text.startsWith(OPT_SYNCTOKEN_PERFIX)) {
        const base64Config = text.slice(OPT_SYNCTOKEN_PERFIX.length);
        const jsonString = atob(base64Config);
        const updatedConfig = JSON.parse(jsonString);

        // 验证同步服务类型是否合法
        if (!OPT_SYNCTYPE_ALL.includes(updatedConfig.syncType)) {
          kissLog("error syncType", updatedConfig.syncType);
          return;
        }

        if (
          updatedConfig.syncUrl ||
          updatedConfig.syncType === OPT_SYNCTYPE_GIST
        ) {
          updateSync({
            syncType: updatedConfig.syncType,
            syncUrl: updatedConfig.syncUrl,
            syncUser: updatedConfig.syncUser,
            syncKey: updatedConfig.syncKey,
          });
        } else {
          kissLog("Invalid config structure");
        }
      } else {
        kissLog("Invalid share string", text);
      }
    } catch (error) {
      kissLog("Failed to read from clipboard or parse JSON", error);
    }
  };

  if (!sync) {
    return null;
  }

  const {
    syncType = OPT_SYNCTYPE_WORKER,
    syncUrl = "",
    syncUser = "",
    syncKey = "",
  } = sync;
  const isGistSync = syncType === OPT_SYNCTYPE_GIST;

  return (
    <Box>
      <Stack spacing={3}>
        {/* 数据同步的风险警告与备份注意事项提示 */}
        <Alert severity="warning">{i18n("sync_warn")}</Alert>
        <Alert severity="warning">{i18n("sync_warn_2")}</Alert>

        {/* 同步通道类型 (Cloudflare Worker 或 WebDAV) */}
        <TextField
          select
          size="small"
          name="syncType"
          value={syncType}
          label={i18n("data_sync_type")}
          onChange={handleChange}
          helperText={
            isGistSync && (
              <Link href={URL_GITHUB_GIST_TOKEN} target="_blank">
                {i18n("gist_sync_tip")}
              </Link>
            )
          }
        >
          {OPT_SYNCTYPE_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>

        {/* 同步接口 URL 终端地址 */}
        {!isGistSync && (
          <TextField
            size="small"
            label={i18n("data_sync_url")}
            name="syncUrl"
            value={syncUrl}
            onChange={handleChange}
            helperText={
              syncType === OPT_SYNCTYPE_WORKER && (
                <Link href={URL_KISS_WORKER} target="_blank">
                  {i18n("about_sync_api")}
                </Link>
              )
            }
          />
        )}

        {/* 仅在 WebDAV 模式下显示的用户名输入框 */}
        {syncType === OPT_SYNCTYPE_WEBDAV && (
          <TextField
            size="small"
            label={i18n("data_sync_user")}
            name="syncUser"
            value={syncUser}
            onChange={handleChange}
          />
        )}

        {/* 云端数据访问密码或 Worker 同步密钥 */}
        <TextField
          size="small"
          type="password"
          label={i18n("data_sync_key")}
          name="syncKey"
          value={syncKey}
          onChange={handleChange}
        />

        {/* 控制按钮栏：包含立即触发同步、复制同步配置口令与从剪贴板贴入同步口令 */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          {/* 立即上传/下载并合并备份的同步按钮 */}
          <LoadingButton
            size="small"
            variant="contained"
            disabled={(!isGistSync && !syncUrl) || !syncKey || loading}
            onClick={handleSyncTest}
            startIcon={<SyncIcon />}
            loading={loading}
          >
            {i18n("sync_now")}
          </LoadingButton>
          {/* 生成同步分享码并拷贝到剪贴板 */}
          <Button
            size="small"
            variant="outlined"
            onClick={handleGenerateShareString}
            startIcon={<ContentCopyIcon />}
          >
            {i18n("copy", "copy")}
          </Button>
          {/* 从剪贴板读取同步码一键连接 */}
          <Button
            onClick={handleImportFromClipboard}
            size="small"
            variant="outlined"
            startIcon={<ContentPasteIcon />}
          >
            {i18n("import", "import")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
