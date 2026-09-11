import { useEffect, useId, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/Download";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  findPromptBySlug,
  isPresetPromptSlug,
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  PROMPT_MODE_GLOBAL,
} from "../../config";
import { detectSubtitleProtocol, handleSubtitle } from "../../apis/trans";
import { useConfirm } from "../../hooks/Confirm";
import { useI18n } from "../../hooks/I18n";
import { downloadBlobFile } from "../../libs/utils";
import { aiSegment } from "../../subtitle/youtubeAiSegmentation";
import {
  formatSubtitles,
  prepareTimedTextEvents,
  runBuiltinSegmentation,
  splitEventsIntoChunks,
} from "../../subtitle/youtubeSubtitleProcessing";
import {
  buildSegmentationMetrics,
  getSegmentationMetricErrors,
} from "../../subtitle/subtitleSegmentationMetrics";
import { DEFAULT_PARAMS } from "../../subtitle/sentenceBreaker";
import { buildBilingualVtt } from "../../subtitle/vtt";
import {
  ResizeHandle,
  usePrefersReducedMotion,
  MIN_RESIZE_HEIGHT_MEDIUM,
} from "../../components/ResizeHandle";
import { useTextareaResize } from "../../components/useTextareaResize";

const SAMPLE_BASE_URL = `${process.env.REACT_APP_SITEURL}/subtitle-samples`;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_EVENTS = 100000;

/** 用命名占位符组装包含运行时数据的多语言文案。 */
function formatI18n(i18n, key, fallback, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) =>
      text.split(`{${name}}`).join(value === undefined ? "" : String(value)),
    i18n(key, fallback)
  );
}

/** 从裸数组或 `{events, lang}` 包装对象中提取测试事件。 */
function parseSubtitleSource(value, i18n = (_, fallback) => fallback) {
  const events = Array.isArray(value) ? value : value?.events;
  if (!Array.isArray(events) || !events.length) {
    throw new Error(
      i18n(
        "subtitle_playground_invalid_events",
        "字幕文件没有有效的 events 数组"
      )
    );
  }
  if (events.length > MAX_UPLOAD_EVENTS) {
    throw new Error(
      formatI18n(
        i18n,
        "subtitle_playground_event_limit",
        "字幕事件数量不能超过 {max}",
        { max: MAX_UPLOAD_EVENTS }
      )
    );
  }
  if (!events.some((event) => Array.isArray(event?.segs))) {
    throw new Error(
      i18n(
        "subtitle_playground_missing_segments",
        "字幕文件缺少 YouTube json3 的 segs 数据"
      )
    );
  }
  return { events, lang: Array.isArray(value) ? "" : value.lang || "" };
}

/** 在浏览器中验证远程样本内容，避免缓存或发布错误导致测试数据损坏。 */
async function verifyRemoteSample(
  buffer,
  sample,
  i18n = (_, fallback) => fallback
) {
  if (buffer.byteLength !== sample.size) {
    throw new Error(
      i18n(
        "subtitle_playground_remote_size_invalid",
        "远程字幕样本大小校验失败"
      )
    );
  }
  if (!globalThis.crypto?.subtle?.digest) return;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  if (hex !== sample.sha256) {
    throw new Error(
      i18n(
        "subtitle_playground_remote_hash_invalid",
        "远程字幕样本哈希校验失败"
      )
    );
  }
}

/** 把测试结果裁剪为播放器和下载文件使用的公开字幕结构。 */
const toPublicCues = (cues) =>
  (cues || []).map(({ start, end, text, translation = "" }) => ({
    start,
    end,
    text,
    translation,
  }));

/** 判断带内部索引的 AI 结果是否从 0 连续覆盖到请求事件末尾。 */
function hasCompleteIndexedCoverage(cues, eventCount) {
  if (!Array.isArray(cues) || !cues.length) return false;
  const hasIndices = cues.some(
    (cue) => Number.isInteger(cue?._ei) || Number.isInteger(cue?._alignedEi)
  );
  // VTT 旧协议没有索引，仍交由时间轴结构指标检查。
  if (!hasIndices) return true;

  let nextIndex = 0;
  for (const cue of cues) {
    const startIndex = cue._alignedSi ?? cue._si;
    const endIndex = cue._alignedEi ?? cue._ei;
    if (startIndex !== nextIndex || endIndex < startIndex) return false;
    nextIndex = endIndex + 1;
  }
  return nextIndex === eventCount;
}

/**
 * 字幕页可拖高输入框包装组件（最简形态）：把「受控高度 state +
 * useTextareaResize + 只读 TextField + 常显 ResizeHandle」收敛进这一层，
 * 使拖动期间的每次 pointermove 只重渲染本组件，不再触发整页
 * SubtitleSegmentationPlayground 的 reconciliation —— 重渲染范围隔离，
 * 修复整页重渲染导致的拖动掉帧。
 *
 * 重渲染范围隔离生效的关键：onHeightChange 直接传 useState setter（引用稳定）。
 * ResizeHandle 的拖动会话监听在 pointerdown/touchstart 内同步安装、由 endSession
 * 卸载，不随重渲染重建；拖动期间每次 pointermove 只重渲染本组件，父级不参与
 * reconciliation，value/ariaLabel 等 props 引用不变、不参与拖动路径。
 *
 * 字幕页没有 focus-gating：两手柄静态 visible、closing=false，
 * 不引入任何焦点状态；notch 遮罩条用默认高度（无局部聚焦边框策略）。
 *
 * 本文件内定义专用包装组件，不与 Selection 的 focus-gating 形态共享：
 * 字幕页是只读静态常显手柄 + 默认 notch；Selection（TranForm/TranCont）则是
 * focus-gating 显隐 + 自定义遮罩条高度——差异足以支撑分开定义，贸然合并会
 * 回归焦点/notch 行为。
 */
function ResizableSubtitleField({
  value,
  textareaLabel,
  handleLabel,
  testId,
  notchTestId,
  // 额外绝对定位浮层（如结果框右上角 JSON/VTT 工具栏），渲染在手柄覆盖层之下。
  toolbar = null,
}) {
  const boxRef = useRef(null);
  const fieldId = useId();
  // 受控高度：null 表示仍由 MUI TextareaAutosize 自动测量，
  // 用户首次拖动后切换为受控高度（与 Selection 语义一致）。
  const [height, setHeight] = useState(null);
  // reduced-motion 偏好由本组件订阅一次并经 prop 下发（单一状态真源，
  // ResizeHandle 自身不再重复订阅）。
  const prefersReducedMotion = usePrefersReducedMotion();
  // 拖动高度 → TextField 的 minRows/maxRows/根节点高度样式（共享 hook）。
  // 未拖动时保持原语义：minRows=5、maxRows=10 限制自动增长上限；
  // 拖动后受控像素高度落在 InputBase 根节点（与 Selection 的根节点高度模型
  // 对齐），min/maxRows 量化全部释放。
  const { minRows, maxRows, rootStyle } = useTextareaResize(height, 5);

  return (
    <Box ref={boxRef} sx={{ position: "relative" }}>
      <TextField
        id={fieldId}
        fullWidth
        multiline
        minRows={minRows}
        maxRows={maxRows}
        value={value}
        InputProps={{
          readOnly: true,
          // 根节点保留右侧内边距；拖动后受控像素高度直接约束 InputBase
          // （输入框本体），与 helperText/标签互不干扰，rootStyle 与
          // TranForm/TranCont 的 InputBase 根节点高度模型一致。不写入内部
          // textarea 的 inline height，TextareaAutosize 的自动测量不受影响；
          // 滚动与几何契约由下方 scoped sx 规则承载（不命中测量 shadow）。
          style: {
            paddingRight: 14,
            ...(rootStyle || {}),
          },
        }}
        inputProps={{
          "aria-label": textareaLabel,
        }}
        sx={{
          "& textarea:not([aria-hidden='true'])": {
            boxSizing: "border-box",
            maxHeight: "100%",
            resize: "none",
            ...(height != null ? { overflow: "auto !important" } : {}),
          },
        }}
      />
      {toolbar}
      {/* 覆盖层：手柄/notch 相对本包装层定位，不被滚动裁切 */}
      <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <ResizeHandle
          visible
          closing={false}
          height={height}
          containerRef={boxRef}
          minHeight={MIN_RESIZE_HEIGHT_MEDIUM}
          // 直接传 state setter（引用稳定）：拖动全程监听器集不重挂，隔离生效关键。
          onHeightChange={setHeight}
          prefersReducedMotion={prefersReducedMotion}
          controlsId={fieldId}
          title={handleLabel}
          ariaLabel={handleLabel}
          testId={testId}
          notchTestId={notchTestId}
        />
      </Box>
    </Box>
  );
}

/** 字幕断句工作台，所有配置只读取当前字幕设置，不单独持久化。 */
export default function SubtitleSegmentationPlayground({
  subtitleSetting = {},
  transApis = [],
  prompts = [],
}) {
  const confirm = useConfirm();
  const i18n = useI18n();
  const [catalog, setCatalog] = useState([]);
  const [sampleId, setSampleId] = useState("");
  const [sampleName, setSampleName] = useState("uploaded");
  const [fromLang, setFromLang] = useState("en");
  const [sourceValue, setSourceValue] = useState(null);
  const [sourceText, setSourceText] = useState("");
  const [result, setResult] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [resultFormat, setResultFormat] = useState("json");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [showLanguageRequired, setShowLanguageRequired] = useState(false);
  const abortRef = useRef(null);
  const languageSelectRef = useRef(null);
  // 原始字幕 JSON / 断句结果输入框的高度 state、useTextareaResize 与手柄
  // 已整体收敛进下方 ResizableSubtitleField 包装组件（重渲染范围隔离）。
  // 索引只应拉取一次，通过 ref 读取当前语言，避免翻译函数变化导致重复请求。
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  const segApi = useMemo(
    () =>
      subtitleSetting?.segSlug && subtitleSetting.segSlug !== "-"
        ? transApis.find((api) => api.apiSlug === subtitleSetting.segSlug)
        : null,
    [subtitleSetting?.segSlug, transApis]
  );
  const mode = segApi
    ? "ai"
    : subtitleSetting?.useAlgorithmBreaker === "statistical"
      ? "statistical"
      : "rule";
  const effectivePromptSlug =
    subtitleSetting?.segPromptMode === PROMPT_MODE_GLOBAL
      ? subtitleSetting?.segPromptSlug || DEFAULT_SUBTITLE_PROMPT_SLUG
      : segApi?.subtitlePromptSlug || DEFAULT_SUBTITLE_PROMPT_SLUG;
  const effectivePrompt = findPromptBySlug(prompts, effectivePromptSlug);
  const promptSource =
    subtitleSetting?.segPromptMode === PROMPT_MODE_GLOBAL
      ? i18n("subtitle_playground_prompt_global", "全局字幕设置")
      : isPresetPromptSlug(effectivePromptSlug)
        ? i18n("subtitle_playground_prompt_preset", "接口预设")
        : i18n("subtitle_playground_prompt_custom", "接口自定义");
  const aiProtocol = detectSubtitleProtocol(segApi?.subtitlePrompt || "");
  const prepared = useMemo(() => {
    if (!sourceValue) return null;
    try {
      return prepareTimedTextEvents(parseSubtitleSource(sourceValue).events);
    } catch {
      return null;
    }
  }, [sourceValue]);
  const estimatedChunkCount = segApi
    ? splitEventsIntoChunks(
        prepared?.flatEvents || [],
        subtitleSetting?.chunkLength || 1000
      ).length
    : 0;
  // AI 可以结合完整文本自动识别语言；内置规则和统计模式必须使用明确语言。
  const requiresExplicitLanguage =
    Boolean(sourceValue) && !segApi && fromLang === "auto";

  // 页面加载时只拉取轻量索引，实际样本等用户选择后再下载。
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${SAMPLE_BASE_URL}/index.json?v=${process.env.REACT_APP_VERSION}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((value) => setCatalog(value.samples || []))
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") {
          setError(
            i18nRef.current(
              "subtitle_playground_remote_index_failed",
              "远程字幕样本索引加载失败，可以继续上传本地 JSON"
            )
          );
        }
      });
    return () => controller.abort();
  }, []);

  // 切换 Playground 页签或离开页面时取消仍在进行的样本下载和 AI 请求。
  useEffect(() => () => abortRef.current?.abort(), []);

  const selectRemoteSample = async (id) => {
    abortRef.current?.abort();
    setSampleId(id);
    setResult(null);
    setMetrics(null);
    setShowLanguageRequired(false);
    if (!id) return;
    const sample = catalog.find((item) => item.id === id);
    if (!sample) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setProgress(null);
    setError("");
    try {
      const response = await fetch(
        `${SAMPLE_BASE_URL}/${sample.path}?hash=${sample.sha256.slice(0, 16)}`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      await verifyRemoteSample(buffer, sample, i18n);
      const text = new TextDecoder().decode(buffer);
      const value = JSON.parse(text);
      parseSubtitleSource(value, i18n);
      setSourceValue(value);
      setSourceText(JSON.stringify(value, null, 2));
      setSampleName(sample.id);
      setFromLang(sample.language || "auto");
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setError(
          formatI18n(
            i18n,
            "subtitle_playground_sample_load_failed",
            "字幕样本加载失败：{message}",
            { message: loadError.message }
          )
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const uploadSample = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        i18n("subtitle_playground_file_too_large", "字幕文件不能超过 10MB")
      );
      return;
    }
    try {
      const text = await file.text();
      const value = JSON.parse(text);
      parseSubtitleSource(value, i18n);
      setSourceValue(value);
      setSourceText(JSON.stringify(value, null, 2));
      setSampleId("");
      setSampleName(file.name.replace(/\.json$/i, "") || "uploaded");
      // 本地文件来源不可验证，先重置为 AutoDetect；内置模式会要求用户再明确选择。
      setFromLang("auto");
      setResult(null);
      setMetrics(null);
      setShowLanguageRequired(false);
    } catch (uploadError) {
      setError(
        formatI18n(
          i18n,
          "subtitle_playground_file_parse_failed",
          "字幕文件解析失败：{message}",
          { message: uploadError.message }
        )
      );
    }
  };

  const runTest = async () => {
    if (!sourceValue || !prepared || loading) return;
    if (requiresExplicitLanguage) {
      // 点击运行后再提示具体语言，并把焦点移到需要处理的字段。
      setShowLanguageRequired(true);
      languageSelectRef.current?.focus();
      return;
    }
    if (segApi) {
      const confirmed = await confirm({
        title: i18n("subtitle_playground_ai_confirm_title", "发送 AI 断句请求"),
        message: formatI18n(
          i18n,
          "subtitle_playground_ai_confirm_message",
          "将使用 {api} / {model} 发送约 {count} 个字幕请求。样本文本会发送到当前 AI 服务。",
          {
            api: segApi.apiName || segApi.apiSlug,
            model:
              segApi.model ||
              i18n("subtitle_playground_default_model", "默认模型"),
            count: estimatedChunkCount,
          }
        ),
        confirmText: i18n("subtitle_playground_continue", "继续"),
        cancelText: i18n("cancel", "取消"),
      });
      if (!confirmed) return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setResult(null);
    setMetrics(null);
    setError("");
    const startedAt = performance.now();

    try {
      const rawEvents = parseSubtitleSource(sourceValue, i18n).events;
      let cues = [];
      let aiMetrics = null;

      if (segApi) {
        const chunks = splitEventsIntoChunks(
          prepared.flatEvents,
          subtitleSetting?.chunkLength || 1000
        );
        setProgress({ completed: 0, total: chunks.length });
        let requestCount = 0;
        let invalidResponseCount = 0;
        let streamedChunkCues = [];
        // 请求函数必须定义在 chunk 循环外，避免每轮创建闭包并触发 CI 的 no-loop-func 校验。
        const runAiSubtitleRequest = async (params) => {
          requestCount += 1;
          const response = await handleSubtitle({
            events: params.events,
            from: params.fromLang,
            to: params.toLang,
            apiSetting: params.apiSetting,
            docInfo: params.docInfo,
            onSubtitleChunk: params.onSubtitleChunk,
            signal: params.signal,
          });
          if (!hasCompleteIndexedCoverage(response, params.events.length)) {
            invalidResponseCount += 1;
          }
          return response;
        };
        // 流式响应只包含本次新闭合的字幕，需要与已完成 chunk 合并后再刷新右侧预览。
        const publishStreamedCues = ({ subtitles }) => {
          streamedChunkCues.push(...(subtitles || []));
          setResult(
            toPublicCues([...cues, ...streamedChunkCues]).sort(
              (a, b) => a.start - b.start
            )
          );
        };

        for (const [chunkIndex, chunkEvents] of chunks.entries()) {
          streamedChunkCues = [];
          // 测试页顺序跑完所有 chunk，不采用播放器的按需预加载调度。
          const chunkCues = await aiSegment({
            videoId: `subtitle-playground-${sampleName}-${chunkIndex}`,
            fromLang,
            toLang: subtitleSetting?.toLang,
            chunkEvents,
            segApiSetting: segApi,
            apiSubtitle: runAiSubtitleRequest,
            docInfo: {
              title: i18n("subtitle_segmentation", "字幕断句"),
              description: "",
              summary: "",
            },
            formatSubtitles: (events, lang) =>
              formatSubtitles(events, lang, {
                longSentenceThreshold:
                  subtitleSetting?.longSentenceThreshold ?? 120,
              }),
            clearSegmentTranslation: false,
            signal: controller.signal,
            setting: { ...subtitleSetting, prompts },
            onSubtitleChunk: publishStreamedCues,
          });
          cues.push(...chunkCues);
          // 完整 chunk 返回后以校验后的最终结果覆盖临时流式预览。
          setResult(toPublicCues(cues).sort((a, b) => a.start - b.start));
          setProgress({ completed: chunkIndex + 1, total: chunks.length });
        }

        const fallbackCueCount = cues.filter(
          (cue) => !Number.isInteger(cue._ei)
        ).length;
        aiMetrics = {
          protocol: aiProtocol,
          chunkCount: chunks.length,
          requestCount,
          retryCount: Math.max(0, requestCount - chunks.length),
          fallbackCueCount,
          invalidResponseCount,
        };
      } else {
        cues = runBuiltinSegmentation({
          events: prepared.events,
          flatEvents: prepared.flatEvents,
          fromLang,
          mode,
          longSentenceThreshold: subtitleSetting?.longSentenceThreshold ?? 120,
        });
      }

      const publicCues = toPublicCues(cues).sort((a, b) => a.start - b.start);
      const nextMetrics = buildSegmentationMetrics({
        rawEvents,
        canonicalEvents: prepared.events,
        flatEvents: prepared.flatEvents,
        cues: publicCues,
        fromLang,
        processingMs: performance.now() - startedAt,
        filteredNonSpeechCount: prepared.filteredNonSpeechCount,
        ai: aiMetrics,
      });
      setResult(publicCues);
      setMetrics({
        ...nextMetrics,
        errors: getSegmentationMetricErrors(nextMetrics),
      });
    } catch (runError) {
      if (runError.name !== "AbortError") {
        setError(
          formatI18n(
            i18n,
            "subtitle_playground_test_failed",
            "字幕断句失败：{message}",
            { message: runError.message }
          )
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
        setProgress(null);
      }
    }
  };

  const resultText = result
    ? resultFormat === "vtt"
      ? buildBilingualVtt(result)
      : JSON.stringify(result, null, 2)
    : "";

  const downloadResult = () => {
    if (!resultText) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadBlobFile(
      resultText,
      `${sampleName}-${mode}-${timestamp}.${resultFormat}`
    );
  };

  const configItems = segApi
    ? [
        [i18n("subtitle_playground_mode", "模式"), "AI"],
        [
          i18n("subtitle_playground_api", "API"),
          segApi.apiName || segApi.apiSlug,
        ],
        [
          i18n("subtitle_playground_type_model", "类型 / 模型"),
          `${segApi.apiType || "-"} / ${segApi.model || "-"}`,
        ],
        [
          i18n("subtitle_playground_prompt", "提示词"),
          formatI18n(
            i18n,
            "subtitle_playground_prompt_value",
            "{prompt}（{source}）",
            {
              prompt:
                effectivePrompt?.name ||
                effectivePromptSlug ||
                i18n("subtitle_playground_api_default", "接口默认"),
              source: promptSource,
            }
          ),
        ],
        [
          i18n("subtitle_playground_chunk_length", "Chunk 长度"),
          subtitleSetting?.chunkLength || 1000,
        ],
        [
          i18n("subtitle_playground_estimated_chunks", "预计 Chunk"),
          estimatedChunkCount,
        ],
        [
          i18n("subtitle_playground_target_language", "目标语言"),
          subtitleSetting?.toLang || "-",
        ],
        [
          i18n("subtitle_playground_streaming", "流式"),
          segApi.useStream
            ? i18n("subtitle_playground_enabled", "启用")
            : i18n("subtitle_playground_disabled", "关闭"),
        ],
        [
          i18n("subtitle_playground_protocol", "协议"),
          formatI18n(
            i18n,
            "subtitle_playground_protocol_value",
            "{protocol}（{compatibility}）",
            {
              protocol: aiProtocol,
              compatibility: i18n(
                "subtitle_playground_legacy_compatible",
                "兼容旧协议"
              ),
            }
          ),
        ],
      ]
    : mode === "statistical"
      ? [
          [
            i18n("subtitle_playground_mode", "模式"),
            i18n("subtitle_playground_statistical_mode", "统计断句"),
          ],
          [
            i18n("subtitle_playground_max_duration", "最大时长"),
            `${DEFAULT_PARAMS.maxDurationMs}ms`,
          ],
          [
            i18n("subtitle_playground_max_words", "最大词数"),
            DEFAULT_PARAMS.maxWords,
          ],
          [
            i18n("subtitle_playground_min_boundary_score", "最小边界评分"),
            DEFAULT_PARAMS.minBoundaryScore,
          ],
          [
            i18n("subtitle_playground_min_sentence_words", "最小句子词数"),
            DEFAULT_PARAMS.minSentenceWords,
          ],
          [i18n("subtitle_playground_source_language", "源语言"), fromLang],
        ]
      : [
          [
            i18n("subtitle_playground_mode", "模式"),
            i18n("subtitle_playground_rule_mode", "规则断句"),
          ],
          [
            i18n("subtitle_playground_long_sentence_threshold", "长句阈值"),
            subtitleSetting?.longSentenceThreshold ?? 120,
          ],
          [i18n("subtitle_playground_source_language", "源语言"), fromLang],
        ];

  return (
    <Stack spacing={2}>
      {error && <Alert severity="warning">{error}</Alert>}
      {segApi && Number(subtitleSetting?.chunkLength) > 1000 && (
        <Alert severity="warning">
          {i18n(
            "subtitle_playground_chunk_risk",
            "当前 AI Chunk 长度高于推荐默认值 1000，长输入可能增加漏句或边界退化风险。"
          )}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {i18n("subtitle_playground_config_title", "当前生效的断句配置")}
        </Typography>
        <Grid container spacing={1}>
          {configItems.map(([label, value]) => (
            <Grid item xs={6} md={3} key={label}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2">{String(value)}</Typography>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* 中等宽度下两个下拉框同排，按钮区跨满下一行，避免三列最小宽度撑出横向滚动条。 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "repeat(2, minmax(0, 1fr))",
          },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <TextField
            select
            fullWidth
            size="small"
            label={i18n("subtitle_playground_builtin_sample", "内置字幕样本")}
            value={sampleId}
            disabled={loading}
            onChange={(event) => selectRemoteSample(event.target.value)}
          >
            <MenuItem value="">
              {i18n("subtitle_playground_select_sample", "请选择远程样本")}
            </MenuItem>
            {catalog.map((sample) => (
              <MenuItem key={sample.id} value={sample.id}>
                {sample.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <TextField
            inputRef={languageSelectRef}
            select
            fullWidth
            size="small"
            label={i18n(
              "subtitle_playground_source_language_label",
              "字幕源语言"
            )}
            value={fromLang}
            disabled={loading}
            error={showLanguageRequired && requiresExplicitLanguage}
            helperText={
              showLanguageRequired && requiresExplicitLanguage
                ? i18n(
                    "subtitle_playground_language_required",
                    "规则和统计断句不支持 AutoDetect，请选择具体的字幕源语言。"
                  )
                : ""
            }
            onChange={(event) => {
              setFromLang(event.target.value);
              setShowLanguageRequired(false);
              // 源语言变化会改变断句语义，直接清空旧结果比显示“已过期”更明确。
              setResult(null);
              setMetrics(null);
            }}
          >
            {OPT_LANGS_FROM.map(([code, name]) => (
              <MenuItem key={code} value={code}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box
          sx={{ minWidth: 0, gridColumn: "1 / -1" }}
          data-testid="segmentation-actions"
        >
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              component="label"
              variant="outlined"
              startIcon={<UploadFileIcon />}
              disabled={loading}
            >
              {i18n("subtitle_playground_upload_json", "上传 JSON")}
              <input
                hidden
                type="file"
                accept=".json,application/json"
                onChange={uploadSample}
              />
            </Button>
            <Button
              variant="contained"
              startIcon={
                loading ? <CircularProgress size={16} /> : <PlayArrowIcon />
              }
              disabled={!sourceValue || loading}
              onClick={runTest}
            >
              {i18n("subtitle_playground_run", "运行测试")}
            </Button>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<StopIcon />}
              disabled={!loading}
              onClick={() => abortRef.current?.abort()}
            >
              {i18n("cancel", "取消")}
            </Button>
          </Stack>
          {loading && progress && (
            <Box
              sx={{ mt: 1, width: "100%" }}
              data-testid="segmentation-progress"
            >
              <LinearProgress
                variant="determinate"
                value={(progress.completed * 100) / Math.max(1, progress.total)}
              />
              <Typography variant="caption" color="text.secondary">
                {formatI18n(
                  i18n,
                  "subtitle_playground_progress",
                  "正在处理 Chunk {completed}/{total}",
                  progress
                )}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "repeat(2, minmax(0, 1fr))",
          },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" gutterBottom>
            {i18n("subtitle_playground_source_json", "原始字幕 JSON")}
          </Typography>
          <ResizableSubtitleField
            value={sourceText}
            textareaLabel={i18n("subtitle_playground_source_json")}
            handleLabel={i18n("field_resize_height")}
            testId="segmentation-source-resize-handle"
            notchTestId="segmentation-source-resize-notch"
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" gutterBottom>
            {i18n("subtitle_playground_result", "断句结果")}
          </Typography>
          <ResizableSubtitleField
            value={resultText}
            textareaLabel={i18n("subtitle_playground_result")}
            handleLabel={i18n("field_resize_height")}
            testId="segmentation-result-resize-handle"
            notchTestId="segmentation-result-resize-notch"
            toolbar={
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{
                  position: "absolute",
                  zIndex: 1,
                  top: 8,
                  right: 8,
                  p: 0.25,
                  borderRadius: 1,
                  bgcolor: "background.paper",
                  boxShadow: 1,
                }}
              >
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={resultFormat}
                  onChange={(_, value) => value && setResultFormat(value)}
                >
                  <ToggleButton value="json">JSON</ToggleButton>
                  <ToggleButton value="vtt">VTT</ToggleButton>
                </ToggleButtonGroup>
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  disabled={!result}
                  onClick={downloadResult}
                >
                  {i18n("subtitle_playground_download", "下载")}
                </Button>
              </Stack>
            }
          />
          {/* 右上按钮 Stack zIndex=1，手柄在下右下，几何上不重叠。 */}
        </Box>
      </Box>

      {metrics && !loading && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            {i18n("subtitle_playground_stats_title", "断句统计信息")}
          </Typography>
          <Grid container spacing={1.5}>
            {[
              [
                i18n("subtitle_playground_metric_processing", "处理耗时"),
                `${metrics.processingMs}ms`,
              ],
              [
                i18n("subtitle_playground_metric_raw_events", "原始事件"),
                metrics.rawEventCount,
              ],
              [
                i18n(
                  "subtitle_playground_metric_canonical_events",
                  "规范化事件"
                ),
                metrics.canonicalEventCount,
              ],
              [
                i18n("subtitle_playground_metric_flat_events", "Flat Events"),
                metrics.flatEventCount,
              ],
              [
                i18n(
                  "subtitle_playground_metric_filtered_non_speech",
                  "已过滤非语音片段"
                ),
                metrics.filteredNonSpeechCount,
              ],
              [
                i18n("subtitle_playground_metric_cues", "字幕条目"),
                metrics.cueCount,
              ],
              [
                i18n(
                  "subtitle_playground_metric_source_duration",
                  "源时间跨度"
                ),
                `${metrics.sourceDurationMs}ms`,
              ],
              [
                i18n("subtitle_playground_metric_covered_duration", "覆盖时长"),
                `${metrics.coveredDurationMs}ms`,
              ],
              [
                i18n("subtitle_playground_metric_text_coverage", "文本覆盖率"),
                `${metrics.textCoveragePercent}%`,
              ],
              [
                i18n("subtitle_playground_metric_empty_cues", "空字幕"),
                metrics.emptyCueCount,
              ],
              [
                i18n("subtitle_playground_metric_invalid_cues", "无效字幕"),
                metrics.invalidCueCount,
              ],
              [
                i18n("subtitle_playground_metric_overlaps", "时间重叠"),
                metrics.overlapCount,
              ],
              [
                i18n("subtitle_playground_metric_non_monotonic", "时间倒退"),
                metrics.nonMonotonicCount,
              ],
              [
                i18n("subtitle_playground_metric_missing_text", "文本遗漏"),
                metrics.missingTextCount,
              ],
              [
                i18n("subtitle_playground_metric_duplicated_text", "文本重复"),
                metrics.duplicatedTextCount,
              ],
              [
                i18n("subtitle_playground_metric_avg_chars", "平均字符"),
                metrics.chars.average,
              ],
              [
                i18n("subtitle_playground_metric_p95_chars", "P95 字符"),
                metrics.chars.p95,
              ],
              [
                i18n("subtitle_playground_metric_max_chars", "最大字符"),
                metrics.chars.max,
              ],
              [
                i18n("subtitle_playground_metric_avg_words", "平均词数"),
                metrics.words.average,
              ],
              [
                i18n("subtitle_playground_metric_p95_words", "P95 词数"),
                metrics.words.p95,
              ],
              [
                i18n("subtitle_playground_metric_max_words", "最大词数"),
                metrics.words.max,
              ],
              [
                i18n("subtitle_playground_metric_avg_duration", "平均时长"),
                `${metrics.durationMs.average}ms`,
              ],
              [
                i18n("subtitle_playground_metric_p95_duration", "P95 时长"),
                `${metrics.durationMs.p95}ms`,
              ],
              [
                i18n("subtitle_playground_metric_max_duration", "最大时长"),
                `${metrics.durationMs.max}ms`,
              ],
            ].map(([label, value]) => (
              <Grid item xs={6} sm={4} md={2} key={label}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body1">{String(value)}</Typography>
              </Grid>
            ))}
          </Grid>
          {metrics.errors.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formatI18n(
                i18n,
                "subtitle_playground_structure_error",
                "结构错误：{errors}",
                { errors: metrics.errors.join(", ") }
              )}
            </Alert>
          )}
          {Object.values(metrics.warnings).some(Boolean) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {formatI18n(
                i18n,
                "subtitle_playground_readability_warning",
                "可读性警告：超长文本 {longText}，超过 10 秒 {longDuration}，短碎片 {fragments}，泄漏的非语音字幕 {nonSpeech}",
                {
                  longText: metrics.warnings.tooLongTextCount,
                  longDuration: metrics.warnings.tooLongDurationCount,
                  fragments: metrics.warnings.fragmentCount,
                  nonSpeech: metrics.warnings.nonSpeechCueCount,
                }
              )}
            </Alert>
          )}
          {metrics.ai && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {formatI18n(
                i18n,
                "subtitle_playground_ai_stats",
                "AI：协议 {protocol}，Chunk {chunks}，请求 {requests}，重试 {retries}，降级字幕 {fallbacks}，无效响应 {invalid}",
                {
                  protocol: metrics.ai.protocol,
                  chunks: metrics.ai.chunkCount,
                  requests: metrics.ai.requestCount,
                  retries: metrics.ai.retryCount,
                  fallbacks: metrics.ai.fallbackCueCount,
                  invalid: metrics.ai.invalidResponseCount,
                }
              )}
            </Typography>
          )}
        </Paper>
      )}
    </Stack>
  );
}
