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

// 级色映射既有 kt 语义令牌；warn 无语义令牌（m3.js :305-331 令牌清单无 --kt-warn），
// 按裁决钉死琥珀字面量并注明豁免。
export const LOG_LEVEL_COLORS = {
  error: "var(--kt-err)",
  warn: "#f59e0b" /* accent-exempt: 暗色档琥珀（#111827 底 8.26 ✓）；浅色档由
     logLevelColor 按主题切 --kt-onv（F9 裁决 A）：#f8fafc 底上 amber 仅 2.05，
     而 err/grn/pri 浅底虽达标但分别撞 error/success/info 分级 */,
  success: "var(--kt-grn)",
  info: "var(--kt-pri)",
};

// 级色取值入口（WCAG AA 文本 4.5 线，离线探针实测见证据日志）：
// warn 主题感知——暗色档琥珀达标，浅色档回落既有分级中性令牌 --kt-onv；
// 其余级别不随主题切换；未知级别退回 info 主色。查找仅认自有属性：
// "constructor"/"toString" 等原型链键不是级别，直取会把函数当颜色。
export const logLevelColor = (level, darkMode) =>
  level === "warn" && !darkMode
    ? "var(--kt-onv)"
    : Object.prototype.hasOwnProperty.call(LOG_LEVEL_COLORS, level)
      ? LOG_LEVEL_COLORS[level]
      : "var(--kt-pri)";

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
                    <span style={{ color: "var(--kt-onv)" }}>[{log.time}]</span>{" "}
                    <span style={{ color, fontWeight: 600 }}>
                      [{log.level.toUpperCase()}]
                    </span>{" "}
                    <span
                      style={{
                        color: log.level === "error" ? "var(--kt-err)" : "inherit",
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
