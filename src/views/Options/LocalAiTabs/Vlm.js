import { validateInputFile } from "../../../localAi/core/inputFiles";
import {
  ModelStatus,
  UnloadModelButton,
  useRuntimeService,
} from "./RuntimeControls";
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { VlmClient } from "../../../localAi/core/vlmClient";
import { CATALOG, getModelDisplayName } from "../../../localAi/core/catalog";
import { setShared } from "../../../localAi/core/shared";
import {
  OCR_VLM_TASK_OPTIONS,
  inferOnnxModelDtype,
  resolveOcrVlmPrompt,
  supportsOcrVlmTaskSwitch,
} from "../../../localAi/core/ocrVlmPrompts";
import { useI18n } from "../../../hooks/I18n";
import LogViewer, { useLocalAiLog } from "./LogViewer";

const VLM_MODELS = CATALOG.filter((m) => m.task === "ocr-vlm");
const VLM_MODEL_IDS = VLM_MODELS.map((m) => m.id);

const vlmClient = new VlmClient();

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export default function VlmTab() {
  const i18n = useI18n();
  const { logs, expanded, setExpanded, addLog, clearLogs } = useLocalAiLog();

  // VLM 状态
  const [vlmModelId, setVlmModelId] = useState(VLM_MODELS[0]?.id || "");
  const [vlmTaskMode, setVlmTaskMode] = useState("doc");
  const [vlmDevice, setVlmDevice] = useState("webgpu");
  const [vlmRecs, setVlmRecs] = useState({});
  const [vlmClientState, setVlmClientState] = useState("idle");
  const [vlmProgressText, setVlmProgressText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [vlmMarkdown, setVlmMarkdown] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  // 图像与错误状态
  const [file, setFile] = useState(null);
  const selectionRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileRef = useRef(null);

  useEffect(() => {
    const unsub = manager.subscribe((_id, r) => {
      if (r.manifest.task === "ocr-vlm") {
        setVlmRecs((prev) => ({ ...prev, [r.manifest.id]: { ...r } }));
      }
    });

    void manager.init().then(() => {
      const next = {};
      for (const id of VLM_MODEL_IDS) {
        const r = manager.get(id);
        if (r) next[id] = { ...r };
      }
      setVlmRecs(next);
    });

    vlmClient.onProgress = (status) => {
      setVlmProgressText(status);
      addLog(status);
    };
    vlmClient.onStateChange = (ready, reason) => {
      if (!ready) {
        setVlmClientState("idle");
        if (reason) {
          if (!reason.includes("已卸载") && !reason.includes("闲置超时"))
            setError(reason);
          addLog(reason, "error");
        }
      }
    };

    return unsub;
  }, [addLog]);

  useEffect(() => {
    setVlmMarkdown("");
    setElapsedMs(0);
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const vlmModel = VLM_MODELS.find((m) => m.id === vlmModelId) ?? VLM_MODELS[0];

  useEffect(() => {
    if (vlmModel?.backend && !vlmModel.backend.includes(vlmDevice)) {
      setVlmDevice(vlmModel.backend[0] || "wasm");
    }
  }, [vlmModel?.id, vlmModel?.backend, vlmDevice]);

  const vlmRec = vlmRecs[vlmModelId] ?? null;
  const vlmInstalled = vlmRec?.state === "installed";
  const vlmBusy =
    vlmRec?.state === "downloading" ||
    vlmRec?.state === "queued" ||
    vlmRec?.state === "verifying";
  const modelTarget = {
    modelRef: vlmModelId,
    loadSpec: { device: vlmDevice, nCtx: 8192 },
  };
  const runtime = useRuntimeService("vlm", modelTarget);
  const vlmIsLoaded = runtime.loaded;

  const loadVlm = async () => {
    if (!vlmModel) return;
    setError(null);
    setVlmClientState("loading");
    setVlmProgressText(
      i18n("local_ai_vlm_engine_loading", "启动 VLM 多模态大模型…")
    );
    const modelName = getModelDisplayName(vlmModel, i18n);
    addLog(
      `准备加载 VLM 模型: ${modelName} (${vlmModel.runtime || "onnx"}, ${vlmDevice.toUpperCase()})…`
    );
    try {
      const isWllama = vlmModel.runtime === "wllama";
      const dtype = isWllama
        ? undefined
        : inferOnnxModelDtype(vlmModel.files.map((f) => f.path));
      const mmprojFile = isWllama
        ? vlmModel.files.find((f) => f.path.includes("mmproj"))?.path
        : undefined;
      const modelFile = isWllama
        ? vlmModel.files.find((f) => !f.path.includes("mmproj"))?.path ||
          vlmModel.files[0]?.path
        : undefined;
      const hasExternalData = vlmModel.files.some((f) =>
        f.path.endsWith(".onnx_data")
      );

      await vlmClient.load(
        {
          runtime: isWllama ? "wllama" : "onnx",
          source: vlmModel.source,
          dir: vlmModel.dir,
          file: modelFile,
          mmprojFile,
          device: vlmDevice,
          dtype,
          nCtx: 8192,
          ...(hasExternalData ? { externalDataChunks: 1 } : {}),
        },
        modelTarget
      );
      setVlmClientState("ready");
      setVlmProgressText("");
      addLog(
        `VLM 模型加载就绪: ${modelName} (${vlmDevice.toUpperCase()})`,
        "success"
      );
    } catch (e) {
      setVlmClientState("idle");
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      addLog(`VLM 模型加载失败: ${err}`, "error");
    }
  };

  const runVlm = async () => {
    if (!file || runtime.busy || !vlmInstalled || !vlmModel) return;
    setParsing(true);
    setError(null);
    setVlmMarkdown("");
    const startTime = performance.now();
    addLog(`开始 VLM 解析 (图片: ${file.name}, 模式: ${vlmTaskMode})…`);
    try {
      const prompt = resolveOcrVlmPrompt(vlmModel.id, vlmTaskMode);
      await validateInputFile(file, "image");
      const imgBuf = await file.arrayBuffer();
      const res = await vlmClient.chat(
        [{ role: "user", content: prompt, images: [imgBuf] }],
        4096,
        (token) => {
          setVlmMarkdown((prev) => prev + token);
        },
        [imgBuf],
        modelTarget
      );
      const text = res.text || "";
      const dur = performance.now() - startTime;
      setVlmMarkdown(text);
      setElapsedMs(dur);
      setShared("vlm", text);
      addLog(
        `VLM 解析完成，耗时 ${fmtMs(dur)} (生成约 ${text.length} 字符)`,
        "success"
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      addLog(`VLM 解析失败: ${err}`, "error");
    } finally {
      setParsing(false);
    }
  };

  const copyResult = () => {
    if (!vlmMarkdown) return;
    navigator.clipboard.writeText(vlmMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Stack spacing={2.5}>
      <Card variant="outlined">
        <CardContent sx={{ pb: "16px !important" }}>
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1,
                width: "100%",
              }}
            >
              <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                {i18n("local_ai_vlm_title", "视觉语言大模型 (VLM)")}
              </Typography>
              <ModelStatus
                installed={vlmInstalled}
                downloading={vlmBusy}
                runtime={runtime}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "local_ai_vlm_desc",
                "端到端多模态文档解析与图文理解，直接输出结构化 Markdown、复杂表格与公式"
              )}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="vlm-model-label">
                {i18n("local_ai_vlm_model", "VLM 模型")}
              </InputLabel>
              <Select
                labelId="vlm-model-label"
                value={vlmModelId}
                label={i18n("local_ai_vlm_model", "VLM 模型")}
                onChange={(e) => setVlmModelId(e.target.value)}
                disabled={vlmClientState === "loading" || parsing}
              >
                {VLM_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {getModelDisplayName(m, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="vlm-task-label">
                {i18n("local_ai_vlm_task_mode", "解析模式")}
              </InputLabel>
              <Select
                labelId="vlm-task-label"
                value={vlmTaskMode}
                label={i18n("local_ai_vlm_task_mode", "解析模式")}
                onChange={(e) => setVlmTaskMode(e.target.value)}
                disabled={
                  vlmClientState === "loading" ||
                  parsing ||
                  !supportsOcrVlmTaskSwitch(vlmModelId)
                }
              >
                {OCR_VLM_TASK_OPTIONS.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {i18n(`local_ai_vlm_task_${opt.id}`, opt.label)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="vlm-backend-label">
                {i18n("local_ai_backend", "计算后端")}
              </InputLabel>
              <Select
                labelId="vlm-backend-label"
                value={vlmDevice}
                label={i18n("local_ai_backend", "计算后端")}
                onChange={(e) => setVlmDevice(e.target.value)}
                disabled={vlmClientState === "loading" || parsing}
              >
                {(vlmModel?.backend ?? ["webgpu", "wasm"]).includes(
                  "webgpu"
                ) && (
                  <MenuItem value="webgpu">
                    {i18n("compute_device_webgpu", "WebGPU")}
                  </MenuItem>
                )}
                {(vlmModel?.backend ?? ["webgpu", "wasm"]).includes("wasm") && (
                  <MenuItem value="wasm">
                    {i18n("compute_device_wasm", "WASM (CPU)")}
                  </MenuItem>
                )}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              disabled={
                runtime.busy ||
                !vlmInstalled ||
                vlmClientState === "loading" ||
                parsing ||
                vlmIsLoaded
              }
              onClick={() => void loadVlm()}
            >
              {vlmClientState === "loading"
                ? i18n("local_ai_model_loading", "加载中…")
                : vlmIsLoaded
                  ? i18n("local_ai_model_loaded", "模型已就绪")
                  : i18n("local_ai_load_model", "加载模型")}
            </Button>
            <UnloadModelButton
              client={vlmClient}
              runtime={runtime}
              onError={setError}
            />
            <Typography variant="caption" color="text.secondary">
              {i18n(
                "local_ai_language_services",
                "LLM 与 VLM 独立驻留，当前推理串行。独享模式切换时先释放其他重模型，JEV 除外。"
              )}
            </Typography>

            {vlmProgressText && (
              <Typography variant="caption" color="text.secondary">
                {vlmProgressText}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

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
            <Typography variant="h6" fontWeight={600}>
              {i18n("local_ai_vlm_image_card", "图像上传与解析")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
              >
                {file
                  ? i18n("local_ai_vlm_change_image", "更换图片")
                  : i18n("local_ai_vlm_upload_image", "选择图片")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  const selection = ++selectionRef.current;
                  if (f) void validateInputFile(f, "image")
                    .then(() => {
                      if (selection === selectionRef.current) { setFile(f); setError(null); }
                    })
                    .catch((e) => { if (selection === selectionRef.current) setError(e.message); });
                }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<PlayArrowRoundedIcon />}
                disabled={!file || runtime.busy || !vlmInstalled || parsing}
                onClick={() => void runVlm()}
              >
                {parsing
                  ? i18n("local_ai_vlm_parsing", "正在解析…")
                  : i18n("local_ai_vlm_run", "开始解析")}
              </Button>
              {parsing && (
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<StopRoundedIcon />}
                  onClick={() => {
                    vlmClient.stop();
                    setParsing(false);
                    addLog("已手动停止 VLM 解析", "warn");
                  }}
                >
                  {i18n("local_ai_stop", "停止")}
                </Button>
              )}
            </Box>
          </Box>

          {file && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {i18n("local_ai_vlm_current_file", "当前文件:")} {file.name} (
                {Math.round(file.size / 1024)} KB)
              </Typography>
            </Box>
          )}

          {previewUrl && (
            <Box sx={{ my: 1.5, maxWidth: "100%", overflow: "auto" }}>
              <Box
                component="img"
                src={previewUrl}
                alt="preview"
                sx={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: 480,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          <LogViewer
            logs={logs}
            expanded={expanded}
            setExpanded={setExpanded}
            onClear={clearLogs}
          />
        </CardContent>
      </Card>

      {vlmMarkdown && (
        <Card variant="outlined">
          <CardContent sx={{ pb: "16px !important" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  {i18n("local_ai_vlm_results", "VLM 解析结果")}
                </Typography>
                {elapsedMs > 0 && (
                  <Chip
                    size="small"
                    label={`${i18n("local_ai_total_time", "总耗时")} ${fmtMs(elapsedMs)}`}
                    variant="outlined"
                  />
                )}
              </Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ContentCopyRoundedIcon />}
                onClick={copyResult}
              >
                {copied
                  ? i18n("local_ai_copied", "已复制")
                  : i18n("local_ai_vlm_copy_content", "复制内容")}
              </Button>
            </Box>

            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                fontSize: 13,
                resize: "vertical",
                overflow: "auto",
                minHeight: 120,
                maxHeight: 600,
              }}
            >
              {vlmMarkdown}
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
