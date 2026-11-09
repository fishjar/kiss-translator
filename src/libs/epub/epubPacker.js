import { logger } from "../log";
import * as fflate from "fflate";
import { parseXml, normalizePath, safeDecodeURI } from "./epubParser";
import { FILE_TRANSLATE_I18N } from "../../config/locales/fileTranslate";

/**
 * 默认内置的双语排版与章节注明 CSS 内容
 */
export const DEFAULT_EPUB_BILINGUAL_CSS = `
/* KISS Translator 双语对照排版样式 */
.kt-bilingual-br {
  display: block;
  content: "";
  margin-top: 0.35em;
}
.kt-bilingual-target {
  display: inline-block;
  opacity: 0.88;
  line-height: 1.6;
  margin-top: 0.15em;
}

/* 章节底部注明：单纯文字与优雅的短线分隔符 */
.kt-epub-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin-top: 3.5em !important;
  margin-bottom: 2em !important;
  margin-left: auto !important;
  margin-right: auto !important;
  padding: 0 !important;
  text-align: center !important;
  clear: both !important;
  width: 100% !important;
}
.kt-epub-footer, .kt-epub-footer * {
  text-align: center !important;
}
.kt-epub-footer-line {
  display: inline-block !important;
  width: 48px !important;
  height: 1px !important;
  background-color: #d1d5db !important;
  vertical-align: middle !important;
  flex-shrink: 0 !important;
}
.kt-epub-footer-text {
  display: inline-block !important;
  margin: 0 14px !important;
  padding: 0 !important;
  text-align: center !important;
  font-size: 0.82em !important;
  line-height: 1.5 !important;
  color: #888888 !important;
  white-space: nowrap !important;
}
.kt-epub-footer a {
  color: #2563eb !important;
  text-decoration: none !important;
  word-break: break-all !important;
}
.kt-epub-footer a:hover {
  text-decoration: underline !important;
}
`;

export const EPUB_FOOTER_LINK = "https://github.com/fishjar/kiss-translator";
export const EPUB_FOOTER_BRAND_HTML = `<a href="${EPUB_FOOTER_LINK}">KISS Translator</a>`;

/**
 * 将传入的语言代码解析为字典中的 UI 语言 key
 * @param {string} lang 语言代码
 * @returns {string} 规范化后的语言 key (zh, en, zh_TW, ja, ko, tr, vi, ru)
 */
export function resolveUiLangKey(lang) {
  if (!lang || typeof lang !== "string") return "zh";
  const lower = lang.toLowerCase().replace(/_/g, "-");
  if (
    lower.startsWith("zh-tw") ||
    lower.startsWith("zh-hk") ||
    lower.startsWith("zh-hant")
  ) {
    return "zh_TW";
  }
  if (lower.startsWith("zh")) {
    return "zh";
  }
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("tr")) return "tr";
  if (lower.startsWith("vi")) return "vi";
  if (lower.startsWith("ru")) return "ru";
  return "en";
}

/**
 * 根据语言代码获取多语言章节底部注明 HTML
 * @param {string} [lang="zh"] 语言代码（如 'zh', 'en', 'zh-CN', 'ja' 等）
 * @returns {string} 底部注明的 HTML 片段
 */
export function getEpubFooterHtml(lang = "zh") {
  const langKey = resolveUiLangKey(lang);
  const template =
    FILE_TRANSLATE_I18N?.epub_footer_made_by?.[langKey] ||
    FILE_TRANSLATE_I18N?.epub_footer_made_by?.zh ||
    "由 {0} 制作";
  const formatted = template
    .replace("{0}", EPUB_FOOTER_BRAND_HTML)
    .replace("{brand}", EPUB_FOOTER_BRAND_HTML);
  return `<div class="kt-epub-footer" align="center" style="display: flex; align-items: center; justify-content: center; margin: 3.5em auto 2em auto; padding: 0; text-align: center !important; clear: both; width: 100%;"><span class="kt-epub-footer-line" style="display: inline-block; width: 48px; height: 1px; background-color: #d1d5db; vertical-align: middle; margin-right: 14px; flex-shrink: 0;"></span><span class="kt-epub-footer-text" style="display: inline-block; margin: 0 14px; padding: 0; font-size: 0.82em; color: #888888; vertical-align: middle; white-space: nowrap; text-align: center !important;">${formatted}</span><span class="kt-epub-footer-line" style="display: inline-block; width: 48px; height: 1px; background-color: #d1d5db; vertical-align: middle; margin-left: 14px; flex-shrink: 0;"></span></div>`;
}

/**
 * 默认章节底部注明的 HTML 片段（包含外框与主页链接）
 */
export const EPUB_FOOTER_HTML = getEpubFooterHtml("zh");

/**
 * 在章节 XHTML 的 </body> 前注入框住的底部注明与主页链接
 * @param {string} xhtmlContent 章节 XHTML
 * @param {string} [langOrCustomHtml="zh"] 目标语言代码或自定义 footer HTML 片段
 * @returns {string} 注入 footer 后的 XHTML
 */
export function injectFooterIntoXhtml(xhtmlContent, langOrCustomHtml = "zh") {
  if (!xhtmlContent) return xhtmlContent;
  if (xhtmlContent.includes("kt-epub-footer")) return xhtmlContent;

  const footerHtml =
    typeof langOrCustomHtml === "string" && langOrCustomHtml.includes("<div")
      ? langOrCustomHtml
      : getEpubFooterHtml(langOrCustomHtml || "zh");

  // 1. 标准情况：存在 </body> 闭合标签
  if (/<\/body>/i.test(xhtmlContent)) {
    return xhtmlContent.replace(/<\/body>/i, `  ${footerHtml}\n</body>`);
  }

  // 2. 自闭合 body 标签（如空章节 <body/> 或 <body class="..."/>）：展开并在其内部注入 footer
  if (/<body\b([^>]*)\/>/i.test(xhtmlContent)) {
    return xhtmlContent.replace(
      /<body\b([^>]*)\/>/i,
      `<body$1>\n  ${footerHtml}\n</body>`
    );
  }

  // 3. 存在 </html> 根闭合标签但缺少 <body>：在 </html> 之前合规闭合 body，绝不输出到 </html> 外部
  if (/<\/html>/i.test(xhtmlContent)) {
    return xhtmlContent.replace(
      /<\/html>/i,
      `<body>\n  ${footerHtml}\n</body>\n</html>`
    );
  }

  return `${xhtmlContent}\n${footerHtml}`;
}

/**
 * 更新 content.opf 元数据与资源清单
 * @param {string} opfXml 原 OPF XML 内容
 * @param {Object} options 配置选项
 * @param {string} [options.toLang] 目标语言代码，如 "zh-CN"
 * @param {string} [options.titleSuffix] 书名后缀，如 " [双语对照]"
 * @param {string} [options.cssHref] 注入的 CSS 相对路径
 * @returns {string} 更新后的 OPF XML 字符串
 */
export function updateOpfDocument(opfXml, options = {}) {
  const { toLang, titleSuffix = "", cssHref = "" } = options;
  const doc = parseXml(opfXml);

  // 1. 更新语言代码（仅在指定了有效的目标语言时更新，避免清空或覆盖原书语言）
  if (toLang && typeof toLang === "string" && toLang.trim()) {
    const langEl =
      doc.getElementsByTagName("dc:language")?.[0] ||
      doc.getElementsByTagName("language")?.[0];
    if (langEl) {
      langEl.textContent = toLang.trim();
    }
  }

  // 2. 更新书名
  if (titleSuffix) {
    const titleEl =
      doc.getElementsByTagName("dc:title")?.[0] ||
      doc.getElementsByTagName("title")?.[0];
    if (titleEl && titleEl.textContent) {
      if (!titleEl.textContent.includes(titleSuffix.trim())) {
        titleEl.textContent = `${titleEl.textContent.trim()}${titleSuffix}`;
      }
    }
  }

  // 3. 注册新注入的 CSS 资源至 <manifest>
  if (cssHref) {
    const manifestEl = doc.querySelector("manifest");
    if (manifestEl && !manifestEl.querySelector("#kt-epub-css")) {
      const opfNs =
        manifestEl.namespaceURI ||
        doc.documentElement?.namespaceURI ||
        "http://www.idpf.org/2007/opf";
      const itemEl = doc.createElementNS(opfNs, "item");
      itemEl.setAttribute("id", "kt-epub-css");
      itemEl.setAttribute("href", cssHref);
      itemEl.setAttribute("media-type", "text/css");
      manifestEl.appendChild(itemEl);
    }
  }

  const serializer = new XMLSerializer();
  let result = serializer.serializeToString(doc);
  if (!result.startsWith("<?xml")) {
    result = `<?xml version="1.0" encoding="utf-8"?>\n${result}`;
  }
  return result;
}

/**
 * 确保 XHTML 的 <head> 中引入了双语排版样式表
 * @param {string} xhtmlContent 章节 XHTML
 * @param {string} relativeCssPath 从当前章节到 CSS 文件的相对路径
 * @returns {string} 更新后的 XHTML
 */
export function injectCssIntoXhtml(xhtmlContent, relativeCssPath) {
  if (!xhtmlContent || !relativeCssPath) return xhtmlContent;
  if (xhtmlContent.includes(relativeCssPath)) return xhtmlContent;

  const linkTag = `<link rel="stylesheet" type="text/css" href="${relativeCssPath}" />`;
  if (/<\/head>/i.test(xhtmlContent)) {
    return xhtmlContent.replace(/<\/head>/i, `  ${linkTag}\n</head>`);
  }
  if (/<head\b([^>]*)\/>/i.test(xhtmlContent)) {
    return xhtmlContent.replace(
      /<head\b([^>]*)\/>/i,
      `<head$1>\n  ${linkTag}\n</head>`
    );
  }
  if (/<html\b([^>]*)>/i.test(xhtmlContent)) {
    return xhtmlContent.replace(
      /<html\b([^>]*)>/i,
      `<html$1>\n<head>\n  ${linkTag}\n</head>`
    );
  }
  return xhtmlContent;
}

/**
 * 依据标题映射同步更新 EPUB 3 导航文档 (nav.xhtml) 中的目录链接文本
 * @param {string} navXml 原 NAV XHTML 字符串
 * @param {Map<string, string>} titleMap 目标全路径/锚点到译文标题的映射
 * @param {string} [navDir=""] NAV 文件所在包内目录（例如 "OEBPS/"）
 * @returns {string} 更新后的 NAV XHTML 字符串
 */
export function updateNavDocument(navXml, titleMap, navDir = "") {
  if (!navXml || !titleMap || titleMap.size === 0) return navXml;

  const doc = parseXml(navXml);
  const links = doc.querySelectorAll("a[href]");

  let modified = false;
  links.forEach((a) => {
    const rawHref = a.getAttribute("href");
    if (!rawHref) return;

    const [cleanHref, rawHash = ""] = rawHref.split("#");
    const targetFullPath = normalizePath(navDir + safeDecodeURI(cleanHref));
    const fullKeyWithHash = rawHash
      ? `${targetFullPath}#${safeDecodeURI(rawHash)}`
      : targetFullPath;

    const translatedTitle = rawHash
      ? titleMap.get(fullKeyWithHash)
      : titleMap.get(fullKeyWithHash) || titleMap.get(targetFullPath);
    if (translatedTitle && translatedTitle.trim()) {
      a.textContent = translatedTitle.trim();
      modified = true;
    }
  });

  if (!modified) return navXml;

  const serializer = new XMLSerializer();
  let result = serializer.serializeToString(doc);
  if (!result.startsWith("<?xml")) {
    result = `<?xml version="1.0" encoding="utf-8"?>\n${result}`;
  }
  return result;
}

/**
 * 依据标题映射同步更新 EPUB 2 NCX 目录文档 (toc.ncx) 中的目录文本
 * @param {string} ncxXml 原 NCX XML 字符串
 * @param {Map<string, string>} titleMap 目标全路径/锚点到译文标题的映射
 * @param {string} [ncxDir=""] NCX 文件所在包内目录（例如 "OEBPS/"）
 * @returns {string} 更新后的 NCX XML 字符串
 */
export function updateNcxDocument(ncxXml, titleMap, ncxDir = "") {
  if (!ncxXml || !titleMap || titleMap.size === 0) return ncxXml;

  const doc = parseXml(ncxXml);
  const navPoints = Array.from(
    doc.getElementsByTagName ? doc.getElementsByTagName("*") : []
  ).filter(
    (el) => el.localName === "navPoint" || el.nodeName?.endsWith("navPoint")
  );

  let modified = false;
  navPoints.forEach((navPoint) => {
    const allChildren = Array.from(
      navPoint.getElementsByTagName ? navPoint.getElementsByTagName("*") : []
    );
    const contentEl = allChildren.find(
      (el) => el.localName === "content" || el.nodeName?.endsWith("content")
    );
    const rawSrc = contentEl?.getAttribute("src");
    if (!rawSrc) return;

    const [cleanSrc, rawHash = ""] = rawSrc.split("#");
    const targetFullPath = normalizePath(ncxDir + safeDecodeURI(cleanSrc));
    const fullKeyWithHash = rawHash
      ? `${targetFullPath}#${safeDecodeURI(rawHash)}`
      : targetFullPath;

    const translatedTitle = rawHash
      ? titleMap.get(fullKeyWithHash)
      : titleMap.get(fullKeyWithHash) || titleMap.get(targetFullPath);
    if (translatedTitle && translatedTitle.trim()) {
      const labelEl = allChildren.find(
        (el) => el.localName === "navLabel" || el.nodeName?.endsWith("navLabel")
      );
      if (labelEl) {
        const textEl = Array.from(
          labelEl.getElementsByTagName ? labelEl.getElementsByTagName("*") : []
        ).find(
          (el) => el.localName === "text" || el.nodeName?.endsWith("text")
        );
        if (textEl) {
          textEl.textContent = translatedTitle.trim();
          modified = true;
        }
      }
    }
  });

  if (!modified) return ncxXml;

  const serializer = new XMLSerializer();
  let result = serializer.serializeToString(doc);
  if (!result.startsWith("<?xml")) {
    result = `<?xml version="1.0" encoding="utf-8"?>\n${result}`;
  }
  return result;
}

/**
 * 根据目录锚点元素查找对应的小节标题元素（支持前置空 a/span 标签向后查找紧邻标题）
 * @param {Element} anchorEl 锚点元素
 * @returns {Element|null} 对应的标题元素或自身
 */
export function findTitleElementForAnchor(anchorEl) {
  if (!anchorEl) return null;

  // 1. 锚点本身就是标题元素 (h1-h6)
  if (anchorEl.matches?.("h1, h2, h3, h4, h5, h6")) {
    return anchorEl;
  }

  // 2. 锚点内部包含标题元素（例如 <div id="sec1"><h3>小节标题</h3></div>）
  const childHeader = anchorEl.querySelector?.("h1, h2, h3, h4, h5, h6");
  if (childHeader) {
    return childHeader;
  }

  // 3. 锚点处于标题元素内部（例如 <h2><a id="sec1"></a>小节标题</h2>）
  const parentHeader = anchorEl.closest?.("h1, h2, h3, h4, h5, h6");
  if (parentHeader) {
    return parentHeader;
  }

  // 4. 若锚点自身已有实质性文本，直接返回自身作为标题元素
  if (anchorEl.textContent?.trim()) {
    return anchorEl;
  }

  // 5. 锚点为前置的空元素（例如空 <a id="sec1"></a> 或包裹在空段落中的 <p><a id="sec1"></a></p>）
  // 向后沿兄弟节点及向上层父级查找紧随其后的小节标题
  let cur = anchorEl;
  while (cur && cur !== cur.ownerDocument?.body) {
    let next = cur.nextElementSibling;
    while (next) {
      if (next.matches?.("h1, h2, h3, h4, h5, h6")) {
        return next;
      }
      const nextHeader = next.querySelector?.("h1, h2, h3, h4, h5, h6");
      if (nextHeader) {
        return nextHeader;
      }
      // 如果遇到具有实际文本内容的非标题块级元素，停止查找，避免误认后续正文或下一章标题
      if (next.textContent?.trim()) {
        break;
      }
      next = next.nextElementSibling;
    }
    // 若当前父级除了当前节点（或其空兄弟）外没有其他实质文本内容，向上一层父元素继续查找后续兄弟
    if (
      cur.parentElement &&
      cur.parentElement !== cur.ownerDocument?.body &&
      !cur.parentElement.textContent?.replace(cur.textContent || "", "").trim()
    ) {
      cur = cur.parentElement;
    } else {
      break;
    }
  }

  return anchorEl;
}

/**
 * 从已翻译的章节与导航状态中提取章节/锚点到翻译后标题的映射
 * @param {Object} epubBook EPUB 图书对象
 * @param {Object} chapterStates 章节翻译状态
 * @param {string} [mode="bilingual"] 导出模式 ("bilingual" | "target")
 * @returns {Map<string, string>}
 */
export function extractTitleMapFromChapterStates(
  epubBook,
  chapterStates,
  mode = "bilingual"
) {
  const titleMap = new Map();
  if (!epubBook || !chapterStates) return titleMap;

  // 1. 若 NAV 文档本身已被独立翻译，优先从翻译后的 NAV 文档提取所有目录条目标题
  if (
    epubBook.navItemHref &&
    chapterStates[epubBook.navItemHref]?.status === "done"
  ) {
    const navState = chapterStates[epubBook.navItemHref];
    const navContent =
      mode === "target"
        ? navState.targetXhtml || navState.targetHtml
        : navState.bilingualXhtml || navState.bilingualHtml;
    if (navContent) {
      try {
        const navDir = epubBook.navItemHref.includes("/")
          ? epubBook.navItemHref.slice(
              0,
              epubBook.navItemHref.lastIndexOf("/") + 1
            )
          : "";
        const navDoc = parseXml(navContent);
        const links = navDoc.querySelectorAll("a[href]");
        links.forEach((a) => {
          const href = a.getAttribute("href");
          const text = a.textContent?.trim();
          if (href && text) {
            const [cleanHref, rawHash = ""] = href.split("#");
            const fullPath = normalizePath(navDir + safeDecodeURI(cleanHref));
            const fullKey = rawHash
              ? `${fullPath}#${safeDecodeURI(rawHash)}`
              : fullPath;
            titleMap.set(fullKey, text);
            if (!titleMap.has(fullPath)) {
              titleMap.set(fullPath, text);
            }
          }
        });
      } catch (e) {
        logger
          .child("file-translate")
          .warn("从已翻译 NAV 提取目录标题映射失败:", e);
      }
    }
  }

  // 2. 遍历已翻译的章节正文，从已翻译的 DOM 中提取主标题 (h1-h6) 及锚点标题
  const spineItems = epubBook.spineItems || [];
  const tocItems = epubBook.tocItems || [];

  for (const spine of spineItems) {
    const state = chapterStates[spine.fullPath];
    if (state?.status !== "done") continue;

    const content =
      mode === "target"
        ? state.targetXhtml || state.targetHtml
        : state.bilingualXhtml || state.bilingualHtml;
    if (!content) continue;

    let doc;
    try {
      doc = parseXml(content);
    } catch {
      continue;
    }

    const getTargetText = (el) => {
      if (!el) return "";
      if (mode === "bilingual") {
        const targetSpan = el.querySelector(".kt-bilingual-target");
        if (targetSpan && targetSpan.textContent?.trim()) {
          return targetSpan.textContent.trim();
        }
      }
      return el.textContent?.trim() || "";
    };

    // 2.1 提取章节首个主标题 (h1-h6)
    if (!titleMap.has(spine.fullPath)) {
      const headerEl = doc.querySelector("h1, h2, h3, h4, h5, h6");
      if (headerEl) {
        const headerText = getTargetText(headerEl);
        if (headerText) {
          titleMap.set(spine.fullPath, headerText);
        }
      }
    }

    // 2.2 若 tocItems 中有指向该章节的锚点，提取锚点处的标题
    const chapterTocItems = tocItems.filter(
      (t) => t.fullPath === spine.fullPath && t.hash
    );
    for (const tocItem of chapterTocItems) {
      const anchorEl =
        doc.getElementById(tocItem.hash) ||
        doc.querySelector?.(`[id="${tocItem.hash}"]`) ||
        doc.querySelector?.(`[name="${tocItem.hash}"]`);
      if (anchorEl) {
        const titleEl = findTitleElementForAnchor(anchorEl);
        const anchorText = getTargetText(titleEl);
        if (anchorText) {
          titleMap.set(`${spine.fullPath}#${tocItem.hash}`, anchorText);
        }
      }
    }
  }

  return titleMap;
}

/**
 * 计算两个处于包内相对路径的文件之间的相对引用路径
 * @param {string} fromPath 源文件路径，例如 "OEBPS/text/ch01.xhtml"
 * @param {string} toPath 目标文件路径，例如 "OEBPS/styles/kt.css"
 * @returns {string} 相对引用路径，例如 "../styles/kt.css"
 */
export function getRelativePath(fromPath, toPath) {
  const fromParts = fromPath.split("/");
  fromParts.pop(); // 去除文件名
  const toParts = toPath.split("/");

  let commonIdx = 0;
  while (
    commonIdx < fromParts.length &&
    commonIdx < toParts.length &&
    fromParts[commonIdx] === toParts[commonIdx]
  ) {
    commonIdx++;
  }

  const upCount = fromParts.length - commonIdx;
  const upParts = new Array(upCount).fill("..");
  const downParts = toParts.slice(commonIdx);

  return [...upParts, ...downParts].join("/") || "./";
}

/**
 * 将修改后的文件映射表打包为合规的 EPUB 二进制 Uint8Array
 * 保证 mimetype 处于首位且以 Store (level 0) 无压缩存储
 * @param {Object} filesMap 文件路径 -> Uint8Array 映射表
 * @returns {Uint8Array} EPUB 二进制数据
 */
export function packEpubUint8Array(filesMap) {
  const zipEntries = {};

  // 1. 首个条目固定为 mimetype，无压缩
  zipEntries["mimetype"] = [
    fflate.strToU8("application/epub+zip"),
    { level: 0 },
  ];

  // 2. 其余文件依次放入
  for (const [path, data] of Object.entries(filesMap)) {
    if (path === "mimetype") continue; // 已处理
    const uint8 =
      data instanceof Uint8Array ? data : fflate.strToU8(String(data));
    zipEntries[path] = uint8;
  }

  return fflate.zipSync(zipEntries);
}

/**
 * 将修改后的文件映射表打包为合规的 EPUB 二进制 Blob
 * 保证 mimetype 处于首位且以 Store (level 0) 无压缩存储
 * @param {Object} filesMap 文件路径 -> Uint8Array 映射表
 * @param {Object} [options] 打包配置
 * @returns {Blob} EPUB 二进制 Blob
 */
export function packEpub(filesMap, options = {}) {
  const compressed = packEpubUint8Array(filesMap);
  return new Blob([compressed], { type: "application/epub+zip" });
}
