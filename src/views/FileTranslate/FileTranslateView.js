import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Collapse from "@mui/material/Collapse";
import Snackbar from "@mui/material/Snackbar";
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
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";

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
import Logo from "../../components/Logo";
import { useSetting } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import { useAllTextStyles } from "../../hooks/CustomStyles";
import { builtinStylesMap } from "../../libs/style";
import {
  DEFAULT_FILE_TRANSLATE_SETTING,
  OPT_LANGS_FROM_REVERSED,
  OPT_LANGS_TO_REVERSED,
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
} from "../../libs/fileTranslate";
import { openOptionsPage } from "../../libs/navigation";
import { SettingsSelect } from "../Options/SettingsCard";
import OrderedApiSelect from "../Options/OrderedApiSelect";
import ScenePromptSelect from "../Options/ScenePromptSelect";
import ImageViewerDialog from "../Options/ImageViewerDialog";
import DarkModeButton from "../Options/DarkModeButton";
import {
  ALL_OCR_MODELS,
  OCR_GROUPS,
  installedLlmModels,
  installedOcrGroups,
  recognizeFileImage,
  translateWithLocalModel,
} from "../../localAi/fileOperations";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  const i18n = useI18n();
  const { setting, updateChild } = useSetting();
  const { allTextStyles } = useAllTextStyles();
  const saved =
    setting?.fileTranslateSetting || DEFAULT_FILE_TRANSLATE_SETTING;
  const [mode, setMode] = useState("txt");
  const scene = saved[mode] || DEFAULT_FILE_TRANSLATE_SETTING[mode];
  const update = updateChild("fileTranslateSetting");
  const patchScene = (patch) =>
    update({ ...saved, [mode]: { ...scene, ...patch } });

  const textStyleClass = useMemo(
    () => getTextStyleClass(scene?.textStyle, allTextStyles),
    [scene?.textStyle, allTextStyles]
  );

  const [file, setFile] = useState(null);
  const [sourceText, setSourceText] = useState("");
  const [preview, setPreview] = useState("");
  const [rows, setRows] = useState([]);
  const [resultText, setResultText] = useState("");
  const [resultViewMode, setResultViewMode] = useState(
    mode === "image" ? "image" : "target"
  );
  const [translatedImageBlob, setTranslatedImageBlob] = useState(null);
  const [translatedImageUrl, setTranslatedImageUrl] = useState("");
  const [mdSourceView, setMdSourceView] = useState("preview");
  const [bilingualMd, setBilingualMd] = useState("");
  const [translatedHtml, setTranslatedHtml] = useState("");
  const [bilingualHtml, setBilingualHtml] = useState("");
  const [sourceHtml, setSourceHtml] = useState("");
  const [mdBlocks, setMdBlocks] = useState([]);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState(null);
  const [availableOcrGroups, setAvailableOcrGroups] = useState([]);
  const allOcrModels = ALL_OCR_MODELS || OCR_GROUPS;
  const currentOcrModel = allOcrModels.find(
    (m) => m.id === (scene.ocrGroup || "ppocr-v5-mobile")
  );
  const isVlmModel = currentOcrModel?.category === "vlm";
  const [progress, setProgress] = useState([0, 0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });
  const [viewerState, setViewerState] = useState({
    open: false,
    activeTab: "source",
  });

  const [translateScope, setTranslateScope] = useState("paragraph"); // "paragraph" | "entire"
  const [translateMenuAnchor, setTranslateMenuAnchor] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isEntireTranslated, setIsEntireTranslated] = useState(false);
  // 顶栏第二行核心配置项展开/收起状态（默认展开）
  const [optionsExpanded, setOptionsExpanded] = useState(true);

  const controller = useRef(null);
  const fileInputRef = useRef(null);
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const isSyncingScroll = useRef(false);

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

  // 获取本地已安装的 OCR 模型组
  useEffect(() => {
    let active = true;
    Promise.resolve(installedOcrGroups?.())
      .then((installed) => {
        if (active) setAvailableOcrGroups(installed || []);
      })
      .catch(() => {
        if (active) setAvailableOcrGroups([]);
      });
    return () => {
      active = false;
    };
  }, []);

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

  // 异步读取 TXT 文件内容
  const readTxtFile = async (selected) => {
    try {
      let content = "";
      if (typeof selected.text === "function") {
        content = await selected.text();
      } else if (typeof selected.arrayBuffer === "function") {
        const buffer = await selected.arrayBuffer();
        content = new TextDecoder("utf-8").decode(buffer);
      } else {
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result || "");
          reader.onerror = reject;
          reader.readAsText(selected, "utf-8");
        });
      }
      setSourceText(content);
      return content;
    } catch (err) {
      setError(
        i18n("file_read_error", "读取文件失败：") +
          (err?.message || String(err))
      );
      return "";
    }
  };

  // 清理现有翻译结果
  const resetResults = () => {
    setRows([]);
    setResultText("");
    setBilingualMd("");
    setTranslatedHtml("");
    setBilingualHtml("");
    setSourceHtml("");
    setMdBlocks([]);
    setIsEntireTranslated(false);
    if (translatedImageUrl) {
      URL.revokeObjectURL(translatedImageUrl);
      setTranslatedImageUrl("");
    }
    setTranslatedImageBlob(null);
  };

  // 选入文件处理与全自动格式识别判定
  const selectFile = async (selected) => {
    setError("");
    resetResults();
    setProgress([0, 0]);
    if (!selected) {
      setFile(null);
      setSourceText("");
      setPreview("");
      return;
    }

    const isTxt = /\.txt$/i.test(selected.name);
    const isMd = /\.(md|markdown)$/i.test(selected.name);
    const isImage =
      IMAGE_TYPES.has(selected.type) ||
      /\.(png|jpe?g|webp)$/i.test(selected.name);

    if (!isTxt && !isMd && !isImage) {
      setFile(null);
      setSourceText("");
      setPreview("");
      setError(
        i18n(
          "file_format_unsupported",
          "暂不支持该文件格式，支持 .txt 文本、.md Markdown 文档及 PNG、JPEG、WebP 图片"
        )
      );
      return;
    }

    const nextMode = isMd ? "markdown" : isTxt ? "txt" : "image";
    setMode(nextMode);
    setFile(selected);

    if (nextMode === "txt" || nextMode === "markdown") {
      setResultViewMode("target");
      if (nextMode === "markdown") {
        setMdSourceView("preview");
      }
      const content = await readTxtFile(selected);
      if (nextMode === "markdown" && content) {
        try {
          const blocks = splitMarkdownBlocks(content);
          setMdBlocks(blocks);
          setSourceHtml(renderMarkdownBlocksToHtml(blocks, { mode: "source" }));
          // 在点击翻译前，右侧翻译结果保持空白，避免用户误以为上传完即完成翻译
          setTranslatedHtml("");
          setBilingualHtml("");
        } catch {
          setSourceHtml("");
          setTranslatedHtml("");
          setBilingualHtml("");
          setMdBlocks([]);
        }
      }
    } else {
      setResultViewMode("image");
    }
  };

  // 切换译文字体并对已完成翻译的图片进行热重绘
  const handleFontChange = async (fontFamily) => {
    patchScene({ fontFamily });
    if (
      file &&
      mode === "image" &&
      rows.length > 0 &&
      rows.some((r) => r.poly && r.poly.length >= 3)
    ) {
      try {
        const synthesized = await synthesizeTranslatedImage(file, rows, {
          fontFamily,
        });
        if (synthesized) {
          setTranslatedImageBlob(synthesized);
          if (translatedImageUrl) URL.revokeObjectURL(translatedImageUrl);
          const url = URL.createObjectURL(synthesized);
          setTranslatedImageUrl(url);
        }
      } catch (e) {
        console.error("Failed to update font for translated image:", e);
      }
    }
  };

  // 清除已选文件，重置回未上传状态
  const handleClearFile = () => {
    setFile(null);
    setSourceText("");
    setPreview("");
    resetResults();
    setError("");
    setProgress([0, 0]);
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
    if (!rows || rows.length === 0) return "";
    return rows.map((r) => `${r.source}\n${r.target}`).join("\n\n");
  };

  // 当前视图对应的翻译结果文本
  const currentResultContent =
    mode === "markdown"
      ? resultViewMode === "bilingual"
        ? bilingualMd || getBilingualText()
        : resultText || rows.map((r) => r.target).join("\n\n")
      : resultViewMode === "bilingual"
      ? getBilingualText()
      : resultText || rows.map((r) => r.target).join("\n\n");

  // 下载 Markdown 格式文件 (.md)
  const handleDownloadMd = () => {
    const baseName = file?.name
      ? file.name.replace(/\.[^.]+$/, "")
      : "translation";
    const content = currentResultContent;
    if (!content) return;
    const suffix =
      resultViewMode === "bilingual" ? "bilingual" : "translated";
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
    const standaloneHtml = generateStandaloneHtml(
      bodyHtml,
      `${baseName} - ${resultViewMode === "bilingual" ? "双语对照" : "译文"}`
    );
    const suffix =
      resultViewMode === "bilingual" ? "bilingual" : "translated";
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
      resultViewMode === "bilingual" ? "bilingual" : "translated";
    downloadText(`${baseName}-${suffix}.txt`, content);
  };

  // 检查并启动翻译（若为整篇翻译且字符数超过 10,000 则弹窗确认）
  const handleStartTranslation = async (scope = translateScope) => {
    setTranslateMenuAnchor(null);
    if (!file || busy) return;
    const rawContent = sourceText || (file ? await readTxtFile(file) : "");
    if (scope === "entire" && rawContent.length > 10000) {
      setConfirmDialogOpen(true);
      return;
    }
    run(scope);
  };

  // 执行翻译流程
  const run = async (scope = translateScope) => {
    if (!file || busy) return;
    const abort = new AbortController();
    controller.current = abort;
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
      const installedModels = new Set(await installedLlmModels());
      const localContext = {
        installedModels,
        translate: async (modelRef, text, toLang, signal) =>
          translateWithLocalModel(modelRef, text, toLang, signal),
      };

      if (scope === "entire" && (mode === "txt" || mode === "markdown")) {
        setIsEntireTranslated(true);
        setResultViewMode("target"); // 整篇翻译自动切换为译文视图
        const content = sourceText || (await readTxtFile(file));

        if (mode === "txt") {
          const result = await translateEntireTxt(
            content,
            scene,
            setting,
            abort.signal,
            localContext
          );
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
        const nextRows = [];
        const result = await translateTxt(
          content,
          scene,
          setting,
          abort.signal,
          (done, total, item) => {
            setProgress([done, total]);
            if (item) {
              nextRows.push(item);
              setRows([...nextRows]);
            }
          },
          localContext
        );
        setRows(result.comparisons);
        setResultText(result.text);
      } else if (mode === "markdown") {
        setIsEntireTranslated(false);
        const content = sourceText || (await readTxtFile(file));
        const nextRows = [];
        const result = await translateMarkdown(
          content,
          scene,
          setting,
          abort.signal,
          (done, total, item, currentBlocks) => {
            setProgress([done, total]);
            if (item) {
              nextRows.push(item);
              setRows([...nextRows]);
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
        setRows(result.comparisons);
        setResultText(result.translatedMd);
        setBilingualMd(result.bilingualMd);
        setTranslatedHtml(result.translatedHtml);
        setBilingualHtml(result.bilingualHtml);
        setSourceHtml(result.sourceHtml);
        setMdBlocks(result.blocks || []);
      } else {
        const recognized = await recognizeFileImage(
          file,
          {
            groupId: scene.ocrGroup || "ppocr-v5-mobile",
            device: scene.ocrDevice || "webgpu",
          },
          abort.signal
        );
        const items = recognized.items || [];
        const nextRows = [];
        const total = items.length;
        for (let i = 0; i < total; i++) {
          if (abort.signal.aborted) {
            throw new DOMException("已取消", "AbortError");
          }
          const item = items[i];
          const trText = await translateFileText(
            item.text,
            scene,
            setting,
            abort.signal,
            localContext
          );
          const row = {
            source: item.text,
            target: trText,
            poly: item.poly,
            box: item.box,
          };
          nextRows.push(row);
          setRows([...nextRows]);
          setProgress([i + 1, total]);
        }

        if (
          currentOcrModel?.supportsInpainting !== false &&
          nextRows.some((r) => r.poly && r.poly.length >= 3)
        ) {
          try {
            const synthesized = await synthesizeTranslatedImage(
              file,
              nextRows,
              {
                fontFamily: scene.fontFamily || "default",
              }
            );
            if (synthesized) {
              setTranslatedImageBlob(synthesized);
              const url = URL.createObjectURL(synthesized);
              setTranslatedImageUrl(url);
            }
          } catch (synthErr) {
            console.error("图像译文合成失败：", synthErr);
          }
        }
      }
    } catch (err) {
      if (err?.name === "AbortError" || abort.signal.aborted) {
        // 用户主动取消
      } else {
        setError(
          i18n("translate_failed", "翻译失败：") +
            (err?.message || String(err))
        );
      }
    } finally {
      setBusy(false);
      controller.current = null;
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
      {/* 语言选择：源语言 -> 目标语言 */}
      <Box sx={{ width: 155, flexShrink: 0 }}>
        <SettingsSelect
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("from_lang", "源语言")}
          value={scene.fromLang}
          options={OPT_LANGS_FROM_REVERSED}
          onChange={(fromLang) => patchScene({ fromLang })}
        />
      </Box>
      <ArrowForwardRoundedIcon
        sx={{
          fontSize: 16,
          color: "text.disabled",
          flexShrink: 0,
        }}
      />
      <Box sx={{ width: 155, flexShrink: 0 }}>
        <SettingsSelect
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("to_lang", "目标语言")}
          value={scene.toLang}
          options={OPT_LANGS_TO_REVERSED}
          onChange={(toLang) => patchScene({ toLang })}
        />
      </Box>

      {/* 翻译服务与提示词 */}
      <Box sx={{ width: 165, flexShrink: 0 }}>
        <OrderedApiSelect
          multiple={false}
          fullWidth
          size="small"
          variant="outlined"
          showOrderList={false}
          hiddenLabel={false}
          label={i18n("translate_service", "翻译服务")}
          scene={scene}
          apis={(setting?.transApis || []).filter((api) => !api.isDisabled)}
          onChange={(apiSlugs) => patchScene({ apiSlugs })}
        />
      </Box>
      <Box sx={{ width: 150, flexShrink: 0 }}>
        <ScenePromptSelect
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("translation_prompt", "翻译提示词")}
          value={scene.promptSlug || ""}
          onChange={(promptSlug) => patchScene({ promptSlug })}
        />
      </Box>

      {/* 译文样式选项（在双语展示文本翻译时生效） */}
      {(mode === "txt" || mode === "markdown") && (
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

      {/* 图片模式下自适应呈现 OCR 与字体选项 */}
      {mode === "image" && (
        <>
          <Box sx={{ width: 180, flexShrink: 0 }}>
            <SettingsSelect
              fullWidth
              size="small"
              variant="outlined"
              hiddenLabel={false}
              label={i18n("ocr_model", "OCR 识别模型")}
              value={scene.ocrGroup || "ppocr-v5-mobile"}
              options={allOcrModels.map((g) => ({
                value: g.id,
                label: `${g.category === "vlm" ? "[VLM] " : ""}${g.name} ${
                  availableOcrGroups.includes(g.id)
                    ? "· 已就绪"
                    : "· 未安装"
                }`,
              }))}
              onChange={(ocrGroup) => patchScene({ ocrGroup })}
            />
          </Box>
          <Box sx={{ width: 125, flexShrink: 0 }}>
            <SettingsSelect
              fullWidth
              size="small"
              variant="outlined"
              hiddenLabel={false}
              label={i18n("compute_device", "计算设备")}
              value={scene.ocrDevice || "webgpu"}
              options={[
                { value: "webgpu", label: "WebGPU" },
                { value: "wasm", label: "WASM" },
              ]}
              onChange={(ocrDevice) => patchScene({ ocrDevice })}
            />
          </Box>
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
        accept=".txt,.md,.markdown,text/plain,text/markdown,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          selectFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* 模块 1：顶部工具栏（>=1600px 单行展示，<1600px 折叠为双行并支持小箭头展开/收起） */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 0,
          px: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          zIndex: 10,
          position: "relative",
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 第一行主栏：Logo、主操作按钮与展开箭头 */}
        <Box
          sx={{
            minHeight: 56,
            py: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {/* 左侧：Logo 与标题 */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
            }}
          >
            <Box
              component="a"
              href="https://github.com/fishjar/kiss-translator"
              target="_blank"
              rel="noreferrer noopener"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mr: 0.5,
                flexShrink: 0,
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
                "&:hover": {
                  opacity: 0.85,
                },
              }}
              title="KISS Translator (GitHub)"
            >
              <Logo size={24} />
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}
              >
                {i18n("file_translate", "文件翻译")}
              </Typography>
            </Box>
          </Box>

        {/* 顶栏右侧：已选文件胶囊、操作按钮、系统辅助（统一高度 32px） */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            ml: 1.5,
            flexShrink: 0,
            flexWrap: "nowrap",
            height: 32,
          }}
        >
          {file && (
            <Chip
              icon={
                mode === "image" ? (
                  <ImageRoundedIcon sx={{ fontSize: 16 }} />
                ) : (
                  <InsertDriveFileRoundedIcon sx={{ fontSize: 16 }} />
                )
              }
              label={`${file.name} (${formatFileSize(file.size)})`}
              variant="outlined"
              color="primary"
              size="small"
              onDelete={handleClearFile}
              onClick={() => fileInputRef.current?.click()}
              title={i18n(
                "chip_file_hint",
                "点击更换文件，点击叉号移除文件"
              )}
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

          {mode === "image" ? (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<PlayArrowRoundedIcon sx={{ fontSize: 18 }} />}
              disabled={!file || busy}
              onClick={() => run("paragraph")}
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
              {i18n("start_translation", "开始翻译")}
            </Button>
          ) : (
            <>
              <ButtonGroup
                variant="contained"
                color="primary"
                size="small"
                disabled={!file || busy}
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
                  onClick={() => handleStartTranslation(translateScope)}
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
                  {translateScope === "entire"
                    ? i18n("translate_entire", "整篇翻译")
                    : i18n("translate_paragraph", "分段翻译")}
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
                  aria-label={i18n("select_translation_scope", "选择翻译模式")}
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
                  selected={translateScope === "paragraph"}
                  onClick={() => {
                    setTranslateScope("paragraph");
                    setTranslateMenuAnchor(null);
                  }}
                >
                  {i18n("scope_paragraph_label", "分段翻译 (默认)")}
                </MenuItem>
                <MenuItem
                  selected={translateScope === "entire"}
                  onClick={() => {
                    setTranslateScope("entire");
                    setTranslateMenuAnchor(null);
                  }}
                >
                  {i18n("scope_entire_label", "整篇翻译 (全文连贯)")}
                </MenuItem>
              </Menu>
            </>
          )}

          {busy && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<StopRoundedIcon sx={{ fontSize: 18 }} />}
              onClick={() => controller.current?.abort()}
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

          {mode === "markdown" ? (
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
                  startIcon={<FileDownloadRoundedIcon sx={{ fontSize: 18 }} />}
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

          <DarkModeButton
            size="small"
            sx={{
              width: 32,
              height: 32,
              p: 0.5,
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          />

          <Tooltip title={i18n("open_options", "打开设置")}>
            <IconButton
              size="small"
              onClick={() => openOptionsPage()}
              sx={{
                width: 32,
                height: 32,
                p: 0.5,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              <SettingsRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          {/* 折叠/展开配置小箭头按钮，始终常驻在第一行最右侧 */}
          <Tooltip
            title={
              optionsExpanded
                ? i18n("collapse_options", "收起配置")
                : i18n("expand_options", "展开配置")
            }
          >
            <IconButton
              size="small"
              onClick={() => setOptionsExpanded((prev) => !prev)}
              aria-expanded={optionsExpanded}
              aria-label={
                optionsExpanded
                  ? i18n("collapse_options", "收起配置")
                  : i18n("expand_options", "展开配置")
              }
              sx={{
                width: 32,
                height: 32,
                p: 0.5,
                color: "text.secondary",
                "&:hover": {
                  color: "primary.main",
                  bgcolor: "action.hover",
                },
              }}
            >
              <KeyboardArrowDownRoundedIcon
                sx={{
                  fontSize: 20,
                  transform: optionsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                }}
              />
            </IconButton>
          </Tooltip>
        </Box>
        </Box>

        {/* 第二行：流式展示核心下拉配置 */}
        <Collapse in={optionsExpanded} timeout="auto" unmountOnExit={false}>
          <Box
            sx={{
              pt: 2,
              pb: 1.25,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            {renderConfigControls()}
          </Box>
        </Collapse>

        {/* 紧凑贴底进度条 */}
        {busy && (
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              width: "100%",
            }}
          >
            <LinearProgress
              variant={progress[1] ? "determinate" : "indeterminate"}
              value={
                progress[1] ? (progress[0] / progress[1]) * 100 : undefined
              }
              sx={{ height: 3 }}
            />
          </Box>
        )}
      </Paper>

      {/* 错误提示浮条 */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError("")}
          sx={{ borderRadius: 0, py: 0.5, px: 1.5 }}
        >
          {error}
        </Alert>
      )}

      {/* 模块 2：下面全部用来浏览和翻译（未上传展示上传框，上传后展示左右双栏或窄屏上下双栏） */}
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
              {i18n(
                "dropzone_prompt",
                "点击选择文件 或 拖拽文件到此处"
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "dropzone_hint_all",
                "支持 .txt 文本、.md Markdown 文档及 PNG、JPEG、WebP 格式图片"
              )}
            </Typography>
          </Box>
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
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
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
                      <Box
                        component="img"
                        src={preview}
                        alt="原图预览"
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
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
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
                          ({rows.length} {i18n("paragraphs", "段落")})
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
                          resultViewMode === "bilingual"
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
                        }}
                      >
                        <InsertDriveFileRoundedIcon
                          sx={{ fontSize: 40, opacity: 0.35, mb: 1 }}
                        />
                        <Typography variant="body2">
                          {busy
                            ? i18n("translating", "正在翻译...")
                            : i18n(
                                "empty_result_prompt",
                                "已就绪，请点击顶部“开始翻译”按钮"
                              )}
                        </Typography>
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
                            alt="译图结果"
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
                      ) : isVlmModel ? (
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
                            {i18n(
                              "vlm_no_inpainting_title",
                              "VLM 端到端模型不支持生成译图"
                            )}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ lineHeight: 1.6 }}
                          >
                            {i18n(
                              "vlm_no_inpainting_desc",
                              "当前选中的 VLM 模型直接输出文本翻译，如需生成原位替换译图请选用 PaddleOCR 模型，或切换上方「译文」与「双语」查看对照。"
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
                              : i18n(
                                  "no_translated_image",
                                  "暂无生成的译图"
                                )}
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
                          rows.map((row, idx) => (
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
                                  {row.target}
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
                      }}
                    >
                      <InsertDriveFileRoundedIcon
                        sx={{ fontSize: 40, opacity: 0.35, mb: 1 }}
                      />
                      <Typography variant="body2">
                        {busy
                          ? i18n("translating", "正在翻译...")
                          : i18n(
                              "empty_result_prompt",
                              "已就绪，请点击顶部“开始翻译”按钮"
                            )}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Card>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* 图片原图/译图放大弹窗 */}
      <ImageViewerDialog
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
