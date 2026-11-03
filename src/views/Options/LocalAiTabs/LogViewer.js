import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { useI18n } from "../../../hooks/I18n";

/**
 * 独立的本地 AI 日志 Hook：管理当前 Tab 的运行日志与添加/清空方法。
 * 保留最新 500 条。
 */
export function useLocalAiLog() {
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((message, level = "info") => {
    if (!message) return;
    const time = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [
      ...prev.slice(-499),
      { time, level, message: String(message) },
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    addLog,
    clearLogs,
  };
}

/**
 * 本地 AI 运行日志展示组件：
 * 支持手动清空、一键复制、日志条数角标及等宽控制台样式。
 */
export default function LogViewer({ logs = [], onClear }) {
  const i18n = useI18n();
  const [copied, setCopied] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    if (!logs.length) return;
    const text = logs
      .map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    onClear?.();
  };

  const errorCount = logs.filter((l) => l.level === "error").length;

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: "16px !important" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6" fontWeight={600}>
              {i18n("local_ai_logs_title", "运行日志")}
            </Typography>
            <Chip
              size="small"
              label={logs.length}
              color={errorCount > 0 ? "error" : "default"}
              variant="outlined"
              sx={{ height: 20, fontSize: 11 }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Button
              size="small"
              variant="text"
              startIcon={<ContentCopyRoundedIcon fontSize="small" />}
              onClick={handleCopy}
              disabled={logs.length === 0}
              sx={{ minWidth: "auto", px: 1, py: 0.2, fontSize: 12 }}
            >
              {copied
                ? i18n("local_ai_copied", "已复制")
                : i18n("local_ai_logs_copy", "复制")}
            </Button>
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<DeleteOutlineRoundedIcon fontSize="small" />}
              onClick={handleClear}
              disabled={logs.length === 0}
              sx={{ minWidth: "auto", px: 1, py: 0.2, fontSize: 12 }}
            >
              {i18n("local_ai_logs_clear", "清空")}
            </Button>
          </Box>
        </Box>
        <Box
          ref={logRef}
          sx={{
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 220,
            overflowY: "auto",
            bgcolor: (theme) =>
              theme.palette.mode === "dark" ? "#111827" : "#f8fafc",
            p: 1.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {logs.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {i18n("local_ai_logs_empty", "暂无运行日志")}
            </Typography>
          ) : (
            <>
              {logs.map((log, index) => {
                const color =
                  log.level === "error"
                    ? "#ef4444"
                    : log.level === "warn"
                      ? "#f59e0b"
                      : log.level === "success"
                        ? "#10b981"
                        : "#3b82f6";
                return (
                  <Box
                    key={index}
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                  >
                    <span style={{ color: "#9ca3af" }}>[{log.time}]</span>{" "}
                    <span style={{ color, fontWeight: 600 }}>
                      [{log.level.toUpperCase()}]
                    </span>{" "}
                    <span
                      style={{
                        color: log.level === "error" ? "#ef4444" : "inherit",
                      }}
                    >
                      {log.message
                        .replace(
                          /CACHE_HIT/g,
                          i18n("local_ai_cache_hit", "缓存命中")
                        )
                        .replace(
                          /INFERENCE_START/g,
                          i18n("local_ai_inference_start", "开始推理")
                        )}
                    </span>
                  </Box>
                );
              })}
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
