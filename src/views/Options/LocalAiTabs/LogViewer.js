import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { ContentCopyRoundedIcon, DeleteOutlineRoundedIcon } from "../../../components/icons";
import { useI18n } from "../../../hooks/I18n";
import { useTheme } from "@mui/material/styles";

// 级色映射既有 kt 语义令牌；warn 无对应语义令牌，暗色档使用琥珀字面量，
// 浅色档由 logLevelColor 切换深琥珀 #b45309（#f8fafc 底 4.79 ✓，且与
// 时间戳灰及 error/success/info 语义三色分离）。warn 字面量
// 仅适用暗色档：调用方须经 logLevelColor 取 warn 级色，不得直读
// LOG_LEVEL_COLORS.warn。
export const LOG_LEVEL_COLORS = {
  error: "var(--kt-err)",
  warn: "#f59e0b" /* 暗色档琥珀（#111827 底 8.26 ✓）；浅色档经 logLevelColor
     切深琥珀 #b45309：#f8fafc 底 4.79 ✓，且与时间戳灰及 err/grn/pri
     语义三色分离 */,
  success: "var(--kt-grn)",
  info: "var(--kt-pri)",
};

// 级色取值入口（WCAG AA 文本 4.5 对比线）：
// warn 主题感知——暗色档琥珀 #f59e0b（#111827 底 8.26 ✓），浅色档深琥珀
// #b45309（#f8fafc 底 4.79 ✓，且与时间戳灰 --kt-onv 及 error/success/info
// 语义三色均分离）。其余级别不随主题切换；未知级别退回 info 主色。查找
// 仅认自有属性："constructor"/"toString" 等原型链键不是级别，直取会把函数当颜色。
export const logLevelColor = (level, darkMode) =>
  level === "warn" && !darkMode
    ? "#b45309"
    : Object.prototype.hasOwnProperty.call(LOG_LEVEL_COLORS, level)
      ? LOG_LEVEL_COLORS[level]
      : "var(--kt-pri)";

// 时间戳恒用中性分级令牌（不随 warn 浅色档变化）。
const TIMESTAMP_COLOR = "var(--kt-onv)";

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
  const darkMode = useTheme().palette.mode === "dark";
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
                const color = logLevelColor(log.level, darkMode);
                return (
                  <Box
                    key={index}
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                  >
                    <span style={{ color: TIMESTAMP_COLOR }}>[{log.time}]</span>{" "}
                    <span style={{ color, fontWeight: 600 }}>
                      [{log.level.toUpperCase()}]
                    </span>{" "}
                    {/* 消息正文仅 error 级染色，级色取值与 LOG_LEVEL_COLORS 映射同源。 */}
                    <span
                      style={{
                        color:
                          log.level === "error"
                            ? LOG_LEVEL_COLORS.error
                            : "inherit",
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
