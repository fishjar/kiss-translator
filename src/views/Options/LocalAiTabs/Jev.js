import {
  ModelStatus,
  UnloadModelButton,
  useRuntimeService,
} from "./RuntimeControls";
import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Tooltip from "@mui/material/Tooltip";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { CATALOG, getModelDisplayName } from "../../../localAi/core/catalog";
import { JEV_PRESETS } from "../../../localAi/core/jev/presets";
import { detectScriptAndLanguage } from "../../../localAi/core/jev/lang";
import { JevClient } from "../../../localAi/core/jevClient";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { useI18n } from "../../../hooks/I18n";
import LogViewer, { useLocalAiLog } from "./LogViewer";

const DECISION_MODELS = CATALOG.filter((m) => m.task === "decision");

export default function JevTab() {
  const i18n = useI18n();
  const clientRef = useRef(null);
  if (!clientRef.current) {
    clientRef.current = new JevClient();
  }

  const [records, setRecords] = useState({});
  const [modelId, setModelId] = useState(
    DECISION_MODELS[0]?.id ?? "laya-multilingual-fp16"
  );
  const [backend, setBackend] = useState("webgpu");
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadStatus, setLoadStatus] = useState("");

  const [presetId, setPresetId] = useState(
    JEV_PRESETS[0]?.id ?? "kiss-translation-action"
  );
  const [stateText, setStateText] = useState(() =>
    JSON.stringify(JEV_PRESETS[0]?.state ?? {}, null, 2)
  );
  const [questionsText, setQuestionsText] = useState(() =>
    JSON.stringify(JEV_PRESETS[0]?.questions ?? {}, null, 2)
  );

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const { logs, addLog, clearLogs } = useLocalAiLog();

  useEffect(() => {
    void manager.init().then(() => {
      const initMap = {};
      for (const r of manager.list()) initMap[r.manifest.id] = r;
      setRecords(initMap);
    });
    const unsub = manager.subscribe((id, rec) => {
      setRecords((prev) => ({ ...prev, [id]: { ...rec } }));
    });
    if (clientRef.current) {
      clientRef.current.onStateChange = (ready, reason) => {
        if (!ready) {
          if (reason) {
            if (!reason.includes("已卸载") && !reason.includes("闲置超时"))
              setError(reason);
            addLog(reason, "warn");
          }
        }
      };
    }
    return () => unsub();
  }, [addLog]);

  const currentManifest = useMemo(
    () => DECISION_MODELS.find((m) => m.id === modelId) ?? DECISION_MODELS[0],
    [modelId]
  );

  useEffect(() => {
    if (!currentManifest.backend.includes(backend)) {
      setBackend(currentManifest.backend[0] ?? "webgpu");
    }
  }, [currentManifest, backend]);

  const currentRec = records[currentManifest.id];
  const isInstalled = currentRec?.state === "installed";
  const modelTarget = {
    modelRef: currentManifest.id,
    loadSpec: { device: backend },
  };
  const runtime = useRuntimeService("decision", modelTarget);
  const isReady = runtime.loaded;

  const parsedPreview = useMemo(() => {
    try {
      const st = JSON.parse(stateText);
      const qs = JSON.parse(questionsText);
      const langInfo = detectScriptAndLanguage(st, qs);
      return { ok: true, state: st, questions: qs, langInfo };
    } catch {
      try {
        const qs = JSON.parse(questionsText);
        const langInfo = detectScriptAndLanguage(stateText, qs);
        return { ok: true, state: stateText, questions: qs, langInfo };
      } catch (e) {
        return { ok: false, err: e instanceof Error ? e.message : String(e) };
      }
    }
  }, [stateText, questionsText]);

  const handleSelectPreset = (id) => {
    setPresetId(id);
    const p = JEV_PRESETS.find((item) => item.id === id);
    if (!p) return;
    setStateText(
      typeof p.state === "string" ? p.state : JSON.stringify(p.state, null, 2)
    );
    setQuestionsText(JSON.stringify(p.questions, null, 2));
    setResult(null);
    setError(null);
  };

  const handleLoadModel = async () => {
    setError(null);
    setLoadingModel(true);
    setLoadStatus(i18n("local_ai_model_loading", "模型加载中…"));
    addLog(
      `开始加载 JEV 模型: ${currentManifest.name} (${backend.toUpperCase()})`
    );
    const client = clientRef.current;
    client.onProgress = (st) => {
      setLoadStatus(st);
      addLog(st);
    };

    const modelFile =
      currentManifest.files.find((f) => f.path.endsWith(".onnx"))?.path ??
      "model.onnx";
    const tokenizerFile =
      currentManifest.files.find((f) => f.path.endsWith("tokenizer.json"))
        ?.path ?? "tokenizer.json";
    const tokenizerConfigFile = currentManifest.files.find((f) =>
      f.path.endsWith("tokenizer_config.json")
    )?.path;
    const configFile =
      currentManifest.files.find((f) => f.path.endsWith("rl_agent_config.json"))
        ?.path ?? "rl_agent_config.json";

    try {
      const info = await client.load(
        {
          modelId: currentManifest.id,
          source: currentManifest.source,
          dir: currentManifest.dir,
          modelFile,
          tokenizerFile,
          tokenizerConfigFile,
          configFile,
          device: backend,
        },
        modelTarget
      );
      setLoadStatus("");
      addLog(`JEV 模型就绪 (${info.backend.toUpperCase()})`, "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog(`JEV 模型加载失败: ${msg}`, "error");
    } finally {
      setLoadingModel(false);
    }
  };

  const handlePredict = async () => {
    if (!parsedPreview.ok) {
      const err = `${i18n("local_ai_jev_error_questions_format", "Questions JSON 格式有误: ")}${parsedPreview.err}`;
      setError(err);
      addLog(err, "error");
      return;
    }
    setError(null);
    setRunning(true);
    addLog("开始执行 JEV 决策推理…");
    try {
      const res = await clientRef.current.predict(
        parsedPreview.state,
        parsedPreview.questions,
        modelTarget
      );
      setResult(res);
      addLog(
        `JEV 决策推理完成，总耗时 ${res.timing?.totalMs ?? 0}ms (分词 ${res.timing?.tokenizeMs ?? 0}ms · ONNX ${res.timing?.onnxMs ?? 0}ms · 校准 ${res.timing?.postprocessMs ?? 0}ms)`,
        "success"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog(`JEV 决策推理失败: ${msg}`, "error");
    } finally {
      setRunning(false);
    }
  };

  const appendTemplateQuestion = (kind) => {
    try {
      const cur = JSON.parse(questionsText);
      const key = `${kind}_${Object.keys(cur).length + 1}`;
      if (kind === "choice") {
        cur[key] = {
          type: "choice",
          instructions: "Which option best matches the state?",
          criteria: {
            option_a: "First candidate action",
            option_b: "Second candidate action",
          },
        };
      } else if (kind === "score") {
        cur[key] = {
          type: "score",
          instructions: "Rate the severity or priority level.",
          criteria: ["low", "medium", "high"],
        };
      } else {
        cur[key] = {
          type: "noul",
          instructions: "Does the statement hold for this state?",
        };
      }
      setQuestionsText(JSON.stringify(cur, null, 2));
    } catch {
      // 忽略 JSON 解析异常
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
              {i18n("local_ai_jev_title", "JEV 决策引擎 (Laya System-1)")}
            </Typography>
            <ModelStatus
              installed={isInstalled}
              downloading={false}
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
              <InputLabel id="jev-model-label">
                {i18n("local_ai_select_model", "选择模型")}
              </InputLabel>
              <Select
                labelId="jev-model-label"
                value={modelId}
                label={i18n("local_ai_select_model", "选择模型")}
                onChange={(e) => setModelId(e.target.value)}
                disabled={loadingModel || running}
              >
                {DECISION_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {getModelDisplayName(m, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="jev-backend-label">
                {i18n("local_ai_backend", "计算后端")}
              </InputLabel>
              <Select
                labelId="jev-backend-label"
                value={backend}
                label={i18n("local_ai_backend", "计算后端")}
                onChange={(e) => setBackend(e.target.value)}
                disabled={loadingModel || running}
              >
                {currentManifest.backend.map((b) => (
                  <MenuItem key={b} value={b}>
                    {b === "webgpu" ? "WebGPU" : "WASM"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {!isInstalled ? (
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadRoundedIcon />}
                onClick={() => void manager.download(currentManifest.id)}
                disabled={
                  currentRec?.state === "downloading" ||
                  currentRec?.state === "queued"
                }
              >
                {currentRec?.state === "downloading"
                  ? i18n("local_ai_downloading", "下载中…")
                  : i18n("local_ai_models_action_download", "下载该模型")}
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handleLoadModel()}
                  disabled={runtime.busy || loadingModel || running || isReady}
                >
                  {loadingModel
                    ? i18n("local_ai_model_loading", "加载中…")
                    : isReady
                      ? i18n("local_ai_model_loaded", "模型已就绪")
                      : i18n("local_ai_load_model", "加载模型")}
                </Button>
              </>
            )}

            <UnloadModelButton
              client={clientRef.current}
              runtime={runtime}
              onError={setError}
            />

            {loadStatus && (
              <Typography variant="caption" color="text.secondary">
                {loadStatus}
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
              gap: 1.5,
              mb: 2,
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              {i18n(
                "local_ai_jev_input_card",
                "输入状态与结构化评估 (choice / score / noul)"
              )}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexWrap: "wrap",
              }}
            >
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="jev-preset-label">
                  {i18n("local_ai_jev_presets", "预设场景")}
                </InputLabel>
                <Select
                  labelId="jev-preset-label"
                  value={presetId}
                  label={i18n("local_ai_jev_presets", "预设场景")}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                >
                  {JEV_PRESETS.map((p) => {
                    const presetLabel =
                      p.id === "kiss-translation-action"
                        ? i18n(
                            "jev_preset_web_routing",
                            "网页区域翻译路由 (Choice + Score + Noul)"
                          )
                        : p.name;
                    return (
                      <MenuItem key={p.id} value={p.id}>
                        {presetLabel}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <Tooltip
                title={
                  !isInstalled
                    ? i18n(
                        "local_ai_jev_load_model_first",
                        "请先加载模型后再执行推理"
                      )
                    : ""
                }
              >
                <span>
                  <Button
                    variant="contained"
                    startIcon={<PlayArrowRoundedIcon />}
                    onClick={() => void handlePredict()}
                    disabled={
                      runtime.busy ||
                      !isInstalled ||
                      running ||
                      !parsedPreview.ok
                    }
                  >
                    {running
                      ? i18n("local_ai_running", "正在运行…")
                      : i18n("local_ai_jev_run", "执行 JEV 决策推理")}
                  </Button>
                  {running && (
                    <Button
                      variant="outlined"
                      color="error"
                      sx={{ ml: 1 }}
                      startIcon={<StopRoundedIcon />}
                      onClick={() => clientRef.current?.stop()}
                    >
                      {i18n("local_ai_stop", "停止")}
                    </Button>
                  )}
                </span>
              </Tooltip>
            </Box>
          </Box>

          {parsedPreview.ok && (
            <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <Chip
                size="small"
                label={i18n("local_ai_jev_lang_analysis", "语言分析")}
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary">
                {i18n("local_ai_jev_dominant_lang", "主导语言")}:{" "}
                <strong>{parsedPreview.langInfo.dominantScript}</strong> ·{" "}
                {parsedPreview.langInfo.reason}
              </Typography>
            </Box>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                {i18n("local_ai_jev_state_title", "State (状态 JSON 或纯文本)")}
              </Typography>
              <TextField
                multiline
                rows={10}
                fullWidth
                value={stateText}
                onChange={(e) => setStateText(e.target.value)}
                inputProps={{
                  className: "kt-resizable-textarea",
                  style: { resize: "vertical" },
                }}
                sx={{
                  "& .MuiInputBase-root": { overflow: "visible" },
                  '& textarea:not([aria-hidden="true"])': {
                    fontFamily: "monospace",
                    fontSize: 13,
                    resize: "vertical",
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                {i18n(
                  "local_ai_jev_questions_title",
                  "Questions (前向评估定义)"
                )}
              </Typography>
              <TextField
                multiline
                rows={10}
                fullWidth
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                inputProps={{
                  className: "kt-resizable-textarea",
                  style: { resize: "vertical" },
                }}
                sx={{
                  "& .MuiInputBase-root": { overflow: "visible" },
                  '& textarea:not([aria-hidden="true"])': {
                    fontFamily: "monospace",
                    fontSize: 13,
                    resize: "vertical",
                  },
                }}
              />
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  mt: 1,
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  size="small"
                  onClick={() => appendTemplateQuestion("choice")}
                >
                  + Choice
                </Button>
                <Button
                  size="small"
                  onClick={() => appendTemplateQuestion("score")}
                >
                  + Score
                </Button>
                <Button
                  size="small"
                  onClick={() => appendTemplateQuestion("noul")}
                >
                  + Noul
                </Button>
              </Box>
            </Grid>
          </Grid>

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
              <Typography variant="h6" fontWeight={600}>
                {i18n("local_ai_jev_results_title", "决策结果")}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <Chip
                  size="small"
                  label={`Tokens: ${result.usage?.input_tokens ?? 0}`}
                  variant="outlined"
                />
                {result.timing && (
                  <Chip
                    size="small"
                    color="success"
                    label={`${i18n("local_ai_total_time", "总耗时")} ${result.timing.totalMs} ms (${i18n("local_ai_jev_timing_tokenize", "分词")} ${result.timing.tokenizeMs}ms · ONNX ${result.timing.onnxMs}ms${result.timing.postprocessMs !== undefined ? ` · ${i18n("local_ai_jev_timing_calibration", "校准")} ${result.timing.postprocessMs}ms` : ""})`}
                  />
                )}
              </Box>
            </Box>

            <Grid container spacing={2}>
              {Object.entries(result.answers || result.decisions || {}).map(
                ([qid, ans]) => (
                  <Grid item xs={12} sm={6} key={qid}>
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 1.5,
                          gap: 1,
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          fontWeight={700}
                          sx={{ wordBreak: "break-word" }}
                        >
                          {qid}
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            gap: 0.5,
                            alignItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {ans.type && (
                            <Chip
                              size="small"
                              label={ans.type.toUpperCase()}
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: "0.75rem" }}
                            />
                          )}
                          {ans.confidence !== undefined && (
                            <Chip
                              size="small"
                              label={`${i18n("local_ai_confidence", "置信度")} ${(ans.confidence * 100).toFixed(1)}%`}
                              color={
                                ans.confidence >= 0.75 ? "success" : "warning"
                              }
                              sx={{ fontWeight: 600, fontSize: "0.75rem" }}
                            />
                          )}
                        </Box>
                      </Box>

                      {ans.type === "choice" && (
                        <Box sx={{ flex: 1 }}>
                          <Box
                            sx={{
                              mb: 1.5,
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              {i18n("local_ai_jev_selected_option", "选中项:")}
                            </Typography>
                            <Typography
                              variant="body1"
                              fontWeight={700}
                              color="primary.main"
                            >
                              {ans.choice}
                            </Typography>
                          </Box>
                          {ans.probabilities && (
                            <Stack spacing={1}>
                              {Object.entries(ans.probabilities).map(
                                ([label, prob]) => {
                                  const isSelected = label === ans.choice;
                                  const pct = (prob * 100).toFixed(1);
                                  return (
                                    <Box key={label}>
                                      <Box
                                        sx={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          mb: 0.5,
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          fontWeight={isSelected ? 700 : 400}
                                          color={
                                            isSelected
                                              ? "text.primary"
                                              : "text.secondary"
                                          }
                                        >
                                          {label}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          {pct}%
                                        </Typography>
                                      </Box>
                                      <LinearProgress
                                        variant="determinate"
                                        value={Math.min(
                                          100,
                                          Math.max(0, prob * 100)
                                        )}
                                        sx={{
                                          height: 5,
                                          borderRadius: 1,
                                          bgcolor: "action.hover",
                                          "& .MuiLinearProgress-bar": {
                                            bgcolor: isSelected
                                              ? "primary.main"
                                              : "text.disabled",
                                          },
                                        }}
                                      />
                                    </Box>
                                  );
                                }
                              )}
                            </Stack>
                          )}
                        </Box>
                      )}

                      {ans.type === "score" && (
                        <Box sx={{ flex: 1 }}>
                          <Box
                            sx={{
                              mb: 1.5,
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              {i18n(
                                "local_ai_jev_expected_score",
                                "期望分值 (Score):"
                              )}
                            </Typography>
                            <Typography
                              variant="body1"
                              fontWeight={700}
                              color="primary.main"
                            >
                              {ans.score !== undefined
                                ? ans.score.toFixed(2)
                                : "--"}{" "}
                              /{" "}
                              {Math.max(
                                0,
                                Object.keys(ans.probabilities || {}).length - 1
                              )}
                            </Typography>
                          </Box>
                          {ans.probabilities && (
                            <Stack spacing={1}>
                              {Object.entries(ans.probabilities).map(
                                ([lvl, prob]) => {
                                  const legendText = ans.legend?.[lvl]
                                    ? `: ${String(ans.legend[lvl])}`
                                    : "";
                                  const pct = (prob * 100).toFixed(1);
                                  return (
                                    <Box key={lvl}>
                                      <Box
                                        sx={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          mb: 0.5,
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{ mr: 1 }}
                                        >
                                          Level {lvl}
                                          {legendText}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{ flexShrink: 0 }}
                                        >
                                          {pct}%
                                        </Typography>
                                      </Box>
                                      <LinearProgress
                                        variant="determinate"
                                        value={Math.min(
                                          100,
                                          Math.max(0, prob * 100)
                                        )}
                                        sx={{
                                          height: 5,
                                          borderRadius: 1,
                                          bgcolor: "action.hover",
                                        }}
                                      />
                                    </Box>
                                  );
                                }
                              )}
                            </Stack>
                          )}
                        </Box>
                      )}

                      {ans.type === "noul" && (
                        <Box sx={{ flex: 1 }}>
                          <Box
                            sx={{
                              mb: 1.5,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: 1,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {i18n("local_ai_jev_judgment", "判定 (Noul):")}
                              </Typography>
                              <Chip
                                size="small"
                                label={
                                  ans.noul >= 0.5
                                    ? i18n("local_ai_jev_true", "TRUE (成立)")
                                    : i18n(
                                        "local_ai_jev_false",
                                        "FALSE (不成立)"
                                      )
                                }
                                color={ans.noul >= 0.5 ? "success" : "default"}
                                sx={{ fontWeight: 700 }}
                              />
                            </Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              P(true) = {(ans.noul * 100).toFixed(1)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, Math.max(0, ans.noul * 100))}
                            color={ans.noul >= 0.5 ? "success" : "inherit"}
                            sx={{
                              height: 6,
                              borderRadius: 1,
                              bgcolor: "action.hover",
                            }}
                          />
                        </Box>
                      )}

                      {ans.type !== "choice" &&
                        ans.type !== "score" &&
                        ans.type !== "noul" && (
                          <Box>
                            <Typography
                              variant="body2"
                              color="primary"
                              fontWeight={600}
                              sx={{ mb: 0.5 }}
                            >
                              {i18n("local_ai_jev_selected", "选定:")}{" "}
                              {ans.action ??
                                ans.label ??
                                ans.choice ??
                                JSON.stringify(ans)}
                            </Typography>
                            {ans.confidence !== undefined && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                              >
                                {i18n("local_ai_confidence", "置信度")}:{" "}
                                {(ans.confidence * 100).toFixed(1)}%
                              </Typography>
                            )}
                          </Box>
                        )}
                    </Box>
                  </Grid>
                )
              )}
            </Grid>
          </CardContent>
        </Card>
      )}
      <LogViewer logs={logs} onClear={clearLogs} />
    </Stack>
  );
}
