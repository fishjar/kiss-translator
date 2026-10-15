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
import { OcrClient } from "../../../localAi/core/ocrClient";
import {
  OCR_GROUPS,
  getCatalogModel,
  getModelDisplayName,
} from "../../../localAi/core/catalog";
import { setShared } from "../../../localAi/core/shared";
import { useI18n } from "../../../hooks/I18n";
import LogViewer, { useLocalAiLog } from "./LogViewer";

const OCR_MODEL_IDS = OCR_GROUPS.flatMap((g) => [g.detId, g.recId]);
const client = new OcrClient();

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export default function OcrTab() {
  const i18n = useI18n();
  const { logs, addLog, clearLogs } = useLocalAiLog();

  // PaddleOCR 状态
  const [selectedGroupId, setSelectedGroupId] = useState(OCR_GROUPS[0].id);
  const [device, setDevice] = useState("webgpu");
  const [recs, setRecs] = useState({});
  const [clientState, setClientState] = useState("idle");
  const [progressText, setProgressText] = useState("");

  // 图像与识别结果
  const [file, setFile] = useState(null);
  const selectionRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const unsub = manager.subscribe((_id, r) => {
      if (
        r.manifest.task === "ocr-detection" ||
        r.manifest.task === "ocr-recognition"
      ) {
        setRecs((prev) => ({ ...prev, [r.manifest.id]: { ...r } }));
      }
    });
    void manager.init().then(() => {
      const next = {};
      for (const id of OCR_MODEL_IDS) {
        const r = manager.get(id);
        if (r) next[id] = { ...r };
      }
      setRecs(next);
    });

    client.onProgress = (status) => {
      setProgressText(status);
      addLog(status);
    };
    client.onStateChange = (ready, reason) => {
      if (!ready) {
        setClientState("idle");
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
    setResult(null);
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!result || !previewUrl || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = result.width / img.naturalWidth;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      ctx.lineWidth = 2;
      ctx.font = "14px sans-serif";
      for (const it of result.items) {
        if (it.poly.length < 4) continue;
        ctx.strokeStyle = "#4caf50";
        ctx.beginPath();
        ctx.moveTo(it.poly[0][0] * scale, it.poly[0][1] * scale);
        for (let i = 1; i < it.poly.length; i++) {
          ctx.lineTo(it.poly[i][0] * scale, it.poly[i][1] * scale);
        }
        ctx.closePath();
        ctx.stroke();
        const label = `${it.text} (${it.score.toFixed(2)})`;
        const w = ctx.measureText(label).width + 8;
        const x = it.poly[0][0] * scale;
        const y = Math.max(14, it.poly[0][1] * scale);
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(x, y - 14, w, 18);
        ctx.fillStyle = "#4caf50";
        ctx.fillText(label, x + 4, y);
      }
    };
    img.src = previewUrl;
  }, [result, previewUrl]);

  const group =
    OCR_GROUPS.find((g) => g.id === selectedGroupId) ?? OCR_GROUPS[0];
  const detRec = recs[group.detId];
  const recRec = recs[group.recId];
  const bothInstalled =
    detRec?.state === "installed" && recRec?.state === "installed";
  const anyBusy = [detRec, recRec].some(
    (r) =>
      r?.state === "downloading" ||
      r?.state === "queued" ||
      r?.state === "verifying"
  );
  const modelTarget = { modelRef: group.id, loadSpec: { device: device } };
  const runtime = useRuntimeService("ocr", modelTarget);
  const paddleLoaded = runtime.loaded;

  const loadGroup = async () => {
    const detManifest = getCatalogModel(group.detId);
    const recManifest = getCatalogModel(group.recId);
    if (!detManifest || !recManifest) {
      const msg = i18n("local_ai_model_manifest_missing", "模型清单缺失");
      setError(msg);
      addLog(msg, "error");
      return;
    }
    setError(null);
    setClientState("loading");
    const loadMsg = i18n("local_ai_ocr_engine_loading", "启动 PaddleOCR 引擎…");
    setProgressText(loadMsg);
    addLog(
      `准备加载 OCR 模型组: ${group.detName} + ${group.recName} (${device})…`
    );
    try {
      await client.load(
        {
          detModelId: detManifest.id,
          recModelId: recManifest.id,
          source: detManifest.source,
          detDir: detManifest.dir,
          detFile: detManifest.files[0]?.path,
          detName: group.detName,
          recDir: recManifest.dir,
          recFile: recManifest.files[0]?.path,
          recName: group.recName,
          device,
        },
        modelTarget
      );
      setClientState("ready");
      setProgressText("");
      addLog(
        `OCR 引擎与模型加载就绪 (${group.detName} + ${group.recName})`,
        "success"
      );
    } catch (e) {
      setClientState("idle");
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      addLog(`OCR 模型加载失败: ${err}`, "error");
    }
  };

  const runPaddleOcr = async () => {
    if (!file || !bothInstalled) return;
    setRecognizing(true);
    setError(null);
    setResult(null);
    addLog(
      `开始 OCR 文字识别 (图片: ${file.name}, 大小: ${Math.round(file.size / 1024)}KB)…`
    );
    try {
      await validateInputFile(file, "image");
      const res = await client.recognize(file, undefined, modelTarget);
      setResult(res);
      setShared("ocr", res.items.map((i) => i.text).join("\n"));
      addLog(
        `OCR 识别完成: 检测到 ${res.items.length} 处文字，耗时 ${res.elapsedMs}ms (Det: ${fmtMs(res.detMs)}, Rec: ${fmtMs(res.recMs)})`,
        "success"
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      addLog(`OCR 识别失败: ${err}`, "error");
    } finally {
      setRecognizing(false);
    }
  };

  const copyResult = () => {
    const text = result?.items?.map((i) => i.text).join("\n");
    if (!text) return;
    navigator.clipboard.writeText(text);
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
                {i18n("local_ai_ocr_title", "本地文字识别 (PaddleOCR)")}
              </Typography>
              <ModelStatus
                installed={bothInstalled}
                downloading={anyBusy}
                runtime={runtime}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "local_ai_ocr_desc",
                "轻量级端侧文字检测与识别流水线，输出精确文字块位置坐标（Bounding Box / 多边形）与置信度"
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
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="ocr-group-label">
                {i18n("local_ai_ocr_group_label", "模型组合 (Det + Rec)")}
              </InputLabel>
              <Select
                labelId="ocr-group-label"
                value={selectedGroupId}
                label={i18n("local_ai_ocr_group_label", "模型组合 (Det + Rec)")}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                disabled={clientState === "loading" || recognizing}
              >
                {OCR_GROUPS.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {getModelDisplayName(g, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="ocr-backend-label">
                {i18n("local_ai_backend", "计算后端")}
              </InputLabel>
              <Select
                labelId="ocr-backend-label"
                value={device}
                label={i18n("local_ai_backend", "计算后端")}
                onChange={(e) => setDevice(e.target.value)}
                disabled={clientState === "loading" || recognizing}
              >
                <MenuItem value="webgpu">
                  {i18n("compute_device_webgpu", "WebGPU")}
                </MenuItem>
                <MenuItem value="wasm">
                  {i18n("compute_device_wasm", "WASM (CPU)")}
                </MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              disabled={
                runtime.busy ||
                !bothInstalled ||
                clientState === "loading" ||
                recognizing ||
                paddleLoaded
              }
              onClick={() => void loadGroup()}
            >
              {clientState === "loading"
                ? i18n("local_ai_model_loading", "加载中…")
                : paddleLoaded
                  ? i18n("local_ai_model_loaded", "模型已就绪")
                  : i18n("local_ai_load_model", "加载模型")}
            </Button>
            <UnloadModelButton
              client={client}
              runtime={runtime}
              onError={setError}
            />

            {progressText && (
              <Typography variant="caption" color="text.secondary">
                {progressText}
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
              {i18n("local_ai_ocr_image_card", "图像上传与识别")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => fileRef.current?.click()}
                disabled={recognizing}
              >
                {file
                  ? i18n("local_ai_ocr_change_image", "更换图片")
                  : i18n("local_ai_ocr_upload_image", "选择图片")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  const selection = ++selectionRef.current;
                  if (f)
                    void validateInputFile(f, "image")
                      .then(() => {
                        if (selection === selectionRef.current) {
                          setFile(f);
                          setError(null);
                        }
                      })
                      .catch((e) => {
                        if (selection === selectionRef.current)
                          setError(e.message);
                      });
                }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<PlayArrowRoundedIcon />}
                disabled={
                  !file || runtime.busy || !bothInstalled || recognizing
                }
                onClick={() => void runPaddleOcr()}
              >
                {recognizing
                  ? i18n("local_ai_ocr_recognizing", "正在识别…")
                  : i18n("local_ai_ocr_run", "开始识别")}
              </Button>
              {recognizing && (
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<StopRoundedIcon />}
                  onClick={() => {
                    client.stop();
                    setRecognizing(false);
                    addLog("已手动停止文字识别", "warn");
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
                {i18n("local_ai_ocr_current_file", "当前文件:")} {file.name} (
                {Math.round(file.size / 1024)} KB)
              </Typography>
            </Box>
          )}

          {previewUrl && (
            <Box
              sx={{
                my: 1.5,
                position: "relative",
                maxWidth: "100%",
                overflow: "auto",
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: result ? "block" : "none",
                  maxWidth: "100%",
                  maxHeight: 480,
                  borderRadius: 8,
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                }}
              />
              {!result && (
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
              )}
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
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
                  {i18n("local_ai_ocr_results", "文字识别结果")}
                </Typography>
                <Chip
                  size="small"
                  label={`${i18n(
                    "local_ai_ocr_detected_blocks",
                    "检测 {0} 块 · 总耗时 {1}"
                  )
                    .replace("{0}", String(result.items.length))
                    .replace("{1}", fmtMs(result.elapsedMs))} (Det ${fmtMs(
                    result.detMs
                  )} · Rec ${fmtMs(result.recMs)})`}
                  variant="outlined"
                />
              </Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ContentCopyRoundedIcon />}
                onClick={copyResult}
              >
                {copied
                  ? i18n("local_ai_copied", "已复制")
                  : i18n("local_ai_ocr_copy_text", "复制文字")}
              </Button>
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                resize: "vertical",
                overflow: "auto",
                minHeight: 120,
                maxHeight: 600,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              {result.items.map((item, idx) => (
                <Box
                  key={idx}
                  sx={{
                    p: 1.25,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "action.hover",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Typography variant="body2">{item.text}</Typography>
                  <Chip
                    size="small"
                    label={`${i18n("local_ai_confidence", "置信度")}: ${(item.score * 100).toFixed(1)}%`}
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
      <LogViewer logs={logs} onClear={clearLogs} />
    </Stack>
  );
}
