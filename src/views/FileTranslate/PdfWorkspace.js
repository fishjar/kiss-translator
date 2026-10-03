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
  translateDocumentBlocks,
} from "../../libs/document/markdown";
import { exportDocument } from "../../libs/document/export";
import PdfPage from "./PdfPage";
import ReaderAlert from "./ReaderAlert";
import "katex/dist/katex.min.css";
import "./PdfWorkspace.css";

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
  },
  ref
) {
  const isPdf = markdownContent === undefined;
  const { context, client, connected, openSettings, i18n } = useFileTranslation();
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
          !api.isDisabled &&
          (Array.isArray(api.capabilities)
            ? api.capabilities.includes("layout")
            : false)
      );
    }
    return true;
  }, [hasLayoutService, context?.services]);

  const effectiveLayoutApi = useMemo(() => {
    if (activeLayoutApi) return activeLayoutApi;
    if (Array.isArray(context?.services)) {
      return (
        context.services.find(
          (api) =>
            !api.isDisabled &&
            (Array.isArray(api.capabilities)
              ? api.capabilities.includes("layout")
              : false)
        ) || null
      );
    }
    return null;
  }, [activeLayoutApi, context?.services]);
  const [localScene, setLocalScene] = useState(scene),
    [pref, setPref] = useState(preferences),
    [pdf, setPdf] = useState(null),
    [bookmarks, setBookmarks] = useState([]),
    [result, setResult] = useState(null),
    [blocks, setBlocks] = useState(() =>
      isPdf ? [] : parseDocumentMarkdown(markdownContent)
    ),
    [phase, setPhase] = useState("idle"),
    [progress, setProgress] = useState(null),
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
    [highlight, setHighlight] = useState(null),
    [showWarnings, setShowWarnings] = useState(false),
    [password, setPassword] = useState(null),
    [passwordText, setPasswordText] = useState(""),
    [pageWidth, setPageWidth] = useState(500),
    [layoutRegions, setLayoutRegions] = useState({}),
    [showLayoutAreas, setShowLayoutAreas] = useState(false);
  const tocToggleRef = useRef(null),
    pdfScroll = useRef(null),
    mdScroll = useRef(null),
    abortRef = useRef(null),
    reader = useRef(null),
    resultRef = useRef(null),
    mounted = useRef(false),
    operation = useRef(0),
    syncOwner = useRef(null),
    suppressUntil = useRef(0),
    highlightTimer = useRef(null),
    raf = useRef(null),
    anchor = useRef(null);
  const hasLayoutResult = Boolean(Object.keys(layoutRegions).length);
  const busy = ["opening", "parsing", "translating", "detecting"].includes(phase);
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
    mounted.current = true;
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    if (isPdf) {
      setLayoutRegions({});
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
      reader.current?.destroy();
      reader.current = null;
      for (const asset of resultRef.current?.assets || [])
        URL.revokeObjectURL(asset.url);
      clearTimeout(highlightTimer.current);
      cancelAnimationFrame(raf.current);
      setLayoutRegions({});
      setShowLayoutAreas(false);
    };
  }, [file, isPdf]);
  useEffect(() => {
    if (
      !connected &&
      ["parsing", "translating"].includes(phase) &&
      !(phase === "parsing" && config.parseMode === "fast")
    ) {
      abortRef.current?.abort();
      setNotice("扩展连接已断开，已保留完成内容；请重新连接后继续。");
    }
  }, [connected, phase, config.parseMode]);
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
  const capabilities = client?.session?.capabilities || [];
  const installed = (id) =>
    context.models.some((m) => m.id === id && m.state === "installed");
  const commit = (next) => {
    resultRef.current = next;
    setResult(next);
    setBlocks((prev) =>
      next.blocks.map((b) => {
        const old = prev.find((p) => p.id === b.id && p.raw === b.raw);
        return old
          ? {
              ...b,
              status: old.status,
              targetRaw: old.targetRaw,
              bilingualRaw: old.bilingualRaw,
              targetAst: old.targetAst,
              translationKey: old.translationKey,
              error: old.error,
            }
          : b;
      })
    );
  };
  const parse = async (reset = false, retryRegion) => {
    if (!pdf || busy) return;
    if (config.parseMode === "smart") {
      if (!connected || !capabilities.includes("doc")) {
        setError("Smart 需要支持 DOC 的新版扩展；可切换 Fast。");
        return;
      }
      if (!effectiveHasLayoutService && !Object.keys(layoutRegions).length) {
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
    if (reset) {
      for (const asset of resultRef.current?.assets || [])
        URL.revokeObjectURL(asset.url);
      resultRef.current = null;
      setBlocks([]);
      setResult(null);
    }
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    setPhase("parsing");
    setError("");
    setMissing("");
    setNotice("");
    try {
      const targetLayoutModel =
        effectiveLayoutApi?.modelRef || config.layoutModel;
      const targetLayoutDevice =
        effectiveLayoutApi?.device || config.layoutDevice;
      const next = await parsePdfDocument(pdf, {
        ...config,
        mode: config.parseMode,
        layoutModel: targetLayoutModel,
        layoutDevice: targetLayoutDevice,
        enableJev: config.enableJev === "true",
        client,
        models: context.models,
        signal: abort.signal,
        previous: resultRef.current,
        retryRegion,
        layoutRegions,
        onProgress: (p, partial) => {
          if (mounted.current && operation.current === version) {
            setProgress(p);
            commit(partial);
          }
        },
      });
      if (mounted.current && operation.current === version) {
        commit(next);
        if (next?.layoutRegions && Object.keys(next.layoutRegions).length) {
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
        setMode("source");
        return next;
      }
    } catch (e) {
      if (mounted.current && operation.current === version) {
        if (e.partial) commit(e.partial);
        if (e instanceof MissingDocumentModel) setMissing(e.modelId);
        else if (!abort.signal.aborted) setError(e.message);
      }
    } finally {
      if (mounted.current && operation.current === version) setPhase("idle");
    }
  };
  const translate = async (onlyId) => {
    if (busy || !connected || (isPdf && !result?.complete)) return;
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    setPhase("translating");
    setError("");
    setMode("bilingual");
    const next = blocks.map((b) => ({ ...b }));
    setBlocks(next);
    try {
      const settingsKey = JSON.stringify({
        fromLang: config.fromLang,
        toLang: config.toLang,
        apiSlugs: config.apiSlugs,
        promptSlug: config.promptSlug,
      });
      for (const block of next) {
        if (block.translationKey !== settingsKey) {
          block.status = "idle";
          delete block.targetRaw;
          delete block.bilingualRaw;
        }
        block.translationKey = settingsKey;
      }
      const targetBlocks =
        typeof onlyId === "string"
          ? next.filter((b) => b.id === onlyId)
          : Array.isArray(onlyId)
            ? next.filter((b) => onlyId.includes(b.id))
            : next;
      await translateDocumentBlocks(
        targetBlocks,
        async (text, signal) => {
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
                  scene: {
                    fromLang: config.fromLang,
                    toLang: config.toLang,
                    apiSlugs: config.apiSlugs,
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
          if (mounted.current && operation.current === version) {
            setBlocks([...next]);
            setProgress({ stage: "翻译内容", done, total });
          }
        }
      );
    } catch (e) {
      if (mounted.current && !abort.signal.aborted) setError(e.message);
    } finally {
      if (mounted.current && operation.current === version) {
        setBlocks([...next]);
        setPhase("idle");
      }
    }
  };
  const recognizeImage = async (block) => {
    if (busy || !connected) return;
    if (!installed(config.visionModel)) {
      setMissing(config.visionModel);
      return;
    }
    const version = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    setPhase("parsing");
    setError("");
    setProgress({ stage: "识别图中文字", done: 0, total: 1 });
    try {
      const fragment = block.fragments[0],
        page = await pdf.getPage(fragment.page),
        blob = await renderPdfRegion(page, fragment.bbox, abort.signal, 2);
      const response = await client.recognizeDocumentRegion(
        blob,
        config.visionModel,
        "doc",
        config.visionDevice,
        abort.signal
      );
      if (
        !abort.signal.aborted &&
        mounted.current &&
        operation.current === version
      ) {
        if (!response.text?.trim()) throw new Error("图中文字识别结果为空");
        const associated = parseDocumentMarkdown(
          response.text,
          `${block.id}-recognized`
        ).map((b) => ({
          ...b,
          fragments: block.fragments,
          associatedImageId: block.id,
        }));
        setBlocks((prev) =>
          prev
            .filter((b) => b.associatedImageId !== block.id)
            .flatMap((b) => (b.id === block.id ? [b, ...associated] : [b]))
        );
      }
    } catch (e) {
      if (!abort.signal.aborted) setError(e.message);
    } finally {
      if (mounted.current && operation.current === version) setPhase("idle");
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
  const locate = (fragment) => {
    suppressUntil.current = performance.now() + 500;
    scrollPdf(fragment);
    setHighlight(fragment);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2000);
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
    setPhase("detecting");
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
        layoutDevice: targetLayoutDevice,
        client,
        models: context.models,
        signal: abort.signal,
        onProgress: (p) => {
          if (mounted.current && operation.current === version) {
            setProgress(p);
          }
        },
      });
      if (mounted.current && operation.current === version) {
        setLayoutRegions(regions);
        setShowLayoutAreas(true);
        setNotice("布局检测完成，可在线框上点击切换是否识别该区域");
        return regions;
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
    if (busy) return;
    let currentRegions = layoutRegions;
    if (config.parseMode === "smart" && !Object.keys(currentRegions).length) {
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
      currentRegions = await detectLayout();
      if (!currentRegions) return;
    }
    let currentResult = resultRef.current;
    if (!currentResult?.complete) {
      currentResult = await parse();
    }
    if (currentResult?.complete) {
      await translate();
    }
  };

  const parseAndTranslate = oneClickTranslate;

  const translateCurrentPage = () => {
    const pageBlocks = blocks.filter((b) =>
      b.fragments?.some((f) => f.page === pageNumber)
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
    abort: () => abortRef.current?.abort(),
    getPdf: () => pdf,
    getBlocks: () => blocks,
    getResult: () => result,
    getPhase: () => phase,
    getProgress: () => progress,
    isBusy: () => busy,
    hasLayoutResult: Boolean(Object.keys(layoutRegions).length),
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
      failedCount: blocks.filter((b) => b.status === "error").length,
      hasLayoutResult: Boolean(Object.keys(layoutRegions).length),
      showLayoutAreas,
    });
  }, [
    phase,
    progress,
    pdf,
    result,
    blocks,
    busy,
    layoutRegions,
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
                    sx={{ display: "inline-flex", alignItems: "center", ml: 0.5 }}
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
                    onToggleRegion={toggleRegion}
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
              disabled={busy || !connected || !blocks.length}
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
                onClick={() => abortRef.current?.abort()}
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
                  </span>
                ))}
                {documentMarkdown([], mode, warnings)}
              </pre>
            ) : (
              blocks.map((block) => (
                <section
                  key={block.id}
                  data-document-block={block.id}
                  className="kt-pdf-block"
                >
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderDocumentBlock(block, mode, blocks),
                    }}
                  />
                  {isPdf && (
                    <div className="kt-pdf-block-actions">
                      {block.type === "image" && (
                        <Button
                          size="small"
                          disabled={busy || !connected}
                          onClick={() => recognizeImage(block)}
                        >
                          识别图中文字
                        </Button>
                      )}
                      {block.fragments.map((fragment, i) => (
                        <Button
                          size="small"
                          key={i}
                          onClick={() => locate(fragment)}
                        >
                          定位原文 · 第 {fragment.page} 页
                        </Button>
                      ))}
                    </div>
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
