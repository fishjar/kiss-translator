import {
  recognitionFeature,
  recognitionOptions,
  hasCompleteCoordinates,
} from "../../fileTranslation/recognition";
import { isApiConfigured } from "../../config/serviceSelection";
import { supportsApiCapability } from "../../config/serviceSelection";
import { runTranslationTasks } from "../../libs/translationTasks";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReaderAlert from "./ReaderAlert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Snackbar from "@mui/material/Snackbar";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ContentPasteRoundedIcon from "@mui/icons-material/ContentPasteRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import ButtonGroup from "@mui/material/ButtonGroup";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import DOMPurify from "dompurify";
import { css } from "@emotion/css";
import { useFileTranslation } from "./State";
import { builtinStylesMap } from "../../libs/style";
import {
  DEFAULT_FILE_TRANSLATE_SETTING,
  PROMPT_CATEGORY_VLM,
} from "../../config";
import {
  IMAGE_FONT_OPTIONS,
  synthesizeTranslatedImage,
  translateFileText,
  translateTxt,
  translateMarkdown,
  translateEntireTxt,
  translateEntireMarkdown,
  splitMarkdownBlocks,
  renderMarkdownBlocksToHtml,
  generateStandaloneHtml,
  parseEpubBook,
  translateEpubChapter,
  translateEpubBook,
  exportEpubFromChapterStates,
  injectFooterIntoXhtml,
} from "../../libs/fileTranslate";
import * as fflate from "fflate";
import {
  parseXhtmlToDoc,
  serializeDocToXhtml,
  embedEpubImagesAsDataUrls,
  sanitizeEpubMarkup,
} from "../../libs/epub/epubDomHandler";
import EpubReaderView from "./EpubReaderView";
import FileTranslateToolbar from "./FileTranslateToolbar";
import FileTranslateSettings from "./FileTranslateSettings";
import LocalServiceNotice from "../../components/LocalServiceNotice";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import { SettingsSelect } from "../Options/SettingsCard";
import ScenePromptSelect from "./ScenePromptSelect";
import ImageViewerDialog from "./ImageViewerDialog";
import ImageSourcePreview, { hasImagePolygon } from "./ImageSourcePreview";
import { recognizeImageWithLayout } from "../../fileTranslation/imageLayout";
import { availableApiForScene } from "../../config/serviceSelection";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
function getFileMode(file) {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf")
    return "pdf";
  if (/\.epub$/i.test(file.name) || file.type === "application/epub+zip")
    return "epub";
  if (/\.(md|markdown)$/i.test(file.name)) return "markdown";
  if (/\.txt$/i.test(file.name)) return "txt";
  if (IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name))
    return "image";
  return null;
}
const PdfWorkspace = lazy(() => import("./PdfWorkspace"));

function getTextStyleClass(styleSlug, allTextStyles) {
  if (!styleSlug || styleSlug === "style_none") return "";
  const found = allTextStyles?.find((s) => s.styleSlug === styleSlug);
  const rawCode = found?.styleCode || builtinStylesMap[styleSlug] || "";
  if (!rawCode) return "";
  try {
    return css`
      ${rawCode}
    `;
  } catch {
    return "";
  }
}

function getRawStyleCode(styleSlug, allTextStyles) {
  if (!styleSlug || styleSlug === "style_none") return "";
  const found = allTextStyles?.find((s) => s.styleSlug === styleSlug);
  return found?.styleCode || builtinStylesMap[styleSlug] || "";
}

/**
 * 提取当前 EPUB 各章节实际导出正文与状态的快照，用于导出结果精确缓存与失效比对
 */
function getEpubExportChapterSnapshot(
  epubBookOrSpine,
  chapterStates,
  mode,
  currentToLang,
  navItemHref,
  ncxItemHref
) {
  const isBook =
    epubBookOrSpine &&
    !Array.isArray(epubBookOrSpine) &&
    epubBookOrSpine.spineItems;
  const spineItems = isBook
    ? epubBookOrSpine.spineItems
    : epubBookOrSpine || [];
  const navHref = navItemHref || (isBook ? epubBookOrSpine.navItemHref : null);
  const ncxHref = ncxItemHref || (isBook ? epubBookOrSpine.ncxItemHref : null);

  const snapshot = {};
  const allPaths = new Set(spineItems.map((s) => s.fullPath));
  if (navHref) allPaths.add(navHref);
  if (ncxHref) allPaths.add(ncxHref);

  for (const path of allPaths) {
    const state = chapterStates?.[path];
    const isLangMatch =
      !state?.targetLang ||
      !currentToLang ||
      state.targetLang === currentToLang;
    const isDone = state?.status === "done" && isLangMatch;
    const content = isDone
      ? mode === "target"
        ? state?.targetXhtml || state?.targetHtml || ""
        : state?.bilingualXhtml || state?.bilingualHtml || ""
      : "";
    snapshot[path] = {
      status: isLangMatch ? state?.status || "idle" : "idle",
      content,
    };
  }
  return snapshot;
}

/**
 * 触发纯文本文件下载
 */
function downloadText(name, content) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 触发图片或二进制文件下载
 */
function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 格式化文件字节大小
 */
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileTranslateView() {
  const {
    connectionNotice,
    context,
    client,
    connected,
    i18n,
    uiLang,
    patchScene: saveScene,
    allTextStyles,
    openSettings: openOptionsPage,
  } = useFileTranslation();
  const setting = useMemo(
    () => ({
      transApis: context.services,
      fileTranslateSetting: context.scenes,
      uiLang,
    }),
    [context.services, context.scenes, uiLang]
  );
  const saved = setting?.fileTranslateSetting || DEFAULT_FILE_TRANSLATE_SETTING;
  const [mode, setMode] = useState("txt");
  const scene = useMemo(
    () => ({ ...DEFAULT_FILE_TRANSLATE_SETTING[mode], ...saved[mode] }),
    [mode, saved]
  );
  const patchScene = (patch) => saveScene(mode, patch);

  const textStyleClass = useMemo(
    () => getTextStyleClass(scene?.textStyle, allTextStyles),
    [scene?.textStyle, allTextStyles]
  );

  const rawStyleCode = useMemo(
    () => getRawStyleCode(scene?.textStyle, allTextStyles),
    [scene?.textStyle, allTextStyles]
  );

  const [file, setFile] = useState(null);
  const [ignoreCache, setIgnoreCache] = useState(false);
  useEffect(() => setIgnoreCache(false), [file]);
  const [sourceText, setSourceText] = useState("");
  const [preview, setPreview] = useState("");
  const [rows, setRows] = useState([]);
  const [resultText, setResultText] = useState("");
  const [resultViewMode, setResultViewMode] = useState(
    mode === "image" ? "image" : "target"
  );
  const [imageActionAnchor, setImageActionAnchor] = useState(null);
  const [pdfActionAnchor, setPdfActionAnchor] = useState(null);
  const [imageStage, setImageStage] = useState("");
  const [imageFailure, setImageFailure] = useState(null);
  const imageFailurePrompt =
    imageFailure &&
    i18n(
      `image_${imageFailure.stage}_failed_prompt`,
      {
        recognize: "文本识别失败，请重试",
        translate: "文本翻译失败，请重试",
        synthesize: "图片合成失败，请重试",
      }[imageFailure.stage]
    );
  const [showImageRegions, setShowImageRegions] = useState(true);
  const selectedImageRows = rows.filter(
    (row) => row.enabled !== false && row.source?.trim()
  );
  const imageTranslationComplete =
    selectedImageRows.length > 0 &&
    selectedImageRows.every((row) => row.translated);
  const hasImageCoordinates = hasCompleteCoordinates(
    selectedImageRows,
    "source"
  );
  const resultRows =
    mode === "image" && resultViewMode !== "source" ? selectedImageRows : rows;
  const [translatedImageBlob, setTranslatedImageBlob] = useState(null);
  const [translatedImageUrl, setTranslatedImageUrl] = useState("");
  const [mdSourceView, setMdSourceView] = useState("preview");
  const [bilingualMd, setBilingualMd] = useState("");
  const [translatedHtml, setTranslatedHtml] = useState("");
  const [bilingualHtml, setBilingualHtml] = useState("");
  const [sourceHtml, setSourceHtml] = useState("");
  const [mdBlocks, setMdBlocks] = useState([]);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState(null);
  const getModelDisplayName = useCallback(
    (id) => context.models.find((model) => model.id === id)?.name || id,
    [context.models]
  );

  // --- EPUB 模式专用状态 ---
  const [epubBook, setEpubBook] = useState(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [epubViewMode, setEpubViewMode] = useState("bilingual");
  const [chapterStates, setChapterStates] = useState({});
  const [readerPreferences, setReaderPreferences] = useState({
    pageWidth: saved.epub?.readerPreferences?.pageWidth || 840,
    fontSize: saved.epub?.readerPreferences?.fontSize || 16,
    fontFamily: saved.epub?.readerPreferences?.fontFamily || "default",
    themeId: saved.epub?.readerPreferences?.themeId || "default",
  });
  useEffect(() => {
    if (connected && saved.epub?.readerPreferences)
      setReaderPreferences({ pageWidth: 840, ...saved.epub.readerPreferences });
  }, [connected, saved.epub?.readerPreferences]);

  // --- PDF 模式专用状态 ---
  const pdfWorkspaceRef = useRef(null);
  const [pdfState, setPdfState] = useState({
    phase: "idle",
    progress: null,
    pdf: null,
    result: null,
    blocks: [],
    busy: false,
    failedCount: 0,
  });

  const recognitionSelection = scene.recognitionService;
  const activeRecognitionApi = (setting?.transApis || []).find(
    (api) => api.apiSlug === recognitionSelection?.apiSlug
  );
  const selectedRecognitionFeature = recognitionFeature(
    activeRecognitionApi,
    recognitionSelection?.capability
  );
  const hasRecognitionService = Boolean(selectedRecognitionFeature);
  const isVlmRecognition = recognitionSelection?.capability === "parseImage";
  const recognitionSelectOptions = recognitionOptions(
    setting?.transApis || [],
    recognitionSelection,
    i18n,
    mode === "pdf"
  );
  const handleRecognitionChange = (value) => {
    if (mode === "image") {
      controller.current?.abort();
      taskIdRef.current += 1;
      setBusy(false);
      setError("");
      setRows([]);
      imageRecognition.current = null;
      setImageFailure(null);
      setTranslatedImageBlob(null);
      setTranslatedImageUrl("");
    }
    patchScene({ recognitionService: value ? JSON.parse(value) : null });
  };
  const visionOptions = [
    { value: "", label: i18n("vision_service_select", "请选择视觉解析服务") },
    ...(setting?.transApis || [])
      .filter((api) => {
        const feature = recognitionFeature(api, "parseImage");
        return (
          feature &&
          (feature.taskModes || ["doc"]).some((task) =>
            ["table", "formula"].includes(task)
          )
        );
      })
      .map((api) => ({
        value: api.apiSlug,
        label: api.apiName || api.apiSlug,
      })),
  ];
  if (
    scene.visionServiceSlug &&
    !visionOptions.some((option) => option.value === scene.visionServiceSlug)
  )
    visionOptions.push({
      value: scene.visionServiceSlug,
      label: `${scene.visionServiceSlug} (${i18n("api_unavailable_here", "当前不可用")})`,
    });

  // 筛选具备界面分析（layout）能力的服务实例
  const layoutApis = useMemo(() => {
    return (setting?.transApis || []).filter(
      (api) =>
        !api.isDisabled &&
        isApiConfigured(api) &&
        supportsApiCapability(api, "analyzeLayout")
    );
  }, [setting?.transApis]);

  const hasLayoutService = layoutApis.length > 0;

  const activeLayoutApi = useMemo(() => {
    const api = scene.layoutApiSlug
      ? availableApiForScene(
          scene,
          setting?.transApis || [],
          "analyzeLayout",
          {
            installedModels: new Set(
              context.models
                .filter((model) => model.state === "installed")
                .map((model) => model.id)
            ),
          },
          "layoutApiSlug"
        )
      : layoutApis.find((api) => api.layoutAvailable !== false);
    return api?.layoutAvailable !== false ? api : undefined;
  }, [scene, setting?.transApis, context.models, layoutApis]);

  const currentLayoutSlug = hasLayoutService
    ? scene.layoutApiSlug || activeLayoutApi?.apiSlug || ""
    : "";

  const handleLayoutServiceChange = (newSlug) => {
    if (!newSlug) return;
    const targetApi = layoutApis.find((api) => api.apiSlug === newSlug);
    patchScene({
      layoutApiSlug: newSlug,
      ...(mode === "pdf" && targetApi?.modelRef
        ? { layoutModel: targetApi.modelRef }
        : {}),
      ...(mode === "pdf" && targetApi?.device
        ? { layoutDevice: targetApi.device }
        : {}),
    });
  };

  const layoutSelectOptions = useMemo(() => {
    if (!hasLayoutService) {
      return [
        {
          value: "",
          label: i18n(
            "layout_service_empty",
            "未配置界面分析服务（请在服务配置中添加）"
          ),
          disabled: true,
        },
      ];
    }
    const options = layoutApis.map((api) => ({
      value: api.apiSlug,
      label: `${api.apiName || api.apiType || api.apiSlug}${
        api.modelRef
          ? ` (${typeof getModelDisplayName === "function" ? getModelDisplayName(api.modelRef, i18n) : api.modelRef})`
          : ""
      }${api.layoutAvailable === false ? ` (${i18n("api_unavailable_here", "unavailable here")})` : ""}`,
    }));
    if (
      currentLayoutSlug &&
      !options.some((o) => o.value === currentLayoutSlug)
    ) {
      options.push({
        value: currentLayoutSlug,
        label: `${currentLayoutSlug} (${i18n("api_unavailable", "当前不可用")})`,
      });
    }
    return options;
  }, [
    hasLayoutService,
    layoutApis,
    currentLayoutSlug,
    i18n,
    getModelDisplayName,
  ]);
  const [progress, setProgress] = useState([0, 0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputNotices, setInputNotices] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });
  const [viewerState, setViewerState] = useState({
    open: false,
    activeTab: "source",
  });

  const [translateMenuAnchor, setTranslateMenuAnchor] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteError, setPasteError] = useState("");
  const [pendingTextMode, setPendingTextMode] = useState(null);
  const [isEntireTranslated, setIsEntireTranslated] = useState(false);
  // 顶栏第二行核心配置项展开/收起状态（默认展开）

  const controller = useRef(null);
  const fileInputRef = useRef(null);
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const isSyncingScroll = useRef(false);
  const taskIdRef = useRef(0);
  const fileRef = useRef(null);
  const imageRecognition = useRef(null);
  const imageTranslationKey = JSON.stringify({
    fromLang: scene.fromLang,
    toLang: scene.toLang,
    apiSlug: scene.apiSlug,
    promptSlug: scene.promptSlug,
    serviceSignature: context.services.find(
      (api) => api.apiSlug === scene.apiSlug
    )?.translationSignature,
    prompt: context.prompts?.find((prompt) => prompt.slug === scene.promptSlug),
  });
  const previousImageTranslationKey = useRef(imageTranslationKey);
  useEffect(() => {
    if (previousImageTranslationKey.current === imageTranslationKey) return;
    previousImageTranslationKey.current = imageTranslationKey;
    if (mode !== "image") return;
    controller.current?.abort();
    taskIdRef.current += 1;
    setBusy(false);
    setImageStage("");
    setImageFailure(null);
    setRows((previous) =>
      previous.map((row) => ({
        ...row,
        target: "",
        translated: false,
        translationKey: undefined,
        error: undefined,
      }))
    );
    setTranslatedImageBlob(null);
    setTranslatedImageUrl("");
  }, [mode, imageTranslationKey]);
  const recognitionPromptSlug =
    scene.vlmPromptSlug || activeRecognitionApi?.vlmPromptSlug || "";
  const imageRecognitionSignature = JSON.stringify({
    layoutService: activeLayoutApi,
    layoutApiSlug: scene.layoutApiSlug,
    selection: recognitionSelection,
    service: activeRecognitionApi,
    promptSlug: recognitionPromptSlug,
    prompt: context.prompts?.find(
      (prompt) => prompt.slug === recognitionPromptSlug
    ),
  });
  const hasCurrentImageRecognition =
    imageRecognition.current?.ready &&
    imageRecognition.current.file === file &&
    imageRecognition.current.signature === imageRecognitionSignature;
  useEffect(() => {
    const previous = imageRecognition.current;
    if (
      !previous ||
      (mode === "image" &&
        previous.file === file &&
        previous.signature === imageRecognitionSignature)
    )
      return;
    controller.current?.abort();
    taskIdRef.current += 1;
    imageRecognition.current = null;
    setBusy(false);
    setRows([]);
    setImageStage("");
    setImageFailure(null);
    setInputNotices([]);
    setTranslatedImageBlob(null);
    setTranslatedImageUrl("");
  }, [mode, file, imageRecognitionSignature]);
  const epubExportCacheRef = useRef(new Map());

  // 监听文件或图书切换，清空 EPUB 导出缓存
  useEffect(() => {
    epubExportCacheRef.current.clear();
  }, [file, epubBook]);

  // 监听语言切换，中止正在运行的任务并彻底清除旧语言译文与导出缓存
  const lastLangsRef = useRef({
    fromLang: scene?.fromLang,
    toLang: scene?.toLang,
  });
  useEffect(() => {
    const prev = lastLangsRef.current;
    if (prev.toLang !== scene?.toLang || prev.fromLang !== scene?.fromLang) {
      controller.current?.abort();
      taskIdRef.current += 1;
      setBusy(false);
      setError("");
      setChapterStates({});
      epubExportCacheRef.current.clear();
      lastLangsRef.current = {
        fromLang: scene?.fromLang,
        toLang: scene?.toLang,
      };
    }
  }, [scene?.fromLang, scene?.toLang]);

  // 左右两栏按百分比联动滚动（通过互斥锁防循环触发）
  const handleLeftScroll = () => {
    if (isSyncingScroll.current) return;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    const leftScrollable = left.scrollHeight - left.clientHeight;
    if (leftScrollable <= 0) return;
    const percentage = left.scrollTop / leftScrollable;
    isSyncingScroll.current = true;
    const rightScrollable = right.scrollHeight - right.clientHeight;
    right.scrollTop = percentage * rightScrollable;
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const handleRightScroll = () => {
    if (isSyncingScroll.current) return;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    const rightScrollable = right.scrollHeight - right.clientHeight;
    if (rightScrollable <= 0) return;
    const percentage = right.scrollTop / rightScrollable;
    isSyncingScroll.current = true;
    const leftScrollable = left.scrollHeight - left.clientHeight;
    left.scrollTop = percentage * leftScrollable;
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  // 当译文样式切换且已有 Markdown 结构时，动态重新计算双语与译文 HTML
  useEffect(() => {
    if (mode === "markdown" && Array.isArray(mdBlocks) && mdBlocks.length > 0) {
      setBilingualHtml(
        renderMarkdownBlocksToHtml(mdBlocks, {
          mode: "bilingual",
          textStyleClass,
        })
      );
      setTranslatedHtml(
        renderMarkdownBlocksToHtml(mdBlocks, {
          mode: "target",
          textStyleClass,
        })
      );
    }
  }, [mode, textStyleClass, mdBlocks]);

  // 图片模式原图预览 URL 处理
  useEffect(() => {
    if (!file || mode !== "image") {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, mode]);

  // 清理生成的译图 URL
  useEffect(() => {
    return () => {
      if (translatedImageUrl) URL.revokeObjectURL(translatedImageUrl);
    };
  }, [translatedImageUrl]);

  // 组件卸载时自动终止正在进行的翻译任务
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!connected) controller.current?.abort();
  }, [connected]);

  // 异步读取 TXT / Markdown 文件内容（纯读取，无副作用）
  const readTxtFile = async (selected) => {
    if (!selected) return "";
    if (typeof selected.text === "function") {
      return await selected.text();
    }
    if (typeof selected.arrayBuffer === "function") {
      const buffer = await selected.arrayBuffer();
      return new TextDecoder("utf-8").decode(buffer);
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = reject;
      reader.readAsText(selected, "utf-8");
    });
  };

  // 清理现有翻译结果
  const resetResults = () => {
    setImageStage("");
    setImageFailure(null);
    imageRecognition.current = null;
    setShowImageRegions(true);
    setImageActionAnchor(null);
    setRows([]);
    setResultText("");
    setBilingualMd("");
    setTranslatedHtml("");
    setBilingualHtml("");
    setSourceHtml("");
    setMdBlocks([]);
    setIsEntireTranslated(false);
    setEpubBook(null);
    setCurrentChapterIndex(0);
    setChapterStates({});
    if (translatedImageUrl) {
      URL.revokeObjectURL(translatedImageUrl);
      setTranslatedImageUrl("");
    }
    setTranslatedImageBlob(null);
  };

  const initializeTextPreview = (nextMode, content) => {
    setMode(nextMode);
    setResultViewMode("target");
    setMdSourceView("preview");
    try {
      const blocks =
        nextMode === "markdown" && content ? splitMarkdownBlocks(content) : [];
      setMdBlocks(blocks);
      setSourceHtml(
        blocks.length
          ? renderMarkdownBlocksToHtml(blocks, { mode: "source" })
          : ""
      );
    } catch {
      setMdBlocks([]);
      setSourceHtml("");
    }
  };

  const switchTextMode = (nextMode) => {
    if (busy || nextMode === mode) return;
    taskIdRef.current += 1;
    controller.current?.abort();
    controller.current = null;
    resetResults();
    setProgress([0, 0]);
    setError("");
    setPreview("");
    setInputNotices([]);
    setConfirmDialogOpen(false);
    setPendingTextMode(null);
    initializeTextPreview(nextMode, sourceText);
  };

  const requestTextMode = (nextMode) => {
    if (busy || nextMode === mode) return;
    if (rows.length || resultText || bilingualMd) {
      setPendingTextMode(nextMode);
    } else {
      switchTextMode(nextMode);
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const data = event.clipboardData;
    const files = Array.from(data?.files || []);
    const fileItems = Array.from(data?.items || []).filter(
      (item) => item.kind === "file"
    );
    if (!files.length) {
      for (const item of fileItems) {
        const pastedFile = item.getAsFile();
        if (pastedFile) files.push(pastedFile);
      }
    }
    if (!files.length && fileItems.length) {
      setPasteError(
        i18n(
          "file_paste_empty",
          "未获取到文件或文本，请重试，或选择、拖入文件。"
        )
      );
      return;
    }
    const selected = files.find((candidate) => getFileMode(candidate));
    if (files.length && !selected) {
      setPasteError(
        i18n(
          "file_format_unsupported",
          "暂不支持该文件格式，支持 PDF、TXT、Markdown、EPUB 及 PNG、JPEG、WebP 图片"
        )
      );
      return;
    }
    const text = files.length ? "" : data?.getData("text/plain");
    if (!selected && !text) {
      setPasteError(
        i18n(
          "file_paste_empty",
          "未获取到文件或文本，请重试，或选择、拖入文件。"
        )
      );
      return;
    }
    setPasteOpen(false);
    setPasteError("");
    selectFile(
      selected ||
        new File([text], i18n("file_pasted_text_name", "粘贴文本.txt"), {
          type: "text/plain",
        })
    );
  };

  // 选入文件处理与全自动格式识别判定
  const selectFile = async (selected) => {
    setInputNotices([]);
    setPendingTextMode(null);
    // 换书或重选文件时：在任何异步操作前立即记录本次唯一任务会话 ID，并中止旧任务
    const currentTaskId = ++taskIdRef.current;
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
    }
    fileRef.current = selected || null;
    setBusy(false);
    setError("");
    resetResults();
    setProgress([0, 0]);
    setConfirmDialogOpen(false);
    // 开始任何异步读取前立即重置旧文件和旧结果，防止异步读取期间用旧状态启动翻译导致竞态
    setFile(null);
    setSourceText("");
    setPreview("");
    setEpubBook(null);
    setChapterStates({});
    setPdfState({
      phase: "idle",
      progress: null,
      pdf: null,
      result: null,
      blocks: [],
      busy: false,
      failedCount: 0,
    });
    if (!selected) {
      return;
    }

    const nextMode = getFileMode(selected);
    const isImage = nextMode === "image";
    const isEpub = nextMode === "epub";
    const isPdf = nextMode === "pdf";
    if (isPdf) {
      setMode("pdf");
      setFile(selected);
      setSourceText("");
      return;
    }
    if (isImage) {
      try {
        if (
          context.limits &&
          selected.size > context.limits.maxImageFileMB * 1024 ** 2
        )
          throw new Error(
            `图片文件超过 ${context.limits.maxImageFileMB} MB 上限`
          );
      } catch (err) {
        if (taskIdRef.current === currentTaskId) setError(err.message);
        return;
      }
      if (taskIdRef.current !== currentTaskId) return;
    }

    if (!nextMode) {
      setFile(null);
      setSourceText("");
      setPreview("");
      setError(
        i18n(
          "file_format_unsupported",
          "暂不支持该文件格式，支持 PDF、TXT、Markdown、EPUB 及 PNG、JPEG、WebP 图片"
        )
      );
      return;
    }

    if (isEpub) {
      try {
        let buffer;
        if (typeof selected.arrayBuffer === "function") {
          buffer = await selected.arrayBuffer();
        } else {
          buffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(selected);
          });
        }
        if (taskIdRef.current !== currentTaskId) return;

        const book = await parseEpubBook(buffer);
        if (taskIdRef.current !== currentTaskId) return;

        setMode("epub");
        setFile(selected);
        setEpubBook(book);
        setCurrentChapterIndex(0);
        setChapterStates({});
      } catch (err) {
        if (taskIdRef.current !== currentTaskId) return;
        setError(err?.message || String(err));
      }
      return;
    }

    if (nextMode === "txt" || nextMode === "markdown") {
      try {
        const content = await readTxtFile(selected);
        if (taskIdRef.current !== currentTaskId) return;

        setFile(selected);
        setSourceText(content);
        initializeTextPreview(nextMode, content);
      } catch (err) {
        if (taskIdRef.current !== currentTaskId) return;
        setError(
          i18n("file_read_error", "读取文件失败：") +
            (err?.message || String(err))
        );
      }
    } else {
      if (taskIdRef.current !== currentTaskId) return;
      setMode(nextMode);
      setFile(selected);
      setResultViewMode("image");
    }
  };

  // 切换译文字体并对已完成翻译的图片进行热重绘
  const handleFontChange = async (fontFamily) => {
    patchScene({ fontFamily });
    if (file && mode === "image" && translatedImageBlob && !busy) {
      await runImageAction("synthesize", fontFamily);
    }
  };

  // 清除已选文件，重置回未上传状态（彻底中止旧任务控制器并自增 taskId 阻断异步回调）
  const handleClearFile = () => {
    setPendingTextMode(null);
    taskIdRef.current += 1;
    controller.current?.abort();
    controller.current = null;
    fileRef.current = null;
    setBusy(false);
    setConfirmDialogOpen(false);
    setFile(null);
    setSourceText("");
    setPreview("");
    epubExportCacheRef.current.clear();
    resetResults();
    setError("");
    setProgress([0, 0]);
    setPdfActionAnchor(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 复制文本辅助函数
  const copyText = async (text, label) => {
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setSnackbar({
        open: true,
        message: i18n("copied_to_clipboard", "已复制{0}到剪贴板").replace(
          "{0}",
          label
        ),
      });
    } catch {
      setSnackbar({
        open: true,
        message: i18n("copy_failed", "复制{0}失败").replace("{0}", label),
      });
    }
  };

  // 组装双语文本
  const getBilingualText = () => {
    if (!resultRows.length) return "";
    return resultRows.map((r) => `${r.source}\n${r.target}`).join("\n\n");
  };

  // 当前视图对应的翻译结果文本
  const currentResultContent =
    mode === "image" && resultViewMode === "source"
      ? rows.map((row) => row.source).join("\n\n")
      : mode === "markdown"
        ? resultViewMode === "bilingual"
          ? bilingualMd || getBilingualText()
          : resultText || resultRows.map((r) => r.target).join("\n\n")
        : resultViewMode === "bilingual"
          ? getBilingualText()
          : resultText || resultRows.map((r) => r.target).join("\n\n");

  // 下载 Markdown 格式文件 (.md)
  const handleDownloadMd = () => {
    const baseName = file?.name
      ? file.name.replace(/\.[^.]+$/, "")
      : "translation";
    const content = currentResultContent;
    if (!content) return;
    const suffix =
      resultViewMode === "source"
        ? "source"
        : resultViewMode === "bilingual"
          ? "bilingual"
          : "translated";
    downloadText(`${baseName}-${suffix}.md`, content);
  };

  // 导出单文件独立 HTML 网页 (.html)
  const handleDownloadHtml = () => {
    const baseName = file?.name
      ? file.name.replace(/\.[^.]+$/, "")
      : "translation";
    const bodyHtml =
      resultViewMode === "bilingual" ? bilingualHtml : translatedHtml;
    if (!bodyHtml) return;
    const exportLang = scene?.toLang || setting?.uiLang || "zh-CN";
    const standaloneHtml = generateStandaloneHtml(
      bodyHtml,
      `${baseName} - ${
        resultViewMode === "bilingual"
          ? i18n("export_file_suffix_bilingual", "双语对照")
          : i18n("export_file_suffix_target", "译文")
      }`,
      "",
      exportLang
    );
    const suffix =
      resultViewMode === "source"
        ? "source"
        : resultViewMode === "bilingual"
          ? "bilingual"
          : "translated";
    const blob = new Blob([standaloneHtml], {
      type: "text/html;charset=utf-8",
    });
    downloadBlob(`${baseName}-${suffix}.html`, blob);
  };

  // 下载当前激活结果文件
  const handleDownload = () => {
    const baseName = file?.name
      ? file.name.replace(/\.[^.]+$/, "")
      : "translation";

    if (resultViewMode === "image" && translatedImageBlob) {
      downloadBlob(`${baseName}-translated.png`, translatedImageBlob);
      return;
    }

    if (mode === "markdown") {
      handleDownloadMd();
      return;
    }

    const content = currentResultContent;
    if (!content) return;
    const suffix =
      resultViewMode === "source"
        ? "source"
        : resultViewMode === "bilingual"
          ? "bilingual"
          : "translated";
    downloadText(`${baseName}-${suffix}.txt`, content);
  };

  // 下载双语 EPUB（支持全书已翻、部分已翻或纯原书调整样式导出）
  const handleDownloadBilingualEpub = () => {
    if (!epubBook) return;

    try {
      const fallbackBaseName = file?.name
        ? file.name.replace(/\.[^.]+$/, "")
        : "book";
      const currentFontFamily = readerPreferences?.fontFamily || "";
      const currentRawStyle = rawStyleCode || "";
      const currentToLang = scene?.toLang || "";
      const currentUiLang = setting?.uiLang || "";

      const cached = epubExportCacheRef.current.get("bilingual");
      if (
        cached &&
        cached.fallbackBaseName === fallbackBaseName &&
        cached.fontFamily === currentFontFamily &&
        cached.rawStyleCode === currentRawStyle &&
        cached.toLang === currentToLang &&
        cached.uiLang === currentUiLang
      ) {
        const currentSnapshot = getEpubExportChapterSnapshot(
          epubBook,
          chapterStates,
          "bilingual",
          currentToLang
        );
        const curKeys = Object.keys(currentSnapshot);
        const prevKeys = Object.keys(cached.snapshot || {});
        const isMatch =
          curKeys.length === prevKeys.length &&
          curKeys.every((key) => {
            const cur = currentSnapshot[key];
            const prev = cached.snapshot?.[key];
            return (
              cur?.status === prev?.status && cur?.content === prev?.content
            );
          });

        if (isMatch) {
          downloadBlob(cached.result.filename, cached.result.blob);
          return;
        }
      }

      const result = exportEpubFromChapterStates(
        epubBook,
        chapterStates,
        scene,
        {
          textStyleCode: rawStyleCode,
          fontFamily: readerPreferences?.fontFamily,
          fallbackBaseName,
          uiLang: setting?.uiLang,
        },
        "bilingual"
      );
      epubExportCacheRef.current.set("bilingual", {
        fallbackBaseName,
        fontFamily: currentFontFamily,
        rawStyleCode: currentRawStyle,
        toLang: currentToLang,
        uiLang: currentUiLang,
        snapshot: getEpubExportChapterSnapshot(
          epubBook,
          chapterStates,
          "bilingual",
          currentToLang
        ),
        result,
      });
      downloadBlob(result.filename, result.blob);
    } catch (e) {
      console.error("export bilingual epub error:", e);
      setSnackbar({
        open: true,
        message: i18n("export_failed", "导出 EPUB 失败"),
      });
    }
  };

  // 下载纯译文 EPUB（支持全书已翻、部分已翻或纯原书调整样式导出）
  const handleDownloadTargetEpub = () => {
    if (!epubBook) return;

    try {
      const fallbackBaseName = file?.name
        ? file.name.replace(/\.[^.]+$/, "")
        : "book";
      const currentFontFamily = readerPreferences?.fontFamily || "";
      const currentRawStyle = rawStyleCode || "";
      const currentToLang = scene?.toLang || "";
      const currentUiLang = setting?.uiLang || "";

      const cached = epubExportCacheRef.current.get("target");
      if (
        cached &&
        cached.fallbackBaseName === fallbackBaseName &&
        cached.fontFamily === currentFontFamily &&
        cached.rawStyleCode === currentRawStyle &&
        cached.toLang === currentToLang &&
        cached.uiLang === currentUiLang
      ) {
        const currentSnapshot = getEpubExportChapterSnapshot(
          epubBook,
          chapterStates,
          "target",
          currentToLang
        );
        const curKeys = Object.keys(currentSnapshot);
        const prevKeys = Object.keys(cached.snapshot || {});
        const isMatch =
          curKeys.length === prevKeys.length &&
          curKeys.every((key) => {
            const cur = currentSnapshot[key];
            const prev = cached.snapshot?.[key];
            return (
              cur?.status === prev?.status && cur?.content === prev?.content
            );
          });

        if (isMatch) {
          downloadBlob(cached.result.filename, cached.result.blob);
          return;
        }
      }

      const result = exportEpubFromChapterStates(
        epubBook,
        chapterStates,
        scene,
        {
          textStyleCode: rawStyleCode,
          fontFamily: readerPreferences?.fontFamily,
          fallbackBaseName,
          uiLang: setting?.uiLang,
        },
        "target"
      );
      epubExportCacheRef.current.set("target", {
        fallbackBaseName,
        fontFamily: currentFontFamily,
        rawStyleCode: currentRawStyle,
        toLang: currentToLang,
        uiLang: currentUiLang,
        snapshot: getEpubExportChapterSnapshot(
          epubBook,
          chapterStates,
          "target",
          currentToLang
        ),
        result,
      });
      downloadBlob(result.filename, result.blob);
    } catch (e) {
      console.error("export target epub error:", e);
      setSnackbar({
        open: true,
        message: i18n("export_failed", "导出 EPUB 失败"),
      });
    }
  };

  // 导出当前章节 HTML
  const handleExportCurrentChapterHtml = () => {
    const currentChapter = epubBook?.spineItems?.[currentChapterIndex];
    if (!currentChapter) return;
    const state = chapterStates[currentChapter.fullPath];
    const isLangMatch =
      !state?.targetLang || !scene?.toLang || state.targetLang === scene.toLang;
    let htmlToExport = isLangMatch
      ? epubViewMode === "target"
        ? state?.targetHtml || ""
        : epubViewMode === "source"
          ? state?.sourceHtml || ""
          : state?.bilingualHtml || state?.sourceHtml || ""
      : epubViewMode === "source"
        ? state?.sourceHtml || ""
        : "";

    // 未翻译章节若无 state.sourceHtml，回退从原始 filesMap 读取
    if (!htmlToExport && epubBook?.filesMap?.[currentChapter.fullPath]) {
      const bytes = epubBook.filesMap[currentChapter.fullPath];
      if (bytes) {
        htmlToExport = fflate.strFromU8(bytes);
      }
    }

    if (!htmlToExport) return;
    const bookTitle = epubBook?.title || "book";
    const chapterTitle =
      currentChapter.title || `chapter_${currentChapterIndex + 1}`;

    // 解析文档，内嵌离线 Base64 图片，并提取干净的 body 内容以避免嵌套完整 XHTML
    let cleanBodyHtml = htmlToExport;
    try {
      const doc = parseXhtmlToDoc(htmlToExport);
      embedEpubImagesAsDataUrls(
        doc,
        currentChapter.fullPath,
        epubBook.filesMap
      );
      cleanBodyHtml = doc.body ? doc.body.innerHTML : serializeDocToXhtml(doc);
    } catch {
      cleanBodyHtml = htmlToExport;
    }

    // 严格净化导出的 HTML 正文内容，彻底剥离潜在的 <script> 标签与 on* 事件属性
    cleanBodyHtml = sanitizeEpubMarkup(cleanBodyHtml);

    const exportLang =
      epubViewMode === "source"
        ? scene?.fromLang || setting?.uiLang || "zh-CN"
        : scene?.toLang || setting?.uiLang || "zh-CN";
    let standalone = generateStandaloneHtml(
      cleanBodyHtml,
      `${bookTitle} - ${chapterTitle}`,
      rawStyleCode,
      exportLang
    );
    standalone = injectFooterIntoXhtml(standalone, exportLang);
    downloadText(`${bookTitle}-${chapterTitle}.html`, standalone);
  };

  // 试译当前章节
  const handleTranslateCurrentChapter = async () => {
    if (!connected || !epubBook || busy) return;
    const currentChapter = epubBook.spineItems[currentChapterIndex];
    if (!currentChapter) return;

    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const currentTaskId = ++taskIdRef.current;
    setBusy(true);
    setError("");

    setChapterStates((prev) => ({
      ...prev,
      [currentChapter.fullPath]: {
        ...(prev[currentChapter.fullPath] || {}),
        status: "busy",
      },
    }));

    try {
      if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
      const localContext = {
        kind: mode,
        cacheMode: ignoreCache ? "refresh" : undefined,
      };

      const result = await translateEpubChapter(
        currentChapter.fullPath,
        epubBook.filesMap,
        scene,
        setting,
        abort.signal,
        (done, total, detail) => {
          if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
            return;
          setProgress([done, total]);
          if (detail?.partialBilingualHtml || detail?.partialTargetHtml) {
            setChapterStates((prev) => {
              if (taskIdRef.current !== currentTaskId) return prev;
              return {
                ...prev,
                [currentChapter.fullPath]: {
                  ...(prev[currentChapter.fullPath] || {}),
                  status: "busy",
                  bilingualHtml:
                    detail.partialBilingualHtml ||
                    prev[currentChapter.fullPath]?.bilingualHtml,
                  targetHtml:
                    detail.partialTargetHtml ||
                    prev[currentChapter.fullPath]?.targetHtml,
                  bilingualXhtml:
                    detail.partialBilingualHtml ||
                    prev[currentChapter.fullPath]?.bilingualXhtml,
                  targetXhtml:
                    detail.partialTargetHtml ||
                    prev[currentChapter.fullPath]?.targetXhtml,
                },
              };
            });
          }
        },
        localContext
      );

      if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;

      setChapterStates((prev) => {
        if (taskIdRef.current !== currentTaskId) return prev;
        return {
          ...prev,
          [currentChapter.fullPath]: {
            status: "done",
            targetLang: scene.toLang,
            sourceHtml: result.sourceHtml,
            targetHtml: result.targetHtml,
            bilingualHtml: result.bilingualHtml,
            targetXhtml: result.targetXhtml || result.targetHtml,
            bilingualXhtml: result.bilingualXhtml || result.bilingualHtml,
          },
        };
      });
    } catch (err) {
      if (taskIdRef.current !== currentTaskId) return;
      if (!abort.signal.aborted) {
        setError(err?.message || String(err));
      }
      setChapterStates((prev) => {
        if (taskIdRef.current !== currentTaskId) return prev;
        const previousState = prev[currentChapter.fullPath];
        if (previousState?.status === "done") {
          return prev;
        }
        return {
          ...prev,
          [currentChapter.fullPath]: {
            status: "idle",
            sourceHtml: previousState?.sourceHtml || "",
          },
        };
      });
    } finally {
      if (taskIdRef.current === currentTaskId) {
        setBusy(false);
      }
      if (controller.current === abort) {
        controller.current = null;
      }
    }
  };

  // 翻译整本电子书
  const handleTranslateEntireEpubBook = async () => {
    if (!connected || !epubBook || busy) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const currentTaskId = ++taskIdRef.current;
    setBusy(true);
    setError("");
    setProgress([0, epubBook.spineItems.length]);

    try {
      if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
      const localContext = {
        kind: mode,
        cacheMode: ignoreCache ? "refresh" : undefined,
      };

      const result = await translateEpubBook(
        epubBook,
        scene,
        setting,
        abort.signal,
        (doneChapters, totalChapters, doneParas, totalParas, detail) => {
          if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
            return;
          setProgress([doneChapters, totalChapters]);
          if (detail?.currentChapter) {
            const chPath = detail.currentChapter.fullPath;
            if (detail.partialBilingualHtml || detail.partialTargetHtml) {
              setChapterStates((prev) => {
                if (taskIdRef.current !== currentTaskId) return prev;
                return {
                  ...prev,
                  [chPath]: {
                    ...(prev[chPath] || {}),
                    status: "busy",
                    bilingualHtml:
                      detail.partialBilingualHtml ||
                      prev[chPath]?.bilingualHtml,
                    targetHtml:
                      detail.partialTargetHtml || prev[chPath]?.targetHtml,
                    bilingualXhtml:
                      detail.partialBilingualHtml ||
                      prev[chPath]?.bilingualXhtml,
                    targetXhtml:
                      detail.partialTargetHtml || prev[chPath]?.targetXhtml,
                  },
                };
              });
            }
          }
          if (detail?.chapterCompleted && detail?.currentChapter) {
            const chPath = detail.currentChapter.fullPath;
            setChapterStates((prev) => {
              if (taskIdRef.current !== currentTaskId) return prev;
              return {
                ...prev,
                [chPath]: {
                  status: "done",
                  targetLang: scene.toLang,
                  bilingualHtml: detail.bilingualHtml,
                  targetHtml: detail.targetHtml,
                  sourceHtml: detail.sourceHtml,
                  bilingualXhtml: detail.bilingualHtml,
                  targetXhtml: detail.targetHtml,
                },
              };
            });
          }
        },
        localContext,
        { textStyleCode: rawStyleCode }
      );

      if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;

      if (result.chapterResults) {
        const nextStates = {};
        for (const [path, r] of Object.entries(result.chapterResults)) {
          nextStates[path] = {
            status: "done",
            targetLang: scene.toLang,
            sourceHtml: r.sourceHtml,
            targetHtml: r.targetHtml,
            bilingualHtml: r.bilingualHtml,
            targetXhtml: r.targetXhtml || r.targetHtml,
            bilingualXhtml: r.bilingualXhtml || r.bilingualHtml,
          };
        }
        setChapterStates(nextStates);
      }
      setSnackbar({
        open: true,
        message: i18n(
          "epub_translate_complete",
          "整本电子书翻译完成，可以下载 EPUB 文件！"
        ),
      });
    } catch (err) {
      if (taskIdRef.current !== currentTaskId) return;
      if (!abort.signal.aborted) {
        setError(err?.message || String(err));
      }
      // 收敛那些处于 busy 状态的未完成章节为 idle，避免挂起
      setChapterStates((prev) => {
        if (taskIdRef.current !== currentTaskId) return prev;
        const next = { ...prev };
        let changed = false;
        for (const [path, item] of Object.entries(next)) {
          if (item?.status === "busy") {
            next[path] = {
              status: "idle",
              sourceHtml: item?.sourceHtml || "",
            };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } finally {
      if (taskIdRef.current === currentTaskId) {
        setBusy(false);
      }
      if (controller.current === abort) {
        controller.current = null;
      }
    }
  };

  // 更新阅读排版偏好
  const handleUpdateReaderPreferences = (patch) => {
    const next = { ...readerPreferences, ...patch };
    setReaderPreferences(next);
    patchScene({ readerPreferences: next });
  };

  // 检查并启动翻译（若为整篇翻译且字符数超过 10,000 则弹窗确认）
  const handleStartTranslation = async (scope = "paragraph") => {
    setTranslateMenuAnchor(null);
    if (!connected || !file || busy) return;
    const currentTaskId = taskIdRef.current;
    const targetFile = file;

    const rawContent =
      scope === "entire"
        ? sourceText || (file ? await readTxtFile(file) : "")
        : "";

    // 校验异步读取文件期间，任务会话与选定文件未被变更
    if (taskIdRef.current !== currentTaskId || file !== targetFile) {
      return;
    }

    if (scope === "entire" && rawContent.length > 10000) {
      setConfirmDialogOpen(true);
      return;
    }
    run(scope);
  };

  const toggleImageRegion = (index) => {
    if (busy || !hasImagePolygon(rows[index]?.poly)) return;
    setRows((previous) =>
      previous.map((row, rowIndex) =>
        rowIndex === index ? { ...row, enabled: row.enabled === false } : row
      )
    );
    setTranslatedImageBlob(null);
    setTranslatedImageUrl("");
  };

  // 图片各阶段共享任务保护，一键翻译复用当前有效识别与选区。
  const runImageAction = async (
    action,
    fontFamily = scene.fontFamily || "default"
  ) => {
    setImageActionAnchor(null);
    if (!file || busy || (action !== "synthesize" && !connected)) return;
    if ((action === "all" || action === "recognize") && !hasRecognitionService)
      return;
    if (
      (action === "translate" ||
        (action === "all" && hasCurrentImageRecognition)) &&
      !selectedImageRows.length
    )
      return;
    if (
      action === "synthesize" &&
      (!imageTranslationComplete || !hasImageCoordinates)
    )
      return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const currentTaskId = ++taskIdRef.current;
    const assertCurrent = () => {
      if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
        throw new DOMException("已取消", "AbortError");
    };
    setBusy(true);
    setError("");
    setProgress([0, 0]);
    setTranslatedImageBlob(null);
    setTranslatedImageUrl("");
    setImageFailure(null);
    let currentStage = action;
    let nextRows = rows;
    try {
      if (
        action === "recognize" ||
        (action === "all" && (!hasCurrentImageRecognition || ignoreCache))
      ) {
        currentStage = "recognize";
        setImageStage("recognize");
        setInputNotices([]);
        imageRecognition.current = {
          file,
          signature: imageRecognitionSignature,
          ready: false,
        };
        setShowImageRegions(true);
        setRows([]);
        setResultViewMode("source");
        const recognitionOptions = {
          promptSlug: scene.vlmPromptSlug || "",
          ...(ignoreCache && { cacheMode: "refresh" }),
        };
        const recognized = activeLayoutApi
          ? await recognizeImageWithLayout(file, {
              client,
              selection: recognitionSelection,
              layoutApi: activeLayoutApi,
              coordinates: recognitionFeature(
                activeRecognitionApi,
                recognitionSelection?.capability
              )?.coordinates,
              signal: abort.signal,
              ...recognitionOptions,
            })
          : await client.recognize(
              file,
              recognitionSelection,
              abort.signal,
              recognitionOptions
            );
        if (
          !recognized?.text?.trim() &&
          !recognized?.items?.some((item) => item.text?.trim())
        )
          throw new Error("图片识别返回空结果");
        if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
        const items = recognized.items?.length
          ? recognized.items
          : (recognized.text || "")
              .split(/\n+/)
              .filter((text) => text.trim())
              .map((text) => ({ text }));
        setInputNotices([
          ...(recognized.layoutApplied === false
            ? [
                i18n(
                  "image_layout_empty",
                  "布局分析未检测到可用区域，按识别结果分段"
                ),
              ]
            : []),
          ...(!activeLayoutApi
            ? [
                i18n(
                  "image_layout_unavailable",
                  "未配置可用的布局服务，按识别结果分段；请选择布局服务以合并段落"
                ),
              ]
            : []),
          ...(recognized.inputAdjustments || []).map((item) => item.message),
          ...(!items.some((item) => hasImagePolygon(item.poly))
            ? [
                i18n(
                  "image_region_selection_unavailable",
                  "识别结果没有文字坐标，无法通过线框选择，将翻译全部文字"
                ),
              ]
            : []),
        ]);

        nextRows = items.map((item) => ({
          source: item.text,
          target: "",
          enabled: true,
          translated: false,
          poly: item.poly,
          box: item.box,
          ...(item.type && { type: item.type }),
          ...(item.label && { label: item.label }),
        }));
        if (action === "all") {
          nextRows = nextRows.map((row) => {
            const old = rows.find(
              (previous) =>
                previous.source === row.source &&
                JSON.stringify(previous.poly) === JSON.stringify(row.poly)
            );
            return old ? { ...row, enabled: old.enabled } : row;
          });
        }
        imageRecognition.current.ready = true;
        setRows(nextRows);
      }
      if (action === "all" || action === "translate") {
        assertCurrent();
        currentStage = "translate";
        setImageStage("translate");
        nextRows = nextRows.map((row) =>
          (ignoreCache || row.translationKey !== imageTranslationKey) &&
          row.enabled !== false &&
          row.source?.trim()
            ? { ...row, target: "", translated: false }
            : row
        );
        setRows(nextRows);
        setResultViewMode("target");
        let completed = 0;
        const tasks = nextRows
          .map((row, index) => ({ row, index }))
          .filter(
            ({ row }) =>
              row.enabled !== false &&
              row.source?.trim() &&
              (!row.translated || ignoreCache)
          );
        setProgress([0, tasks.length]);
        await runTranslationTasks(
          tasks.map(({ row, index }) => async (signal) => {
            assertCurrent();
            let target;
            try {
              target = await translateFileText(
                row.source,
                scene,
                setting,
                signal,
                {
                  kind: "image",
                  cacheMode: ignoreCache || row.error ? "refresh" : undefined,
                }
              );
            } catch (error) {
              if (!signal.aborted && taskIdRef.current === currentTaskId) {
                nextRows[index] = { ...row, error: error.message };
                setRows([...nextRows]);
              }
              throw error;
            }
            if (signal.aborted) throw new DOMException("已取消", "AbortError");
            assertCurrent();
            nextRows[index] = {
              ...row,
              target,
              translated: true,
              translationKey: imageTranslationKey,
              error: undefined,
            };
            setRows([...nextRows]);
            setProgress([++completed, tasks.length]);
          }),
          abort.signal
        );
        assertCurrent();
      }
      if (action === "all" || action === "synthesize") {
        assertCurrent();
        const selected = nextRows.filter(
          (row) => row.enabled !== false && row.source?.trim()
        );
        if (hasCompleteCoordinates(selected, "source")) {
          currentStage = "synthesize";
          setImageStage("synthesize");
          setProgress([0, 0]);
          const blob = await synthesizeTranslatedImage(file, selected, {
            fontFamily,
            preservePolygons: nextRows
              .filter(
                (row) => row.enabled === false && hasImagePolygon(row.poly)
              )
              .map((row) => row.poly),
          });
          assertCurrent();
          if (!blob)
            throw new Error(
              i18n("image_synthesis_failed", "图片合成失败，请重试")
            );
          setTranslatedImageBlob(blob);
          setTranslatedImageUrl(URL.createObjectURL(blob));
          setResultViewMode("image");
        } else {
          setInputNotices((previous) => [
            ...previous,
            i18n("image_no_coordinates", "识别结果没有区域坐标，无法合成译图"),
          ]);
        }
      }
    } catch (err) {
      if (
        taskIdRef.current === currentTaskId &&
        !abort.signal.aborted &&
        err?.name !== "AbortError"
      ) {
        const message = err?.message || String(err);
        setError(message);
        setImageFailure({ stage: currentStage, message });
      }
    } finally {
      if (taskIdRef.current === currentTaskId) {
        setBusy(false);
        setImageStage("");
      }
      if (controller.current === abort) controller.current = null;
    }
  };

  // 主按钮和菜单使用同一套动作前置条件。
  const getPdfActionDisabledInfo = (action) => {
    const translatingDuringRecognition =
      action === "translate" &&
      pdfState.recognitionBusy &&
      !pdfState.translationBusy &&
      !pdfState.automaticBusy;
    if (!file || busy || (pdfState.busy && !translatingDuringRecognition)) {
      return { disabled: true, reason: "" };
    }
    if (!connected) {
      return {
        disabled: true,
        reason: i18n("service_not_connected", "服务未连接"),
      };
    }
    if (action === "detect") {
      if (!hasLayoutService) {
        return {
          disabled: true,
          reason: i18n(
            "layout_service_empty",
            "未配置界面分析服务（请在服务配置中添加）"
          ),
        };
      }
      return { disabled: false, reason: "" };
    }
    if (action === "recognize") {
      if (!pdfState.hasLayoutResult) {
        return {
          disabled: true,
          reason: i18n("pdf_detect_layout_first", "请先执行布局检测"),
        };
      }
      return { disabled: false, reason: "" };
    }
    if (action === "translate") {
      if (
        pdfState.canTranslate === false ||
        (pdfState.canTranslate === undefined &&
          (!pdfState.blocks?.length || !pdfState.result?.complete))
      ) {
        return {
          disabled: true,
          reason: i18n(
            "pdf_ready_translation_empty",
            "暂无已识别且待翻译的内容"
          ),
        };
      }
      return { disabled: false, reason: "" };
    }
    // "all" 一键翻译
    if (scene.parseMode === "smart" && !hasLayoutService) {
      return {
        disabled: true,
        reason: i18n(
          "layout_service_empty",
          "未配置界面分析服务（请在服务配置中添加）"
        ),
      };
    }
    return { disabled: false, reason: "" };
  };
  const pdfActionDisabledInfo = getPdfActionDisabledInfo("all");

  // 菜单直接执行指定动作，主按钮始终执行一键翻译。
  const runPdfAction = (action) => {
    setPdfActionAnchor(null);
    if (getPdfActionDisabledInfo(action).disabled) return;
    if (action === "detect") {
      if (scene.parseMode !== "smart") {
        patchScene({ parseMode: "smart" });
      }
      pdfWorkspaceRef.current?.detectLayout();
    } else if (action === "recognize") {
      pdfWorkspaceRef.current?.recognizeText();
    } else if (action === "translate") {
      pdfWorkspaceRef.current?.translate();
    } else {
      // "all"
      (
        pdfWorkspaceRef.current?.oneClickTranslate ||
        pdfWorkspaceRef.current?.parseAndTranslate
      )?.();
    }
  };

  // 执行翻译流程
  const run = async (scope = "paragraph") => {
    if (!connected || !file || busy) return;
    setInputNotices([]);
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const currentTaskId = ++taskIdRef.current;
    setBusy(true);
    setError("");
    if (mode === "markdown") {
      setRows([]);
      setResultText("");
      setBilingualMd("");
    } else {
      resetResults();
    }
    setProgress([0, 0]);
    try {
      if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
      const localContext = {
        kind: mode,
        cacheMode: ignoreCache ? "refresh" : undefined,
      };

      if (scope === "entire" && (mode === "txt" || mode === "markdown")) {
        setIsEntireTranslated(true);
        setResultViewMode("target"); // 整篇翻译自动切换为译文视图
        const content = sourceText || (await readTxtFile(file));
        if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;

        if (mode === "txt") {
          const result = await translateEntireTxt(
            content,
            scene,
            setting,
            abort.signal,
            localContext
          );
          if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
            return;
          setRows([]);
          setResultText(result.text);
          setProgress([1, 1]);
        } else {
          const result = await translateEntireMarkdown(
            content,
            scene,
            setting,
            abort.signal,
            localContext
          );
          if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
            return;
          setRows([]);
          setResultText(result.translatedMd);
          setBilingualMd("");
          setTranslatedHtml(result.translatedHtml);
          setBilingualHtml("");
          setSourceHtml(result.sourceHtml);
          setMdBlocks(result.blocks || []);
          setProgress([1, 1]);
        }
      } else if (mode === "txt") {
        setIsEntireTranslated(false);
        const content = sourceText || (await readTxtFile(file));
        if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
        const nextRows = [];
        const result = await translateTxt(
          content,
          scene,
          setting,
          abort.signal,
          (done, total, item) => {
            if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
              return;
            setProgress([done, total]);
            if (item) {
              nextRows[item.index] = item;
              setRows(nextRows.filter(Boolean));
            }
          },
          localContext
        );
        if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
        setRows(result.comparisons);
        setResultText(result.text);
      } else if (mode === "markdown") {
        setIsEntireTranslated(false);
        const content = sourceText || (await readTxtFile(file));
        if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
        const nextRows = [];
        const result = await translateMarkdown(
          content,
          scene,
          setting,
          abort.signal,
          (done, total, item, currentBlocks) => {
            if (abort.signal.aborted || taskIdRef.current !== currentTaskId)
              return;
            setProgress([done, total]);
            if (item) {
              nextRows[item.index] = item;
              setRows(nextRows.filter(Boolean));
            }
            if (currentBlocks) {
              setMdBlocks([...currentBlocks]);
              setTranslatedHtml(
                renderMarkdownBlocksToHtml(currentBlocks, {
                  mode: "target",
                  textStyleClass,
                })
              );
              setBilingualHtml(
                renderMarkdownBlocksToHtml(currentBlocks, {
                  mode: "bilingual",
                  textStyleClass,
                })
              );
            }
          },
          localContext
        );
        if (abort.signal.aborted || taskIdRef.current !== currentTaskId) return;
        setRows(result.comparisons);
        setResultText(result.translatedMd);
        setBilingualMd(result.bilingualMd);
        setTranslatedHtml(result.translatedHtml);
        setBilingualHtml(result.bilingualHtml);
        setSourceHtml(result.sourceHtml);
        setMdBlocks(result.blocks || []);
      }
    } catch (err) {
      if (taskIdRef.current !== currentTaskId) return;
      if (err?.name === "AbortError" || abort.signal.aborted) {
        // 用户主动取消
      } else {
        setError(
          i18n("translate_failed", "翻译失败：") + (err?.message || String(err))
        );
      }
    } finally {
      if (taskIdRef.current === currentTaskId) {
        setBusy(false);
      }
      if (controller.current === abort) {
        controller.current = null;
      }
    }
  };

  // 核心下拉配置选项（源语言/目标语言、翻译服务、提示词、样式及 OCR 等参数）
  const renderConfigControls = () => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        rowGap: 1.75,
        minWidth: 0,
        flexWrap: "wrap",
      }}
    >
      <FileTranslateSettings
        i18n={i18n}
        scene={scene}
        services={(setting?.transApis || []).filter((api) => !api.isDisabled)}
        prompts={context.prompts}
        onChange={(values) => {
          if (values.fromLang !== undefined) {
            const fromLang = values.fromLang;

            if (fromLang === scene.fromLang) return;
            controller.current?.abort();
            taskIdRef.current += 1;
            setBusy(false);
            setError("");
            setChapterStates({});
            epubExportCacheRef.current.clear();
            patchScene({ fromLang });
          } else if (values.toLang !== undefined) {
            const toLang = values.toLang;

            if (toLang === scene.toLang) return;
            controller.current?.abort();
            taskIdRef.current += 1;
            setBusy(false);
            setError("");
            setChapterStates({});
            epubExportCacheRef.current.clear();
            patchScene({ toLang });
          } else patchScene(values);
        }}
      />

      {(mode === "image" || mode === "pdf") && isVlmRecognition && (
        <Box sx={{ width: 170, flexShrink: 0 }}>
          <ScenePromptSelect
            i18n={i18n}
            prompts={context.prompts}
            category={PROMPT_CATEGORY_VLM}
            fullWidth
            size="small"
            variant="outlined"
            hiddenLabel={false}
            label={i18n("vlm_prompt", "视觉解析提示词")}
            value={scene.vlmPromptSlug || ""}
            onChange={(vlmPromptSlug) => patchScene({ vlmPromptSlug })}
          />
        </Box>
      )}

      {file && (mode === "txt" || mode === "markdown") && (
        <Box sx={{ width: 160, flexShrink: 0 }}>
          <SettingsSelect
            fullWidth
            variant="outlined"
            hiddenLabel={false}
            label={i18n("file_text_format", "文本格式")}
            value={mode}
            disabled={busy}
            options={[
              { value: "txt", label: "TXT" },
              { value: "markdown", label: "Markdown" },
            ]}
            onChange={requestTextMode}
          />
        </Box>
      )}

      {/* 译文样式选项（在双语展示文本、电子书与 PDF 翻译时生效） */}
      {(mode === "txt" ||
        mode === "markdown" ||
        mode === "epub" ||
        mode === "pdf") && (
        <Box sx={{ width: 140, flexShrink: 0 }}>
          <SettingsSelect
            fullWidth
            size="small"
            variant="outlined"
            hiddenLabel={false}
            label={i18n("text_style", "译文样式")}
            value={scene.textStyle || "style_none"}
            options={allTextStyles.map((s) => ({
              value: s.styleSlug,
              label: s.styleName || i18n(s.styleSlug) || s.styleSlug,
            }))}
            onChange={(textStyle) => patchScene({ textStyle })}
          />
        </Box>
      )}

      {/* PDF 解析模式 */}
      {mode === "pdf" && (
        <>
          <Box sx={{ width: 165, flexShrink: 0 }}>
            <SettingsSelect
              disabled={pdfState.busy}
              fullWidth
              size="small"
              variant="outlined"
              hiddenLabel={false}
              label={i18n("pdf_parse_mode", "解析模式")}
              value={scene.parseMode || "smart"}
              options={[
                {
                  value: "smart",
                  label: i18n("pdf_parse_mode_smart", "Smart (智能版面)"),
                },
                {
                  value: "fast",
                  label: i18n("pdf_parse_mode_fast", "Fast (纯文本快速)"),
                },
              ]}
              onChange={(parseMode) => patchScene({ parseMode })}
            />
          </Box>
          {scene.parseMode === "smart" && (
            <Box sx={{ width: 220, flexShrink: 0 }}>
              <SettingsSelect
                fullWidth
                size="small"
                variant="outlined"
                hiddenLabel={false}
                disabled={pdfState.busy}
                label={i18n("layout_service", "界面分析服务")}
                value={currentLayoutSlug}
                options={layoutSelectOptions}
                onChange={handleLayoutServiceChange}
              />
            </Box>
          )}
        </>
      )}

      {mode === "image" && (
        <Box sx={{ width: 220, flexShrink: 0 }}>
          <SettingsSelect
            fullWidth
            size="small"
            variant="outlined"
            hiddenLabel={false}
            disabled={busy}
            label={i18n("layout_service", "界面分析服务")}
            value={currentLayoutSlug}
            options={layoutSelectOptions}
            onChange={handleLayoutServiceChange}
          />
        </Box>
      )}

      {/* 富文本选项（EPUB 电子书翻译时生效，控制是否保留内联标签） */}
      {mode === "epub" && (
        <Box sx={{ width: 140, flexShrink: 0 }}>
          <SettingsSelect
            fullWidth
            size="small"
            variant="outlined"
            hiddenLabel={false}
            label={i18n("rich_text", "富文本")}
            value={scene?.hasRichText ?? "true"}
            options={[
              { value: "true", label: i18n("rich_text_keep", "保留富文本") },
              {
                value: "false",
                label: i18n("rich_text_strip", "纯净文本(忽略标签)"),
              },
            ]}
            onChange={(hasRichText) => patchScene({ hasRichText })}
          />
        </Box>
      )}

      {(mode === "image" || mode === "pdf") && (
        <Box sx={{ width: 250, flexShrink: 0 }}>
          <SettingsSelect
            fullWidth
            size="small"
            variant="outlined"
            hiddenLabel={false}
            disabled={busy || pdfState.busy}
            label={i18n("recognition_service", "文本识别服务")}
            value={
              recognitionSelection ? JSON.stringify(recognitionSelection) : ""
            }
            options={recognitionSelectOptions}
            onChange={handleRecognitionChange}
          />
        </Box>
      )}
      {mode === "pdf" && (
        <Box sx={{ width: 220, flexShrink: 0 }}>
          <SettingsSelect
            fullWidth
            size="small"
            variant="outlined"
            hiddenLabel={false}
            disabled={pdfState.busy}
            label={i18n("vision_service", "表格/公式解析服务")}
            value={scene.visionServiceSlug || ""}
            options={visionOptions}
            onChange={(visionServiceSlug) => patchScene({ visionServiceSlug })}
          />
        </Box>
      )}
      {mode === "image" && (
        <>
          {selectedRecognitionFeature &&
            !selectedRecognitionFeature.coordinates && (
              <Typography variant="caption" color="text.secondary">
                {i18n(
                  "recognition_text_only_hint",
                  "所选服务仅输出文本，可查看译文与双语，无法原位合成译图。"
                )}
              </Typography>
            )}
          <Box sx={{ width: 135, flexShrink: 0 }}>
            <SettingsSelect
              fullWidth
              size="small"
              variant="outlined"
              hiddenLabel={false}
              label={i18n("image_font_family", "译文字体")}
              value={scene.fontFamily || "default"}
              options={IMAGE_FONT_OPTIONS}
              onChange={handleFontChange}
            />
          </Box>
        </>
      )}
      {file && (
        <FormControlLabel
          sx={{ ml: 0, mr: 0, flexShrink: 0 }}
          control={
            <Switch
              size="small"
              checked={ignoreCache}
              disabled={busy || pdfState.busy}
              onChange={(event) => setIgnoreCache(event.target.checked)}
            />
          }
          label={i18n("file_ignore_cache", "忽略缓存")}
        />
      )}
    </Box>
  );

  return (
    <Box
      className="kt-m2-root"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        bgcolor: "background.default",
        color: "text.primary",
        position: "relative",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) selectFile(droppedFile);
      }}
    >
      {/* 隐藏的文件输入控件 */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept=".pdf,.txt,.md,.markdown,.epub,application/pdf,text/plain,text/markdown,application/epub+zip,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          selectFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* 模块 1：顶部工具栏（>=1600px 单行展示，<1600px 折叠为双行并支持小箭头展开/收起） */}
      <FileTranslateToolbar
        actions={
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentPasteRoundedIcon sx={{ fontSize: 18 }} />}
              sx={{
                height: 32,
                borderRadius: "4px",
                fontSize: 13,
                px: 1.5,
                whiteSpace: "nowrap",
                textTransform: "none",
              }}
              onClick={() => {
                setPasteError("");
                setPasteOpen(true);
              }}
            >
              {i18n("file_paste", "粘贴文件或文本")}
            </Button>
            {file && (
              <Chip
                icon={
                  mode === "image" ? (
                    <ImageRoundedIcon sx={{ fontSize: 16 }} />
                  ) : mode === "epub" ? (
                    <MenuBookRoundedIcon sx={{ fontSize: 16 }} />
                  ) : mode === "pdf" ? (
                    <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <InsertDriveFileRoundedIcon sx={{ fontSize: 16 }} />
                  )
                }
                label={
                  mode === "epub" && epubBook
                    ? `${epubBook.title} (${epubBook.spineItems.length} ${i18n("epub_chapters_count", "章")})`
                    : mode === "pdf" && pdfState.pdf
                      ? `${file.name} (${pdfState.pdf.numPages} ${i18n("pdf_pages_count", "页")})`
                      : `${file.name} (${formatFileSize(file.size)})`
                }
                variant="outlined"
                color="primary"
                size="small"
                onDelete={handleClearFile}
                onClick={() => fileInputRef.current?.click()}
                title={i18n("chip_file_hint", "点击更换文件，点击叉号移除文件")}
                sx={{
                  height: 32,
                  borderRadius: "4px",
                  maxWidth: 200,
                  fontSize: 12,
                  cursor: "pointer",
                  boxSizing: "border-box",
                  "& .MuiChip-label": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                }}
              />
            )}

            {mode === "image" && busy && (
              <Typography variant="caption" role="status">
                {imageStage === "recognize"
                  ? i18n("image_recognizing", "正在识别...")
                  : imageStage === "synthesize"
                    ? i18n("image_synthesizing", "正在合成...")
                    : i18n("translating", "正在翻译...")}
              </Typography>
            )}
            {mode === "epub" ? (
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<PlayArrowRoundedIcon sx={{ fontSize: 18 }} />}
                disabled={!connected || !file || busy || !epubBook}
                onClick={handleTranslateEntireEpubBook}
                sx={{
                  height: 32,
                  borderRadius: "4px",
                  fontWeight: 600,
                  px: 1.75,
                  whiteSpace: "nowrap",
                  textTransform: "none",
                  fontSize: 13,
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none" },
                }}
              >
                {i18n("file_translate_one_click", "一键翻译")}
              </Button>
            ) : mode === "pdf" ? (
              <>
                <ButtonGroup
                  variant="contained"
                  size="small"
                  sx={{ height: 32, boxShadow: "none" }}
                >
                  <Tooltip
                    title={pdfActionDisabledInfo.reason || ""}
                    placement="bottom"
                    disableHoverListener={!pdfActionDisabledInfo.reason}
                  >
                    <span style={{ display: "inline-flex", height: "100%" }}>
                      <Button
                        startIcon={
                          <PlayArrowRoundedIcon sx={{ fontSize: 18 }} />
                        }
                        disabled={pdfActionDisabledInfo.disabled}
                        onClick={() => runPdfAction("all")}
                        sx={{
                          height: 32,
                          fontWeight: 600,
                          px: 1.75,
                          whiteSpace: "nowrap",
                          textTransform: "none",
                          fontSize: 13,
                          boxShadow: "none",
                          borderTopRightRadius: 0,
                          borderBottomRightRadius: 0,
                          "&:hover": { boxShadow: "none" },
                        }}
                      >
                        {i18n("pdf_translate_one_click", "一键翻译")}
                      </Button>
                    </span>
                  </Tooltip>
                  <Button
                    size="small"
                    disabled={
                      !file ||
                      busy ||
                      (pdfState.busy &&
                        (!pdfState.recognitionBusy || pdfState.automaticBusy))
                    }
                    aria-label={i18n("pdf_actions", "PDF 处理步骤")}
                    aria-haspopup="menu"
                    aria-expanded={Boolean(pdfActionAnchor)}
                    onClick={(e) => setPdfActionAnchor(e.currentTarget)}
                    sx={{ px: 0.5 }}
                  >
                    <ArrowDropDownRoundedIcon />
                  </Button>
                </ButtonGroup>
                <Menu
                  anchorEl={pdfActionAnchor}
                  open={Boolean(pdfActionAnchor)}
                  onClose={() => setPdfActionAnchor(null)}
                >
                  <Tooltip
                    title={getPdfActionDisabledInfo("detect").reason}
                    placement="right"
                  >
                    <span>
                      <MenuItem
                        disabled={getPdfActionDisabledInfo("detect").disabled}
                        onClick={() => runPdfAction("detect")}
                      >
                        {i18n("pdf_detect_layout", "布局检测")}
                      </MenuItem>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={getPdfActionDisabledInfo("recognize").reason}
                    placement="right"
                  >
                    <span>
                      <MenuItem
                        disabled={
                          getPdfActionDisabledInfo("recognize").disabled
                        }
                        onClick={() => runPdfAction("recognize")}
                      >
                        {i18n("pdf_recognize_text", "文本识别")}
                      </MenuItem>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={getPdfActionDisabledInfo("translate").reason}
                    placement="right"
                  >
                    <span>
                      <MenuItem
                        disabled={
                          getPdfActionDisabledInfo("translate").disabled
                        }
                        onClick={() => runPdfAction("translate")}
                      >
                        {i18n("pdf_translate_text", "文本翻译")}
                      </MenuItem>
                    </span>
                  </Tooltip>
                </Menu>
              </>
            ) : mode === "image" ? (
              <>
                <ButtonGroup
                  variant="contained"
                  size="small"
                  sx={{ height: 32, boxShadow: "none" }}
                >
                  <Button
                    startIcon={<PlayArrowRoundedIcon />}
                    disabled={
                      !connected ||
                      !file ||
                      busy ||
                      !hasRecognitionService ||
                      (hasCurrentImageRecognition && !selectedImageRows.length)
                    }
                    title={
                      hasCurrentImageRecognition && !selectedImageRows.length
                        ? i18n(
                            "image_select_region_first",
                            "请至少选择一个文字区域"
                          )
                        : ""
                    }
                    onClick={() => runImageAction("all")}
                  >
                    {i18n("image_translate_all", "一键翻译")}
                  </Button>
                  <Button
                    disabled={!file || busy}
                    aria-label={i18n("image_actions", "图片处理步骤")}
                    aria-haspopup="menu"
                    aria-expanded={Boolean(imageActionAnchor)}
                    onClick={(event) =>
                      setImageActionAnchor(event.currentTarget)
                    }
                  >
                    <ArrowDropDownRoundedIcon />
                  </Button>
                </ButtonGroup>
                <Menu
                  anchorEl={imageActionAnchor}
                  open={Boolean(imageActionAnchor)}
                  onClose={() => setImageActionAnchor(null)}
                >
                  <MenuItem
                    disabled={!connected || !hasRecognitionService || busy}
                    onClick={() => runImageAction("recognize")}
                  >
                    {activeLayoutApi
                      ? i18n("image_layout_recognize", "布局与识别")
                      : i18n("image_recognize", "识别文本")}
                  </MenuItem>
                  <MenuItem
                    disabled={!connected || !selectedImageRows.length || busy}
                    onClick={() => runImageAction("translate")}
                    title={
                      !rows.length
                        ? activeLayoutApi
                          ? i18n(
                              "image_layout_recognize_first",
                              "请先执行布局与识别"
                            )
                          : i18n("image_recognize_first", "请先识别文本")
                        : !selectedImageRows.length
                          ? i18n(
                              "image_select_region_first",
                              "请至少选择一个文字区域"
                            )
                          : ""
                    }
                  >
                    {i18n("image_translate_text", "翻译文本")}
                  </MenuItem>
                  <MenuItem
                    disabled={
                      !imageTranslationComplete || !hasImageCoordinates || busy
                    }
                    onClick={() => runImageAction("synthesize")}
                    title={
                      !selectedImageRows.length
                        ? i18n(
                            "image_select_region_first",
                            "请至少选择一个文字区域"
                          )
                        : !imageTranslationComplete
                          ? i18n("image_translate_first", "请先完成文本翻译")
                          : !hasImageCoordinates
                            ? i18n(
                                "image_no_coordinates",
                                "识别结果没有区域坐标，无法合成译图"
                              )
                            : ""
                    }
                  >
                    {i18n("image_synthesize", "合成图片")}
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <>
                <ButtonGroup
                  variant="contained"
                  color="primary"
                  size="small"
                  disabled={!connected || !file || busy}
                  sx={{
                    height: 32,
                    borderRadius: "4px",
                    boxShadow: "none",
                    "&:hover": { boxShadow: "none" },
                    "& .MuiButtonGroup-grouped": {
                      borderColor: "rgba(255, 255, 255, 0.25)",
                    },
                  }}
                >
                  <Button
                    startIcon={<PlayArrowRoundedIcon sx={{ fontSize: 18 }} />}
                    onClick={() => handleStartTranslation("paragraph")}
                    sx={{
                      height: 32,
                      fontWeight: 600,
                      px: 1.5,
                      whiteSpace: "nowrap",
                      textTransform: "none",
                      fontSize: 13,
                      boxShadow: "none",
                      "&:hover": { boxShadow: "none" },
                    }}
                  >
                    {i18n("file_translate_one_click", "一键翻译")}
                  </Button>
                  <Button
                    size="small"
                    color="primary"
                    onClick={(e) => setTranslateMenuAnchor(e.currentTarget)}
                    disabled={!file || busy}
                    sx={{
                      px: 0.5,
                      minWidth: 28,
                      height: 32,
                      boxShadow: "none",
                      "&:hover": { boxShadow: "none" },
                    }}
                    aria-label={i18n(
                      "select_translation_scope",
                      "选择翻译模式"
                    )}
                    title={i18n("select_translation_scope", "选择翻译模式")}
                  >
                    <ArrowDropDownRoundedIcon sx={{ fontSize: 20 }} />
                  </Button>
                </ButtonGroup>

                <Menu
                  anchorEl={translateMenuAnchor}
                  open={Boolean(translateMenuAnchor)}
                  onClose={() => setTranslateMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    disabled={!connected || !file || busy}
                    onClick={() => handleStartTranslation("paragraph")}
                  >
                    {i18n("scope_paragraph_label", "分段翻译 (默认)")}
                  </MenuItem>
                  <MenuItem
                    disabled={!connected || !file || busy}
                    onClick={() => handleStartTranslation("entire")}
                  >
                    {i18n("scope_entire_label", "整篇翻译 (全文连贯)")}
                  </MenuItem>
                </Menu>
              </>
            )}

            {(busy || (mode === "pdf" && pdfState.busy)) && (
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                startIcon={<StopRoundedIcon sx={{ fontSize: 18 }} />}
                onClick={() => {
                  controller.current?.abort();
                  if (mode === "pdf") pdfWorkspaceRef.current?.abort();
                }}
                sx={{
                  height: 32,
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  textTransform: "none",
                  fontSize: 13,
                  px: 1.5,
                }}
              >
                {i18n("cancel", "取消")}
              </Button>
            )}

            {mode === "epub" ? (
              <>
                <ButtonGroup
                  variant="outlined"
                  color="inherit"
                  size="small"
                  disabled={busy}
                  sx={{
                    height: 32,
                    borderRadius: "4px",
                  }}
                >
                  <Button
                    startIcon={
                      <FileDownloadRoundedIcon sx={{ fontSize: 18 }} />
                    }
                    onClick={
                      epubViewMode === "target"
                        ? handleDownloadTargetEpub
                        : handleDownloadBilingualEpub
                    }
                    sx={{
                      height: 32,
                      textTransform: "none",
                      fontSize: 13,
                      px: 1.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {epubViewMode === "target"
                      ? i18n("download_translated_epub", "下载译文 EPUB")
                      : i18n("download_bilingual_epub", "下载双语 EPUB")}
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
                    disabled={busy}
                    sx={{ px: 0.5, minWidth: 28, height: 32 }}
                    title={i18n("more_export_options", "更多导出选项")}
                  >
                    <ArrowDropDownRoundedIcon sx={{ fontSize: 20 }} />
                  </Button>
                </ButtonGroup>
                <Menu
                  anchorEl={downloadMenuAnchor}
                  open={Boolean(downloadMenuAnchor)}
                  onClose={() => setDownloadMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    disabled={!epubBook}
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      handleDownloadBilingualEpub();
                    }}
                  >
                    {i18n("download_bilingual_epub", "下载双语 EPUB (.epub)")}
                  </MenuItem>
                  <MenuItem
                    disabled={!epubBook}
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      handleDownloadTargetEpub();
                    }}
                  >
                    {i18n("download_translated_epub", "下载译文 EPUB (.epub)")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      handleExportCurrentChapterHtml();
                    }}
                  >
                    {i18n("export_chapter_html", "导出当前章节 HTML (.html)")}
                  </MenuItem>
                </Menu>
              </>
            ) : mode === "pdf" ? (
              <>
                <ButtonGroup
                  variant="outlined"
                  color="inherit"
                  size="small"
                  disabled={!pdfState.blocks?.length || busy || pdfState.busy}
                  sx={{
                    height: 32,
                    borderRadius: "4px",
                  }}
                >
                  <Button
                    startIcon={
                      <FileDownloadRoundedIcon sx={{ fontSize: 18 }} />
                    }
                    onClick={() => pdfWorkspaceRef.current?.download("md")}
                    sx={{
                      height: 32,
                      textTransform: "none",
                      fontSize: 13,
                      px: 1.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {i18n("download_md", "下载 Markdown")}
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
                    disabled={!pdfState.blocks?.length || busy || pdfState.busy}
                    sx={{ px: 0.5, minWidth: 28, height: 32 }}
                    title={i18n("more_export_options", "更多导出选项")}
                  >
                    <ArrowDropDownRoundedIcon sx={{ fontSize: 20 }} />
                  </Button>
                </ButtonGroup>
                <Menu
                  anchorEl={downloadMenuAnchor}
                  open={Boolean(downloadMenuAnchor)}
                  onClose={() => setDownloadMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      pdfWorkspaceRef.current?.download("md");
                    }}
                  >
                    {i18n("export_markdown_file", "导出 Markdown 文档 (.md)")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      pdfWorkspaceRef.current?.download("html");
                    }}
                  >
                    {i18n("export_html_file", "导出独立 HTML (.html)")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      pdfWorkspaceRef.current?.download("zip");
                    }}
                  >
                    {i18n("export_zip_file", "导出 Markdown + 资源 ZIP (.zip)")}
                  </MenuItem>
                </Menu>
              </>
            ) : mode === "markdown" ? (
              <>
                <ButtonGroup
                  variant="outlined"
                  color="inherit"
                  size="small"
                  disabled={!currentResultContent || busy}
                  sx={{
                    height: 32,
                    borderRadius: "4px",
                  }}
                >
                  <Button
                    startIcon={
                      <FileDownloadRoundedIcon sx={{ fontSize: 18 }} />
                    }
                    onClick={handleDownloadMd}
                    sx={{
                      height: 32,
                      textTransform: "none",
                      fontSize: 13,
                      px: 1.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {resultViewMode === "bilingual"
                      ? i18n("download_bilingual_md", "下载双语 MD")
                      : i18n("download_md", "下载译文 MD")}
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
                    disabled={!currentResultContent || busy}
                    sx={{ px: 0.5, minWidth: 28, height: 32 }}
                    title={i18n("more_export_options", "更多导出选项")}
                  >
                    <ArrowDropDownRoundedIcon sx={{ fontSize: 20 }} />
                  </Button>
                </ButtonGroup>
                <Menu
                  anchorEl={downloadMenuAnchor}
                  open={Boolean(downloadMenuAnchor)}
                  onClose={() => setDownloadMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      handleDownloadMd();
                    }}
                  >
                    {i18n("export_markdown_file", "导出 Markdown 文档 (.md)")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setDownloadMenuAnchor(null);
                      handleDownloadHtml();
                    }}
                  >
                    {i18n("export_html_file", "导出 HTML 网页 (.html)")}
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                startIcon={<FileDownloadRoundedIcon sx={{ fontSize: 18 }} />}
                disabled={
                  resultViewMode === "image"
                    ? !translatedImageBlob || busy
                    : !currentResultContent || busy
                }
                onClick={handleDownload}
                sx={{
                  height: 32,
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  textTransform: "none",
                  fontSize: 13,
                  px: 1.5,
                }}
              >
                {resultViewMode === "image"
                  ? i18n("download_image_png", "下载译图 (PNG)")
                  : resultViewMode === "bilingual"
                    ? i18n("download_bilingual_txt", "下载双语 TXT")
                    : i18n("download_txt", "下载译文 TXT")}
              </Button>
            )}
          </>
        }
        configuration={renderConfigControls()}
        busy={busy || (mode === "pdf" && pdfState.busy)}
        progress={
          mode === "pdf" && pdfState.progress
            ? [pdfState.progress.done, pdfState.progress.total]
            : progress
        }
      />

      {connected && (
        <LocalServiceNotice
          apis={(setting?.transApis || []).filter((api) =>
            [
              scene.apiSlug,
              ...(["image", "pdf"].includes(mode)
                ? [recognitionSelection?.apiSlug]
                : []),
              ...(mode === "pdf"
                ? [scene.visionServiceSlug, currentLayoutSlug]
                : []),
            ].includes(api.apiSlug)
          )}
          models={context.modelError ? null : context.models}
          i18n={i18n}
          onDownload={() => openOptionsPage("/local-ai")}
          sx={{ mx: 1.5, mt: 1.25 }}
        />
      )}

      {/* 错误提示浮条 */}
      {error && (
        <ReaderAlert
          severity="error"
          onClose={() => setError("")}
          sx={{ mx: 1.5, mt: 1.25 }}
        >
          {error}
        </ReaderAlert>
      )}

      {connectionNotice}

      {/* 模块 2：下面全部用来浏览和翻译（未上传展示上传框，上传后展示左右双栏或窄屏上下双栏） */}
      {inputNotices.length > 0 && (
        <ReaderAlert
          severity="info"
          onClose={() => setInputNotices([])}
          sx={{ mx: 1.5, mt: 1.25 }}
        >
          {inputNotices.join("；")}
        </ReaderAlert>
      )}
      {mode === "image" && rows.length > 0 && !selectedImageRows.length && (
        <ReaderAlert severity="info" sx={{ mx: 1.5, mt: 1.25 }}>
          {i18n("image_select_region_first", "请至少选择一个文字区域")}
        </ReaderAlert>
      )}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!file ? (
          /* 未上传文件时：展示居中大面积虚线拖拽上传框 */
          <Box
            role="button"
            tabIndex={0}
            aria-label={i18n("dropzone_select_file", "选择或拖拽上传文件")}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            sx={{
              flex: 1,
              border: "2px dashed",
              borderColor: isDragging ? "primary.main" : "divider",
              bgcolor: isDragging ? "action.hover" : "background.paper",
              borderRadius: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              gap: 1.5,
              p: 4,
              transition: "border-color 0.2s, background-color 0.2s",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: "action.hover",
              },
            }}
          >
            <CloudUploadRoundedIcon
              sx={{
                fontSize: 64,
                color: isDragging ? "primary.main" : "text.secondary",
                transition: "color 0.2s, transform 0.2s",
                transform: isDragging ? "scale(1.1)" : "none",
              }}
            />
            <Typography variant="h6" sx={{ fontSize: 18, fontWeight: 600 }}>
              {i18n("dropzone_prompt", "点击选择文件 或 拖拽文件到此处")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "dropzone_hint_all",
                "支持 PDF、.txt 文本、.md Markdown 文档、.epub 电子书及 PNG、JPEG、WebP 格式图片"
              )}
            </Typography>
          </Box>
        ) : mode === "epub" && epubBook ? (
          <EpubReaderView
            epubBook={epubBook}
            currentChapterIndex={currentChapterIndex}
            onSelectChapter={(idx) => setCurrentChapterIndex(idx)}
            epubViewMode={epubViewMode}
            onChangeViewMode={(m) => setEpubViewMode(m)}
            chapterStates={chapterStates}
            busy={busy}
            translationAvailable={connected}
            onTranslateChapter={handleTranslateCurrentChapter}
            onTranslateBook={handleTranslateEntireEpubBook}
            onCancel={() => controller.current?.abort()}
            readerPreferences={readerPreferences}
            onChangeReaderPreferences={handleUpdateReaderPreferences}
            i18n={i18n}
            textStyleClass={textStyleClass}
            rawStyleCode={rawStyleCode}
            hasRichText={scene?.hasRichText}
          />
        ) : mode === "pdf" && file ? (
          <Suspense fallback={<Box p={3}>正在加载 PDF 阅读器…</Box>}>
            <PdfWorkspace
              ref={pdfWorkspaceRef}
              ignoreCache={ignoreCache}
              key={taskIdRef.current}
              file={file}
              hasLayoutService={hasLayoutService}
              activeLayoutApi={activeLayoutApi}
              onStateChange={setPdfState}
              onChangeFile={selectFile}
              onClear={handleClearFile}
            />
          </Suspense>
        ) : (
          /* 文件上传后：900px 以上左右双栏，900px 以下上下分割各占 50% 可用高度 */
          <Grid
            container
            spacing={1.5}
            sx={{
              flex: 1,
              height: "100%",
              minHeight: 0,
              flexDirection: { xs: "column", md: "row" },
              flexWrap: { xs: "nowrap", md: "wrap" },
            }}
          >
            {/* 左栏/上栏：原文 / 原图 */}
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                height: { xs: "50%", md: "100%" },
                maxHeight: { xs: "50%", md: "100%" },
                flexBasis: { xs: "50% !important", md: "50% !important" },
                maxWidth: { xs: "100% !important", md: "50% !important" },
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 1,
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 1.5,
                    height: 48,
                    minHeight: 48,
                    maxHeight: 48,
                    boxSizing: "border-box",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    gap: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        mr: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {mode === "txt"
                        ? i18n("source_text_title", "原文内容")
                        : mode === "markdown"
                          ? i18n("source_markdown_title", "Markdown 原文")
                          : i18n("source_image_title", "原图预览")}
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {mode === "txt" || mode === "markdown"
                          ? `(${sourceText.length} ${i18n(
                              "characters",
                              "字符"
                            )})`
                          : `(${formatFileSize(file.size)})`}
                      </Typography>
                    </Typography>

                    {mode === "image" &&
                      rows.some((row) => hasImagePolygon(row.poly)) && (
                        <FormControlLabel
                          sx={{ m: 0, whiteSpace: "nowrap" }}
                          label={
                            <Typography variant="caption">
                              {i18n("image_text_regions", "布局线框")}
                            </Typography>
                          }
                          control={
                            <Switch
                              size="small"
                              checked={showImageRegions}
                              onChange={(_, checked) =>
                                setShowImageRegions(checked)
                              }
                            />
                          }
                        />
                      )}
                    {mode === "markdown" && sourceText && (
                      <ToggleButtonGroup
                        size="small"
                        value={mdSourceView}
                        exclusive
                        onChange={(e, val) => val && setMdSourceView(val)}
                        sx={{ height: 26, flexShrink: 0 }}
                      >
                        <ToggleButton
                          value="preview"
                          sx={{
                            px: 1,
                            py: 0.25,
                            fontSize: 11,
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {i18n("md_preview_view", "渲染视图")}
                        </ToggleButton>
                        <ToggleButton
                          value="source"
                          sx={{
                            px: 1,
                            py: 0.25,
                            fontSize: 11,
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {i18n("md_source_view", "源码")}
                        </ToggleButton>
                      </ToggleButtonGroup>
                    )}
                  </Box>

                  {(mode === "txt" || mode === "markdown") && sourceText && (
                    <Button
                      size="small"
                      variant="text"
                      startIcon={
                        <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                      }
                      onClick={() =>
                        copyText(sourceText, i18n("source_text", "原文"))
                      }
                      sx={{ height: 28, fontSize: 12, minWidth: 0, px: 1 }}
                    >
                      {i18n("copy", "复制")}
                    </Button>
                  )}
                </Box>

                <Box
                  ref={leftScrollRef}
                  onScroll={handleLeftScroll}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    p: 1.5,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {mode === "markdown" ? (
                    sourceText ? (
                      mdSourceView === "preview" ? (
                        <Box
                          className="kt-markdown-body"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              sourceHtml ||
                                renderMarkdownBlocksToHtml(
                                  splitMarkdownBlocks(sourceText),
                                  { mode: "source" }
                                )
                            ),
                          }}
                          sx={{
                            lineHeight: 1.7,
                            fontSize: 14,
                            color: "text.primary",
                            "& pre": {
                              bgcolor: "action.hover",
                              p: 1.5,
                              borderRadius: 1,
                              overflowX: "auto",
                            },
                            "& code": {
                              bgcolor: "action.hover",
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 1,
                              fontSize: 13,
                              fontFamily: "monospace",
                            },
                            "& blockquote": {
                              borderLeft: "4px solid",
                              borderColor: "divider",
                              pl: 1.5,
                              m: "10px 0",
                            },
                            "& table": {
                              borderCollapse: "collapse",
                              width: "100%",
                              my: 1.5,
                            },
                            "& th, & td": {
                              border: "1px solid",
                              borderColor: "divider",
                              p: 1,
                            },
                          }}
                        />
                      ) : (
                        <Typography
                          component="pre"
                          sx={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "inherit",
                            fontSize: 13,
                            lineHeight: 1.6,
                            m: 0,
                          }}
                        >
                          {sourceText}
                        </Typography>
                      )
                    ) : (
                      <Box
                        sx={{
                          m: "auto",
                          textAlign: "center",
                          color: "text.secondary",
                          py: 6,
                        }}
                      >
                        <InsertDriveFileRoundedIcon
                          sx={{ fontSize: 40, opacity: 0.35, mb: 1 }}
                        />
                        <Typography variant="body2">
                          {i18n("empty_source_txt", "暂无原文内容")}
                        </Typography>
                      </Box>
                    )
                  ) : mode === "txt" ? (
                    sourceText ? (
                      <Typography
                        component="pre"
                        sx={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontFamily: "inherit",
                          fontSize: 13,
                          lineHeight: 1.6,
                          m: 0,
                        }}
                      >
                        {sourceText}
                      </Typography>
                    ) : (
                      <Box
                        sx={{
                          m: "auto",
                          textAlign: "center",
                          color: "text.secondary",
                          py: 6,
                        }}
                      >
                        <InsertDriveFileRoundedIcon
                          sx={{ fontSize: 40, opacity: 0.35, mb: 1 }}
                        />
                        <Typography variant="body2">
                          {i18n("empty_source_txt", "暂无原文内容")}
                        </Typography>
                      </Box>
                    )
                  ) : preview ? (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100%",
                        cursor: "zoom-in",
                        position: "relative",
                        "&:hover .kt-zoom-overlay": { opacity: 1 },
                      }}
                      onClick={() =>
                        setViewerState({ open: true, activeTab: "source" })
                      }
                      title={i18n("click_to_zoom", "点击放大查看原图")}
                    >
                      <ImageSourcePreview
                        src={preview}
                        alt={i18n("source_image_title", "原图预览")}
                        rows={rows}
                        i18n={i18n}
                        showRegions={showImageRegions}
                        disabled={busy}
                        onToggleRegion={toggleImageRegion}
                        regionLabel={(row, index) =>
                          `${i18n("image_text_region", "文字区域")} ${index + 1}: ${row.source}`
                        }
                        selectLabel={i18n(
                          "image_region_select",
                          "点击参与翻译"
                        )}
                        excludeLabel={i18n(
                          "image_region_exclude",
                          "点击取消翻译"
                        )}
                      />
                      <Chip
                        className="kt-zoom-overlay"
                        icon={<ZoomInRoundedIcon />}
                        label={i18n("click_to_zoom", "点击放大查看")}
                        size="small"
                        sx={{
                          position: "absolute",
                          bottom: 12,
                          opacity: 0.85,
                          bgcolor: "rgba(0, 0, 0, 0.7)",
                          color: "#fff",
                          transition: "opacity 0.2s",
                          pointerEvents: "none",
                        }}
                      />
                    </Box>
                  ) : null}
                </Box>
              </Card>
            </Grid>

            {/* 右栏/下栏：翻译结果（支持译文 / 双语 / 译图切换） */}
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                height: { xs: "50%", md: "100%" },
                maxHeight: { xs: "50%", md: "100%" },
                flexBasis: { xs: "50% !important", md: "50% !important" },
                maxWidth: { xs: "100% !important", md: "50% !important" },
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 1,
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 1.5,
                    height: 48,
                    minHeight: 48,
                    maxHeight: 48,
                    boxSizing: "border-box",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    gap: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        mr: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {i18n("translation_result_title", "翻译结果")}
                      {rows.length > 0 && (
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          ({resultRows.length} {i18n("paragraphs", "段落")})
                        </Typography>
                      )}
                    </Typography>

                    <ToggleButtonGroup
                      size="small"
                      value={resultViewMode}
                      exclusive
                      onChange={(e, val) => val && setResultViewMode(val)}
                      sx={{ height: 28, flexShrink: 0 }}
                    >
                      {mode === "image" && (
                        <ToggleButton
                          value="source"
                          sx={{ px: 1.25, py: 0.25, fontSize: 12 }}
                        >
                          {i18n("view_source_only", "原文")}
                        </ToggleButton>
                      )}
                      <ToggleButton
                        value="target"
                        sx={{
                          px: 1.25,
                          py: 0.25,
                          fontSize: 12,
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {i18n("view_target_only", "译文")}
                      </ToggleButton>
                      {isEntireTranslated ? (
                        <Tooltip
                          title={i18n(
                            "entire_translate_no_bilingual",
                            "整篇翻译不支持双语对照"
                          )}
                          arrow
                        >
                          <span style={{ display: "inline-flex" }}>
                            <ToggleButton
                              value="bilingual"
                              disabled
                              sx={{
                                px: 1.25,
                                py: 0.25,
                                fontSize: 12,
                                lineHeight: 1.2,
                                whiteSpace: "nowrap",
                                pointerEvents: "none",
                              }}
                            >
                              {i18n("view_bilingual", "双语")}
                            </ToggleButton>
                          </span>
                        </Tooltip>
                      ) : (
                        <ToggleButton
                          value="bilingual"
                          sx={{
                            px: 1.25,
                            py: 0.25,
                            fontSize: 12,
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {i18n("view_bilingual", "双语")}
                        </ToggleButton>
                      )}
                      {mode === "image" && (
                        <ToggleButton
                          value="image"
                          sx={{
                            px: 1.25,
                            py: 0.25,
                            fontSize: 12,
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {i18n("view_image", "译图")}
                        </ToggleButton>
                      )}
                    </ToggleButtonGroup>
                  </Box>

                  {currentResultContent && resultViewMode !== "image" && (
                    <Button
                      size="small"
                      variant="text"
                      startIcon={
                        <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                      }
                      onClick={() =>
                        copyText(
                          currentResultContent,
                          resultViewMode === "source"
                            ? i18n("view_source_only", "原文")
                            : resultViewMode === "bilingual"
                              ? i18n("bilingual_text", "双语")
                              : i18n("translated_text", "译文")
                        )
                      }
                      sx={{ height: 28, fontSize: 12, minWidth: 0, px: 1 }}
                    >
                      {i18n("copy", "复制")}
                    </Button>
                  )}
                </Box>

                <Box
                  ref={rightScrollRef}
                  onScroll={handleRightScroll}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    p: 1.5,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {mode === "markdown" ? (
                    translatedHtml || bilingualHtml ? (
                      <Box
                        className="kt-markdown-body"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            resultViewMode === "bilingual"
                              ? bilingualHtml
                              : translatedHtml
                          ),
                        }}
                        sx={{
                          lineHeight: 1.7,
                          fontSize: 14,
                          color: "text.primary",
                          "& pre": {
                            bgcolor: "action.hover",
                            p: 1.5,
                            borderRadius: 1,
                            overflowX: "auto",
                          },
                          "& code": {
                            bgcolor: "action.hover",
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            fontSize: 13,
                            fontFamily: "monospace",
                          },
                          "& blockquote": {
                            borderLeft: "4px solid",
                            borderColor: "divider",
                            pl: 1.5,
                            m: "10px 0",
                          },
                          "& table": {
                            borderCollapse: "collapse",
                            width: "100%",
                            my: 1.5,
                          },
                          "& th, & td": {
                            border: "1px solid",
                            borderColor: "divider",
                            p: 1,
                          },
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          m: "auto",
                          textAlign: "center",
                          color: "text.secondary",
                          py: 6,
                          px: 2,
                        }}
                      >
                        {mode === "image" && !hasRecognitionService ? (
                          <>
                            <WarningAmberRoundedIcon
                              sx={{
                                fontSize: 44,
                                color: "warning.main",
                                mb: 1.5,
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                mb: 2,
                                maxWidth: 360,
                                mx: "auto",
                                color: "text.primary",
                              }}
                            >
                              {i18n(
                                "ocr_service_missing_guide",
                                "请选择文本识别服务（OCR / VLM）"
                              )}
                            </Typography>
                            <Button
                              variant="outlined"
                              size="small"
                              color="primary"
                              onClick={() => openOptionsPage("/apis")}
                            >
                              {i18n("goto_service_config", "前往服务配置")}
                            </Button>
                          </>
                        ) : (
                          <>
                            <InsertDriveFileRoundedIcon
                              sx={{ fontSize: 40, opacity: 0.35, mb: 1 }}
                            />
                            <Typography variant="body2">
                              {busy
                                ? i18n("translating", "正在翻译...")
                                : mode === "image" && imageFailure
                                  ? imageFailurePrompt
                                  : i18n(
                                      mode === "image"
                                        ? "image_ready_prompt"
                                        : "empty_result_prompt",
                                      mode === "image"
                                        ? "已就绪，请点击顶部“一键翻译”或选择处理步骤"
                                        : "已就绪，请点击顶部“一键翻译”按钮"
                                    )}
                            </Typography>
                          </>
                        )}
                      </Box>
                    )
                  ) : rows.length > 0 || resultText ? (
                    resultViewMode === "image" ? (
                      translatedImageUrl ? (
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            height: "100%",
                            cursor: "zoom-in",
                            position: "relative",
                            "&:hover .kt-zoom-overlay": { opacity: 1 },
                          }}
                          onClick={() =>
                            setViewerState({
                              open: true,
                              activeTab: "translated",
                            })
                          }
                          title={i18n(
                            "click_to_zoom_trans",
                            "点击放大查看译图"
                          )}
                        >
                          <Box
                            component="img"
                            src={translatedImageUrl}
                            alt={i18n("translated_image_title", "译图结果")}
                            sx={{
                              maxWidth: "100%",
                              maxHeight: "100%",
                              objectFit: "contain",
                              borderRadius: 1,
                              boxShadow: 1,
                            }}
                          />
                          <Chip
                            className="kt-zoom-overlay"
                            icon={<ZoomInRoundedIcon />}
                            label={i18n("click_to_zoom", "点击放大查看")}
                            size="small"
                            sx={{
                              position: "absolute",
                              bottom: 12,
                              opacity: 0.85,
                              bgcolor: "rgba(0, 0, 0, 0.7)",
                              color: "#fff",
                              transition: "opacity 0.2s",
                              pointerEvents: "none",
                            }}
                          />
                        </Box>
                      ) : !hasImageCoordinates ? (
                        <Box
                          sx={{
                            m: "auto",
                            textAlign: "center",
                            color: "text.secondary",
                            py: 6,
                            px: 3,
                            maxWidth: 420,
                          }}
                        >
                          <ImageRoundedIcon
                            sx={{ fontSize: 44, opacity: 0.35, mb: 1.5 }}
                          />
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 600,
                              mb: 1,
                              color: "text.primary",
                            }}
                          >
                            {!selectedImageRows.length
                              ? i18n(
                                  "image_select_region_first",
                                  "请至少选择一个文字区域"
                                )
                              : i18n(
                                  "image_no_coordinates",
                                  "识别结果没有区域坐标，无法合成译图"
                                )}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ lineHeight: 1.6 }}
                          >
                            {!selectedImageRows.length
                              ? i18n(
                                  "image_restore_region_hint",
                                  "点击原图布局线框可恢复选择"
                                )
                              : i18n(
                                  "image_coordinates_hint",
                                  "请选择能返回区域坐标的 OCR 服务重新识别，或切换到文本视图查看结果。"
                                )}
                          </Typography>
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            m: "auto",
                            textAlign: "center",
                            color: "text.secondary",
                            py: 6,
                          }}
                        >
                          <Typography variant="body2">
                            {busy
                              ? i18n(
                                  "generating_translated_image",
                                  "正在合成译图..."
                                )
                              : i18n("no_translated_image", "暂无生成的译图")}
                          </Typography>
                        </Box>
                      )
                    ) : (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2.5,
                        }}
                      >
                        {rows.length > 0 ? (
                          resultRows.map((row, idx) => (
                            <Box key={idx}>
                              {resultViewMode === "bilingual" && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    fontSize: 13,
                                    lineHeight: 1.7,
                                    mb: 0.5,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {row.source}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: 14,
                                  lineHeight: 1.75,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  ...(resultViewMode === "bilingual" &&
                                  !textStyleClass
                                    ? { fontWeight: 500 }
                                    : {}),
                                }}
                              >
                                <span
                                  className={
                                    resultViewMode === "bilingual"
                                      ? textStyleClass || undefined
                                      : undefined
                                  }
                                >
                                  {resultViewMode === "source"
                                    ? row.source
                                    : row.target}
                                </span>
                              </Typography>
                            </Box>
                          ))
                        ) : resultText ? (
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: 14,
                              lineHeight: 1.75,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            <span className={textStyleClass || undefined}>
                              {resultText}
                            </span>
                          </Typography>
                        ) : null}
                      </Box>
                    )
                  ) : (
                    <Box
                      sx={{
                        m: "auto",
                        textAlign: "center",
                        color: "text.secondary",
                        py: 6,
                        px: 2,
                      }}
                    >
                      {mode === "image" && !hasRecognitionService ? (
                        <>
                          <WarningAmberRoundedIcon
                            sx={{
                              fontSize: 44,
                              color: "warning.main",
                              mb: 1.5,
                            }}
                          />
                          <Typography
                            variant="body2"
                            sx={{
                              mb: 2,
                              maxWidth: 360,
                              mx: "auto",
                              color: "text.primary",
                            }}
                          >
                            {i18n(
                              "ocr_service_missing_guide",
                              "请选择文本识别服务（OCR / VLM）"
                            )}
                          </Typography>
                          <Button
                            variant="outlined"
                            size="small"
                            color="primary"
                            onClick={() => openOptionsPage("/apis")}
                          >
                            {i18n("goto_service_config", "前往服务配置")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <InsertDriveFileRoundedIcon
                            sx={{ fontSize: 40, opacity: 0.35, mb: 1 }}
                          />
                          <Typography variant="body2">
                            {busy
                              ? i18n("translating", "正在翻译...")
                              : mode === "image" && imageFailure
                                ? imageFailurePrompt
                                : i18n(
                                    mode === "image"
                                      ? "image_ready_prompt"
                                      : "empty_result_prompt",
                                    mode === "image"
                                      ? "已就绪，请点击顶部“一键翻译”或选择处理步骤"
                                      : "已就绪，请点击顶部“一键翻译”按钮"
                                  )}
                          </Typography>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              </Card>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* 图片原图/译图放大弹窗 */}
      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{i18n("file_paste", "粘贴文件或文本")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {i18n(
              "file_paste_hint",
              "在下方区域按 Ctrl+V（Mac：⌘V）粘贴文件、截图或文本。文本默认按 TXT 导入，可在选项中切换为 Markdown。若无法粘贴文件，请选择或拖入文件。"
            )}
          </DialogContentText>
          <Box
            component="textarea"
            autoFocus
            aria-label={i18n("file_paste_area", "粘贴区域")}
            onPaste={handlePaste}
            sx={{
              width: "100%",
              minHeight: 120,
              mt: 2,
              boxSizing: "border-box",
              bgcolor: "background.default",
              color: "text.primary",
            }}
          />
          {pasteError && (
            <Typography color="error" role="alert">
              {pasteError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasteOpen(false)}>
            {i18n("cancel", "取消")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(pendingTextMode)}
        onClose={() => setPendingTextMode(null)}
      >
        <DialogTitle>{i18n("file_text_format", "文本格式")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {i18n(
              "file_text_format_confirm",
              "切换格式将清空翻译结果，保留原文。是否继续？"
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingTextMode(null)}>
            {i18n("cancel", "取消")}
          </Button>
          <Button
            variant="contained"
            onClick={() => switchTextMode(pendingTextMode)}
          >
            {i18n("file_text_format_switch", "切换格式")}
          </Button>
        </DialogActions>
      </Dialog>

      <ImageViewerDialog
        i18n={i18n}
        open={viewerState.open}
        initialTab={viewerState.activeTab}
        activeTab={viewerState.activeTab}
        sourceUrl={preview}
        translatedUrl={translatedImageUrl}
        onClose={() => setViewerState({ open: false, activeTab: "source" })}
      />

      {/* 整篇翻译超长字符提醒弹窗 */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          {i18n("confirm_entire_translate_title", "确认整篇翻译？")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14 }}>
            {i18n(
              "confirm_entire_translate_tip",
              "当前文档超过 10,000 字符。整篇翻译将一次性提交完整原文至翻译接口，可能会消耗较多 Token，且若超出接口上下文限制可能会导致内容被截断。是否继续？"
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmDialogOpen(false)}
            color="inherit"
            variant="text"
          >
            {i18n("cancel", "取消")}
          </Button>
          <Button
            onClick={() => {
              setConfirmDialogOpen(false);
              run("entire");
            }}
            variant="contained"
            color="primary"
          >
            {i18n("continue_entire_translate", "继续整篇翻译")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 消息提示 Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        message={snackbar.message}
      />
    </Box>
  );
}
