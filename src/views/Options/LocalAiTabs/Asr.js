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
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Divider from "@mui/material/Divider";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { AsrClient } from "../../../localAi/core/asrClient";
import {
  MicRecorder,
  decodeAudioFile,
  resampleTo16k,
  audioToWavBlob,
} from "../../../localAi/core/recorder";
import { CATALOG, getModelDisplayName } from "../../../localAi/core/catalog";
import { getSupportedAsrLanguages } from "../../../localAi/core/asrLanguages";
import { setShared } from "../../../localAi/core/shared";
import { useI18n } from "../../../hooks/I18n";
import LogViewer, { useLocalAiLog } from "./LogViewer";

const ASR_MODELS = CATALOG.filter((m) => m.task === "asr");
const DEFAULT_ASR_ID = "sensevoice-small";
const client = new AsrClient();

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AsrTab() {
  const i18n = useI18n();
  const [selectedId, setSelectedId] = useState(DEFAULT_ASR_ID);
  const [device, setDevice] = useState("wasm");
  const [recs, setRecs] = useState({});
  const [clientState, setClientState] = useState("idle");
  const [progressText, setProgressText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState("zh-hans");
  const { logs, addLog, clearLogs } = useLocalAiLog();
  const [file, setFile] = useState(null);
  const selectionRef = useRef(0);
  const [recWav, setRecWav] = useState(null);
  const [playingSource, setPlayingSource] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showWords, setShowWords] = useState(true);

  const recorderRef = useRef(null);
  const fileRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

  useEffect(() => {
    const unsub = manager.subscribe((_id, r) => {
      if (r.manifest.task === "asr") {
        setRecs((prev) => ({ ...prev, [r.manifest.id]: { ...r } }));
      }
    });
    void manager.init().then(() => {
      const next = {};
      for (const m of ASR_MODELS) {
        const r = manager.get(m.id);
        if (r) next[m.id] = { ...r };
      }
      setRecs(next);
    });
    client.onProgress = (p) => {
      const file = p.file ? ` ${p.file.split("/").pop()}` : "";
      const pct =
        p.progress !== undefined && p.total
          ? ` ${Math.min(100, Math.round((p.progress / p.total) * 100))}%`
          : "";
      const text = `${p.status ?? "loading"}${file}${pct}`;
      setProgressText(text);
      addLog(text);
    };
    client.onStateChange = (ready, reason) => {
      if (!ready) {
        setClientState("idle");
        if (reason) {
          if (!reason.includes("已卸载") && !reason.includes("闲置超时"))
            setError(reason);
          addLog(reason, "warn");
        }
      }
    };
    return unsub;
  }, [addLog]);

  const selectedManifest =
    ASR_MODELS.find((m) => m.id === selectedId) ?? ASR_MODELS[0];
  const supportedLanguages = getSupportedAsrLanguages(selectedManifest);
  const preferredBackend = selectedManifest.backend[0] ?? "webgpu";

  useEffect(() => {
    setDevice(preferredBackend);
  }, [preferredBackend]);

  useEffect(() => {
    if (
      language !== "" &&
      !supportedLanguages.some((l) => l.value === language)
    ) {
      setLanguage(supportedLanguages[0]?.value ?? "zh-hans");
    }
  }, [selectedManifest.id, language, supportedLanguages]);

  const rec = recs[selectedId] ?? null;
  const modelInstalled = rec?.state === "installed";
  const modelBusy =
    rec?.state === "downloading" ||
    rec?.state === "queued" ||
    rec?.state === "verifying";
  const modelTarget = { modelRef: selectedId, loadSpec: { device: device } };
  const runtime = useRuntimeService("asr", modelTarget);
  const isLoaded = runtime.loaded;

  const loadModel = async () => {
    const m = selectedManifest;
    setError(null);
    setClientState("loading");
    setProgressText(i18n("local_ai_model_loading", "启动推理引擎…"));
    addLog(`开始加载 ASR 模型: ${m.name} (${device.toUpperCase()})`);
    try {
      const spec = {
        runtime: m.runtime === "onnx" ? "onnx" : "transformers",
        source: m.source,
        dir: m.dir,
        device,
        dtype: "int8",
        multilingual: m.multilingual !== false,
        wordTimestamps: m.wordTimestamps === true,
      };
      await client.load(spec, modelTarget);
      setClientState("ready");
      setProgressText("");
      addLog(`ASR 模型加载就绪 (${device.toUpperCase()})`, "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setClientState("idle");
      setError(msg);
      addLog(`ASR 模型加载失败: ${msg}`, "error");
    }
  };

  const stopPlayback = () => {
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.pause();
      a.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingSource(null);
  };

  const play = (blob, source) => {
    if (playingSource === source) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => {
      if (audioUrlRef.current === url) {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      }
      audioRef.current = null;
      setPlayingSource(null);
    };
    setPlayingSource(source);
    void a.play().catch(() => {
      if (audioUrlRef.current === url) {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      }
      audioRef.current = null;
      setPlayingSource(null);
    });
  };

  const startRecording = async () => {
    setError(null);
    stopPlayback();
    setRecWav(null);
    try {
      const r = await MicRecorder.start();
      recorderRef.current = r;
      setIsRecording(true);
      setElapsed(0);
      setResult(null);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? i18n(
              "local_ai_asr_mic_denied",
              "麦克风权限被拒绝：请允许浏览器访问麦克风后重试"
            )
          : `${i18n("local_ai_asr_record_start_failed", "录音启动失败：")}${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  const doTranscribe = async (audio16k) => {
    if (!modelInstalled) {
      const msg = i18n(
        "local_ai_load_model_first",
        "当前模型未加载，请先加载模型"
      );
      setError(msg);
      addLog(msg, "warn");
      return;
    }
    setRecognizing(true);
    setError(null);
    addLog(
      `开始语音识别 (${(audio16k.length / 16000).toFixed(1)}s 音频, 语言: ${language || "自动检测"})…`
    );
    try {
      const r = await client.transcribe(audio16k, language, modelTarget);
      setResult(r);
      setShared("asr", r.segments.map((s) => s.text).join(""));
      addLog(
        `语音识别完成，共 ${r.segments.length} 个片段，耗时 ${r.elapsedMs}ms`,
        "success"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog(`语音识别失败: ${msg}`, "error");
    } finally {
      setRecognizing(false);
    }
  };

  const transcribeFile = async (selectedFile) => {
    const targetFile = selectedFile || file;
    if (!targetFile) return;
    if (!modelInstalled) {
      const msg = i18n(
        "local_ai_load_model_first",
        "当前模型未加载，请先加载模型"
      );
      setError(msg);
      addLog(msg, "warn");
      return;
    }
    setRecognizing(true);
    setError(null);
    setResult(null);
    addLog(
      `解码音频文件: ${targetFile.name} (${Math.round(targetFile.size / 1024)} KB)…`
    );
    try {
      const dec = await decodeAudioFile(targetFile);
      addLog(`重采样至 16kHz (原始采样率: ${dec.sampleRate}Hz)，开始转写…`);
      const r = await client.transcribe(
        resampleTo16k(dec.audio, dec.sampleRate),
        language,
        modelTarget
      );
      setResult(r);
      setShared("asr", r.segments.map((s) => s.text).join(""));
      addLog(
        `文件语音识别完成，共 ${r.segments.length} 个片段，耗时 ${r.elapsedMs}ms`,
        "success"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog(`语音识别失败: ${msg}`, "error");
    } finally {
      setRecognizing(false);
    }
  };

  const stopRecording = () => {
    const r = recorderRef.current;
    if (!r) return;
    const stopped = r.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setElapsed(stopped.duration);
    if (stopped.audio.length > 0) {
      setRecWav(audioToWavBlob(stopped.audio, stopped.sampleRate));
    }
    if (stopped.duration < 0.3) {
      setError(
        i18n("local_ai_asr_record_too_short", "录音太短，请至少录制 0.5 秒")
      );
      return;
    }
    void doTranscribe(resampleTo16k(stopped.audio, stopped.sampleRate));
  };

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      if (recorderRef.current) setElapsed(recorderRef.current.elapsedSeconds);
    }, 200);
    return () => clearInterval(t);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.onended = null;
        a.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const fullText = result?.segments?.map((s) => s.text).join("\n") || "";
  const copyFullText = () => {
    if (!fullText) return;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Stack spacing={2.5}>
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
              {i18n("local_ai_asr_title", "本地语音识别")}
            </Typography>
            <ModelStatus
              installed={modelInstalled}
              downloading={modelBusy}
              runtime={runtime}
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="asr-model-label">
                {i18n("local_ai_select_model", "选择模型")}
              </InputLabel>
              <Select
                labelId="asr-model-label"
                value={selectedId}
                label={i18n("local_ai_select_model", "选择模型")}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={
                  clientState === "loading" || recognizing || isRecording
                }
              >
                {ASR_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {getModelDisplayName(m, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="asr-backend-label">
                {i18n("local_ai_backend", "计算后端")}
              </InputLabel>
              <Select
                labelId="asr-backend-label"
                value={device}
                label={i18n("local_ai_backend", "计算后端")}
                onChange={(e) => setDevice(e.target.value)}
                disabled={
                  clientState === "loading" || recognizing || isRecording
                }
              >
                <MenuItem value="webgpu">WebGPU</MenuItem>
                <MenuItem
                  value="wasm"
                  disabled={!selectedManifest.backend.includes("wasm")}
                >
                  WASM (CPU)
                </MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              disabled={
                runtime.busy ||
                !modelInstalled ||
                clientState === "loading" ||
                recognizing ||
                isRecording ||
                isLoaded
              }
              onClick={() => void loadModel()}
            >
              {clientState === "loading"
                ? i18n("local_ai_model_loading", "加载中…")
                : isLoaded
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
              {i18n("local_ai_asr_audio_card", "音频录制与识别")}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="asr-lang-label">
                {i18n("local_ai_asr_lang", "识别语言")}
              </InputLabel>
              <Select
                labelId="asr-lang-label"
                value={language}
                label={i18n("local_ai_asr_lang", "识别语言")}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={recognizing || isRecording}
              >
                {supportedLanguages.map((l) => (
                  <MenuItem key={l.value} value={l.value}>
                    {l.label}
                  </MenuItem>
                ))}
                <MenuItem value="">
                  {i18n("local_ai_asr_lang_auto", "自动检测")}
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            {!isRecording ? (
              <Button
                variant="contained"
                color="primary"
                startIcon={<MicRoundedIcon />}
                disabled={runtime.busy || !modelInstalled || recognizing}
                onClick={startRecording}
              >
                {i18n("local_ai_asr_record", "开始录音")}
              </Button>
            ) : (
              <Button
                variant="contained"
                color="error"
                startIcon={<StopRoundedIcon />}
                onClick={stopRecording}
              >
                {i18n("local_ai_asr_stop_record", "停止录音")} (
                {fmtTime(elapsed)})
              </Button>
            )}

            <Button
              variant="outlined"
              startIcon={<UploadFileRoundedIcon />}
              disabled={recognizing || isRecording}
              onClick={() => fileRef.current?.click()}
            >
              {i18n("local_ai_asr_upload_audio", "上传音频文件")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const selection = ++selectionRef.current;
                  void validateInputFile(f, "audio")
                    .then(() => {
                      if (selection === selectionRef.current) { setFile(f); setError(null); setResult(null); }
                    })
                    .catch((e) => { if (selection === selectionRef.current) setError(e.message); });
                }
                e.target.value = "";
              }}
            />

            {recWav && (
              <Button
                variant="text"
                size="small"
                startIcon={
                  playingSource === "record" ? (
                    <PauseRoundedIcon />
                  ) : (
                    <PlayArrowRoundedIcon />
                  )
                }
                onClick={() => play(recWav, "record")}
              >
                {playingSource === "record"
                  ? i18n("local_ai_asr_pause_record", "暂停录音")
                  : i18n("local_ai_asr_playback_record", "回放录音")}
              </Button>
            )}

            {file && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ wordBreak: "break-all" }}
                >
                  {i18n("local_ai_asr_selected_file", "已选文件:")} {file.name}{" "}
                  ({Math.round(file.size / 1024)} KB)
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    playingSource === "file" ? (
                      <PauseRoundedIcon />
                    ) : (
                      <PlayArrowRoundedIcon />
                    )
                  }
                  onClick={() => play(file, "file")}
                >
                  {playingSource === "file"
                    ? i18n("local_ai_asr_pause_preview", "暂停试听")
                    : i18n("local_ai_asr_play_preview", "试听音频")}
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  color="primary"
                  startIcon={<PlayArrowRoundedIcon />}
                  disabled={
                    runtime.busy ||
                    !modelInstalled ||
                    recognizing ||
                    isRecording
                  }
                  onClick={() => void transcribeFile()}
                >
                  {recognizing
                    ? i18n("local_ai_asr_transcribing", "正在识别…")
                    : i18n("local_ai_asr_start_transcribe", "开始识别")}
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
                    }}
                  >
                    {i18n("local_ai_stop", "停止")}
                  </Button>
                )}
              </Box>
            )}
          </Box>

          {recognizing && (
            <Alert
              severity="info"
              sx={{ mt: 2 }}
              action={
                <Button
                  color="error"
                  size="small"
                  startIcon={<StopRoundedIcon />}
                  onClick={() => {
                    client.stop();
                    setRecognizing(false);
                  }}
                >
                  {i18n("local_ai_stop", "停止")}
                </Button>
              }
            >
              {i18n("local_ai_asr_transcribing", "正在转写识别音频…")}
            </Alert>
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
                flexWrap: "wrap",
                gap: 1,
                mb: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  {i18n("local_ai_asr_results", "识别结果")}
                </Typography>
                <Chip
                  size="small"
                  label={`${i18n("local_ai_elapsed", "耗时")} ${result.elapsedMs}ms · ${i18n("local_ai_asr_duration", "音频时长")} ${result.durationSeconds?.toFixed(1)}s`}
                  variant="outlined"
                />
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showWords}
                      onChange={(e) => setShowWords(e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      {i18n("local_ai_asr_word_timestamps", "词级时间戳")}
                    </Typography>
                  }
                  sx={{ mr: 0.5 }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyRoundedIcon />}
                  onClick={copyFullText}
                >
                  {copied
                    ? i18n("local_ai_copied", "已复制")
                    : i18n("local_ai_copy_all", "复制全文")}
                </Button>
              </Box>
            </Box>

            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                minHeight: 120,
                maxHeight: 600,
                resize: "vertical",
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {result.segments.map((seg, idx) => (
                <Box key={idx}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 0.75,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontFamily="monospace"
                      sx={{ fontWeight: 600 }}
                    >
                      [{seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s]
                    </Typography>
                    {seg.emotion && (
                      <Chip
                        size="small"
                        label={seg.emotion}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    )}
                    {seg.event && (
                      <Chip
                        size="small"
                        label={seg.event}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 500, lineHeight: 1.6 }}
                  >
                    {seg.text}
                  </Typography>

                  {showWords && seg.words && seg.words.length > 0 && (
                    <Box
                      sx={{
                        mt: 1.25,
                        p: 1.25,
                        borderRadius: 1.5,
                        bgcolor: "action.hover",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.75,
                      }}
                    >
                      {seg.words.map((w, wIdx) => (
                        <Box
                          key={wIdx}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            px: 1,
                            py: 0.35,
                            borderRadius: 1,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: "text.primary" }}
                          >
                            {w.text}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              fontFamily: "monospace",
                              fontSize: 11,
                            }}
                          >
                            {w.start.toFixed(2)}s–{w.end.toFixed(2)}s
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                  {idx < result.segments.length - 1 && (
                    <Divider sx={{ mt: 2 }} />
                  )}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
      <LogViewer
        logs={logs}
        onClear={clearLogs}
      />
    </Stack>
  );
}
