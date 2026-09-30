import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { nextRpcId } from "../../../localAi/runtime/rpc";
import { OCR_GROUPS, getModelDisplayName } from "../../../localAi/core/catalog";
import {
  formatBytes,
  formatEta,
  formatSpeed,
} from "../../../localAi/core/progress";
import { useI18n } from "../../../hooks/I18n";

function snapshot(rec) {
  return { ...rec, files: { ...rec.files } };
}

function matchesTaskFilter(task, filter) {
  if (filter === "all") return true;
  if (filter === "jev") return task === "decision";
  if (filter === "asr") return task === "asr";
  if (filter === "ocr") {
    return task === "ocr-detection" || task === "ocr-recognition";
  }
  if (filter === "vlm") return task === "ocr-vlm";
  if (filter === "llm") return task === "llm";
  if (filter === "tts") return task === "tts";
  return true;
}

function FileRow({ file, fs, size }) {
  const i18n = useI18n();
  const name = file.path.split("/").pop() ?? file.path;
  const active =
    fs?.state === "downloading" ||
    fs?.state === "verifying" ||
    fs?.state === "queued";
  const pct = fs ? Math.min(100, (fs.downloaded / size) * 100) : 0;
  return (
    <Box
      sx={{
        py: 0.75,
        borderBottom: "1px dashed",
        borderColor: "divider",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{ wordBreak: "break-all", flex: 1, fontFamily: "monospace" }}
        >
          {name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flexShrink: 0 }}
        >
          {formatBytes(size)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ minWidth: 120, textAlign: "right", flexShrink: 0 }}
        >
          {fs && active
            ? `${formatBytes(fs.downloaded)} · ${formatSpeed(fs.speed ?? 0)} · ${i18n("local_ai_models_remaining", "剩余")} ${formatEta(fs.etaSeconds)}`
            : fs?.state === "installed"
              ? i18n("local_ai_models_completed", "完成")
              : fs?.state === "error"
                ? i18n("local_ai_models_state_error", "出错")
                : fs?.state === "paused"
                  ? `${i18n("local_ai_models_downloaded", "已下载")} ${formatBytes(fs.downloaded)}`
                  : ""}
        </Typography>
      </Box>
      {active && (
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ mt: 0.5, height: 4, borderRadius: 1 }}
        />
      )}
    </Box>
  );
}

function getChipProps(state, busyState) {
  if (state === "installed") return { color: "success", variant: "filled" };
  if (state === "error") return { color: "error", variant: "filled" };
  if (state === "paused") return { color: "warning", variant: "filled" };
  if (busyState) return { color: "primary", variant: "filled" };
  return { color: "default", variant: "outlined" };
}

function ModelCard({ rec }) {
  const i18n = useI18n();
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const manifest = rec.manifest;
  const total = manifest.files.reduce((s, f) => s + f.size, 0);
  const downloaded = manifest.files.reduce(
    (s, f) => s + (rec.files[f.path]?.downloaded ?? 0),
    0
  );
  const busyState =
    rec.state === "downloading" ||
    rec.state === "queued" ||
    rec.state === "verifying";

  const stateLabels = {
    "not-installed": i18n("local_ai_models_state_not_installed", "未安装"),
    queued: i18n("local_ai_models_state_queued", "排队中"),
    downloading: i18n("local_ai_models_state_downloading", "下载中"),
    paused: i18n("local_ai_models_state_paused", "已暂停"),
    verifying: i18n("local_ai_models_state_verifying", "校验中"),
    installed: i18n("local_ai_models_state_installed", "已安装"),
    error: i18n("local_ai_models_state_error", "出错"),
  };

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: "16px !important" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flex: 1,
              minWidth: 0,
            }}
          >
            <IconButton
              size="small"
              onClick={() => setCollapsed(!collapsed)}
              sx={{ flexShrink: 0 }}
            >
              {collapsed ? (
                <KeyboardArrowDownRoundedIcon fontSize="small" />
              ) : (
                <KeyboardArrowUpRoundedIcon fontSize="small" />
              )}
            </IconButton>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{ wordBreak: "break-word" }}
            >
              {getModelDisplayName(manifest, i18n)}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
            }}
          >
            <Chip
              size="small"
              label={
                manifest.task === "ocr-vlm"
                  ? "VLM"
                  : manifest.task.toUpperCase()
              }
              variant="outlined"
            />
            <Chip size="small" label={formatBytes(total)} variant="outlined" />
            <Chip
              size="small"
              label={stateLabels[rec.state] || rec.state}
              {...getChipProps(rec.state, busyState)}
            />
            {!busyState && rec.state !== "installed" && (
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadRoundedIcon />}
                onClick={() =>
                  void manager
                    .download(manifest.id)
                    .catch((e) => console.error(e))
                }
              >
                {rec.state === "paused"
                  ? i18n("local_ai_models_action_resume", "继续")
                  : i18n("local_ai_models_action_download", "下载")}
              </Button>
            )}
            {busyState && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PauseCircleOutlineRoundedIcon />}
                  disabled={busy}
                  onClick={() => act(() => manager.pause(manifest.id))}
                >
                  {i18n("local_ai_models_action_pause", "暂停")}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  disabled={busy}
                  onClick={() => act(() => manager.cancel(manifest.id))}
                >
                  {i18n("local_ai_models_cancel", "取消")}
                </Button>
              </>
            )}
            {rec.state === "installed" && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteOutlineRoundedIcon />}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `${i18n("local_ai_models_action_delete_confirm", "确定删除此模型的所有本地缓存文件吗？")}\n(${getModelDisplayName(manifest, i18n)})`
                    )
                  ) {
                    void act(() => manager.remove(manifest.id));
                  }
                }}
              >
                {i18n("local_ai_models_action_delete", "删除")}
              </Button>
            )}
          </Box>
        </Box>

        {(busyState || rec.state === "paused") && total > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={(downloaded / total) * 100}
              sx={{ height: 6, borderRadius: 1 }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
            >
              {formatBytes(downloaded)} / {formatBytes(total)}（
              {Math.floor((downloaded / total) * 100)}%）
            </Typography>
          </Box>
        )}

        <Collapse in={!collapsed} timeout="auto" unmountOnExit sx={{ mt: 1.5 }}>
          <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1.5 }}>
            <Typography
              variant="caption"
              fontWeight={600}
              color="text.secondary"
              gutterBottom
              sx={{ display: "block" }}
            >
              {i18n("local_ai_models_included_files", "包含文件：")}
            </Typography>
            {manifest.files.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                fs={rec.files[f.path]}
                size={f.size}
              />
            ))}
          </Box>
        </Collapse>

        {rec.state === "error" && rec.error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {rec.error}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

const OCR_GROUP_BY_DET = Object.fromEntries(
  OCR_GROUPS.map((g) => [g.detId, g])
);
const isBusyState = (s) =>
  s === "downloading" || s === "queued" || s === "verifying";

function groupState(recs) {
  const states = recs.map((r) => r.state);
  if (states.every((s) => s === "installed")) return "installed";
  for (const s of ["downloading", "verifying", "queued", "error", "paused"]) {
    if (states.includes(s)) return s;
  }
  return "not-installed";
}

function OcrGroupCard({ group, det, rec }) {
  const i18n = useI18n();
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const recs = [det, rec];
  const state = groupState(recs);
  const busyState = isBusyState(state);
  const total = recs.reduce(
    (s, r) => s + r.manifest.files.reduce((a, f) => a + f.size, 0),
    0
  );
  const downloaded = recs.reduce(
    (s, r) =>
      s +
      r.manifest.files.reduce(
        (a, f) => a + (r.files[f.path]?.downloaded ?? 0),
        0
      ),
    0
  );

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stateLabels = {
    "not-installed": i18n("local_ai_models_state_not_installed", "未安装"),
    queued: i18n("local_ai_models_state_queued", "排队中"),
    downloading: i18n("local_ai_models_state_downloading", "下载中"),
    paused: i18n("local_ai_models_state_paused", "已暂停"),
    verifying: i18n("local_ai_models_state_verifying", "校验中"),
    installed: i18n("local_ai_models_state_installed", "已安装"),
    error: i18n("local_ai_models_state_error", "出错"),
  };

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: "16px !important" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flex: 1,
              minWidth: 0,
            }}
          >
            <IconButton
              size="small"
              onClick={() => setCollapsed(!collapsed)}
              sx={{ flexShrink: 0 }}
            >
              {collapsed ? (
                <KeyboardArrowDownRoundedIcon fontSize="small" />
              ) : (
                <KeyboardArrowUpRoundedIcon fontSize="small" />
              )}
            </IconButton>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{ wordBreak: "break-word" }}
            >
              {getModelDisplayName(group, i18n)}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
            }}
          >
            <Chip
              size="small"
              label={i18n("local_ai_models_ocr_group", "OCR 组合")}
              variant="outlined"
            />
            <Chip size="small" label={formatBytes(total)} variant="outlined" />
            <Chip
              size="small"
              label={stateLabels[state] || state}
              {...getChipProps(state, busyState)}
            />
            {!busyState && state !== "installed" && (
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadRoundedIcon />}
                onClick={() => {
                  void manager.download(det.manifest.id);
                  void manager.download(rec.manifest.id);
                }}
              >
                {state === "paused"
                  ? i18n("local_ai_models_action_resume", "继续")
                  : i18n("local_ai_models_download_group", "下载组合")}
              </Button>
            )}
            {busyState && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await manager.pause(det.manifest.id);
                      await manager.pause(rec.manifest.id);
                    })
                  }
                >
                  {i18n("local_ai_models_action_pause", "暂停")}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await manager.cancel(det.manifest.id);
                      await manager.cancel(rec.manifest.id);
                    })
                  }
                >
                  {i18n("local_ai_models_cancel", "取消")}
                </Button>
              </>
            )}
            {state === "installed" && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteOutlineRoundedIcon />}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `${i18n("local_ai_models_action_delete_confirm", "确定删除此模型的所有本地缓存文件吗？")}\n(${getModelDisplayName(group, i18n)})`
                    )
                  ) {
                    void act(async () => {
                      await manager.remove(det.manifest.id);
                      await manager.remove(rec.manifest.id);
                    });
                  }
                }}
              >
                {i18n("local_ai_models_delete_group", "删除组合")}
              </Button>
            )}
          </Box>
        </Box>

        {(busyState || state === "paused") && total > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={(downloaded / total) * 100}
              sx={{ height: 6, borderRadius: 1 }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
            >
              {formatBytes(downloaded)} / {formatBytes(total)}（
              {Math.floor((downloaded / total) * 100)}%）
            </Typography>
          </Box>
        )}

        <Collapse in={!collapsed} timeout="auto" unmountOnExit sx={{ mt: 1.5 }}>
          <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1.5 }}>
            {recs.map((r) => (
              <Box
                key={r.manifest.id}
                sx={{ mb: 1.5, "&:last-child": { mb: 0 } }}
              >
                <Typography
                  variant="caption"
                  fontWeight={600}
                  color="text.secondary"
                >
                  {getModelDisplayName(r.manifest, i18n)}
                </Typography>
                {r.manifest.files.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    fs={r.files[f.path]}
                    size={f.size}
                  />
                ))}
              </Box>
            ))}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

export default function ModelsTab() {
  const i18n = useI18n();
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState(null);
  const [storage, setStorage] = useState(null);
  const [taskFilter, setTaskFilter] = useState("all");

  const taskFilters = [
    { value: "all", label: i18n("local_ai_models_filter_all", "全部") },
    { value: "jev", label: "JEV" },
    { value: "asr", label: "ASR" },
    { value: "ocr", label: "OCR" },
    { value: "vlm", label: "VLM" },
    { value: "llm", label: "LLM" },
    { value: "tts", label: "TTS" },
  ];

  useEffect(() => {
    const unsub = manager.subscribe(() => {
      setRecords(manager.list().map(snapshot));
    });
    void (async () => {
      const s = await runtimeHost.request({
        id: nextRpcId("settings"),
        service: "runtime",
        method: "getSettings",
        payload: {},
      });
      setSettings(s);
      await manager.init();
      setRecords(manager.list().map(snapshot));
    })().catch((e) => setSettingsError(String(e)));
    const unsubSettings = runtimeHost.onServiceState((state) => {
      if (state.settings) setSettings(state.settings);
    });
    return () => {
      unsub();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    void manager.storageStats().then(setStorage);
  }, [records]);

  const changeMirror = async (mirror) => {
    setSettingsError(null);
    try {
      const s = await runtimeHost.request({
        id: nextRpcId("settings-update"),
        service: "runtime",
        method: "updateSettings",
        payload: { mirror },
      });
      setSettings(s);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    }
  };

  const renderItems = (items, idOf, render, renderGroup) => {
    const out = [];
    const used = new Set();
    for (const t of items) {
      const id = idOf(t);
      const g = OCR_GROUP_BY_DET[id];
      if (g) {
        out.push(renderGroup(g));
        used.add(g.detId);
        used.add(g.recId);
        continue;
      }
      if (used.has(id)) continue;
      out.push(render(t));
    }
    return out;
  };

  const filteredRecords = records.filter((r) =>
    matchesTaskFilter(r.manifest.task, taskFilter)
  );

  return (
    <Box>
      {settingsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {settingsError}
        </Alert>
      )}
      <Card variant="outlined" sx={{ mb: 2.5 }}>
        <CardContent sx={{ pb: "16px !important" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={600}>
                {i18n("local_ai_tab_models", "模型中心")}
              </Typography>
              {storage && (
                <Typography variant="caption" color="text.secondary">
                  {i18n("local_ai_models_storage_usage", "本地存储占用：")}
                  {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
                </Typography>
              )}
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="local-ai-filter-label">
                  {i18n("local_ai_models_task_category", "任务分类")}
                </InputLabel>
                <Select
                  labelId="local-ai-filter-label"
                  value={taskFilter}
                  label={i18n("local_ai_models_task_category", "任务分类")}
                  onChange={(e) => setTaskFilter(e.target.value)}
                >
                  {taskFilters.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="local-ai-mirror-label">
                  {i18n("local_ai_models_mirror", "下载源镜像")}
                </InputLabel>
                <Select
                  labelId="local-ai-mirror-label"
                  value={settings?.mirror ?? "hf-mirror"}
                  label={i18n("local_ai_models_mirror", "下载源镜像")}
                  onChange={(e) => void changeMirror(e.target.value)}
                >
                  <MenuItem value="hf-mirror">
                    {i18n(
                      "local_ai_models_mirror_hf_mirror",
                      "HF 国内镜像 (hf-mirror.com)"
                    )}
                  </MenuItem>
                  <MenuItem value="modelscope">
                    {i18n(
                      "local_ai_models_mirror_modelscope",
                      "魔搭 (ModelScope)"
                    )}
                  </MenuItem>
                  <MenuItem value="huggingface">
                    {i18n("local_ai_models_mirror_hf", "Hugging Face (官方)")}
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Box>
        {renderItems(
          filteredRecords,
          (r) => r.manifest.id,
          (rec) => (
            <ModelCard key={rec.manifest.id} rec={rec} />
          ),
          (g) => {
            const det = records.find((r) => r.manifest.id === g.detId);
            const rec = records.find((r) => r.manifest.id === g.recId);
            if (!det || !rec) return null;
            return <OcrGroupCard key={g.id} group={g} det={det} rec={rec} />;
          }
        )}
      </Box>
    </Box>
  );
}
