import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useI18n } from "../../../hooks/I18n";
import {
  getRuntimeSettings,
  updateRuntimeSettings,
} from "../../../localAi/core/runtimeClient";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { nextRpcId } from "../../../localAi/runtime/rpc";

const call = (method) =>
  runtimeHost.request({
    id: nextRpcId("result-cache"),
    service: "runtime",
    method,
    payload: {},
  });
export default function InferenceCache() {
  const i18n = useI18n(),
    mounted = useRef(false);
  const [settings, setSettings] = useState(null),
    [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const next = await call("cacheStats");
      if (mounted.current) setStats(next);
    } catch (e) {
      if (mounted.current) setError(e.message);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    getRuntimeSettings()
      .then((next) => {
        if (mounted.current) setSettings(next);
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    void refresh();
    const unsubscribe = runtimeHost.onServiceState(refresh);
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [refresh]);
  const run = async (operation) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={600}>
            {i18n("local_ai_result_cache", "AI 结果缓存")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {i18n(
              "local_ai_cache_local",
              "仅保存在此浏览器，不删除模型文件或文本翻译缓存。"
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n(
              "local_ai_cache_text_only",
              "仅缓存文本和结构化结果；音频、图片等二进制结果暂不缓存。"
            )}
          </Typography>
          <FormControlLabel
            label={i18n("local_ai_cache_enabled", "启用结果缓存")}
            control={
              <Switch
                disabled={busy || !settings}
                checked={settings?.inferenceCacheEnabled ?? true}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    inferenceCacheEnabled: event.target.checked,
                  })
                }
              />
            }
          />
          <Stack direction="row" spacing={2}>
            {[
              ["inferenceCacheMB", "local_ai_cache_mb", "容量上限（MiB）"],
              ["inferenceCacheDays", "local_ai_cache_days", "有效期（天）"],
            ].map(([key, label, fallback]) => (
              <TextField
                key={key}
                size="small"
                type="number"
                label={i18n(label, fallback)}
                disabled={busy || !settings}
                value={settings?.[key] ?? ""}
                inputProps={{ min: 1, step: 1 }}
                onChange={(event) =>
                  setSettings({ ...settings, [key]: event.target.value })
                }
              />
            ))}
          </Stack>
          <Typography variant="body2">
            {i18n("local_ai_cache_entries", "条目数")}: {stats?.count ?? "—"} ·{" "}
            {i18n("local_ai_cache_usage", "占用空间")}:{" "}
            {stats ? (stats.bytes / 1048576).toFixed(2) : "—"} MiB
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              disabled={busy || !settings}
              onClick={() =>
                run(async () => {
                  const next = await updateRuntimeSettings({
                    inferenceCacheEnabled: settings.inferenceCacheEnabled,
                    inferenceCacheMB: Number(settings.inferenceCacheMB),
                    inferenceCacheDays: Number(settings.inferenceCacheDays),
                  });
                  if (mounted.current) setSettings(next);
                })
              }
            >
              {i18n("save", "保存")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => run(() => call("clearInferenceCache"))}
            >
              {i18n("local_ai_clear_result_cache", "清空 AI 结果缓存")}
            </Button>
            <Button disabled={busy} onClick={refresh}>
              {i18n("local_ai_refresh_status", "刷新状态")}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
