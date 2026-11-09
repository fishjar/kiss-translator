import TocDrawer from "./TocDrawer";
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import InputBase from "@mui/material/InputBase";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Collapse from "@mui/material/Collapse";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Popover from "@mui/material/Popover";
import CircularProgress from "@mui/material/CircularProgress";
import ReaderAlert from "./ReaderAlert";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import FormatSizeRoundedIcon from "@mui/icons-material/FormatSizeRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DOMPurify from "dompurify";
import * as fflate from "fflate";
import {
  parseXhtmlToDoc,
  serializeDocToXhtml,
  resolveEpubImages,
  cleanCssRemoteUrls,
} from "../../libs/epub/epubDomHandler";
import { normalizePath, safeDecodeURI } from "../../libs/epub/epubParser";

/**
 * 递归树形目录项组件
 */
function TocTreeItem({
  node,
  depth = 0,
  selectedId,
  onSelectNode,
  expandedKeys,
  onToggleExpand,
  chapterStates = {},
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedKeys?.has(node.id);
  const isSelected = selectedId === node.id;
  const state = chapterStates[node.fullPath];
  const isBusy = state?.status === "busy";
  const isDone = state?.status === "done";

  return (
    <Box sx={{ width: "100%" }}>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelectNode(node)}
        sx={{
          py: 0.5,
          px: 1,
          pl: 1 + depth * 1.5,
          borderRadius: 1,
          mb: 0.25,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            sx={{ p: 0.25, mr: 0.25 }}
          >
            {isExpanded ? (
              <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />
            ) : (
              <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 22 }} />
        )}

        <ListItemText
          primary={node.title}
          primaryTypographyProps={{
            fontSize: depth === 0 ? 12.5 : 12,
            fontWeight: isSelected ? 700 : depth === 0 ? 500 : 400,
            noWrap: true,
            color: (theme) =>
              isSelected && theme.palette.mode !== "dark"
                ? theme.palette.primary.main
                : theme.palette.text.primary,
          }}
        />

        <ListItemIcon sx={{ minWidth: 20, ml: 1, justifyContent: "flex-end" }}>
          {isBusy ? (
            <CircularProgress size={13} color="primary" />
          ) : isDone ? (
            <CheckCircleRoundedIcon
              sx={{ fontSize: 15, color: "success.main" }}
            />
          ) : null}
        </ListItemIcon>
      </ListItemButton>

      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {node.children.map((child) => (
              <TocTreeItem
                key={child.id || child.href || child.title}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelectNode={onSelectNode}
                expandedKeys={expandedKeys}
                onToggleExpand={onToggleExpand}
                chapterStates={chapterStates}
              />
            ))}
          </List>
        </Collapse>
      )}
    </Box>
  );
}

export const EPUB_DOMPURIFY_CONFIG = {
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob|data):|[^a-z]|[-a-z+.]+(?:[^-a-z+.:]|$))/i,
  ADD_ATTR: ["xlink:href"],
};

/**
 * 严格净化 EPUB 阅读器正文 HTML，阻断所有外部网络图片与多媒体资源的加载，同时不污染全局共享的 DOMPurify 实例
 * @param {string} html 待净化的正文 HTML
 * @returns {string} 净化后的安全 HTML
 */
export function sanitizeEpubReaderHtml(html) {
  if (!html) return "";
  const uponSanitizeAttrHook = (node, data) => {
    // 1. 拦截媒体元素的远程资源：src, xlink:href, href (SVG image), poster
    if (
      (data.attrName === "src" ||
        data.attrName === "xlink:href" ||
        (data.attrName === "href" &&
          node.tagName &&
          node.tagName.toLowerCase() === "image") ||
        data.attrName === "poster") &&
      /^(?:https?:)?\/\//i.test(data.attrValue)
    ) {
      data.keepAttr = false;
      return;
    }
    // 2. 拦截 srcset 中的远程图片地址（含逗号分隔的响应式图片列表）
    if (
      data.attrName === "srcset" &&
      /(?:^|[\s,])(?:https?:)?\/\//i.test(data.attrValue)
    ) {
      data.keepAttr = false;
      return;
    }
    // 3. 清理内联 style 中潜在的远程背景图或外部资源（支持 CSS 转义解析）
    if (data.attrName === "style") {
      data.attrValue = cleanCssRemoteUrls(data.attrValue);
    }
  };

  const uponSanitizeElemHook = (node) => {
    if (
      node &&
      node.tagName &&
      node.tagName.toLowerCase() === "style" &&
      node.textContent
    ) {
      node.textContent = cleanCssRemoteUrls(node.textContent);
    }
  };

  if (typeof DOMPurify !== "undefined" && DOMPurify.addHook) {
    DOMPurify.addHook("uponSanitizeAttribute", uponSanitizeAttrHook);
    DOMPurify.addHook("uponSanitizeElement", uponSanitizeElemHook);
  }
  try {
    return DOMPurify.sanitize(html, EPUB_DOMPURIFY_CONFIG);
  } finally {
    if (typeof DOMPurify !== "undefined" && DOMPurify.removeHook) {
      DOMPurify.removeHook("uponSanitizeAttribute", uponSanitizeAttrHook);
      DOMPurify.removeHook("uponSanitizeElement", uponSanitizeElemHook);
    }
  }
}

export const EPUB_READER_THEMES = [
  {
    id: "default",
    name: "经典纯白",
    nameKey: "epub_theme_white",
    bg: "#FFFFFF",
    deskBg: "#F0F2F5",
    text: "#1F2937",
    border: "#E5E7EB",
    shadow: "0 4px 20px rgba(0, 0, 0, 0.07)",
  },
  {
    id: "sepia",
    name: "羊皮纸米黄",
    nameKey: "epub_theme_sepia",
    bg: "#F8F1E3",
    deskBg: "#E8DECB",
    text: "#2C2621",
    border: "#E0D3BE",
    shadow: "0 6px 24px rgba(78, 59, 39, 0.12)",
  },
  {
    id: "eyecare",
    name: "柔和护眼绿",
    nameKey: "epub_theme_green",
    bg: "#EBF3EA",
    deskBg: "#D7E4D5",
    text: "#1C3829",
    border: "#C7D8C5",
    shadow: "0 4px 20px rgba(28, 56, 41, 0.08)",
  },
  {
    id: "dark",
    name: "夜间深黑",
    nameKey: "epub_theme_dark",
    bg: "#18181B",
    deskBg: "#09090B",
    text: "#D4D4D8",
    border: "#27272A",
    shadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
  },
];

export const EPUB_FONT_PRESETS = [
  {
    id: "default",
    label: "系统默认 (无衬线)",
    labelKey: "epub_font_default",
    font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: "serif",
    label: "衬线体 (宋体/明朝)",
    labelKey: "epub_font_serif",
    font: 'SimSun, "Songti SC", STSong, "Source Han Serif CN", Georgia, serif',
  },
  {
    id: "kaiti",
    label: "楷体 (传统优美)",
    labelKey: "epub_font_kaiti",
    font: 'KaiTi, "Kaiti SC", STKaiti, BiauKai, serif',
  },
];

export default function EpubReaderView({
  epubBook,
  currentChapterIndex,
  onSelectChapter,
  epubViewMode,
  onChangeViewMode,
  chapterStates,
  busy,
  onTranslateChapter,
  onTranslateBook,
  translationAvailable = true,
  onCancel,
  readerPreferences,
  onChangeReaderPreferences,
  i18n,
  textStyleClass = "",
  rawStyleCode = "",
}) {
  const [tocCollapsed, setTocCollapsed] = useState(true);
  const [tocSearch, setTocSearch] = useState("");
  const [fontMenuAnchor, setFontMenuAnchor] = useState(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  // 目录栏拖拽调整宽度相关状态与常量
  const DEFAULT_TOC_WIDTH = 270;
  const MIN_TOC_WIDTH = 180;
  const MAX_TOC_WIDTH = 600;

  const [tocWidth, setTocWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("kiss_epub_toc_width"));
      if (saved && saved >= MIN_TOC_WIDTH && saved <= MAX_TOC_WIDTH) {
        return saved;
      }
    } catch {}
    return DEFAULT_TOC_WIDTH;
  });

  const tocToggleRef = useRef(null);
  const changeTocWidth = (width) => {
    setTocWidth(width);
    try {
      localStorage.setItem("kiss_epub_toc_width", String(width));
    } catch {}
  };
  useEffect(() => setTocCollapsed(true), [epubBook]);

  // 正文搜索相关状态与 DOM 引用
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const contentBodyRef = useRef(null);
  const highlightMarksRef = useRef([]);

  const scrollContainerRef = useRef(null);
  const isNavigatingRef = useRef(false);
  // 记录是否是由正文容器自然滚动引发的当前章节索引更新（避免触发 scrollTop = 0 回跳）
  const scrollDrivenChapterRef = useRef(null);

  // 清除正文搜索高亮并恢复原生文本节点
  const clearHighlights = useCallback(() => {
    const container = contentBodyRef.current;
    if (!container) return;
    const marks = container.querySelectorAll("mark.kt-search-highlight");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });
    highlightMarksRef.current = [];
    setMatchCount(0);
    setCurrentMatchIndex(0);
  }, []);

  // 执行正文关键词高亮（使用 TreeWalker 仅处理文本节点，避免破坏标签和属性）
  const applyHighlights = useCallback(
    (query) => {
      clearHighlights();
      const trimmed = query?.trim();
      if (!trimmed) return;

      const container = contentBodyRef.current;
      if (!container) return;

      const marks = [];
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.nodeValue || !node.nodeValue.trim()) {
              return NodeFilter.FILTER_REJECT;
            }
            const parent = node.parentElement;
            if (
              parent &&
              (parent.tagName === "SCRIPT" || parent.tagName === "STYLE")
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      const textNodes = [];
      let currentNode;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode);
      }

      const lowerQuery = trimmed.toLowerCase();
      const queryLen = trimmed.length;

      for (const node of textNodes) {
        let activeNode = node;
        let text = activeNode.nodeValue;
        let lowerText = text.toLowerCase();
        let matchIdx = lowerText.indexOf(lowerQuery);

        while (matchIdx !== -1) {
          const matchNode = activeNode.splitText(matchIdx);
          activeNode = matchNode.splitText(queryLen);

          const mark = document.createElement("mark");
          mark.className = "kt-search-highlight";
          matchNode.parentNode.insertBefore(mark, matchNode);
          mark.appendChild(matchNode);
          marks.push(mark);

          text = activeNode.nodeValue;
          lowerText = text.toLowerCase();
          matchIdx = lowerText.indexOf(lowerQuery);
        }
      }

      highlightMarksRef.current = marks;
      setMatchCount(marks.length);

      if (marks.length > 0) {
        setCurrentMatchIndex(0);
        marks[0].classList.add("kt-search-current");
        marks[0].scrollIntoView?.({ behavior: "smooth", block: "center" });
      } else {
        setCurrentMatchIndex(0);
      }
    },
    [clearHighlights]
  );

  // 跳转指定索引的匹配项并平滑居中滚动
  const jumpToMatch = useCallback((index) => {
    const marks = highlightMarksRef.current;
    if (!marks || marks.length === 0) return;

    const newIndex = ((index % marks.length) + marks.length) % marks.length;
    marks.forEach((m, idx) => {
      if (idx === newIndex) {
        m.classList.add("kt-search-current");
      } else {
        m.classList.remove("kt-search-current");
      }
    });
    setCurrentMatchIndex(newIndex);
    marks[newIndex].scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, []);

  const handleNextMatch = () => jumpToMatch(currentMatchIndex + 1);
  const handlePrevMatch = () => jumpToMatch(currentMatchIndex - 1);

  // 外部显式切换章节时自动回到页面顶端；如果是用户自然滚动或正在导航锚点 (isNavigatingRef) 则跳过，避免冲掉目标锚点
  useEffect(() => {
    if (scrollDrivenChapterRef.current === currentChapterIndex) {
      scrollDrivenChapterRef.current = null;
      return;
    }
    scrollDrivenChapterRef.current = null;
    if (isNavigatingRef.current) {
      return;
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentChapterIndex]);

  // 翻译进行中时自动清空正文搜索框与高亮，避免高亮标记干扰翻译或被带入处理
  useEffect(() => {
    if (busy && (searchQuery || highlightMarksRef.current.length > 0)) {
      setSearchQuery("");
      clearHighlights();
    }
  }, [busy, searchQuery, clearHighlights]);

  // 点击试译当前章节前先清空搜索框
  const handleTranslateChapterClick = () => {
    setSearchQuery("");
    clearHighlights();
    onTranslateChapter?.();
  };

  const spineItems = useMemo(
    () => epubBook?.spineItems || [],
    [epubBook?.spineItems]
  );
  const currentChapter = spineItems[currentChapterIndex] || null;

  // 原始目录树 (TOC Tree)
  const rawTocTree = useMemo(() => {
    if (epubBook?.tocTree && epubBook.tocTree.length > 0) {
      return epubBook.tocTree;
    }
    return spineItems.map((s, idx) => ({
      id: `spine-${idx}`,
      title: s.title || `第 ${idx + 1} 节`,
      href: s.href,
      fullPath: s.fullPath,
      hash: "",
      children: [],
    }));
  }, [epubBook, spineItems]);

  // 展开状态：二级目录默认为收起状态
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  useEffect(() => {
    // 切换书籍或目录时二级目录默认为收起状态
    setExpandedKeys(new Set());
  }, [rawTocTree]);

  // 收集所有目录瞄点 hash 集合
  const tocAnchorHashes = useMemo(() => {
    const set = new Set();
    (epubBook?.tocItems || []).forEach((item) => {
      if (item.hash) {
        set.add(item.hash);
      }
    });
    return set;
  }, [epubBook?.tocItems]);

  // 选中的目录项 ID
  const [selectedTocId, setSelectedTocId] = useState(null);

  // 切换折叠展开
  const handleToggleExpand = useCallback((nodeId) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // 目录搜索过滤
  const filteredTocTree = useMemo(() => {
    if (!tocSearch.trim()) return rawTocTree;
    const kw = tocSearch.toLowerCase();

    function filterNodes(nodes) {
      const result = [];
      for (const node of nodes) {
        const titleMatch = node.title?.toLowerCase().includes(kw);
        const childMatched = node.children ? filterNodes(node.children) : [];
        if (titleMatch || childMatched.length > 0) {
          result.push({
            ...node,
            children: childMatched,
          });
        }
      }
      return result;
    }

    return filterNodes(rawTocTree);
  }, [rawTocTree, tocSearch]);

  // 点击目录节点定位（限定章节容器范围查找锚点，避免跨章同名 ID 误定位）
  const handleSelectTocNode = useCallback(
    (node) => {
      setSelectedTocId(node.id);
      const targetSpineIndex = spineItems.findIndex(
        (s) => s.fullPath === node.fullPath
      );
      if (targetSpineIndex !== -1) {
        onSelectChapter?.(targetSpineIndex);
      }
      isNavigatingRef.current = true;
      setTimeout(() => {
        if (!scrollContainerRef.current) return;
        const chapterSection =
          targetSpineIndex !== -1
            ? scrollContainerRef.current.querySelector(
                `#epub-spine-${targetSpineIndex}`
              )
            : scrollContainerRef.current;

        let targetEl = null;
        if (chapterSection && node.hash) {
          try {
            targetEl =
              chapterSection.querySelector(`[id="${CSS.escape(node.hash)}"]`) ||
              chapterSection.querySelector(`[name="${CSS.escape(node.hash)}"]`);
          } catch {
            targetEl = chapterSection.querySelector(`[id="${node.hash}"]`);
          }
        }
        if (!targetEl) {
          targetEl = chapterSection;
        }
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 600);
      }, 50);
    },
    [spineItems, onSelectChapter]
  );

  // 拦截并处理阅读器正文中的链接点击（外部链接在新标签页打开，书内相对链接与锚点平滑跳转）
  const handleContentClick = useCallback(
    (e) => {
      const anchor = e.target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;

      // 1. 外部链接安全新窗口打开
      if (/^(https?:|mailto:)/i.test(href)) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }

      // 2. 危险脚本拦截
      if (/^javascript:/i.test(href)) {
        e.preventDefault();
        return;
      }

      // 3. 书内链接跳转（跨章相对链接或本章锚点）
      const section = anchor.closest(".kt-epub-spine-section");
      const currentSpinePath = section?.getAttribute("data-spine-path");
      if (!currentSpinePath) return;

      e.preventDefault();
      const currentDir = currentSpinePath.includes("/")
        ? currentSpinePath.slice(0, currentSpinePath.lastIndexOf("/") + 1)
        : "";
      const [rawPath, hash = ""] = href.split("#");

      let targetSpineIndex = -1;
      if (!rawPath) {
        targetSpineIndex = Number(section.getAttribute("data-spine-index"));
      } else {
        const resolvedPath = normalizePath(currentDir + safeDecodeURI(rawPath));
        targetSpineIndex = spineItems.findIndex(
          (s) => s.fullPath === resolvedPath
        );
      }

      if (targetSpineIndex !== -1) {
        isNavigatingRef.current = true;
        onSelectChapter?.(targetSpineIndex);
        const targetSection = scrollContainerRef.current?.querySelector(
          `#epub-spine-${targetSpineIndex}`
        );
        let targetEl = null;
        const safeHash = safeDecodeURI(hash);
        if (targetSection && safeHash) {
          try {
            targetEl =
              targetSection.querySelector(`[id="${CSS.escape(safeHash)}"]`) ||
              targetSection.querySelector(`[name="${CSS.escape(safeHash)}"]`);
          } catch {
            targetEl = targetSection.querySelector(`[id="${safeHash}"]`);
          }
        }
        if (!targetEl) targetEl = targetSection;
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 600);
      }
    },
    [spineItems, onSelectChapter]
  );

  // 监听正文滚动，自动同步视口焦点章节至 currentChapterIndex
  const handleScroll = useCallback(() => {
    if (
      isNavigatingRef.current ||
      !scrollContainerRef.current ||
      !spineItems.length
    ) {
      return;
    }
    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const focalY = containerRect.top + Math.min(120, containerRect.height / 3);

    const sections = container.querySelectorAll(".kt-epub-spine-section");
    let activeIndex = -1;

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= focalY && rect.bottom > focalY) {
        activeIndex = Number(section.getAttribute("data-spine-index"));
        break;
      }
    }

    if (activeIndex !== -1 && activeIndex !== currentChapterIndex) {
      scrollDrivenChapterRef.current = activeIndex;
      onSelectChapter?.(activeIndex);
    }
  }, [spineItems, currentChapterIndex, onSelectChapter]);

  // 当前阅读主题与字体
  const currentTheme = useMemo(
    () =>
      EPUB_READER_THEMES.find((t) => t.id === readerPreferences?.themeId) ||
      EPUB_READER_THEMES[0],
    [readerPreferences?.themeId]
  );

  const currentFont = useMemo(
    () =>
      EPUB_FONT_PRESETS.find((f) => f.id === readerPreferences?.fontFamily) ||
      EPUB_FONT_PRESETS[0],
    [readerPreferences?.fontFamily]
  );

  const currentState = currentChapter
    ? chapterStates[currentChapter.fullPath]
    : null;
  const isChapterTranslated = currentState?.status === "done";
  const isChapterTranslating = currentState?.status === "busy";

  // 章节级 HTML 与图片 Blob URL 缓存引用：Map<spinePath, { contentXhtml, sectionHtml, blobUrls, idx, tocHashes }>()
  const chapterCacheRef = useRef(new Map());

  // 清除全部章节缓存并安全释放已分配的 Blob URLs
  const clearChapterCache = useCallback(() => {
    if (
      typeof URL !== "undefined" &&
      typeof URL.revokeObjectURL === "function"
    ) {
      chapterCacheRef.current.forEach((entry) => {
        entry.blobUrls?.forEach((u) => URL.revokeObjectURL(u));
      });
    }
    chapterCacheRef.current.clear();
  }, []);

  // 当更换书籍或组件卸载时，清空缓存并释放全部 Blob URLs
  useEffect(() => {
    return () => {
      clearChapterCache();
    };
  }, [epubBook, clearChapterCache]);

  const [combinedHtml, setCombinedHtml] = useState("");

  // 提交后创建章节资源，避免 StrictMode 清理后继续显示已释放的 Blob URL。
  useEffect(() => {
    if (!spineItems.length || !epubBook?.filesMap) {
      clearChapterCache();
      setCombinedHtml("");
      return;
    }

    const currentSpinePaths = new Set(spineItems.map((s) => s.fullPath));
    // 清理已从 spineItems 移除的孤立缓存条目
    for (const [cachedPath, entry] of chapterCacheRef.current.entries()) {
      if (!currentSpinePaths.has(cachedPath)) {
        if (
          typeof URL !== "undefined" &&
          typeof URL.revokeObjectURL === "function"
        ) {
          entry.blobUrls?.forEach((u) => URL.revokeObjectURL(u));
        }
        chapterCacheRef.current.delete(cachedPath);
      }
    }

    const sections = spineItems.map((spine, idx) => {
      const state = chapterStates[spine.fullPath];
      let contentXhtml = "";

      // 仅在章节已完成翻译 (status === "done") 或正在翻译中 (status === "busy") 时呈现译文；
      // 取消、未翻译或失败的章节 (status === "idle" / "error") 绝不呈现未完成的半成品译文
      if (state?.status === "done" || state?.status === "busy") {
        if (epubViewMode === "bilingual" && state?.bilingualHtml) {
          contentXhtml = state.bilingualHtml;
        } else if (epubViewMode === "target" && state?.targetHtml) {
          contentXhtml = state.targetHtml;
        } else if (state?.sourceHtml) {
          contentXhtml = state.sourceHtml;
        }
      }

      if (!contentXhtml) {
        const bytes = epubBook.filesMap[spine.fullPath];
        if (bytes) {
          contentXhtml = fflate.strFromU8(bytes);
        }
      }

      if (!contentXhtml) return "";

      const cachedEntry = chapterCacheRef.current.get(spine.fullPath);
      if (
        cachedEntry &&
        cachedEntry.contentXhtml === contentXhtml &&
        cachedEntry.idx === idx &&
        cachedEntry.tocHashes === tocAnchorHashes
      ) {
        // 章节内容与锚点未变，直接命中缓存，无需重新解析 DOM 与创建 Blob URL
        return cachedEntry.sectionHtml;
      }

      // 该章节内容更新（例如当前章节流式译文进度变更），释放该章节旧的 Blob URL
      if (
        cachedEntry &&
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
      ) {
        cachedEntry.blobUrls?.forEach((u) => URL.revokeObjectURL(u));
      }

      let sectionHtml = "";
      const imgUrls = [];
      try {
        const doc = parseXhtmlToDoc(contentXhtml);
        // 标记所有目录链接的瞄点元素为居中标题类
        tocAnchorHashes.forEach((hash) => {
          try {
            const el =
              doc.getElementById?.(hash) ||
              doc.querySelector?.(`[id="${CSS.escape(hash)}"]`) ||
              doc.querySelector?.(`[name="${CSS.escape(hash)}"]`);
            if (el) {
              el.classList.add("kt-toc-anchor");
            }
          } catch {}
        });
        const resolvedUrls = resolveEpubImages(
          doc,
          spine.fullPath,
          epubBook.filesMap
        );
        imgUrls.push(...resolvedUrls);
        const bodyContent = doc.body
          ? doc.body.innerHTML
          : serializeDocToXhtml(doc);
        sectionHtml = `<section id="epub-spine-${idx}" data-spine-index="${idx}" data-spine-path="${spine.fullPath}" class="kt-epub-spine-section" style="margin-bottom: 3.5rem;">${bodyContent}</section>`;
      } catch {
        sectionHtml = `<section id="epub-spine-${idx}" data-spine-index="${idx}" data-spine-path="${spine.fullPath}" class="kt-epub-spine-section" style="margin-bottom: 3.5rem;">${contentXhtml}</section>`;
      }

      chapterCacheRef.current.set(spine.fullPath, {
        contentXhtml,
        sectionHtml,
        blobUrls: imgUrls,
        idx,
        tocHashes: tocAnchorHashes,
      });
      return sectionHtml;
    });

    setCombinedHtml(sections.join("\n"));
  }, [
    spineItems,
    epubBook,
    chapterStates,
    epubViewMode,
    tocAnchorHashes,
    clearChapterCache,
  ]);

  const displayHtml = combinedHtml;
  const sanitizedHtml = useMemo(
    () => sanitizeEpubReaderHtml(displayHtml),
    [displayHtml]
  );

  // 监听正文内容渲染或搜索关键词变化，自动更新高亮与计数
  useEffect(() => {
    if (searchQuery.trim()) {
      applyHighlights(searchQuery);
    } else {
      clearHighlights();
    }
  }, [displayHtml, searchQuery, applyHighlights, clearHighlights]);

  // 字号增减调节
  const adjustFontSize = (delta) => {
    const nextSize = Math.max(
      12,
      Math.min(32, (readerPreferences?.fontSize || 16) + delta)
    );
    onChangeReaderPreferences?.({ fontSize: nextSize });
  };

  // 页面宽度增减调节 (步长 40px，范围 560px ~ 1400px)
  const adjustPageWidth = (delta) => {
    const nextWidth = Math.max(
      560,
      Math.min(1400, (readerPreferences?.pageWidth || 840) + delta)
    );
    onChangeReaderPreferences?.({ pageWidth: nextWidth });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flex: 1,
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* 2. 右侧单主阅读区 */}
      <Card
        variant="outlined"
        sx={{
          flex: 1,
          position: "relative",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <TocDrawer
          open={!tocCollapsed}
          onClose={() => setTocCollapsed(true)}
          toggleRef={tocToggleRef}
          width={tocWidth}
          defaultWidth={DEFAULT_TOC_WIDTH}
          onWidthChange={changeTocWidth}
        >
          {/* 目录栏顶部 */}
          <Box
            sx={{
              p: 1.25,
              borderBottom: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <MenuBookRoundedIcon
              sx={{
                fontSize: 18,
                color: (theme) =>
                  theme.palette.mode === "dark"
                    ? theme.palette.common.white
                    : theme.palette.primary.main,
              }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              {i18n("epub_toc_title", "书籍目录")} (
              {epubBook?.tocItems?.length || rawTocTree.length})
            </Typography>
          </Box>

          {/* 章节搜索框 */}
          <Box sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
            <TextField
              fullWidth
              size="small"
              placeholder={i18n("search_chapter", "搜索章节...")}
              value={tocSearch}
              onChange={(e) => setTocSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <SearchRoundedIcon
                    sx={{ fontSize: 16, mr: 0.5, color: "text.secondary" }}
                  />
                ),
              }}
              sx={{
                "& .MuiInputBase-input": {
                  py: 0.5,
                  fontSize: 12,
                },
              }}
            />
          </Box>

          {/* 树形章节列表 */}
          <List
            sx={{
              flex: 1,
              overflowY: "auto",
              p: 0.5,
            }}
          >
            {filteredTocTree.map((node) => (
              <TocTreeItem
                key={node.id || node.href || node.title}
                node={node}
                depth={0}
                selectedId={selectedTocId}
                onSelectNode={handleSelectTocNode}
                expandedKeys={expandedKeys}
                onToggleExpand={handleToggleExpand}
                chapterStates={chapterStates}
              />
            ))}
          </List>
        </TocDrawer>
        {/* 阅读区顶部工具栏 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 48,
            minHeight: 48,
            boxSizing: "border-box",
            overflowX: "auto",
            flexShrink: 0,
            "& > *": { flexShrink: 0 },
            p: 1,
            px: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            gap: 1.5,
            flexWrap: "nowrap",
          }}
        >
          {/* 左侧：折叠目录与章节标题 */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              minWidth: 0,
              flex: "1 0 auto",
            }}
          >
            <Tooltip
              title={
                tocCollapsed
                  ? i18n("expand_toc", "展开目录")
                  : i18n("collapse_toc", "折叠目录")
              }
            >
              <IconButton
                size="small"
                ref={tocToggleRef}
                aria-label={
                  tocCollapsed
                    ? i18n("expand_toc", "展开目录")
                    : i18n("collapse_toc", "折叠目录")
                }
                aria-expanded={!tocCollapsed}
                onClick={() => setTocCollapsed(!tocCollapsed)}
                color={!tocCollapsed ? "primary" : "default"}
                sx={{
                  p: 0.5,
                  borderRadius: 1,
                  bgcolor: !tocCollapsed ? "action.selected" : "transparent",
                }}
              >
                <MenuRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            <Typography
              variant="subtitle2"
              title={epubBook?.title || ""}
              sx={{
                fontWeight: 700,
                fontSize: 13.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {epubBook?.title || i18n("epub_reader_title", "电子书阅读")}
            </Typography>
          </Box>

          {/* 右侧：正文搜索 + Aa阅读排版 + 视图切换 + 翻译按钮 */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
            }}
          >
            {/* 正文搜索框 */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                px: 0.75,
                height: 30,
                bgcolor: "background.paper",
                width: { xs: 120, sm: 170, md: 220 },
                transition: "width 0.2s, border-color 0.2s",
                "&:focus-within": {
                  borderColor: "primary.main",
                  boxShadow: (theme) =>
                    `0 0 0 1px ${theme.palette.primary.main}`,
                },
              }}
            >
              <SearchRoundedIcon
                sx={{
                  fontSize: 16,
                  color: "text.secondary",
                  mr: 0.5,
                  flexShrink: 0,
                }}
              />
              <InputBase
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                      handlePrevMatch();
                    } else {
                      handleNextMatch();
                    }
                  } else if (e.key === "Escape") {
                    setSearchQuery("");
                  }
                }}
                placeholder={i18n("search_content_placeholder", "搜索正文...")}
                inputProps={{
                  "aria-label": "search content",
                }}
                sx={{
                  flex: 1,
                  fontSize: 12,
                  "& input": { p: 0, height: "auto" },
                }}
              />
              {searchQuery && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.2,
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: 11,
                      color: "text.secondary",
                      px: 0.25,
                      lineHeight: 1,
                      userSelect: "none",
                    }}
                  >
                    {matchCount > 0
                      ? `${currentMatchIndex + 1}/${matchCount}`
                      : "0/0"}
                  </Typography>
                  <Tooltip title={i18n("search_prev", "上一个 (Shift+Enter)")}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={matchCount === 0}
                        onClick={handlePrevMatch}
                        sx={{ p: 0.25 }}
                      >
                        <KeyboardArrowUpRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={i18n("search_next", "下一个 (Enter)")}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={matchCount === 0}
                        onClick={handleNextMatch}
                        sx={{ p: 0.25 }}
                      >
                        <KeyboardArrowDownRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <IconButton
                    size="small"
                    onClick={() => setSearchQuery("")}
                    sx={{ p: 0.25 }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              )}
            </Box>

            {/* Aa 阅读偏好快捷按钮 */}
            <Tooltip title={i18n("epub_reader_settings", "阅读排版")}>
              <IconButton
                size="small"
                onClick={(e) => setFontMenuAnchor(e.currentTarget)}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 0.8,
                  height: 30,
                  gap: 0.3,
                }}
              >
                <FormatSizeRoundedIcon sx={{ fontSize: 17 }} />
                <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
                  Aa
                </Typography>
              </IconButton>
            </Tooltip>

            {/* 视图模式：原文 / 译文 / 双语 */}
            <ToggleButtonGroup
              size="small"
              value={epubViewMode}
              exclusive
              onChange={(e, val) => val && onChangeViewMode?.(val)}
              sx={{ height: 30 }}
            >
              <ToggleButton
                value="source"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                {i18n("epub_view_source", "原文")}
              </ToggleButton>
              <ToggleButton
                value="target"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                {i18n("epub_view_target", "译文")}
              </ToggleButton>
              <ToggleButton
                value="bilingual"
                sx={{ px: 1, py: 0.25, fontSize: 11.5 }}
              >
                {i18n("epub_view_bilingual", "双语")}
              </ToggleButton>
            </ToggleButtonGroup>

            {/* 试译当前章节按钮 */}
            <Button
              size="small"
              variant="outlined"
              color="primary"
              disabled={busy || !translationAvailable}
              onClick={handleTranslateChapterClick}
              sx={{
                height: 30,
                fontSize: 12,
                px: 1.25,
                textTransform: "none",
                whiteSpace: "nowrap",
              }}
            >
              {i18n("epub_translate_chapter", "试译当前章节")}
            </Button>

            {/* 停止按钮 (仅在繁忙/翻译中显示) */}
            {busy && (
              <Button
                size="small"
                variant="contained"
                color="error"
                startIcon={<StopRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={onCancel}
                sx={{
                  height: 30,
                  fontSize: 12,
                  px: 1.5,
                  fontWeight: 600,
                  textTransform: "none",
                }}
              >
                {i18n("stop_translation", "停止")}
              </Button>
            )}
          </Box>
        </Box>

        {/* Aa 排版设置浮层 */}
        <Popover
          open={Boolean(fontMenuAnchor)}
          anchorEl={fontMenuAnchor}
          onClose={() => setFontMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{
            sx: {
              p: 2,
              width: 280,
              borderRadius: 2,
              boxShadow: 4,
            },
          }}
        >
          {/* 页面宽度设置 */}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "text.secondary",
              display: "block",
              mb: 1,
            }}
          >
            {i18n("epub_page_width", "页面宽度")}
          </Typography>
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={() => adjustPageWidth(-40)}
              sx={{ minWidth: 36, height: 32, fontSize: 12 }}
            >
              W-
            </Button>
            <Typography sx={{ flex: 1, textAlign: "center", fontWeight: 700 }}>
              {readerPreferences?.pageWidth || 840} px
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => adjustPageWidth(40)}
              sx={{ minWidth: 36, height: 32, fontSize: 12 }}
            >
              W+
            </Button>
          </Box>
          <Box sx={{ display: "flex", gap: 0.75, mb: 2 }}>
            {[
              { label: i18n("page_width_narrow", "窄版 (680)"), width: 680 },
              { label: i18n("page_width_medium", "适中 (840)"), width: 840 },
              { label: i18n("page_width_wide", "宽版 (1020)"), width: 1020 },
            ].map((preset) => {
              const currentW = readerPreferences?.pageWidth || 840;
              const isSelected = currentW === preset.width;
              return (
                <Button
                  key={preset.width}
                  size="small"
                  variant={isSelected ? "contained" : "outlined"}
                  onClick={() =>
                    onChangeReaderPreferences?.({ pageWidth: preset.width })
                  }
                  sx={{
                    flex: 1,
                    fontSize: 11,
                    py: 0.4,
                    px: 0.5,
                    boxShadow: "none",
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
          </Box>

          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "text.secondary",
              display: "block",
              mb: 1,
            }}
          >
            {i18n("epub_font_size", "字号大小")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => adjustFontSize(-2)}
              sx={{ minWidth: 36, height: 32, fontSize: 12 }}
            >
              A-
            </Button>
            <Typography sx={{ flex: 1, textAlign: "center", fontWeight: 700 }}>
              {readerPreferences?.fontSize || 16} px
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => adjustFontSize(2)}
              sx={{ minWidth: 36, height: 32, fontSize: 12 }}
            >
              A+
            </Button>
          </Box>

          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "text.secondary",
              display: "block",
              mb: 1,
            }}
          >
            {i18n("epub_font_family", "正文字体")}
          </Typography>
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}
          >
            {EPUB_FONT_PRESETS.map((font) => (
              <Button
                key={font.id}
                size="small"
                variant={
                  readerPreferences?.fontFamily === font.id
                    ? "contained"
                    : "text"
                }
                onClick={() =>
                  onChangeReaderPreferences?.({ fontFamily: font.id })
                }
                sx={{
                  justifyContent: "flex-start",
                  fontSize: 12,
                  py: 0.5,
                  boxShadow: "none",
                }}
              >
                {i18n(font.labelKey, font.label)}
              </Button>
            ))}
          </Box>

          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "text.secondary",
              display: "block",
              mb: 1,
            }}
          >
            {i18n("epub_reader_theme", "阅读底色")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            {EPUB_READER_THEMES.map((theme) => {
              const isSelected = readerPreferences?.themeId === theme.id;
              return (
                <Tooltip key={theme.id} title={i18n(theme.nameKey, theme.name)}>
                  <Box
                    onClick={() =>
                      onChangeReaderPreferences?.({ themeId: theme.id })
                    }
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      bgcolor: theme.bg,
                      border: "2px solid",
                      borderColor: (muiTheme) =>
                        isSelected
                          ? muiTheme.palette.mode === "dark"
                            ? muiTheme.palette.common.white
                            : muiTheme.palette.primary.main
                          : theme.border,
                      cursor: "pointer",
                      boxShadow: isSelected ? 2 : 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "transform 0.15s",
                      "&:hover": { transform: "scale(1.1)" },
                    }}
                  >
                    {isSelected && (
                      <CheckCircleRoundedIcon
                        sx={{
                          fontSize: 16,
                          borderRadius: "50%",
                          color: (muiTheme) =>
                            muiTheme.palette.mode === "dark"
                              ? muiTheme.palette.common.white
                              : muiTheme.palette.primary.main,
                          bgcolor: (muiTheme) =>
                            muiTheme.palette.mode === "dark"
                              ? muiTheme.palette.background.paper
                              : "transparent",
                        }}
                      />
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Popover>

        {/* 动态注入译文样式（如虚线框、高亮等），与 Aa 字号底色无缝叠加 */}
        {rawStyleCode && (
          <style>{`
            .kt-epub-reader-body .kt-bilingual-target {
              ${rawStyleCode}
            }
          `}</style>
        )}

        {/* 未翻译时的温和提示 */}
        {!isChapterTranslated &&
          !isChapterTranslating &&
          !currentState?.bilingualHtml &&
          !hintDismissed &&
          epubViewMode !== "source" && (
            <ReaderAlert
              severity="info"
              onClose={() => setHintDismissed(true)}
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
              {i18n(
                "epub_chapter_untranslated_hint",
                "当前章节尚未翻译，正在显示原文。点击上方【试译当前章节】或【翻译整本书】即可生成译文。"
              )}
            </ReaderAlert>
          )}

        {/* 核心阅读正文区域 (拟真实体纸张设计，与桌台背景底座分离) */}
        <Box
          ref={scrollContainerRef}
          onClick={handleContentClick}
          onScroll={handleScroll}
          sx={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            py: { xs: 2, md: 4 },
            px: { xs: 1, sm: 2, md: 3 },
            bgcolor: currentTheme.deskBg || currentTheme.bg,
            transition: "background-color 0.2s",
          }}
        >
          <Box
            ref={contentBodyRef}
            className="kt-epub-reader-body"
            sx={{
              width: "100%",
              maxWidth: `${readerPreferences?.pageWidth || 840}px`,
              minHeight: "100%",
              mx: "auto",
              boxSizing: "border-box",
              bgcolor: currentTheme.bg,
              color: currentTheme.text,
              boxShadow: currentTheme.shadow,
              border: "1px solid",
              borderColor: currentTheme.border,
              borderRadius: "4px",
              p: { xs: 2.5, sm: 4, md: 6 },
              fontSize: `${readerPreferences?.fontSize || 16}px`,
              fontFamily: currentFont.font,
              lineHeight: 1.8,
              transition: "background-color 0.2s, color 0.2s, max-width 0.2s",
              "& p": { my: 1.5 },
              "& h1, & h2, & h3, & h4, & h5, & h6, & .kt-toc-anchor": {
                textAlign: "center !important",
                fontWeight: 700,
                my: 2,
                lineHeight: 1.3,
              },
              "& .kt-toc-anchor *": {
                textAlign: "center !important",
              },
              "& img": {
                maxWidth: "100%",
                height: "auto",
                borderRadius: 1,
                my: 1.5,
                display: "block",
                mx: "auto",
              },
              "& svg": {
                maxWidth: "100%",
                maxHeight: "85vh",
                height: "auto !important",
                display: "block",
                mx: "auto",
                borderRadius: 1,
                my: 1.5,
              },
              "& .x-ebookmaker-cover": {
                width: "100%",
                height: "auto !important",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                bgcolor: "transparent !important",
                my: 2,
              },
              "& blockquote": {
                borderLeft: "4px solid",
                borderColor: "divider",
                pl: 2,
                my: 1.5,
                opacity: 0.85,
              },
              "& .kt-bilingual-br": {
                display: "block",
                content: '""',
                mt: 0.5,
              },
              "& .kt-bilingual-target": {
                display: "inline-block",
                opacity: 0.9,
                lineHeight: 1.65,
                mt: 0.2,
                fontWeight: 500,
              },
              "& mark.kt-search-highlight": {
                backgroundColor: "rgba(253, 224, 71, 0.65)",
                color: "inherit",
                borderRadius: "2px",
                padding: "0 2px",
              },
              "& mark.kt-search-current": {
                backgroundColor: "#f59e0b",
                color: "#ffffff !important",
                borderRadius: "2px",
                padding: "0 2px",
                boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.4)",
              },
              "& .kt-epub-footer": {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center !important",
                my: 4,
                width: "100%",
                clear: "both",
              },
              "& .kt-epub-footer-line": {
                display: "inline-block",
                width: "48px",
                height: "1px",
                bgcolor: "divider",
                verticalAlign: "middle",
                flexShrink: 0,
              },
              "& .kt-epub-footer-text": {
                display: "inline-block",
                mx: 1.75,
                fontSize: "0.82em",
                color: "text.secondary",
                whiteSpace: "nowrap",
                textAlign: "center !important",
                "& a": {
                  color: "primary.main",
                  textDecoration: "none",
                  "&:hover": {
                    textDecoration: "underline",
                  },
                },
              },
              "& .kt-epub-footer *": {
                textAlign: "center !important",
              },
            }}
            dangerouslySetInnerHTML={{
              __html: sanitizedHtml,
            }}
          />
        </Box>
      </Card>
    </Box>
  );
}
