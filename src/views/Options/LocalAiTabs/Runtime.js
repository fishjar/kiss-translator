import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { getRuntimeStatus } from "../../../localAi/core/runtimeClient";
import { useI18n } from "../../../hooks/I18n";
import Settings from "./Settings";

const services = ["decision", "asr", "ocr", "llm", "vlm", "tts", "doc"];

export default function RuntimeTab() {
  const i18n = useI18n();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(runtimeHost.getPendingCount());
  useEffect(() => runtimeHost.onPendingChange(setPending), []);
  const mounted = useRef(false);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    const version = ++refreshVersion.current;
    setRefreshing(true);
    try {
      const next = await getRuntimeStatus();
      if (mounted.current && version === refreshVersion.current) {
        setStatus(next);
        setError("");
      }
    } catch (e) {
      if (mounted.current && version === refreshVersion.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current && version === refreshVersion.current)
        setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let timer;
    const unsub = runtimeHost.onServiceState(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 0);
    });
    void refresh();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      unsub();
    };
  }, [refresh]);
  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="h6" fontWeight={600}>
                {i18n("local_ai_sessions", "会话与任务")}
              </Typography>
              <Button disabled={refreshing} onClick={refresh}>
                {i18n("local_ai_refresh_status", "刷新状态")}
              </Button>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2">
              {i18n("local_ai_tasks_active", "执行中")}:{" "}
              {status?.scheduler.active ?? 0} ·{" "}
              {i18n("local_ai_tasks_queued", "排队")}:{" "}
              {status?.scheduler.queued ?? 0} ·{" "}
              {i18n("local_ai_page_pending", "本页 RPC 等待")}: {pending}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i18n("local_ai_estimated_residency", "估算驻留")}:{" "}
              {status?.pool.reduce(
                (total, entry) => total + (entry.memoryMB ?? 0),
                0
              ) ?? 0}{" "}
              MB
            </Typography>
            <TableContainer>
              <Table
                size="small"
                aria-label={i18n("local_ai_sessions", "会话与任务")}
              >
                <TableHead>
                  <TableRow>
                    {[
                      ["service", "服务"],
                      ["model", "模型"],
                      ["state", "状态"],
                      ["backend", "后端"],
                      ["version", "会话版本"],
                    ].map(([key, fallback]) => (
                      <TableCell key={key}>
                        {i18n(`local_ai_session_${key}`, fallback)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {services.map((service) => {
                    const session = status?.sessions[service];
                    const state = session?.busy
                      ? "busy"
                      : (session?.state ?? "unloaded");
                    return (
                      <TableRow key={service}>
                        <TableCell>{service}</TableCell>
                        <TableCell>{session?.modelId ?? "—"}</TableCell>
                        <TableCell>
                          {i18n(`local_ai_state_${state}`, state)}
                        </TableCell>
                        <TableCell>{session?.backend ?? "—"}</TableCell>
                        <TableCell>{session?.sessionVersion ?? 0}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "local_ai_language_services",
                "LLM 与 VLM 独立驻留，当前推理串行。独享模式切换时先释放其他重模型，JEV 除外。"
              )}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
      <Settings />
    </Stack>
  );
}
