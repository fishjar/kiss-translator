import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { useI18n } from "../../../hooks/I18n";

/**
 * 独立的本地 AI 日志 Hook：管理当前 Tab 的运行日志、展开状态与添加/清空方法。
 * 默认折叠，发生 error 级别日志时自动展开。
 */
export function useLocalAiLog() {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);

  const addLog = useCallback((message, level = "info") => {
    if (!message) return;
    const time = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [...prev, { time, level, message: String(message) }]);
    if (level === "error") {
      setExpanded(true);
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    expanded,
    setExpanded,
    addLog,
    clearLogs,
  };
}

/**
 * 本地 AI 运行日志展示组件：
 * 支持折叠/展开、手动清空、一键复制、日志条数角标及等宽控制台样式。
 */
export default function LogViewer({
  logs = [],
  expanded = false,
  setExpanded,
  onClear,
}) {
  const i18n = useI18n();
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (expanded && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, expanded]);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!logs.length) return;
    const text = logs
      .map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onClear?.();
  };

  const errorCount = logs.filter((l) => l.level === "error").length;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExp) => setExpanded?.(isExp)}
      variant="outlined"
      sx={{
        mt: 2,
        borderRadius: "8px !important",
        borderColor: "divider",
        "&:before": { display: "none" },
        bgcolor: "background.paper",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          minHeight: 44,
          px: 1.5,
          "&.Mui-expanded": { minHeight: 44 },
          "& .MuiAccordionSummary-content": {
            my: 0.5,
            alignItems: "center",
            justifyContent: "space-between",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TerminalRoundedIcon
            fontSize="small"
            color={errorCount > 0 ? "error" : "action"}
          />
          <Typography variant="body2" fontWeight={600}>
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mr: 1 }}>
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
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1.5, pt: 0 }}>
        <Box
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
                      style={{ color: log.level === "error" ? "#ef4444" : "inherit" }}
                    >
                      {log.message}
                    </span>
                  </Box>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
