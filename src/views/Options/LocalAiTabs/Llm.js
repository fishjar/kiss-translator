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
import TextField from "@mui/material/TextField";
import Collapse from "@mui/material/Collapse";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { LlmClient, backendLabel } from "../../../localAi/core/llmClient";
import { CATALOG, getModelDisplayName } from "../../../localAi/core/catalog";
import { setShared } from "../../../localAi/core/shared";
import { useI18n } from "../../../hooks/I18n";

const LLM_MODELS = CATALOG.filter((m) => m.task === "llm");
const DEFAULT_LLM_ID = "qwen2.5-0.5b";
const MAX_TOKENS = 512;
const client = new LlmClient();
globalThis.__kissLlmClient = client;

const TARGET_LANGUAGES = [
  { value: "Simplified Chinese", label: "简体中文" },
  { value: "Traditional Chinese", label: "繁体中文" },
  { value: "English", label: "英语" },
  { value: "Japanese", label: "日语" },
  { value: "Korean", label: "韩语" },
  { value: "French", label: "法语" },
  { value: "German", label: "德语" },
  { value: "Spanish", label: "西班牙语" },
  { value: "Russian", label: "俄语" },
];

const DEFAULT_TRANSLATE_PROMPT = `Translate the following text into {{to}}. Preserve all HTML-like tags. Output ONLY the translated text without any explanation:\n{{text}}`;
const SAMPLE_HTML_TEXT = `<p>Welcome to <b>KISS Local AI</b>! Click <a href="https://example.com">here</a> to learn how <i>on-device LLM</i> protects your <span class="highlight">privacy</span>.</p>`;

export function buildTranslatePrompt(template, to, text) {
  return template.replace(/\{\{to\}\}/g, to).replace(/\{\{text\}\}/g, text);
}

export default function LlmTab() {
  const i18n = useI18n();
  const [selectedId, setSelectedId] = useState(DEFAULT_LLM_ID);
  const [device, setDevice] = useState("webgpu");
  const [recs, setRecs] = useState({});
  const [loadedId, setLoadedId] = useState(null);
  const [actualBackend, setActualBackend] = useState(null);
  const [clientState, setClientState] = useState("idle");
  const [progressText, setProgressText] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // 翻译测试
  const [targetLang, setTargetLang] = useState("Simplified Chinese");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState(
    DEFAULT_TRANSLATE_PROMPT
  );
  const [transInput, setTransInput] = useState(SAMPLE_HTML_TEXT);
  const [transOutput, setTransOutput] = useState("");
  const [translating, setTranslating] = useState(false);
  const [transStats, setTransStats] = useState(null);

  const listRef = useRef(null);
  const lastAssistantRef = useRef("");
  const lastTransRef = useRef("");

  const busy = streaming || translating;

  useEffect(() => {
    const unsub = manager.subscribe((_id, r) => {
      if (r.manifest.task === "llm") {
        setRecs((prev) => ({ ...prev, [r.manifest.id]: { ...r } }));
      }
    });
    void manager.init().then(() => {
      const next = {};
      for (const m of LLM_MODELS) {
        const r = manager.get(m.id);
        if (r) next[m.id] = { ...r };
      }
      setRecs(next);
    });
    client.onProgress = (status) => setProgressText(status);
    client.onStateChange = (ready, reason) => {
      if (!ready) {
        setClientState("idle");
        setLoadedId(null);
        if (reason) setError(reason);
      }
    };
    return unsub;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const selectedManifest =
    LLM_MODELS.find((m) => m.id === selectedId) ?? LLM_MODELS[0];
  const rec = recs[selectedId] ?? null;
  const modelInstalled = rec?.state === "installed";
  const modelBusy =
    rec?.state === "downloading" ||
    rec?.state === "queued" ||
    rec?.state === "verifying";
  const isLoaded = clientState === "ready" && loadedId === selectedId;

  const loadModel = async () => {
    const m = selectedManifest;
    const file = m.files[0];
    if (!file) {
      setError(i18n("local_ai_no_files_for_model", "该模型没有可用的文件"));
      return;
    }
    const dev = m.backend.includes(device) ? device : m.backend[0];
    setError(null);
    setClientState("loading");
    setProgressText(i18n("local_ai_model_loading", "启动推理引擎…"));
    try {
      const spec =
        m.runtime === "wllama"
          ? {
              runtime: "wllama",
              dir: m.dir,
              file: file.path,
              device: dev,
              nCtx: 2048,
            }
          : (() => {
              const onnxFile =
                m.files.find((f) => f.path.endsWith(".onnx")) ?? m.files[0];
              const dtype =
                onnxFile.path.match(/model_(.+)\.onnx$/)?.[1] ?? "q4f16";
              const dataPrefix =
                onnxFile.path.slice(0, -".onnx".length) + ".onnx_data";
              const chunks = m.files.filter((f) =>
                f.path.startsWith(dataPrefix)
              ).length;
              return {
                runtime: "onnx",
                source: m.source,
                dir: m.dir,
                device: dev,
                dtype,
                ...(chunks > 0 ? { externalDataChunks: chunks } : {}),
              };
            })();
      const info = await client.load(spec);
      setActualBackend(info.backend);
      setClientState("ready");
      setLoadedId(m.id);
      setProgressText("");
    } catch (e) {
      setClientState("idle");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !isLoaded) return;
    const next = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setError(null);
    setStats(null);
    lastAssistantRef.current = "";
    try {
      const r = await client.chat(next, MAX_TOKENS, (tok) => {
        lastAssistantRef.current += tok;
        setMessages((prev) => {
          const arr = [...prev];
          const last = arr[arr.length - 1];
          if (last)
            arr[arr.length - 1] = { ...last, content: last.content + tok };
          return arr;
        });
      });
      setStats(r);
      if (lastAssistantRef.current) setShared("llm", lastAssistantRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
    }
  };

  const translate = async () => {
    const text = transInput.trim();
    if (!text || busy || !isLoaded) return;
    const prompt = buildTranslatePrompt(promptTemplate, targetLang, text);
    const reqMessages = [{ role: "user", content: prompt }];
    setTranslating(true);
    setTransOutput("");
    setTransStats(null);
    setError(null);
    lastTransRef.current = "";
    try {
      const r = await client.chat(reqMessages, MAX_TOKENS, (tok) => {
        lastTransRef.current += tok;
        setTransOutput((prev) => prev + tok);
      });
      setTransStats(r);
      if (lastTransRef.current) setShared("llm", lastTransRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(false);
    }
  };

  const stop = () => client.stop();

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
              {i18n("local_ai_llm_title", "本地大语言模型")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Chip
                size="small"
                label={
                  modelInstalled
                    ? i18n("local_ai_models_state_installed", "已安装")
                    : modelBusy
                      ? i18n("local_ai_models_state_downloading", "下载中")
                      : i18n("local_ai_models_state_not_installed", "未安装")
                }
                color={modelInstalled ? "success" : "default"}
                variant={modelInstalled ? "filled" : "outlined"}
              />
              <Chip
                size="small"
                label={
                  isLoaded
                    ? `${i18n("local_ai_ready", "已就绪")} (${actualBackend ? backendLabel(actualBackend) : device.toUpperCase()})`
                    : clientState === "loading"
                      ? i18n("local_ai_model_loading", "加载中…")
                      : i18n("local_ai_not_loaded", "未加载")
                }
                color={isLoaded ? "success" : "default"}
              />
            </Box>
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
              <InputLabel id="llm-model-label">
                {i18n("local_ai_select_model", "选择模型")}
              </InputLabel>
              <Select
                labelId="llm-model-label"
                value={selectedId}
                label={i18n("local_ai_select_model", "选择模型")}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={clientState === "loading" || busy}
              >
                {LLM_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {getModelDisplayName(m, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="llm-backend-label">
                {i18n("local_ai_backend", "计算后端")}
              </InputLabel>
              <Select
                labelId="llm-backend-label"
                value={device}
                label={i18n("local_ai_backend", "计算后端")}
                onChange={(e) => setDevice(e.target.value)}
                disabled={clientState === "loading" || busy}
              >
                {selectedManifest.backend.map((b) => (
                  <MenuItem key={b} value={b}>
                    {b === "webgpu" ? "WebGPU" : "WASM (CPU)"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              disabled={
                !modelInstalled || clientState === "loading" || busy || isLoaded
              }
              onClick={() => void loadModel()}
            >
              {clientState === "loading"
                ? i18n("local_ai_model_loading", "加载中…")
                : isLoaded
                  ? i18n("local_ai_model_loaded", "模型已就绪")
                  : i18n("local_ai_load_model", "加载模型")}
            </Button>

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
              {i18n("local_ai_llm_trans_test", "翻译测试卡片")}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexWrap: "wrap",
              }}
            >
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="trans-lang-label">
                  {i18n("local_ai_llm_target_lang", "目标语言")}
                </InputLabel>
                <Select
                  labelId="trans-lang-label"
                  value={targetLang}
                  label={i18n("local_ai_llm_target_lang", "目标语言")}
                  onChange={(e) => setTargetLang(e.target.value)}
                  disabled={busy}
                >
                  {TARGET_LANGUAGES.map((l) => {
                    const langKeyMap = {
                      "Simplified Chinese": "local_ai_lang_zh_hans",
                      "Traditional Chinese": "local_ai_lang_zh_hant",
                      English: "local_ai_lang_en",
                      Japanese: "local_ai_lang_ja",
                      Korean: "local_ai_lang_ko",
                      French: "local_ai_lang_fr",
                      German: "local_ai_lang_de",
                      Spanish: "local_ai_lang_es",
                      Russian: "local_ai_lang_ru",
                    };
                    const label = langKeyMap[l.value]
                      ? i18n(langKeyMap[l.value], l.label)
                      : l.label;
                    return (
                      <MenuItem key={l.value} value={l.value}>
                        {label}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
              <Button
                variant={showPromptEditor ? "contained" : "outlined"}
                size="small"
                color={showPromptEditor ? "primary" : "inherit"}
                startIcon={<TuneRoundedIcon />}
                onClick={() => setShowPromptEditor((v) => !v)}
              >
                {showPromptEditor
                  ? i18n("local_ai_llm_collapse_prompt", "收起提示词")
                  : i18n("local_ai_llm_prompt_template", "提示词模板")}
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<TranslateRoundedIcon />}
                disabled={!isLoaded || busy || !transInput.trim()}
                onClick={() => void translate()}
              >
                {translating
                  ? i18n("local_ai_llm_translating", "翻译中…")
                  : i18n("local_ai_llm_run_trans", "执行翻译")}
              </Button>
            </Box>
          </Box>

          <Collapse
            in={showPromptEditor}
            timeout="auto"
            unmountOnExit
            sx={{ mb: 2 }}
          >
            <Box
              sx={{
                p: 2,
                bgcolor: "action.hover",
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 1,
                  mb: 1,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {i18n("local_ai_llm_vars_support", "支持变量：")}
                  <code>{"{{to}}"}</code>
                  {i18n("local_ai_llm_var_to_desc", "（目标语言）")}、
                  <code>{"{{text}}"}</code>
                  {i18n("local_ai_llm_var_text_desc", "（待翻译文本）")}
                </Typography>
                {promptTemplate !== DEFAULT_TRANSLATE_PROMPT && (
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => setPromptTemplate(DEFAULT_TRANSLATE_PROMPT)}
                  >
                    {i18n("local_ai_llm_reset_template", "重置默认模板")}
                  </Button>
                )}
              </Box>
              <TextField
                multiline
                rows={3}
                fullWidth
                value={promptTemplate}
                disabled={busy}
                onChange={(e) => setPromptTemplate(e.target.value)}
                inputProps={{
                  className: "kt-resizable-textarea",
                  style: { resize: "vertical" },
                }}
                sx={{
                  bgcolor: "background.paper",
                  "& .MuiInputBase-root": { overflow: "visible" },
                  '& textarea:not([aria-hidden="true"])': {
                    fontFamily: "monospace",
                    fontSize: 13,
                    resize: "vertical",
                  },
                }}
              />
            </Box>
          </Collapse>

          <Stack spacing={1.5}>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="small"
                disabled={busy}
                onClick={() => setTransInput(SAMPLE_HTML_TEXT)}
              >
                {i18n("local_ai_llm_fill_html_sample", "填入 HTML 示例")}
              </Button>
            </Box>
            <TextField
              label={i18n(
                "local_ai_llm_source_text_label",
                "待翻译文本 (支持 HTML 结构保留测试)"
              )}
              multiline
              rows={3}
              fullWidth
              value={transInput}
              onChange={(e) => setTransInput(e.target.value)}
              disabled={busy}
              inputProps={{
                className: "kt-resizable-textarea",
                style: { resize: "vertical" },
              }}
              sx={{
                "& .MuiInputBase-root": { overflow: "visible" },
                '& textarea:not([aria-hidden="true"])': { resize: "vertical" },
              }}
            />

            {(transOutput || translating) && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  resize: "vertical",
                  overflow: "auto",
                  minHeight: 80,
                }}
              >
                <Typography variant="subtitle2" color="primary" gutterBottom>
                  {i18n("local_ai_llm_trans_result", "翻译结果：")}
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                  {transOutput}
                </Typography>
                {transStats && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: "block" }}
                  >
                    {i18n("local_ai_llm_speed", "速度:")}{" "}
                    {transStats.tokensPerSecond.toFixed(1)} tok/s ·{" "}
                    {i18n("local_ai_llm_generated", "生成:")}{" "}
                    {transStats.outputTokens} tokens
                  </Typography>
                )}
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

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
            <Typography variant="h6" fontWeight={600}>
              {i18n("local_ai_llm_chat_card", "模型交互对话")}
            </Typography>
            <Button
              variant="text"
              size="small"
              startIcon={<DeleteOutlineRoundedIcon />}
              onClick={() => setMessages([])}
              disabled={messages.length === 0 || busy}
            >
              {i18n("local_ai_llm_clear_chat", "清空记录")}
            </Button>
          </Box>

          <Box
            ref={listRef}
            sx={{
              minHeight: 200,
              height: 320,
              resize: "vertical",
              overflowY: "auto",
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "action.hover",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              mb: 2,
            }}
          >
            {messages.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", my: "auto" }}
              >
                {i18n(
                  "local_ai_llm_empty_chat",
                  "暂无对话内容，输入消息开始交流"
                )}
              </Typography>
            ) : (
              messages.map((msg, i) => (
                <Box
                  key={i}
                  sx={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor:
                      msg.role === "user" ? "primary.main" : "background.paper",
                    color:
                      msg.role === "user"
                        ? "primary.contrastText"
                        : "text.primary",
                    boxShadow: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.8, display: "block", mb: 0.5 }}
                  >
                    {msg.role === "user"
                      ? i18n("local_ai_llm_role_user", "用户")
                      : i18n("local_ai_llm_role_model", "模型")}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {msg.content ||
                      (streaming && i === messages.length - 1 ? "…" : "")}
                  </Typography>
                </Box>
              ))
            )}
          </Box>

          {stats && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1.5 }}
            >
              {i18n("local_ai_speed", "速度")}:{" "}
              {stats.tokensPerSecond.toFixed(1)} tokens/s ·{" "}
              {i18n("local_ai_llm_total_stats", "总计:")} {stats.outputTokens}{" "}
              tokens
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={1}
              maxRows={6}
              placeholder={i18n(
                "local_ai_llm_input_placeholder",
                "输入消息… (Enter 发送, Shift+Enter 换行)"
              )}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={!isLoaded || busy}
              inputProps={{
                className: "kt-resizable-textarea",
                style: { resize: "vertical" },
              }}
              sx={{
                "& .MuiInputBase-root": { overflow: "visible" },
                '& textarea:not([aria-hidden="true"])': { resize: "vertical" },
              }}
            />
            {streaming ? (
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopRoundedIcon />}
                onClick={stop}
              >
                {i18n("local_ai_llm_stop", "停止")}
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<SendRoundedIcon />}
                disabled={!isLoaded || busy || !input.trim()}
                onClick={() => void send()}
              >
                {i18n("local_ai_llm_send", "发送")}
              </Button>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
