import {
  ModelStatus,
  UnloadModelButton,
  useRuntimeService,
} from "./RuntimeControls";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { getShared, onShared } from "../../../localAi/core/shared";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { TtsClient } from "../../../localAi/core/ttsClient";
import { CATALOG, KOKORO_VOICES } from "../../../localAi/core/catalog";
import { AUDIO8_PRESET_VOICES } from "../../../localAi/core/audio8PresetVoices";
import { audioToWavBlob } from "../../../localAi/core/recorder";
import { useI18n } from "../../../hooks/I18n";
import LogViewer, { useLocalAiLog } from "./LogViewer";

const SOURCES = [
  { key: "manual", label: "手动输入" },
  { key: "asr", label: "语音识别结果" },
  { key: "ocr", label: "OCR 识别结果" },
  { key: "llm", label: "LLM 回复" },
];

const KOKORO_MODELS = CATALOG.filter(
  (m) => m.task === "tts" && m.runtime === "transformers"
);
const AUDIO8_MODELS = CATALOG.filter(
  (m) => m.task === "tts" && m.runtime === "onnx"
);
const client = new TtsClient();

export default function TtsTab() {
  const i18n = useI18n();
  const { logs, addLog, clearLogs } = useLocalAiLog();

  // 模型状态
  const [engine, setEngine] = useState("system");
  const [selectedId, setSelectedId] = useState(KOKORO_MODELS[0]?.id ?? "");
  const [device, setDevice] = useState("webgpu");
  const [recs, setRecs] = useState({});
  const [clientState, setClientState] = useState("idle");
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState(null);

  // 朗读状态
  const [source, setSource] = useState("manual");
  const [text, setText] = useState("");
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [kokoroVoice, setKokoroVoice] = useState("zf_xiaoxiao");
  const [audio8Voice, setAudio8Voice] = useState("default");
  const [synthState, setSynthState] = useState("idle");
  const [audioUrl, setAudioUrl] = useState(null);
  const [stats, setStats] = useState(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const loadVoices = () => {
      const v = synth.getVoices();
      if (!v.length) return;
      setVoices(v);
      setVoiceURI((prev) => {
        if (prev && v.some((x) => x.voiceURI === prev)) return prev;
        const zh = v.find((x) => x.lang.toLowerCase().startsWith("zh"));
        return (zh ?? v[0])?.voiceURI ?? "";
      });
    };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, []);

  useEffect(() => onShared(() => forceRender((v) => v + 1)), []);

  useEffect(() => {
    const unsub = manager.subscribe((_id, r) => {
      if (r.manifest.task === "tts") {
        setRecs((prev) => ({ ...prev, [r.manifest.id]: { ...r } }));
      }
    });
    void manager.init().then(() => {
      const next = {};
      for (const m of [...KOKORO_MODELS, ...AUDIO8_MODELS]) {
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
      const txt = `${p.status ?? "loading"}${file}${pct}`;
      setProgressText(txt);
      addLog(txt);
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
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const models = engine === "audio8" ? AUDIO8_MODELS : KOKORO_MODELS;
  const selectedManifest = models.find((m) => m.id === selectedId) ?? models[0];
  const rec = recs[selectedId] ?? null;
  const modelInstalled = rec?.state === "installed";
  const modelBusy =
    rec?.state === "downloading" ||
    rec?.state === "queued" ||
    rec?.state === "verifying";
  const effDevice = engine === "audio8" ? "wasm" : device;
  const modelTarget = { modelRef: selectedId, loadSpec: { device: effDevice } };
  const runtime = useRuntimeService("tts", modelTarget);
  const isLoaded = runtime.loaded;

  const changeEngine = (e) => {
    setEngine(e);
    const list = e === "audio8" ? AUDIO8_MODELS : KOKORO_MODELS;
    setSelectedId(list[0]?.id ?? "");
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStats(null);
  };

  const loadModel = async () => {
    const m = selectedManifest;
    if (!m) return;
    setError(null);
    setClientState("loading");
    setProgressText(i18n("local_ai_model_loading", "启动推理引擎…"));
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStats(null);
    addLog(`准备加载 TTS 模型: ${m.name} (${engine}, ${effDevice})…`);
    try {
      await client.load(
        {
          engine: engine === "audio8" ? "audio8" : "kokoro",
          source: m.source,
          dir: m.dir,
          device: effDevice,
        },
        modelTarget
      );
      setClientState("ready");
      setProgressText("");
      addLog(`TTS 模型加载就绪: ${m.name}`, "success");
    } catch (e) {
      setClientState("idle");
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      addLog(`TTS 模型加载失败: ${err}`, "error");
    }
  };

  const pickSource = (s) => {
    setSource(s);
    if (s !== "manual") {
      const entry = getShared(s);
      setText(entry?.text ?? "");
      if (!entry) {
        const msg = i18n(
          "local_ai_tts_source_empty",
          "该来源暂无结果，请先到对应 Tab 生成。"
        );
        setError(msg);
        addLog(msg, "warn");
      }
    }
  };

  const speak = () => {
    const t = text.trim();
    if (!t) {
      const msg = i18n(
        "local_ai_tts_text_empty",
        "请输入或从其他 Tab 选择要朗读的文本。"
      );
      setError(msg);
      addLog(msg, "warn");
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v) u.voice = v;
    u.rate = rate;
    u.onstart = () => {
      setSpeaking(true);
      setError(null);
      addLog(
        `开始系统原生朗读: "${t.slice(0, 30)}${t.length > 30 ? "…" : ""}"…`
      );
    };
    u.onend = () => {
      setSpeaking(false);
      addLog("系统原生朗读完成", "success");
    };
    u.onerror = (e) => {
      setSpeaking(false);
      if (e.error !== "canceled" && e.error !== "interrupted") {
        const err = `${i18n("local_ai_tts_play_failed", "朗读失败：")}${e.error}`;
        setError(err);
        addLog(err, "error");
      }
    };
    synth.speak(u);
  };

  const stopSystem = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    addLog("已手动停止系统朗读", "warn");
  };

  const synthesize = async () => {
    const t = text.trim();
    if (!t || !modelInstalled) return;
    setSynthState("busy");
    setError(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStats(null);
    const voice = engine === "audio8" ? audio8Voice : kokoroVoice;
    addLog(
      `开始语音合成: "${t.slice(0, 30)}${t.length > 30 ? "…" : ""}" (音色: ${voice}, 语速: ${rate.toFixed(1)}x)…`
    );
    try {
      const r = await client.synthesize(t, voice, rate, modelTarget);
      const wav = audioToWavBlob(r.audio, r.sampleRate);
      setAudioUrl(URL.createObjectURL(wav));
      const dur = r.audio.length / r.sampleRate;
      setStats({
        elapsedMs: r.elapsedMs,
        durationS: dur,
      });
      addLog(
        `语音合成完成: 耗时 ${r.elapsedMs}ms, 音频时长 ${dur.toFixed(1)}s`,
        "success"
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setError(err);
      addLog(`语音合成失败: ${err}`, "error");
    } finally {
      setSynthState("idle");
    }
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
              {i18n("local_ai_tts_title", "本地语音合成")}
            </Typography>
            <ModelStatus
              installed={modelInstalled}
              downloading={modelBusy}
              runtime={runtime}
              system={engine === "system"}
            />
          </Box>

          <ToggleButtonGroup
            sx={{ mb: 2, flexWrap: "wrap" }}
            size="small"
            value={engine}
            exclusive
            onChange={(_, v) => v && changeEngine(v)}
          >
            <ToggleButton value="system">
              {i18n("local_ai_tts_engine_system", "系统原生朗读")}
            </ToggleButton>
            <ToggleButton value="kokoro">Kokoro-82M (WebGPU)</ToggleButton>
            <ToggleButton value="audio8">Audio8 (ONNX)</ToggleButton>
          </ToggleButtonGroup>

          {engine !== "system" ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 2,
              }}
            >
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="tts-model-label">
                  {i18n("local_ai_select_model", "选择模型")}
                </InputLabel>
                <Select
                  labelId="tts-model-label"
                  value={selectedId}
                  label={i18n("local_ai_select_model", "选择模型")}
                  onChange={(e) => setSelectedId(e.target.value)}
                  disabled={clientState === "loading" || synthState === "busy"}
                >
                  {models.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {engine === "kokoro" && (
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="tts-backend-label">
                    {i18n("local_ai_backend", "计算后端")}
                  </InputLabel>
                  <Select
                    labelId="tts-backend-label"
                    value={device}
                    label={i18n("local_ai_backend", "计算后端")}
                    onChange={(e) => setDevice(e.target.value)}
                    disabled={
                      clientState === "loading" || synthState === "busy"
                    }
                  >
                    <MenuItem value="webgpu">WebGPU</MenuItem>
                    <MenuItem value="wasm">WASM (CPU)</MenuItem>
                  </Select>
                </FormControl>
              )}

              <Button
                variant="contained"
                size="small"
                disabled={
                  runtime.busy ||
                  !modelInstalled ||
                  clientState === "loading" ||
                  synthState === "busy" ||
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
                cacheable={false}
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
          ) : (
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "local_ai_tts_system_desc",
                "使用操作系统自带的 SpeechSynthesis 语音朗读服务，无需下载离线模型（注：系统发音由系统底层直接输出，不支持导出与下载音频；如需下载语音文件，请切换至右侧离线模型）。"
              )}
            </Typography>
          )}
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
              {i18n("local_ai_tts_synth_card", "合成与朗读")}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="tts-source-label">
                  {i18n("local_ai_tts_source_label", "文本来源")}
                </InputLabel>
                <Select
                  labelId="tts-source-label"
                  value={source}
                  label={i18n("local_ai_tts_source_label", "文本来源")}
                  onChange={(e) => pickSource(e.target.value)}
                >
                  {SOURCES.map((s) => (
                    <MenuItem key={s.key} value={s.key}>
                      {i18n(`local_ai_tts_source_${s.key}`, s.label)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {engine === "system" && voices.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="sys-voice-label">
                    {i18n("local_ai_tts_sys_voice_label", "系统音色")}
                  </InputLabel>
                  <Select
                    labelId="sys-voice-label"
                    value={voiceURI}
                    label={i18n("local_ai_tts_sys_voice_label", "系统音色")}
                    onChange={(e) => setVoiceURI(e.target.value)}
                  >
                    {voices.map((v) => (
                      <MenuItem key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {engine === "kokoro" && (
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="kokoro-voice-label">
                    {i18n("local_ai_tts_kokoro_voice_label", "Kokoro 音色")}
                  </InputLabel>
                  <Select
                    labelId="kokoro-voice-label"
                    value={kokoroVoice}
                    label={i18n(
                      "local_ai_tts_kokoro_voice_label",
                      "Kokoro 音色"
                    )}
                    onChange={(e) => setKokoroVoice(e.target.value)}
                  >
                    {KOKORO_VOICES.map((v) => (
                      <MenuItem key={v.id} value={v.id}>
                        {v.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {engine === "audio8" && (
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="audio8-voice-label">
                    {i18n("local_ai_tts_audio8_voice_label", "Audio8 音色")}
                  </InputLabel>
                  <Select
                    labelId="audio8-voice-label"
                    value={audio8Voice}
                    label={i18n(
                      "local_ai_tts_audio8_voice_label",
                      "Audio8 音色"
                    )}
                    onChange={(e) => setAudio8Voice(e.target.value)}
                  >
                    {AUDIO8_PRESET_VOICES.map((v) => (
                      <MenuItem key={v.id} value={v.id}>
                        {v.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          </Box>

          <TextField
            multiline
            rows={4}
            fullWidth
            placeholder={i18n(
              "local_ai_tts_input_placeholder",
              "请输入要朗读的文本…"
            )}
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputProps={{
              className: "kt-resizable-textarea",
              style: { resize: "vertical" },
            }}
            sx={{
              mb: 2,
              "& .MuiInputBase-root": { overflow: "visible" },
              '& textarea:not([aria-hidden="true"])': {
                resize: "vertical",
              },
            }}
          />

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              flexWrap: "wrap",
              mb: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                width: 220,
              }}
            >
              <Typography variant="body2" sx={{ flexShrink: 0 }}>
                {i18n("local_ai_tts_rate", "语速")} ({rate.toFixed(1)}x):
              </Typography>
              <Slider
                size="small"
                min={0.5}
                max={2.0}
                step={0.1}
                value={rate}
                onChange={(_, v) => setRate(v)}
              />
            </Box>

            {engine === "system" ? (
              speaking ? (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopRoundedIcon />}
                  onClick={stopSystem}
                >
                  {i18n("local_ai_tts_stop", "停止朗读")}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<PlayArrowRoundedIcon />}
                  onClick={speak}
                >
                  {i18n("local_ai_tts_play", "开始朗读")}
                </Button>
              )
            ) : (
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrowRoundedIcon />}
                  disabled={
                    runtime.busy ||
                    !modelInstalled ||
                    synthState === "busy" ||
                    !text.trim()
                  }
                  onClick={() => void synthesize()}
                >
                  {synthState === "busy"
                    ? i18n("local_ai_tts_synthesizing", "正在合成…")
                    : i18n("local_ai_tts_synthesize", "合成语音")}
                </Button>
                {synthState === "busy" && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<StopRoundedIcon />}
                    onClick={() => {
                      client.stop();
                      setSynthState("idle");
                      addLog("已手动停止语音合成", "warn");
                    }}
                  >
                    {i18n("local_ai_stop", "停止")}
                  </Button>
                )}
              </Box>
            )}
          </Box>

          {audioUrl && (
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <audio controls src={audioUrl} style={{ height: 36 }} />
                {stats && (
                  <Typography variant="caption" color="text.secondary">
                    {i18n("local_ai_tts_stats", "耗时 {0}ms · 音频时长 {1}s")
                      .replace("{0}", String(stats.elapsedMs))
                      .replace("{1}", stats.durationS.toFixed(1))}
                  </Typography>
                )}
              </Box>
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadRoundedIcon />}
                component="a"
                href={audioUrl}
                download="synthesized.wav"
              >
                {i18n("local_ai_download_speech", "下载语音")}
              </Button>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
      <LogViewer logs={logs} onClear={clearLogs} />
    </Stack>
  );
}
