import {
  documentRecognitionSelection,
  documentOcrBlocks,
  documentRecognitionKey,
} from "../../libs/pdf/recognition";
import { runTranslationTasks } from "../../libs/translationTasks";
import TocDrawer from "./TocDrawer";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Card,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useFileTranslation } from "./State";
import { DEFAULT_FILE_TRANSLATE_SETTING } from "../../config";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { openPdf } from "../../libs/pdf/pdfDocument";
import {
  MissingDocumentModel,
  detectPdfLayout,
  parsePdfDocument,
} from "../../libs/pdf/pdfParser";
import { renderPdfRegion } from "../../libs/pdf/pdfDocument";
import { buildToc } from "../../libs/pdf/structure";
import {
  blockMarkdown,
  documentMarkdown,
  isTranslatableBlock,
  parseDocumentMarkdown,
  renderDocumentBlock,
  restoreDocumentBilingual,
  translateDocumentBlocks,
} from "../../libs/document/markdown";
import { exportDocument } from "../../libs/document/export";
import {
  DocumentAssetPreview,
  normalizeDocumentAssets,
} from "../../libs/document/assets";
import PdfPage from "./PdfPage";
import ReaderAlert from "./ReaderAlert";
import "katex/dist/katex.min.css";
import "./PdfWorkspace.css";

const sourceFragments = (block, ids) => {
  const anchors = block?.sourceAnchors || [];
  const body = anchors.filter(
    (anchor) =>
      !["formula", "inline-formula", "formula_number"].includes(anchor.type)
  );
  const selected = ids?.length
    ? anchors.filter((anchor) => ids.includes(anchor.id))
    : body.length
      ? body
      : ["formula", "inline-formula"].includes(block?.type)
        ? anchors
        : [];
  return (selected.length ? selected : block?.fragments || []).filter(
    (fragment) =>
      Number.isInteger(fragment.page) &&
      fragment.page > 0 &&
      fragment.bbox?.length === 4 &&
      fragment.bbox.every(Number.isFinite) &&
      fragment.bbox[2] > fragment.bbox[0] &&
      fragment.bbox[3] > fragment.bbox[1]
  );
};

function SourceToolbar({
  block,
  sourceIds,
  busy,
  connected,
  locate,
  recognizeImage,
  i18n,
}) {
  const [anchor, setAnchor] = useState(null);
  const fragments = sourceFragments(block, sourceIds),
    pages = [...new Set(fragments.map((fragment) => fragment.page))];
  const label = (key, fallback) => i18n?.(key, fallback) || fallback;
  if (!fragments.length && block.type !== "image") return null;
  return (
    <Paper
      className="kt-pdf-block-actions"
      elevation={2}
      onClick={(event) => event.stopPropagation()}
    >
      {block.type === "image" && (
        <Button
          size="small"
          disabled={busy || !connected}
          onClick={() => recognizeImage(block)}
        >
          {label("pdf_recognize_image_text", "识别图中文字")}
        </Button>
      )}
      {fragments.length > 0 && (
        <Button
          size="small"
          sx={{ whiteSpace: "nowrap" }}
          onClick={() => locate(block, undefined, sourceIds)}
        >
          {label("pdf_locate_source", "定位原文")} ·{" "}
          {label("pdf_source_page", "第 $1 页").replace("$1", pages.join(", "))}
        </Button>
      )}
      {pages.length > 1 && (
        <>
          <IconButton
            size="small"
            aria-label={label("pdf_locate_page", "选择原文页码")}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            <ExpandMoreRoundedIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
          >
            {pages.map((page) => (
              <MenuItem
                key={page}
                onClick={() => {
                  setAnchor(null);
                  locate(block, page, sourceIds);
                }}
              >
                {(i18n?.("pdf_source_page", "第 $1 页") || "第 $1 页").replace(
                  "$1",
                  String(page)
                )}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Paper>
  );
}

const PREF_KEY = "kiss_pdf_reader";
function preferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    return {
      tocWidth: Number.isFinite(stored.tocWidth)
        ? Math.max(180, Math.min(600, stored.tocWidth))
        : 270,
      sync: stored.sync === true,
    };
  } catch {
    return { tocWidth: 270, sync: false };
  }
}
const PdfWorkspace = forwardRef(function PdfWorkspace(
  {
    file,
    markdownContent,
    onChangeFile,
    onClear,
    onStateChange,
    hasLayoutService,
    activeLayoutApi,
    ignoreCache = false,
  },
  ref
) {
  const isPdf = markdownContent === undefined;
  const assetPreview = useRef(new DocumentAssetPreview());
  const [, updateAssetPreview] = useState(0);
  useLayoutEffect(() => {
    const registry = assetPreview.current;
    return () => registry.clear();
  }, [file]);
  const { context, client, connected, openSettings, i18n } =
    useFileTranslation();
  const kind = isPdf ? "pdf" : "markdown",
    scene = {
      ...DEFAULT_FILE_TRANSLATE_SETTING[kind],
      ...context.scenes[kind],
    };

  const effectiveHasLayoutService = useMemo(() => {
    if (typeof hasLayoutService === "boolean") return hasLayoutService;
    if (Array.isArray(context?.services)) {
      return context.services.some(
        (api) =>
          !api.isDisabled && api.enabledCapabilities?.includes("analyzeLayout")
      );
    }
    return true;
  }, [hasLayoutService, context?.services]);

  const effectiveLayoutApi = useMemo(() => {
    if (activeLayoutApi) return activeLayoutApi;
    if (Array.isArray(context?.services)) {
      const api = scene.layoutApiSlug
        ? context.services.find((api) => api.apiSlug === scene.layoutApiSlug)
        : context.services.find(
            (api) =>
              !api.isDisabled &&
              api.layoutAvailable !== false &&
              api.enabledCapabilities?.includes("analyzeLayout")
          );
      return api &&
        !api.isDisabled &&
        api.layoutAvailable !== false &&
        api.enabledCapabilities?.includes("analyzeLayout")
        ? api
        : null;
    }
    return null;
  }, [activeLayoutApi, context?.services, scene.layoutApiSlug]);
  const [localScene, setLocalScene] = useState(scene),
    [pref, setPref] = useState(preferences),
    [pdf, setPdf] = useState(null),
    [bookmarks, setBookmarks] = useState([]),
    [result, setResult] = useState(null),
    [blocks, setBlocks] = useState(() =>
      isPdf ? [] : parseDocumentMarkdown(markdownContent)
    ),
    [phase, setPhase] = useState("idle"),
    [translationBusy, setTranslationBusy] = useState(false),
    [automaticBusy, setAutomaticBusy] = useState(false),
    [translationProgress, setTranslationProgress] = useState(null),
    [progress, setProgress] = useState(null),
    [recognitionElapsed, setRecognitionElapsed] = useState(0),
    [error, setError] = useState(""),
    [missing, setMissing] = useState(""),
    [mode, setMode] = useState("source"),
    [view, setView] = useState("read"),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(new Set()),
    [drawer, setDrawer] = useState(false),
    [pageNumber, setPageNumber] = useState(1),
    [zoom, setZoom] = useState(1),
    [selected, setSelected] = useState(""),
    [notice, setNotice] = useState(""),
    [hoverBlock, setHoverBlock] = useState(null),
    [hoverSources, setHoverSources] = useState([]),
    [touchBlock, setTouchBlock] = useState(null),
    [locatedBlock, setLocatedBlock] = useState(null),
    [showWarnings, setShowWarnings] = useState(false),
    [password, setPassword] = useState(null),
    [passwordText, setPasswordText] = useState(""),
    [pageWidth, setPageWidth] = useState(500),
    [layoutRegions, setLayoutRegions] = useState({}),
    [layoutComplete, setLayoutComplete] = useState(false),
    [showLayoutAreas, setShowLayoutAreas] = useState(false);
  const tocToggleRef = useRef(null),
    pdfScroll = useRef(null),
    mdScroll = useRef(null),
    abortRef = useRef(null),
    reader = useRef(null),
    resultRef = useRef(null),
    blocksRef = useRef(blocks),
    translationRun = useRef(null),
    automaticRun = useRef(null),
    enqueueTranslation = useRef(null),
    mounted = useRef(false),
    operation = useRef(0),
    syncOwner = useRef(null),
    suppressUntil = useRef(0),
    highlightTimer = useRef(null),
    raf = useRef(null),
    anchor = useRef(null);
  const hasLayoutResult = Boolean(Object.keys(layoutRegions).length);
  const busy =
    ["opening", "parsing", "translating", "detecting"].includes(phase) ||
    translationBusy ||
    automaticBusy;
  blocksRef.current = blocks;
  const config = { ...scene, ...localScene };
  useEffect(() => {
    if (
      !isPdf &&
      /!\[[^\]]*\]\((?!https?:|data:|blob:|\/\/)[^)]+\)/i.test(markdownContent)
    )
      setNotice(
        "Markdown 引用了相对图片路径，单文件上传无法读取这些图片；本轮不支持文件夹上传。"
      );
  }, [isPdf, markdownContent]);
  useEffect(() => {
    setLocalScene(scene);
  }, [context.scenes, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(pref));
    } catch {}
  }, [pref]);
  useEffect(() => {
    if (!isPdf) return;
    const observer = new ResizeObserver(
      (entries) =>
        entries[0].contentRect.width > 0 &&
        setPageWidth(entries[0].contentRect.width)
    );
    observer.observe(pdfScroll.current);
    return () => observer.disconnect();
  }, [isPdf]);
  useEffect(() => {
    setDrawer(false);
    setHoverBlock(null);
    setHoverSources([]);
    setTouchBlock(null);
    setLocatedBlock(null);
    mounted.current = true;
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    if (isPdf) {
      setLayoutRegions({});
      setLayoutComplete(false);
      setShowLayoutAreas(false);
      setPhase("opening");
      openPdf(
        file,
        (updatePassword, incorrect) => {
          if (mounted.current)
            setPassword({ update: updatePassword, incorrect });
        },
        abort.signal
      )
        .then((doc) => {
          if (!mounted.current || operation.current !== version) {
            doc.destroy();
            return;
          }
          reader.current = doc;
          setPdf(doc.pdf);
          setBookmarks(doc.bookmarks);
          setPhase("idle");
        })
        .catch((e) => {
          if (mounted.current && !abort.signal.aborted) {
            setError(e.message);
            setPhase("idle");
          }
        });
    }
    return () => {
      mounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++operation.current;
      abortRef.current?.abort();
      translationRun.current?.abort.abort();
      if (automaticRun.current) automaticRun.current.cancelled = true;
      translationRun.current = null;
      automaticRun.current = null;
      enqueueTranslation.current = null;
      setTranslationBusy(false);
      setAutomaticBusy(false);
      reader.current?.destroy();
      reader.current = null;
      clearTimeout(highlightTimer.current);
      cancelAnimationFrame(raf.current);
      setLayoutRegions({});
      setLayoutComplete(false);
      setShowLayoutAreas(false);
    };
  }, [file, isPdf]);
  useEffect(() => {
    if (
      !connected &&
      (["parsing", "translating"].includes(phase) || translationBusy) &&
      (translationBusy || !(phase === "parsing" && config.parseMode === "fast"))
    ) {
      abortRef.current?.abort();
      translationRun.current?.abort.abort();
      if (automaticRun.current) automaticRun.current.cancelled = true;
      setNotice("扩展连接已断开，已保留完成内容；请重新连接后继续。");
    }
  }, [connected, phase, config.parseMode, translationBusy]);
  const irBlocks = useMemo(
    () => result?.ir?.blocks || result?.pageBlocks?.flat() || [],
    [result]
  );
  const toc = useMemo(
    () => buildToc(bookmarks, irBlocks, pdf?.numPages || 0),
    [bookmarks, irBlocks, pdf]
  );
  const activeToc = toc.filter((e) => e.page <= pageNumber).at(-1)?.id;
  const warnings = result?.warnings || [],
    failed = blocks.filter((b) => b.status === "error");
  const progressStageKey = {
    识别区域: "pdf_recognizing_region",
    恢复正文: "pdf_restore_native",
    恢复结构: "pdf_restore_structure",
    缓存命中: "file_cache_hit",
  }[progress?.stage];
  const progressStage =
    i18n?.(progressStageKey, progress?.stage) || progress?.stage;
  const regionLabel = {
    "inline-formula": ["pdf_inline_formula", "行内公式"],
    formula: ["pdf_formula", "公式"],
    table: ["pdf_table", "表格"],
    image: ["pdf_image", "图片"],
  }[progress?.regionType] || ["pdf_text_region", "文字区域"];
  const capabilities = client?.session?.capabilities || [];
  useLayoutEffect(() => {
    const registry = assetPreview.current;
    const changedFile = registry.file && registry.file !== file;
    registry.file = file;
    const assets = changedFile ? [] : result?.assets || [];
    if (changedFile) {
      resultRef.current = null;
      setResult(null);
      setBlocks(isPdf ? [] : parseDocumentMarkdown(markdownContent));
    }
    const release = assetPreview.current.sync(assets);
    if (assets.some((asset) => asset.url)) {
      const normalized = normalizeDocumentAssets(result, assets);
      resultRef.current = normalized;
      setResult(normalized);
      setBlocks((current) => normalizeDocumentAssets(current, assets));
    }
    updateAssetPreview((version) => version + 1);
    const restored = blocksRef.current.map(restoreDocumentBilingual);
    if (restored.some((block, index) => block !== blocksRef.current[index]))
      publishBlocks(restored);
    const timer = setTimeout(release, 0);
    return () => {
      clearTimeout(timer);
      release();
    };
    // Asset identity, rather than each progress snapshot, controls URL allocation.
  }, [result?.assets, file, isPdf, markdownContent]); // eslint-disable-line react-hooks/exhaustive-deps
  const publishBlocks = (next) => {
    next = next.map(restoreDocumentBilingual);
    blocksRef.current = next;
    if (resultRef.current)
      resultRef.current = { ...resultRef.current, blocks: next };
    setBlocks(next);
  };
  const retainTranslations = (next, previous = blocksRef.current) =>
    next && {
      ...next,
      blocks: next.blocks.map((block) => {
        const old = previous.find(
          (item) => item.id === block.id && item.raw === block.raw
        );
        return old
          ? {
              ...block,
              status: old.status,
              targetRaw: old.targetRaw,
              bilingualRaw: old.bilingualRaw,
              targetAst: old.targetAst,
              bilingualAst: old.bilingualAst,
              translationKey: old.translationKey,
              error: old.error,
              bilingualVersion: old.bilingualVersion,
              translationRepairRequired: old.translationRepairRequired,
            }
          : block;
      }),
    };
  const commit = (next) => {
    next = retainTranslations(normalizeDocumentAssets(next, next.assets));
    resultRef.current = next;
    setResult(next);
    publishBlocks(next.blocks);
    enqueueTranslation.current?.(next);
    return next;
  };
  const settingsKey = JSON.stringify({
    fromLang: config.fromLang,
    toLang: config.toLang,
    apiSlug: config.apiSlug,
    promptSlug: config.promptSlug,
  });
  const readyBlock = (block, current = resultRef.current) =>
    !isPdf ||
    block.translationReady === true ||
    (block.translationReady === undefined &&
      current?.complete &&
      !block.pendingSourceIds?.length);
  const pendingTranslation = (block) =>
    readyBlock(block) &&
    isTranslatableBlock(block) &&
    (ignoreCache ||
      block.translationKey !== settingsKey ||
      block.status !== "done");
  const readyCount = blocks.filter(pendingTranslation).length;
  const canTranslate =
    connected &&
    !translationBusy &&
    !automaticBusy &&
    !["opening", "detecting"].includes(phase) &&
    readyCount > 0;
  const recognitionStartedAt = progress?.startedAt;
  useEffect(() => {
    setRecognitionElapsed(0);
    if (phase !== "parsing" || !recognitionStartedAt) return;
    const timer = setInterval(
      () => setRecognitionElapsed(Date.now() - recognitionStartedAt),
      1000
    );
    return () => clearInterval(timer);
  }, [phase, recognitionStartedAt]);
  const cancelOperation = () => {
    clearSourceHighlight();
    abortRef.current?.abort();
    translationRun.current?.abort.abort();
    if (automaticRun.current) automaticRun.current.cancelled = true;
    publishBlocks(
      blocksRef.current.map((block) =>
        block.status === "busy" ? { ...block, status: "idle" } : block
      )
    );
    setProgress(null);
    setTranslationProgress(null);
  };
  const parse = async (
    reset = false,
    retryRegion,
    regions = layoutComplete ? layoutRegions : {}
  ) => {
    if (!pdf || busy) return;
    if (config.parseMode === "smart") {
      if (!connected || !capabilities.includes("doc")) {
        setError("Smart 需要支持 DOC 的新版扩展；可切换 Fast。");
        return;
      }
      if (!effectiveHasLayoutService && !Object.keys(regions).length) {
        setError(
          i18n
            ? i18n(
                "layout_service_empty",
                "未配置界面分析服务（请在服务配置中添加）"
              )
            : "未配置界面分析服务（请在服务配置中添加）"
        );
        return;
      }
    }
    const savedTranslations = blocksRef.current;
    if (reset) {
      const previous = resultRef.current;
      resultRef.current = previous
        ? {
            ...previous,
            pageBlocks: [],
            completedPages: [],
            warnings: [],
            blocks: [],
            complete: false,
            cache: previous.cache,
          }
        : null;
      publishBlocks([]);
      setResult(null);
    }
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    setPhase("parsing");
    setError("");
    setMissing("");
    setNotice("");
    enqueueTranslation.current?.(resultRef.current);
    try {
      const targetLayoutModel =
        effectiveLayoutApi?.modelRef || config.layoutModel;
      const targetLayoutDevice =
        effectiveLayoutApi?.device || config.layoutDevice;
      const next = await parsePdfDocument(pdf, {
        ...config,
        mode: config.parseMode,
        layoutModel: targetLayoutModel,
        layoutServiceId: effectiveLayoutApi?.apiSlug || config.layoutApiSlug,
        layoutDevice: targetLayoutDevice,
        enableJev: config.enableJev === "true",
        client,
        models: context.models,
        services: context.services,
        signal: abort.signal,
        previous: resultRef.current,
        retryRegion,
        cacheMode: ignoreCache ? "refresh" : undefined,
        layoutRegions: regions,
        onProgress: (p, partial) => {
          if (
            mounted.current &&
            operation.current === version &&
            !abort.signal.aborted
          ) {
            setProgress(p);
            if (partial)
              commit(
                retainTranslations(partial, [
                  ...blocksRef.current,
                  ...savedTranslations,
                ])
              );
            if (partial?.layoutRegions) setLayoutRegions(partial.layoutRegions);
          }
        },
      });
      if (
        mounted.current &&
        operation.current === version &&
        !abort.signal.aborted
      ) {
        const retained = commit(
          retainTranslations(next, [...blocksRef.current, ...savedTranslations])
        );
        if (next?.layoutRegions && Object.keys(next.layoutRegions).length) {
          setLayoutComplete(true);
          setLayoutRegions((prev) => {
            const merged = { ...next.layoutRegions };
            for (const [pNo, regs] of Object.entries(prev)) {
              if (merged[pNo]) {
                const prevMap = new Map(regs.map((r) => [r.id, r.enabled]));
                merged[pNo] = merged[pNo].map((r) =>
                  prevMap.has(r.id) ? { ...r, enabled: prevMap.get(r.id) } : r
                );
              }
            }
            return merged;
          });
          setShowLayoutAreas(true);
        }
        if (
          !automaticRun.current &&
          !translationRun.current &&
          !blocksRef.current.some(
            (block) => block.status === "done" && block.targetRaw !== undefined
          )
        )
          setMode("source");
        return retained;
      }
    } catch (e) {
      if (mounted.current && operation.current === version) {
        if (e.partial) commit(e.partial);
        if (e instanceof MissingDocumentModel) setMissing(e.modelId);
        else if (!abort.signal.aborted) setError(e.message);
      }
    } finally {
      if (mounted.current && operation.current === version) {
        setPhase("idle");
        setProgress(null);
      }
    }
  };
  const translate = async (onlyId, parsedResult, automatic = false) => {
    if (
      !connected ||
      translationRun.current ||
      (!automatic && automaticRun.current) ||
      ["opening", "detecting"].includes(phase)
    )
      return;
    const current = parsedResult || resultRef.current;
    const requested = typeof onlyId === "string" ? [onlyId] : onlyId;
    const targetBlocks = (parsedResult?.blocks || blocksRef.current)
      .filter(
        (block) =>
          readyBlock(block, current) &&
          (!Array.isArray(requested) || requested.includes(block.id)) &&
          isTranslatableBlock(block) &&
          (ignoreCache ||
            block.translationKey !== settingsKey ||
            block.status !== "done")
      )
      .map((block) => ({ ...block }));
    if (!targetBlocks.length) return;
    const version = operation.current,
      abort = new AbortController(),
      run = { abort };
    translationRun.current = run;
    const valid = () =>
      mounted.current &&
      operation.current === version &&
      translationRun.current === run &&
      !abort.signal.aborted;
    const publish = () => {
      if (!valid()) return;
      publishBlocks(
        blocksRef.current.map((block) => {
          const translated = targetBlocks.find(
            (item) => item.id === block.id && item.raw === block.raw
          );
          return translated
            ? {
                ...block,
                status: translated.status,
                targetRaw: translated.targetRaw,
                bilingualRaw: translated.bilingualRaw,
                targetAst: translated.targetAst,
                bilingualAst: translated.bilingualAst,
                translationKey: translated.translationKey,
                error: translated.error,
                bilingualVersion: translated.bilingualVersion,
                translationRepairRequired: translated.translationRepairRequired,
              }
            : block;
        })
      );
    };
    setTranslationBusy(true);
    if (!automatic) setError("");
    setMode("bilingual");
    try {
      for (const block of targetBlocks) {
        if (block.translationKey !== settingsKey) {
          block.status = "idle";
          delete block.targetRaw;
          delete block.bilingualRaw;
          delete block.targetAst;
          delete block.bilingualAst;
        }
        block.translationKey = settingsKey;
      }
      const failedIds = new Set(
        targetBlocks
          .filter(
            (block) =>
              block.status === "error" || block.translationRepairRequired
          )
          .map((block) => block.id)
      );
      if (ignoreCache)
        targetBlocks.forEach((block) => {
          block.status = "idle";
        });
      await translateDocumentBlocks(
        targetBlocks,
        async (text, signal, block) => {
          const pieces = []; // Keep each bridge request within its existing text limit.
          for (let start = 0; start < text.length; ) {
            let end = Math.min(start + 12000, text.length);
            if (end < text.length) {
              const boundary = text.lastIndexOf(" ", end);
              if (boundary > start + 6000) end = boundary;
            }
            pieces.push(text.slice(start, end));
            start = end;
          }
          const translated = await runTranslationTasks(
            pieces.map((piece) => async (signal) => {
              const out = await client.request(
                "translateText",
                {
                  text: piece,
                  kind,
                  ...((ignoreCache || failedIds.has(block?.id)) && {
                    cacheMode: "refresh",
                  }),
                  scene: {
                    fromLang: config.fromLang,
                    toLang: config.toLang,
                    apiSlug: config.apiSlug,
                    promptSlug: config.promptSlug,
                    textStyle: config.textStyle,
                  },
                },
                { signal }
              );
              return out.text;
            }),
            signal
          );
          return translated.join("");
        },
        abort.signal,
        (done, total) => {
          if (valid()) {
            publish();
            setTranslationProgress({ done, total });
          }
        }
      );
    } catch (e) {
      if (valid()) setError(e.message);
    } finally {
      if (
        mounted.current &&
        operation.current === version &&
        translationRun.current === run
      ) {
        if (abort.signal.aborted)
          targetBlocks.forEach((block) => {
            if (block.status === "busy") block.status = "idle";
          });
        // Cancellation preserves successful blocks but suppresses delayed request results.
        if (!abort.signal.aborted)
          publishBlocks(
            blocksRef.current.map((block) => {
              const translated = targetBlocks.find(
                (item) => item.id === block.id && item.raw === block.raw
              );
              return translated
                ? {
                    ...block,
                    status: translated.status,
                    targetRaw: translated.targetRaw,
                    bilingualRaw: translated.bilingualRaw,
                    targetAst: translated.targetAst,
                    bilingualAst: translated.bilingualAst,
                    translationKey: translated.translationKey,
                    error: translated.error,
                    bilingualVersion: translated.bilingualVersion,
                    translationRepairRequired:
                      translated.translationRepairRequired,
                  }
                : block;
            })
          );
        translationRun.current = null;
        setTranslationBusy(false);
        setTranslationProgress(null);
      }
    }
  };
  const recognizeImage = async (block) => {
    if (busy || !connected) return;
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    setPhase("parsing");
    setError("");
    setProgress({
      stage: "识别图中文字",
      page: block.fragments[0].page,
      regionId: undefined,
      regionType: "image",
      done: 0,
      total: 1,
    });
    try {
      const fragment = block.fragments[0],
        page = await pdf.getPage(fragment.page),
        blob = await renderPdfRegion(page, fragment.bbox, abort.signal, 2);
      const selection = documentRecognitionSelection(
        "doc",
        config.recognitionService,
        config.visionServiceSlug
      );
      const response = await client.recognize(blob, selection, abort.signal, {
        taskMode: "doc",
        promptSlug: config.vlmPromptSlug,
        cacheMode: ignoreCache ? "refresh" : undefined,
        onProgress: (event) => {
          if (
            mounted.current &&
            operation.current === version &&
            !abort.signal.aborted
          )
            setProgress({
              stage: event.type === "cache-hit" ? "缓存命中" : "识别图中文字",
              page: block.fragments[0].page,
              regionId: event.type === "inference" ? block.regionId : undefined,
              regionType: "image",
              ...(event.type === "inference" && { startedAt: Date.now() }),
              done: 0,
              total: 1,
            });
        },
      });
      if (
        !abort.signal.aborted &&
        mounted.current &&
        operation.current === version
      ) {
        if (!response.text?.trim()) throw new Error("图中文字识别结果为空");
        const located =
          selection.capability === "recognizeText"
            ? documentOcrBlocks(
                response,
                fragment.bbox,
                fragment.page,
                `${block.id}-recognized`
              )
            : null;
        const associated = (
          located ||
          parseDocumentMarkdown(response.text, `${block.id}-recognized`)
        ).map((b) => ({
          ...b,
          fragments: located ? b.fragments : block.fragments,
          associatedImageId: block.id,
        }));
        setBlocks((prev) =>
          prev
            .filter((b) => b.associatedImageId !== block.id)
            .flatMap((b) => (b.id === block.id ? [b, ...associated] : [b]))
        );
      }
    } catch (e) {
      if (
        mounted.current &&
        operation.current === version &&
        !abort.signal.aborted
      )
        setError(e.message);
    } finally {
      if (mounted.current && operation.current === version) {
        setPhase("idle");
        setProgress(null);
      }
    }
  };
  const scrollPdf = useCallback((fragment) => {
    const container = pdfScroll.current,
      element = container?.querySelector(`[data-pdf-page="${fragment.page}"]`);
    if (!element) return;
    const scale = Number(element.dataset.scale);
    container.scrollTo({
      top: element.offsetTop + fragment.bbox[1] * scale - 40,
    });
    setPageNumber(fragment.page);
  }, []);
  const scrollMd = useCallback((id) => {
    const container = mdScroll.current,
      element = container?.querySelector(`[data-document-block="${id}"]`);
    if (element) container.scrollTo({ top: element.offsetTop - 12 });
  }, []);
  const highlight = sourceFragments(
    blocks.find((block) => block.id === (locatedBlock?.id || hoverBlock)),
    locatedBlock ? locatedBlock.sourceIds : hoverSources
  ).filter(
    (fragment) =>
      locatedBlock?.page === undefined || fragment.page === locatedBlock.page
  );
  const clearSourceHighlight = () => {
    setHoverBlock(null);
    setHoverSources([]);
    setTouchBlock(null);
    setLocatedBlock(null);
    clearTimeout(highlightTimer.current);
  };
  useEffect(() => {
    if (["parsing", "detecting"].includes(phase)) {
      setHoverBlock(null);
      setHoverSources([]);
      setTouchBlock(null);
      setLocatedBlock(null);
      clearTimeout(highlightTimer.current);
    }
  }, [phase]);
  useEffect(() => {
    if (!touchBlock) return;
    const dismiss = (event) => {
      if (
        event.target.closest?.("[data-document-block]")?.dataset
          .documentBlock !== touchBlock &&
        !event.target.closest?.(".MuiMenu-root")
      ) {
        setTouchBlock((current) => (current === touchBlock ? null : current));
        setHoverBlock((current) => (current === touchBlock ? null : current));
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [touchBlock]);
  const hoveredSources = (block, target) => {
    const ids =
      target
        ?.closest?.("[data-pdf-source]")
        ?.getAttribute("data-pdf-source")
        ?.split(" ") || [];
    return ids.filter((id) =>
      block.sourceAnchors?.some((anchor) => anchor.id === id)
    );
  };
  const activateBlock = (block, target) => {
    if (target?.closest?.(".kt-pdf-block-actions,.MuiMenu-root")) return;
    const sourceIds = hoveredSources(block, target);
    setHoverBlock(block.id);
    setHoverSources(sourceIds);
    setLocatedBlock((current) =>
      current?.id === block.id &&
      (current.sourceIds || []).join(" ") === sourceIds.join(" ")
        ? current
        : null
    );
  };
  const locate = (block, page, sourceIds) => {
    const fragment = sourceFragments(block, sourceIds).find(
      (fragment) => page === undefined || fragment.page === page
    );
    if (!fragment) return;
    suppressUntil.current = performance.now() + 500;
    scrollPdf(fragment);
    setLocatedBlock({ id: block.id, page, sourceIds });
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setLocatedBlock(null), 2000);
  };
  const navigate = (entry) => {
    suppressUntil.current = performance.now() + 500;
    setSelected(entry.id);
    scrollPdf({ page: entry.page, bbox: [0, entry.y, 0, entry.y] });
    if (entry.blockId) {
      scrollMd(entry.blockId);
      setNotice("");
    } else setNotice("该目录位置暂无对应 Markdown 内容。");
  };
  const visibleMd = () => {
    const container = mdScroll.current;
    if (!container) return null;
    return [...container.querySelectorAll("[data-document-block]")].find(
      (el) => el.offsetTop + el.offsetHeight > container.scrollTop + 25
    )?.dataset.documentBlock;
  };
  const changeMode = (next) => {
    if (!next) return;
    anchor.current = visibleMd();
    setMode(next);
  };
  useLayoutEffect(() => {
    if (anchor.current) {
      scrollMd(anchor.current);
      anchor.current = null;
    }
  }, [mode, view, scrollMd]);
  const scroll = (pane) => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      if (pane === "pdf") {
        const container = pdfScroll.current,
          element = [...container.querySelectorAll("[data-pdf-page]")].find(
            (el) => el.offsetTop + el.offsetHeight > container.scrollTop + 60
          );
        if (!element) return;
        const page = Number(element.dataset.pdfPage),
          y = Math.max(
            0,
            (container.scrollTop - element.offsetTop + 60) /
              Number(element.dataset.scale)
          );
        setPageNumber(page);
        const active = toc
          .filter((e) => e.page < page || (e.page === page && e.y <= y + 20))
          .at(-1);
        if (active) setSelected(active.id);
        if (
          pref.sync &&
          view === "read" &&
          syncOwner.current === pane &&
          performance.now() > suppressUntil.current
        ) {
          const block = blocks.find((b) =>
            b.fragments.some((f) => f.page === page && f.bbox[3] >= y)
          );
          if (block) {
            suppressUntil.current = performance.now() + 120;
            scrollMd(block.id);
          }
        }
      } else if (
        pref.sync &&
        view === "read" &&
        syncOwner.current === pane &&
        performance.now() > suppressUntil.current
      ) {
        const id = visibleMd(),
          block = blocks.find((b) => b.id === id);
        if (block?.fragments[0]) {
          suppressUntil.current = performance.now() + 120;
          scrollPdf(block.fragments[0]);
        }
      }
    });
  };
  const download = async (format) => {
    try {
      setError("");
      await exportDocument(
        blocks,
        mode,
        warnings,
        result?.assets,
        file.name.replace(/\.[^.]+$/, ""),
        format
      );
    } catch (e) {
      setError(e.message);
    }
  };

  const detectLayout = async () => {
    if (!pdf || busy) return;
    if (!effectiveHasLayoutService) {
      setError(
        i18n
          ? i18n(
              "layout_service_empty",
              "未配置界面分析服务（请在服务配置中添加）"
            )
          : "未配置界面分析服务（请在服务配置中添加）"
      );
      return;
    }
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    const regionKey = (page, region) =>
      JSON.stringify([
        page,
        region.type,
        region.bbox.map((v) => Math.round(v * 10) / 10),
      ]);
    const previousChoices = new Map(
      Object.entries(layoutRegions).flatMap(([page, regions]) =>
        regions.map((region) => [regionKey(page, region), region.enabled])
      )
    );
    const restoreChoices = (pages) =>
      Object.fromEntries(
        Object.entries(pages).map(([page, regions]) => [
          page,
          regions.map((region) => ({
            ...region,
            enabled: previousChoices.get(regionKey(page, region)) ?? true,
          })),
        ])
      );
    setPhase("detecting");
    setLayoutComplete(false);
    setLayoutRegions({});
    setShowLayoutAreas(true);
    setError("");
    setMissing("");
    setNotice("");
    try {
      const targetLayoutModel =
        effectiveLayoutApi?.modelRef || config.layoutModel;
      const targetLayoutDevice =
        effectiveLayoutApi?.device || config.layoutDevice;
      const regions = await detectPdfLayout(pdf, {
        ...config,
        layoutModel: targetLayoutModel,
        layoutServiceId: effectiveLayoutApi?.apiSlug || config.layoutApiSlug,
        layoutDevice: targetLayoutDevice,
        client,
        models: context.models,
        services: context.services,
        cacheMode: ignoreCache ? "refresh" : undefined,
        signal: abort.signal,
        onProgress: (p, partialRegions) => {
          if (
            mounted.current &&
            operation.current === version &&
            !abort.signal.aborted
          ) {
            setProgress(p);
            if (partialRegions)
              setLayoutRegions(restoreChoices(partialRegions));
          }
        },
      });
      if (
        mounted.current &&
        operation.current === version &&
        !abort.signal.aborted
      ) {
        const selectedRegions = restoreChoices(regions);
        setLayoutRegions(selectedRegions);
        if (resultRef.current) {
          resultRef.current = {
            ...resultRef.current,
            complete: false,
            completedPages: [],
          };
          setResult(resultRef.current);
        }
        setLayoutComplete(true);
        setShowLayoutAreas(true);
        setNotice("布局检测完成，可在线框上点击切换是否识别该区域");
        return selectedRegions;
      }
    } catch (e) {
      if (mounted.current && operation.current === version) {
        if (e instanceof MissingDocumentModel) setMissing(e.modelId);
        else if (!abort.signal.aborted) setError(e.message);
      }
    } finally {
      if (mounted.current && operation.current === version) {
        setPhase("idle");
        setProgress(null);
      }
    }
  };

  const toggleRegion = useCallback((pageNo, regionId) => {
    if (resultRef.current) {
      resultRef.current = {
        ...resultRef.current,
        complete: false,
        completedPages: [],
      };
      setResult(resultRef.current);
    }
    setLayoutRegions((prev) => {
      const pageList = prev[pageNo] || [];
      return {
        ...prev,
        [pageNo]: pageList.map((r) =>
          r.id === regionId
            ? { ...r, enabled: r.enabled === false ? true : false }
            : r
        ),
      };
    });
  }, []);

  const recognizeText = async () => {
    if (busy) return;
    return await parse(true);
  };

  const oneClickTranslate = async () => {
    if (busy || automaticRun.current) return;
    const run = {
      cancelled: false,
      attempted: new Set(),
      promise: Promise.resolve(),
      pumping: false,
    };
    automaticRun.current = run;
    setAutomaticBusy(true);
    const pump = () => {
      if (run.pumping || run.cancelled || automaticRun.current !== run)
        return run.promise;
      run.pumping = true;
      run.promise = (async () => {
        while (!run.cancelled && automaticRun.current === run) {
          const candidates = blocksRef.current.filter(
            (block) =>
              !block.translationRepairRequired &&
              pendingTranslation(block) &&
              !run.attempted.has(`${block.id}\0${block.raw}`)
          );
          if (!candidates.length) break;
          const page = candidates[0].fragments?.[0]?.page;
          const batch = candidates.filter(
            (block) => block.fragments?.[0]?.page === page
          );
          batch.forEach((block) =>
            run.attempted.add(`${block.id}\0${block.raw}`)
          );
          await translate(
            batch.map((block) => block.id),
            undefined,
            true
          );
        }
      })().finally(() => {
        run.pumping = false;
      });
      return run.promise;
    };
    enqueueTranslation.current = pump;
    try {
      let currentRegions = layoutRegions;
      if (config.parseMode === "smart" && (!layoutComplete || ignoreCache)) {
        if (!effectiveHasLayoutService) {
          setError(
            i18n?.(
              "layout_service_empty",
              "未配置界面分析服务（请在服务配置中添加）"
            ) || "未配置界面分析服务（请在服务配置中添加）"
          );
          return;
        }
        currentRegions = await detectLayout();
        if (!currentRegions || run.cancelled) return;
      }
      const currentResult = resultRef.current;
      if (
        ignoreCache ||
        !currentResult?.complete ||
        (isPdf &&
          currentResult.recognitionKey !==
            documentRecognitionKey({ ...config, services: context.services }))
      )
        await parse(ignoreCache, undefined, currentRegions);
      if (!run.cancelled) await pump();
      await run.promise;
    } finally {
      if (automaticRun.current === run) {
        automaticRun.current = null;
        enqueueTranslation.current = null;
        if (mounted.current) setAutomaticBusy(false);
      }
    }
  };

  const parseAndTranslate = oneClickTranslate;

  const translateCurrentPage = () => {
    const pageBlocks = blocksRef.current.filter(
      (b) =>
        pendingTranslation(b) && b.fragments?.some((f) => f.page === pageNumber)
    );
    if (!pageBlocks.length) {
      setNotice(`第 ${pageNumber} 页暂无可翻译的文本段落`);
      return;
    }
    translate(pageBlocks.map((b) => b.id));
  };

  useImperativeHandle(ref, () => ({
    translate: (onlyId) => translate(onlyId),
    parse: (reset, retryRegion) => parse(reset, retryRegion),
    detectLayout,
    recognizeText,
    oneClickTranslate,
    parseAndTranslate,
    download: (format) => download(format),
    abort: cancelOperation,
    getPdf: () => pdf,
    getBlocks: () => blocks,
    getResult: () => result,
    getPhase: () => phase,
    getProgress: () => progress,
    isBusy: () => busy,
    hasLayoutResult: layoutComplete && hasLayoutResult,
    showLayoutAreas,
    setShowLayoutAreas,
    toggleRegion,
  }));

  useEffect(() => {
    onStateChange?.({
      phase,
      progress,
      pdf,
      result,
      blocks,
      busy,
      recognitionBusy: phase === "parsing",
      translationBusy,
      automaticBusy,
      translationProgress,
      completedPages: result?.completedPages || [],
      readyCount,
      canTranslate,
      failedCount: blocks.filter((b) => b.status === "error").length,
      hasLayoutResult: layoutComplete && hasLayoutResult,
      showLayoutAreas,
    });
  }, [
    phase,
    progress,
    pdf,
    result,
    blocks,
    busy,
    translationBusy,
    automaticBusy,
    translationProgress,
    readyCount,
    canTranslate,
    layoutRegions,
    layoutComplete,
    hasLayoutResult,
    showLayoutAreas,
    onStateChange,
  ]);
  const tocPane = (
    <Card
      variant="outlined"
      className="kt-pdf-toc"
      sx={{ borderRadius: 0, bgcolor: "background.paper" }}
    >
      <Stack
        className="kt-pdf-column-header"
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ borderBottom: "1px solid", borderColor: "divider", gap: 1 }}
      >
        <MenuBookRoundedIcon sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          目录 ({toc.length})
        </Typography>
      </Stack>
      <TextField
        size="small"
        placeholder="搜索目录"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <SearchRoundedIcon
              sx={{ fontSize: 16, mr: 0.5, color: "text.secondary" }}
            />
          ),
        }}
        sx={{ m: 1, "& .MuiInputBase-input": { py: 0.5, fontSize: 12 } }}
      />
      <Box sx={{ overflow: "auto", flex: 1, p: 0.5 }}>
        {toc.map((entry, index) => {
          if (query && !entry.title.toLowerCase().includes(query.toLowerCase()))
            return null;
          let ancestorDepth = entry.depth;
          const ancestors = toc
            .slice(0, index)
            .reverse()
            .filter((e) => {
              if (e.depth >= ancestorDepth) return false;
              ancestorDepth = e.depth;
              return true;
            });
          const hidden = !query && ancestors.some((e) => expanded.has(e.id)),
            children = toc[index + 1]?.depth > entry.depth;
          if (hidden) return null;
          return (
            <Box
              key={entry.id}
              sx={{
                display: "flex",
                alignItems: "center",
                pl: entry.depth * 1.2,
              }}
            >
              {children && (
                <IconButton
                  size="small"
                  sx={{ p: 0.25, mr: 0.25 }}
                  aria-label={`展开或收起 ${entry.title}`}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(entry.id)
                        ? next.delete(entry.id)
                        : next.add(entry.id);
                      return next;
                    })
                  }
                >
                  {expanded.has(entry.id) ? (
                    <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              )}
              <ListItemButton
                selected={(selected || activeToc) === entry.id}
                sx={{ py: 0.5, px: 1, minWidth: 0, borderRadius: 1, mb: 0.25 }}
                onClick={() => navigate(entry)}
              >
                <ListItemText
                  primary={entry.title}
                  primaryTypographyProps={{
                    fontSize: entry.depth ? 12 : 12.5,
                    fontWeight:
                      (selected || activeToc) === entry.id
                        ? 700
                        : entry.depth
                          ? 400
                          : 500,
                    noWrap: true,
                    color: (theme) =>
                      (selected || activeToc) === entry.id &&
                      theme.palette.mode !== "dark"
                        ? theme.palette.primary.main
                        : theme.palette.text.primary,
                  }}
                />
              </ListItemButton>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
  return (
    <Box className="kt-pdf-workspace">
      {error && (
        <ReaderAlert
          severity="error"
          onClose={() => setError("")}
          sx={{ mb: 1.5 }}
        >
          {error}
        </ReaderAlert>
      )}
      {missing && (
        <ReaderAlert
          severity="warning"
          sx={{ mb: 1.5 }}
          action={
            <Button onClick={() => openSettings("local-ai")}>安装模型</Button>
          }
        >
          缺少 {missing}。安装后继续，或明确切换 Fast。
        </ReaderAlert>
      )}
      <Box
        className="kt-pdf-reading"
        sx={{ flexDirection: { xs: "column", md: "row" }, gap: 1.5 }}
      >
        {isPdf && (
          <Card
            variant="outlined"
            className="kt-pdf-column"
            sx={{
              flex: "1 1 0",
              position: "relative",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          >
            <Stack
              className="kt-pdf-column-header"
              sx={{
                borderBottom: "1px solid",
                borderColor: "divider",
                "& .MuiTypography-root": { fontSize: 13 },
                "& .MuiToggleButton-root": { fontSize: 12, px: 1, py: 0.5 },
                "& .MuiFormControlLabel-label": { fontSize: 12 },
              }}
              direction="row"
              gap={1}
              alignItems="center"
              flexWrap="nowrap"
            >
              <Tooltip title={drawer ? "折叠目录" : "展开目录"}>
                <IconButton
                  ref={tocToggleRef}
                  size="small"
                  aria-label={drawer ? "折叠目录" : "展开目录"}
                  aria-expanded={drawer}
                  onClick={() => setDrawer((value) => !value)}
                  color={drawer ? "primary" : "default"}
                  sx={{
                    p: 0.5,
                    borderRadius: 1,
                    bgcolor: drawer ? "action.selected" : "transparent",
                  }}
                >
                  <MenuRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Typography fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
                PDF 原文
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Tooltip title="上一页">
                  <span>
                    <IconButton
                      size="small"
                      disabled={pageNumber <= 1}
                      onClick={() => {
                        const next = Math.max(1, pageNumber - 1);
                        setPageNumber(next);
                        scrollPdf({ page: next, bbox: [0, 0, 0, 0] });
                      }}
                      sx={{ p: 0.5 }}
                    >
                      <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <TextField
                  type="number"
                  size="small"
                  value={pageNumber}
                  inputProps={{
                    min: 1,
                    max: pdf?.numPages,
                    "aria-label": "页码",
                  }}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= pdf?.numPages) {
                      setPageNumber(n);
                      scrollPdf({ page: n, bbox: [0, 0, 0, 0] });
                    }
                  }}
                  sx={{
                    width: 52,
                    "& input": { py: 0.4, fontSize: 12, textAlign: "center" },
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 12,
                    color: "text.secondary",
                    whiteSpace: "nowrap",
                  }}
                >
                  / {pdf?.numPages || "—"}
                </Typography>
                <Tooltip title="下一页">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!pdf || pageNumber >= pdf.numPages}
                      onClick={() => {
                        const next = Math.min(
                          pdf?.numPages || 1,
                          pageNumber + 1
                        );
                        setPageNumber(next);
                        scrollPdf({ page: next, bbox: [0, 0, 0, 0] });
                      }}
                      sx={{ p: 0.5 }}
                    >
                      <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  ml: "auto",
                }}
              >
                <Tooltip title="缩小">
                  <IconButton
                    size="small"
                    onClick={() =>
                      setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))
                    }
                    sx={{ p: 0.5 }}
                  >
                    <ZoomOutRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Typography
                  variant="caption"
                  sx={{ fontSize: 12, minWidth: 38, textAlign: "center" }}
                >
                  {Math.round(zoom * 100)}%
                </Typography>
                <Tooltip title="放大">
                  <IconButton
                    size="small"
                    onClick={() =>
                      setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))
                    }
                    sx={{ p: 0.5 }}
                  >
                    <ZoomInRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setZoom(1)}
                  sx={{ height: 26, fontSize: 11, px: 0.75, minWidth: "auto" }}
                >
                  适宽
                </Button>
                <Tooltip
                  title={
                    !hasLayoutResult
                      ? "请先执行布局检测"
                      : showLayoutAreas
                        ? "隐藏布局线框"
                        : "显示布局线框"
                  }
                >
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      ml: 0.5,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={showLayoutAreas}
                          disabled={!hasLayoutResult}
                          onChange={(e) => setShowLayoutAreas(e.target.checked)}
                          sx={{ m: 0 }}
                        />
                      }
                      label={
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 12,
                            userSelect: "none",
                            color: hasLayoutResult
                              ? "text.primary"
                              : "text.disabled",
                          }}
                        >
                          布局线框
                        </Typography>
                      }
                      sx={{ ml: 0.5, mr: 0 }}
                    />
                  </Box>
                </Tooltip>
              </Box>
            </Stack>
            <TocDrawer
              open={drawer}
              onClose={() => setDrawer(false)}
              toggleRef={tocToggleRef}
              width={pref.tocWidth}
              defaultWidth={270}
              onWidthChange={(tocWidth) => setPref((p) => ({ ...p, tocWidth }))}
            >
              {tocPane}
            </TocDrawer>
            <div
              className="kt-pdf-scroll kt-pdf-pages"
              ref={pdfScroll}
              onScroll={() => scroll("pdf")}
              onWheel={() => {
                syncOwner.current = "pdf";
              }}
              onPointerDown={() => {
                syncOwner.current = "pdf";
              }}
              onKeyDown={() => {
                syncOwner.current = "pdf";
              }}
              tabIndex={0}
            >
              {pdf ? (
                Array.from({ length: pdf.numPages }, (_, i) => (
                  <PdfPage
                    key={i}
                    pdf={pdf}
                    number={i + 1}
                    width={pageWidth}
                    zoom={zoom}
                    scrollRoot={pdfScroll.current}
                    highlight={highlight}
                    regions={layoutRegions[i + 1]}
                    showLayout={showLayoutAreas}
                    onToggleRegion={busy ? undefined : toggleRegion}
                    disabled={busy}
                    recognizingRegionId={
                      phase === "parsing" &&
                      progress?.startedAt &&
                      progress?.page === i + 1
                        ? progress.regionId
                        : null
                    }
                    i18n={i18n}
                  />
                ))
              ) : (
                <Typography p={3}>
                  {phase === "opening" ? "正在读取 PDF…" : "未能读取 PDF"}
                </Typography>
              )}
            </div>
          </Card>
        )}
        <Card
          variant="outlined"
          className="kt-pdf-column"
          sx={{
            flex: "1 1 0",
            position: "relative",
            borderRadius: 1,
            bgcolor: "background.paper",
          }}
        >
          <Stack
            className="kt-pdf-column-header"
            sx={{
              borderBottom: "1px solid",
              borderColor: "divider",
              "& .MuiTypography-root": { fontSize: 13 },
              "& .MuiToggleButton-root": { fontSize: 12, px: 1, py: 0.5 },
              "& .MuiFormControlLabel-label": { fontSize: 12 },
            }}
            direction="row"
            gap={1}
            alignItems="center"
            flexWrap="nowrap"
          >
            <Typography fontWeight={600} sx={{ mr: "auto" }}>
              译文对照
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode}
              onChange={(_, v) => changeMode(v)}
              sx={{ height: 28 }}
            >
              <ToggleButton
                value="source"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                原文
              </ToggleButton>
              <ToggleButton
                value="target"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                译文
              </ToggleButton>
              <ToggleButton
                value="bilingual"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                双语
              </ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_, v) => {
                if (v) {
                  anchor.current = visibleMd();
                  setView(v);
                }
              }}
              sx={{ height: 28 }}
            >
              <ToggleButton
                value="read"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                阅读
              </ToggleButton>
              <ToggleButton
                value="source"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                源码
              </ToggleButton>
            </ToggleButtonGroup>
            {isPdf && (
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={pref.sync}
                    disabled={view !== "read"}
                    onChange={(e) =>
                      setPref((p) => ({ ...p, sync: e.target.checked }))
                    }
                  />
                }
                label="滚动同步"
                sx={{
                  mr: 0.5,
                  "& .MuiFormControlLabel-label": { fontSize: 12 },
                }}
              />
            )}
            <Button
              size="small"
              variant="outlined"
              color="primary"
              disabled={!canTranslate}
              onClick={translateCurrentPage}
              sx={{
                height: 28,
                fontSize: 12,
                px: 1.25,
                textTransform: "none",
                whiteSpace: "nowrap",
              }}
            >
              试译当前页
            </Button>
            {warnings.length + failed.length > 0 && (
              <Button size="small" onClick={() => setShowWarnings(true)}>
                问题 {warnings.length + failed.length}
              </Button>
            )}
            {busy && (
              <Button
                size="small"
                variant="contained"
                color="error"
                startIcon={<StopRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={cancelOperation}
                sx={{
                  height: 28,
                  fontSize: 12,
                  px: 1.25,
                  fontWeight: 600,
                  textTransform: "none",
                }}
              >
                停止
              </Button>
            )}
          </Stack>
          {phase === "parsing" && progress && (
            <Typography variant="caption" sx={{ px: 2, py: 0.5 }} role="status">
              {progress.page
                ? (
                    i18n?.("pdf_region_progress", "$1 · 第 $2 页 · $3/$4") ||
                    "$1 · 第 $2 页 · $3/$4"
                  ).replace(
                    /\$([1-4])/g,
                    (_, index) =>
                      [
                        progressStage,
                        progress.page,
                        progress.done,
                        progress.total,
                      ][Number(index) - 1]
                  )
                : `${progressStage} · ${progress.done}/${progress.total}`}
              {progress.regionId
                ? ` · ${(i18n?.("pdf_region_elapsed", "$1 · $2s") || "$1 · $2s")
                    .replace("$1", i18n?.(...regionLabel) || regionLabel[1])
                    .replace("$2", Math.floor(recognitionElapsed / 1000))}`
                : ""}
            </Typography>
          )}
          {translationProgress && (
            <Typography variant="caption" sx={{ px: 2, py: 0.5 }} role="status">
              {(
                i18n?.("pdf_translation_progress", "翻译内容 · $1/$2") ||
                "翻译内容 · $1/$2"
              )
                .replace("$1", translationProgress.done)
                .replace("$2", translationProgress.total)}
            </Typography>
          )}
          {notice && (
            <ReaderAlert
              severity="info"
              onClose={() => setNotice("")}
              sx={{
                position: "absolute",
                top: 48,
                left: 0,
                right: 0,
                zIndex: 3,
                borderRadius: 0,
                border: "none",
                borderBottom: "none",
                boxShadow: "none",
              }}
            >
              {notice}
            </ReaderAlert>
          )}
          <div
            ref={mdScroll}
            className="kt-pdf-scroll kt-pdf-markdown"
            onScroll={() => scroll("md")}
            onWheel={() => {
              syncOwner.current = "md";
            }}
            onPointerDown={() => {
              syncOwner.current = "md";
            }}
            onKeyDown={() => {
              syncOwner.current = "md";
            }}
            tabIndex={0}
          >
            {!blocks.length ? (
              <Box p={3}>
                <Typography color="text.secondary">
                  PDF 原文已保留在中栏。解析后，Markdown 将显示在这里。
                </Typography>
                <Button disabled={busy || !pdf} onClick={() => parse()}>
                  解析为 Markdown
                </Button>
              </Box>
            ) : view === "source" ? (
              <pre className="kt-pdf-source">
                {blocks.map((block) => (
                  <span
                    key={block.id}
                    data-document-block={block.id}
                    style={{ display: "block" }}
                  >
                    {blockMarkdown(block, mode) + "\n\n"}
                    {(block.formulaDiagnostics || [])
                      .filter((diagnostic) => diagnostic.error)
                      .map(
                        (diagnostic) =>
                          `公式识别原始输出 (${diagnostic.regionId}):\n${diagnostic.output || "（空结果）"}\n${diagnostic.error}\n\n`
                      )
                      .join("")}
                  </span>
                ))}
                {documentMarkdown([], mode, warnings)}
              </pre>
            ) : (
              blocks.map((block) => (
                <section
                  key={block.id}
                  data-document-block={block.id}
                  className={`kt-pdf-block${touchBlock === block.id ? " kt-pdf-block-active" : ""}`}
                  tabIndex={
                    isPdf && sourceFragments(block).length ? 0 : undefined
                  }
                  onMouseOver={(event) =>
                    isPdf && activateBlock(block, event.target)
                  }
                  onMouseLeave={() =>
                    setHoverBlock((current) =>
                      current === block.id ? null : current
                    )
                  }
                  onFocus={(event) =>
                    isPdf && activateBlock(block, event.target)
                  }
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setHoverBlock((current) =>
                        current === block.id ? null : current
                      );
                  }}
                  onPointerDown={(event) => {
                    if (isPdf && event.pointerType === "touch") {
                      setTouchBlock(block.id);
                      activateBlock(block, event.target);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.target === event.currentTarget ||
                        hoveredSources(block, event.target).length)
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      locate(
                        block,
                        undefined,
                        hoveredSources(block, event.target)
                      );
                    }
                  }}
                >
                  <div
                    onErrorCapture={(event) => {
                      const image = event.target;
                      if (!isPdf || image.tagName !== "IMG") return;
                      const path = image.getAttribute("data-document-asset"),
                        oldUrl = image.getAttribute("src");
                      if (!path) return;
                      const url = assetPreview.current.retry(path, oldUrl);
                      if (url) {
                        image.setAttribute("src", url);
                        URL.revokeObjectURL(oldUrl);
                      }
                      updateAssetPreview((version) => version + 1);
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderDocumentBlock(
                        block,
                        mode,
                        blocks,
                        [],
                        isPdf ? assetPreview.current.urls() : undefined,
                        i18n?.("pdf_asset_failed", "图片资源加载失败") ||
                          "图片资源加载失败"
                      ),
                    }}
                  />
                  {isPdf && (
                    <SourceToolbar
                      block={block}
                      sourceIds={
                        locatedBlock?.id === block.id
                          ? locatedBlock.sourceIds
                          : hoverBlock === block.id
                            ? hoverSources
                            : undefined
                      }
                      busy={busy}
                      connected={connected}
                      locate={locate}
                      recognizeImage={recognizeImage}
                      i18n={i18n}
                    />
                  )}
                  {mode !== "source" &&
                    isTranslatableBlock(block) &&
                    block.status !== "done" && (
                      <Typography
                        variant="caption"
                        color={
                          block.status === "error" ? "error" : "text.secondary"
                        }
                      >
                        {block.status === "error"
                          ? `失败：${block.error}`
                          : block.status === "busy"
                            ? "翻译中…"
                            : "尚未完成翻译"}
                        {block.status === "error" && (
                          <Button
                            size="small"
                            disabled={busy || !connected}
                            onClick={() => translate(block.id)}
                          >
                            重试此块
                          </Button>
                        )}
                      </Typography>
                    )}
                </section>
              ))
            )}
          </div>
        </Card>
      </Box>
      <Dialog
        open={showWarnings}
        onClose={() => setShowWarnings(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>解析与翻译问题</DialogTitle>
        <DialogContent>
          <Box sx={{ maxHeight: 180, overflow: "auto" }}>
            {warnings.map((w) => (
              <Typography key={w.id} variant="caption" component="div">
                第 {w.page} 页：{w.message}
                {w.regionId && config.parseMode === "smart" && (
                  <Button
                    size="small"
                    disabled={busy || !connected}
                    onClick={() => parse(false, w)}
                  >
                    重试识别
                  </Button>
                )}
              </Typography>
            ))}
            {failed.map((b) => (
              <Typography
                key={b.id}
                color="error"
                variant="caption"
                component="div"
              >
                {blockMarkdown(b, "source").slice(0, 60)}：{b.error}
              </Typography>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowWarnings(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!password}
        onClose={() => {
          abortRef.current?.abort();
          setPassword(null);
          setPhase("idle");
        }}
      >
        <DialogTitle>
          {password?.incorrect ? "密码错误，请重试" : "PDF 需要密码"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            type="password"
            value={passwordText}
            onChange={(e) => setPasswordText(e.target.value)}
            label="密码"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                password.update(passwordText);
                setPassword(null);
                setPasswordText("");
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              abortRef.current?.abort();
              setPassword(null);
              setPhase("idle");
            }}
          >
            取消
          </Button>
          <Button
            onClick={() => {
              password.update(passwordText);
              setPassword(null);
              setPasswordText("");
            }}
          >
            打开
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default PdfWorkspace;
