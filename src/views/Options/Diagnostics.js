import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import { browser } from "../../libs/browser";
import { diagnosticRequest } from "../../libs/diagnostics/transport";
import {
  collectLogExport,
  exportLogText,
  logText,
} from "../../libs/diagnostics/export";
import { LEVELS } from "../../libs/diagnostics/record";

function recordDetails(record, i18n) {
  const { time, level, environment, module, event, error, ...details } = record;
  const { stack, ...errorDetails } = error || {};
  const bodies = [];
  for (const kind of ["request", "response"]) {
    if (!details[kind]?.preview) continue;
    const { preview, ...metadata } = details[kind];
    details[kind] = metadata;
    bodies.push(
      `${i18n(`diagnostics_${kind}_body`)}${preview.truncated ? ` [${i18n("diagnostics_truncated")}]` : ""}\n${preview.text}`
    );
  }
  return [
    JSON.stringify(
      { ...details, ...(error && { error: errorDetails }) },
      null,
      2
    ),
    stack,
    ...bodies,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function Diagnostics() {
  const i18n = useI18n();
  const [filter, setFilter] = useState({});
  const [result, setResult] = useState(null);
  const [before, setBefore] = useState();
  const [history, setHistory] = useState([]);
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState([]);
  const [view, setView] = useState("cards");
  const [includeBodies, setIncludeBodies] = useState(false);
  const [detail, setDetail] = useState({ enabled: false, expiresAt: 0 });
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const loading = useRef(false);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await diagnosticRequest("query", {
        filter,
        page: { before, limit: 100 },
      });
      if (current === generation.current) {
        setResult(response);
        if (response.detail) setDetail(response.detail);
        setError("");
      }
    } catch (err) {
      if (current === generation.current) setError(err.message);
    }
  }, [filter, before]);
  useEffect(() => {
    loading.current = false;
    void load();
    return invalidate;
  }, [load, invalidate]);
  useEffect(() => {
    if (!auto || before || busy) return;
    const timer = setInterval(async () => {
      if (loading.current) return;
      loading.current = true;
      await load();
      loading.current = false;
    }, 2000);
    return () => clearInterval(timer);
  }, [auto, before, busy, load]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const change = (key, value) => {
    generation.current++;
    setFilter((previous) => ({ ...previous, [key]: value }));
    setBefore(undefined);
    setHistory([]);
    setSelected([]);
    setResult(null);
  };
  const act = async (fn) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (format) => {
    const data = await collectLogExport(filter, {
      extensionVersion: browser.runtime.getManifest().version,
      browserVersion: navigator.userAgent,
      includeBodies,
    });
    const blob = new Blob(
      [format === "json" ? JSON.stringify(data, null, 2) : exportLogText(data)],
      { type: format === "json" ? "application/json" : "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kiss-diagnostics-${Date.now()}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const rows = result?.records || [];
  const continuous = view === "continuous";
  return (
    <Stack spacing={2}>
      <Alert severity="info">{i18n("diagnostics_policy")}</Alert>
      <Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={detail.enabled && detail.expiresAt > clock}
              disabled={busy}
              onChange={(e) => {
                const enabled = e.target.checked;
                generation.current++;
                void act(async () => {
                  const response = await diagnosticRequest("setDetail", {
                    enabled,
                  });
                  setDetail(response.detail);
                  setClock(Date.now());
                });
              }}
            />
          }
          label={i18n("diagnostics_detail")}
        />
        {detail.enabled && detail.expiresAt > clock && (
          <Typography component="span" variant="body2">
            {i18n("diagnostics_remaining")}:{" "}
            {Math.ceil((detail.expiresAt - clock) / 60000)} min
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {i18n("diagnostics_detail_notice")}
        </Typography>
      </Box>
      <Typography variant="body2">
        {i18n("diagnostics_console")}:{" "}
        {[...LEVELS, "silent"][result?.consoleLevel ?? 1].toUpperCase()}
        {" · "}
        {i18n("diagnostics_storage")}: {result?.stats.count ?? 0} / 10,000
        {" · "}
        {((result?.stats.bytes || 0) / 1024 / 1024).toFixed(2)} / 10 MiB
        {" · "}
        {i18n("diagnostics_dropped")}: {result?.stats.dropped ?? 0}
      </Typography>
      {(error || result?.storageError) && (
        <Alert severity="error" role="alert">
          {i18n("diagnostics_failure")} ({error || result.storageError})
        </Alert>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Box
        sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}
      >
        <Tabs
          aria-label={i18n("diagnostics_level")}
          value={filter.level || ""}
          onChange={(_, value) => change("level", value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="" label={i18n("diagnostics_all")} />
          {LEVELS.map((level) => (
            <Tab key={level} value={level} label={level.toUpperCase()} />
          ))}
        </Tabs>
        <Tabs
          aria-label={i18n("diagnostics_view")}
          value={view}
          onChange={(_, value) => setView(value)}
        >
          <Tab value="cards" label={i18n("diagnostics_cards")} />
          <Tab value="continuous" label={i18n("diagnostics_continuous")} />
        </Tabs>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {["module", "environment", "taskId", "query"].map((key) => (
          <TextField
            key={key}
            size="small"
            label={i18n(`diagnostics_${key}`)}
            value={filter[key] || ""}
            onChange={(e) => change(key, e.target.value)}
          />
        ))}
        {["from", "to"].map((key) => (
          <TextField
            key={key}
            size="small"
            type="datetime-local"
            label={i18n(`diagnostics_${key}`)}
            InputLabelProps={{ shrink: true }}
            onChange={(e) =>
              change(
                key,
                e.target.value ? new Date(e.target.value).getTime() : undefined
              )
            }
          />
        ))}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
          }
          label={i18n("diagnostics_auto")}
        />
        <Button onClick={load} disabled={busy}>
          {i18n("diagnostics_refresh")}
        </Button>
        <Button
          disabled={busy || !selected.length}
          onClick={() =>
            act(async () => {
              await navigator.clipboard.writeText(
                selected
                  .map((record) => logText(record, includeBodies))
                  .join("\n")
              );
              setNotice(i18n("diagnostics_copied"));
            })
          }
        >
          {i18n("diagnostics_copy")}
        </Button>
        <Button disabled={busy} onClick={() => act(() => download("json"))}>
          JSON
        </Button>
        <Button disabled={busy} onClick={() => act(() => download("txt"))}>
          {i18n("diagnostics_export")}
        </Button>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeBodies}
              onChange={(e) => setIncludeBodies(e.target.checked)}
            />
          }
          label={i18n("diagnostics_include_bodies")}
        />
        <Button
          color="error"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(i18n("diagnostics_clear_confirm"))) return;
            void act(async () => {
              generation.current++;
              await diagnosticRequest("clear");
              setBefore(undefined);
              setHistory([]);
              setSelected([]);
              setResult(null);
              await load();
            });
          }}
        >
          {i18n("diagnostics_clear")}
        </Button>
      </Box>
      {!rows.length && (
        <Typography color="text.secondary">
          {i18n("diagnostics_empty")}
        </Typography>
      )}
      <Box
        sx={
          continuous
            ? {
                bgcolor: "action.hover",
                borderRadius: 1,
                px: 1.5,
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: 1.6,
              }
            : { display: "flex", flexDirection: "column", gap: 2 }
        }
      >
        {rows.map((record) => (
          <Box
            key={record.id}
            sx={
              continuous
                ? {
                    py: 1.5,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-child": { borderBottom: 0 },
                    overflowWrap: "anywhere",
                  }
                : {
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1,
                    overflowWrap: "anywhere",
                  }
            }
          >
            <Box sx={{ display: "flex", alignItems: "flex-start" }}>
              <Checkbox
                size="small"
                inputProps={{ "aria-label": `Select ${record.id}` }}
                checked={selected.some((row) => row.id === record.id)}
                onChange={(e) =>
                  setSelected((previous) =>
                    e.target.checked
                      ? [...previous, record]
                      : previous.filter((row) => row.id !== record.id)
                  )
                }
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {continuous ? (
                  <Box
                    component="div"
                    sx={{
                      color:
                        record.level === "error"
                          ? "error.main"
                          : record.level === "warn"
                            ? "warning.main"
                            : "text.primary",
                    }}
                  >
                    [{new Date(record.time).toISOString()}] [
                    {record.level.toUpperCase()}] [{record.environment}/
                    {record.module}] {record.event}
                    {record.truncated
                      ? ` [${i18n("diagnostics_truncated")}]`
                      : ""}
                  </Box>
                ) : (
                  <>
                    <Typography variant="caption">
                      {new Date(record.time).toLocaleString()} ·{" "}
                      {record.level.toUpperCase()} · {record.environment}/
                      {record.module}
                    </Typography>
                    <Typography
                      color={
                        record.level === "error" ? "error.main" : "text.primary"
                      }
                    >
                      {record.event}
                      {record.truncated
                        ? ` [${i18n("diagnostics_truncated")}]`
                        : ""}
                    </Typography>
                  </>
                )}
                {record.request && (
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {record.request.method}{" "}
                    {record.request.url || i18n("diagnostics_internal")}
                    {record.response?.status
                      ? ` · HTTP ${record.response.status}`
                      : ""}
                    {Number.isFinite(record.context.elapsedMs)
                      ? ` · ${record.context.elapsedMs} ms`
                      : ""}
                  </Typography>
                )}
                {!record.request &&
                  record.module === "local-ai" &&
                  record.context.method && (
                    <Typography variant="body2">
                      {i18n("diagnostics_internal")}: {record.context.service}.
                      {record.context.method}
                      {record.context.modelId
                        ? ` · ${record.context.modelId}`
                        : ""}
                    </Typography>
                  )}
                {record.resultSummary && (
                  <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                    {JSON.stringify(record.resultSummary)}
                  </Typography>
                )}
                {(record.context.taskId || record.context.requestId) && (
                  <Button
                    size="small"
                    onClick={() =>
                      change(
                        "taskId",
                        record.context.taskId || record.context.requestId
                      )
                    }
                  >
                    {record.context.taskId || record.context.requestId}
                  </Button>
                )}
                {continuous ? (
                  <Box
                    component="pre"
                    sx={{
                      "&&": {
                        m: 0,
                        p: 0,
                        bgcolor: "transparent",
                        borderRadius: 0,
                        overflow: "visible",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                        lineHeight: "inherit",
                      },
                    }}
                  >
                    {recordDetails(record, i18n)}
                  </Box>
                ) : (
                  <details>
                    <summary>{i18n("diagnostics_details")}</summary>
                    <Box
                      component="pre"
                      sx={{ whiteSpace: "pre-wrap", fontSize: 12 }}
                    >
                      {recordDetails(record, i18n)}
                    </Box>
                  </details>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={1}>
        <Button
          disabled={busy || !history.length}
          onClick={() => {
            setBefore(history[history.length - 1]);
            setHistory((prev) => prev.slice(0, -1));
            setSelected([]);
          }}
        >
          {i18n("diagnostics_previous")}
        </Button>
        <Button
          disabled={busy || !result?.next}
          onClick={() => {
            setHistory((prev) => [...prev, before]);
            setBefore(result.next);
            setSelected([]);
          }}
        >
          {i18n("diagnostics_next")}
        </Button>
      </Stack>
    </Stack>
  );
}
