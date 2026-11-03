/**
 * EPUB XHTML 章节 DOM 解析、可翻译节点提取、行内标签保护与双语/译文写回处理模块
 */
import { normalizePath, safeDecodeURI } from "./epubParser";
import DOMPurify from "dompurify";

// 块级标签集合（对齐插件 Translator.TAGS.BLOCK，使用小写以兼容严格 XML 文档查询）
export const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "header",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "th",
  "td",
  "ul",
]);

// 严格跳过翻译的标签集合
export const IGNORED_TAGS = new Set([
  "script",
  "style",
  "pre",
  "code",
  "svg",
  "math",
  "head",
  "title",
  "meta",
  "link",
]);

/**
 * 判断节点是否为被忽略的节点（代码、脚本、样式、不可翻译属性或分页符）
 * @param {Node} node 待检查节点
 * @returns {boolean}
 */
export function isIgnoredNode(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName.toLowerCase();
  if (IGNORED_TAGS.has(tag)) return true;
  if (node.getAttribute?.("translate") === "no") return true;
  if (node.classList?.contains("notranslate")) return true;
  if (node.getAttribute?.("epub:type") === "pagebreak") return true;
  return false;
}

/**
 * 判断字符串是否为纯无意义符号、标点或数字
 * @param {string} text 待测文本
 * @returns {boolean}
 */
function isPureNoise(text) {
  if (!text) return true;
  return /^[\d\s.,:;!?'"()[\]{}#@&*-]+$/.test(text);
}

/**
 * 判断元素是否直接包含块级子元素
 * @param {Element} element
 * @returns {boolean}
 */
function hasBlockChildren(element) {
  if (!element || !element.children) return false;
  return Array.from(element.children).some((child) =>
    BLOCK_TAGS.has(child.tagName.toLowerCase())
  );
}

/**
 * 判断元素是否直接包含非空白的行内内容（文本节点或非块级行内元素）
 * @param {Element} element
 * @returns {boolean}
 */
function hasDirectInlineOrText(element) {
  if (!element || !element.childNodes) return false;
  for (const child of element.childNodes) {
    if (isIgnoredNode(child)) continue;
    if (child.nodeType === 3 && /\S/.test(child.nodeValue)) {
      return true;
    }
    if (
      child.nodeType === 1 &&
      !BLOCK_TAGS.has(child.tagName.toLowerCase()) &&
      !child.classList?.contains("kt-text-leaf")
    ) {
      const text = child.textContent?.trim();
      if (text && !isPureNoise(text)) return true;
    }
  }
  return false;
}

/**
 * 将混合内容容器中的直接非空白文本节点及连续的内联子节点自动包裹为独立的叶子块
 * @param {Element} container 包含子块或根容器且包含直接行内内容的父容器
 */
function wrapMixedInlineNodes(container) {
  const childNodes = Array.from(container.childNodes);
  let currentRun = [];

  const flushRun = () => {
    if (!currentRun.length) return;
    const hasText = currentRun.some((n) => {
      if (isIgnoredNode(n)) return false;
      const text = n.textContent?.trim();
      return Boolean(text && !isPureNoise(text));
    });
    if (hasText) {
      const doc = container.ownerDocument;
      const wrapper =
        container.namespaceURI && doc.createElementNS
          ? doc.createElementNS(container.namespaceURI, "div")
          : doc.createElement("div");
      wrapper.className = "kt-text-leaf";
      container.insertBefore(wrapper, currentRun[0]);
      for (const node of currentRun) {
        wrapper.appendChild(node);
      }
    }
    currentRun = [];
  };

  for (const child of childNodes) {
    if (
      child.nodeType === 1 &&
      (BLOCK_TAGS.has(child.tagName.toLowerCase()) ||
        child.classList?.contains("kt-text-leaf") ||
        isIgnoredNode(child))
    ) {
      flushRun();
    } else {
      currentRun.push(child);
    }
  }
  flushRun();
}

const hasDirectNonEmptyText = hasDirectInlineOrText;
const wrapMixedTextNodes = wrapMixedInlineNodes;

/**
 * 判断是否为换行标签（br, wbr）
 * @param {Node} node
 * @returns {boolean}
 */
function isBreakTag(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName.toLowerCase();
  return tag === "br" || tag === "wbr";
}

/**
 * 将 XHTML 文本解析为 DOM 文档
 * @param {string} xhtmlContent XHTML 文本
 * @returns {Document} DOM 对象
 */
export function parseXhtmlToDoc(xhtmlContent) {
  const parser = new DOMParser();
  let doc = parser.parseFromString(xhtmlContent, "application/xhtml+xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    // 容错：回退至 text/html 解析
    doc = parser.parseFromString(xhtmlContent, "text/html");
  }
  return doc;
}

/**
 * 判断节点是否为应翻译的独立块级文本容器（对外暴露的辅助检测函数）
 * @param {Element} el 待检查元素
 * @returns {boolean} 是否可翻译
 */
export function isTranslatableBlock(el) {
  if (
    !el ||
    el.nodeType !== (typeof Node !== "undefined" ? Node.ELEMENT_NODE : 1)
  )
    return false;
  if (isIgnoredNode(el)) return false;
  const tag = el.tagName.toLowerCase();
  if (!BLOCK_TAGS.has(tag) && !el.classList?.contains("kt-text-leaf"))
    return false;

  // 检查是否位于禁止翻译的祖先标签或不可翻译标记内
  let parent = el.parentElement;
  while (parent) {
    if (isIgnoredNode(parent)) return false;
    parent = parent.parentElement;
  }

  // 避免嵌套块重复提取（若其内部包含其他块级元素，则该外层块不作为叶子块翻译）
  if (hasBlockChildren(el)) return false;

  // 必须包含非空白字符且非纯标点数字
  const text = el.textContent?.trim();
  if (!text || isPureNoise(text)) return false;

  return true;
}

// 常见的 EPUB 印刷分页/页码标记标签（ebookmaker-pageno, pageno, pagebreak, doc-pagebreak 等）
export const PAGEBREAK_REGEX =
  /(?:<span\b[^>]*\bclass="[^"]*(?:ebookmaker-pageno|pageno|pagebreak)[^"]*"[^>]*>[\s\S]*?<\/span>|<(?:span|div|a)\b[^>]*\b(?:epub:type|role)="doc-pagebreak|pagebreak"[^>]*>[\s\S]*?<\/(?:span|div|a)>|<a\b[^>]*\bid="page_?\d+"[^>]*>[\s\S]*?<\/a>|<(?:hr|span|div)\b[^>]*\b(?:epub:type|role)="doc-pagebreak|pagebreak"[^>]*\/?>)/gi;

/**
 * 缝合 EPUB 纸质书排版跨页断词，并剔除页码标记元数据
 * 杜绝类似 "ter-" + <span class="ebookmaker-pageno"...> + "rific" 导致的断词截断及生成重复 id="page_17"
 * @param {string} html 原始 HTML
 * @returns {string} 缝合后的 HTML
 */
export function healEpubPagebreaks(html) {
  if (!html) return "";
  let healed = html;
  // 1. 缝合跨页断词：字母 + 可选连字符 + 页码标记 + 字母 -> 自动缝合还原为完整单词
  const hyphenWordRegex = new RegExp(
    `([a-zA-Z]+)-?\\s*${PAGEBREAK_REGEX.source}\\s*([a-zA-Z]+)`,
    "gi"
  );
  healed = healed.replace(hyphenWordRegex, "$1$2");

  // 2. 移除剩余的页码标记（排版元数据，不应作为翻译内容或生成重复ID）
  healed = healed.replace(PAGEBREAK_REGEX, " ");

  return healed;
}

// 可翻译成对富文本标签集合（对齐 Translator.TAGS.WARP，增加 sup, sub 等排版标签）
export const WARP_TAGS = new Set([
  "a",
  "b",
  "bdo",
  "bdi",
  "big",
  "cite",
  "del",
  "em",
  "font",
  "i",
  "ins",
  "mark",
  "q",
  "ruby",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

/**
 * 保护行内富文本标签（成对包裹标签转为成对语义标签 <t0>...</t0>，自闭合标签生成独立占位符）
 * 当 hasRichText 为 false 时，忽略所有内联标签，直接返回纯净文本，彻底杜绝标签切断短语
 * @param {string} html 待处理 HTML
 * @param {boolean|string} [hasRichText=true] 是否保留富文本
 * @returns {{ masked: string, masks: Array }}
 */
export function maskEpubInlineElements(html, hasRichText = true) {
  if (!html) {
    const emptyMasks = [];
    emptyMasks.tagMap = new Map();
    emptyMasks.placeholderMap = new Map();
    return { masked: "", masks: emptyMasks };
  }

  // 1. 跨页断词缝合与页码标记预清洗
  const healedHtml = healEpubPagebreaks(html);
  const keepRich = hasRichText === true || hasRichText === "true";

  // 保护独立自闭合的图片等元素，保留 100% 原始字符串（包括 XHTML 的 /> 自闭合与属性中合法的 > 字符）
  const imgPlaceholders = [];
  const preprocessedHtml = healedHtml.replace(
    /<img\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/gi,
    (match) => {
      const key = `{{KTIMG_${imgPlaceholders.length}}}`;
      imgPlaceholders.push({ key, original: match });
      return key;
    }
  );

  const parser = new DOMParser();
  const tempDoc = parser.parseFromString(
    `<body>${preprocessedHtml}</body>`,
    "text/html"
  );

  // 2. 纯文本模式：忽略常规格式标签提取文本，但严格保护免翻元素 (translate="no" / notranslate) 与公式图形 (math, svg)
  if (!keepRich) {
    const textMasks = [];
    textMasks.tagMap = new Map();
    const placeholderMap = new Map();
    textMasks.placeholderMap = placeholderMap;

    for (const item of imgPlaceholders) {
      placeholderMap.set(item.key, item.original);
      textMasks.push(item);
    }

    const traverseText = (node) => {
      if (!node) return "";
      if (node.nodeType === 3) {
        return node.nodeValue || "";
      }
      if (node.nodeType === 1) {
        const tagName = node.tagName.toLowerCase();

        // 过滤不可翻译或可执行标签（脚本、样式、元信息等），绝不送翻其文本内容
        if (
          tagName === "script" ||
          tagName === "style" ||
          tagName === "head" ||
          tagName === "title" ||
          tagName === "meta" ||
          tagName === "link"
        ) {
          return "";
        }

        // 保护不可翻译元素 (translate="no" 或 notranslate 类名)
        if (
          node.getAttribute?.("translate") === "no" ||
          node.classList?.contains("notranslate")
        ) {
          const key = `{{KTRAW_${placeholderMap.size}}}`;
          const rawHtml = node.outerHTML;
          placeholderMap.set(key, rawHtml);
          textMasks.push({ key, original: rawHtml });
          return key;
        }

        // 保护 MathML 与 SVG 富文本节点，避免公式与矢量图在翻译时丢失
        if (tagName === "math" || tagName === "svg") {
          const key = `{{KTOBJ_${placeholderMap.size}}}`;
          const rawHtml = node.outerHTML;
          placeholderMap.set(key, rawHtml);
          textMasks.push({ key, original: rawHtml });
          return key;
        }

        // 保护行内代码元素，避免代码文本被发送翻译破坏，并在导出时完整还原
        if (tagName === "code") {
          const key = `{{KTRAW_${placeholderMap.size}}}`;
          const rawHtml = node.outerHTML;
          placeholderMap.set(key, rawHtml);
          textMasks.push({ key, original: rawHtml });
          return key;
        }

        // 普通元素：递归提取子节点文本
        let res = "";
        for (let i = 0; i < node.childNodes.length; i++) {
          res += traverseText(node.childNodes[i]);
        }
        return res;
      }
      return "";
    };

    let rawText = "";
    for (let i = 0; i < tempDoc.body.childNodes.length; i++) {
      rawText += traverseText(tempDoc.body.childNodes[i]);
    }
    const pureText = rawText.replace(/\s+/g, " ").trim();

    return {
      masked: pureText,
      masks: textMasks,
    };
  }

  // 3. 保留富文本模式：采用成对语义标签 <t0>...</t0>，避免下划线占位符破坏 NMT 分词
  let tagCounter = 0;
  const tagMap = new Map();
  const placeholderMap = new Map();
  const masks = [];

  for (const item of imgPlaceholders) {
    placeholderMap.set(item.key, item.original);
    masks.push(item);
  }

  const buildOpeningTag = (node) => {
    const escapeAttr = (str) => String(str).replace(/"/g, "&quot;");
    let tag = `<${node.tagName.toLowerCase()}`;
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        tag += ` ${attr.name}="${escapeAttr(attr.value)}"`;
      }
    }
    tag += ">";
    return tag;
  };

  const traverse = (node) => {
    if (!node) return "";
    // 文本节点
    if (node.nodeType === 3) {
      return node.nodeValue || "";
    }
    // 元素节点
    if (node.nodeType === 1) {
      const tagName = node.tagName.toLowerCase();

      // 保护不可翻译元素 (translate="no" 或 notranslate 类名)
      if (
        node.getAttribute?.("translate") === "no" ||
        node.classList?.contains("notranslate")
      ) {
        const key = `{{KTRAW_${placeholderMap.size}}}`;
        const rawHtml = node.outerHTML;
        placeholderMap.set(key, rawHtml);
        masks.push({ key, original: rawHtml });
        return key;
      }

      // 保护 MathML 与 SVG 富文本节点，避免公式与矢量图在翻译时丢失
      if (tagName === "math" || tagName === "svg") {
        const key = `{{KTOBJ_${placeholderMap.size}}}`;
        const rawHtml = node.outerHTML;
        placeholderMap.set(key, rawHtml);
        masks.push({ key, original: rawHtml });
        return key;
      }

      // 保护行内代码元素，避免代码文本被发送翻译破坏，并在导出时完整还原
      if (tagName === "code") {
        const key = `{{KTRAW_${placeholderMap.size}}}`;
        const rawHtml = node.outerHTML;
        placeholderMap.set(key, rawHtml);
        masks.push({ key, original: rawHtml });
        return key;
      }

      // 忽略节点
      if (IGNORED_TAGS.has(tagName)) {
        return "";
      }

      // 自闭合与不可拆分独立元素（如 img）
      if (tagName === "img") {
        const key = `{{KTIMG_${placeholderMap.size}}}`;
        placeholderMap.set(key, node.outerHTML);
        masks.push({ key, original: node.outerHTML });
        return key;
      }

      // 递归遍历子节点
      let innerContent = "";
      for (const child of Array.from(node.childNodes)) {
        innerContent += traverse(child);
      }

      // 若为 WARP 富文本成对标签，生成语义化成对标签 <t0>...</t0>
      if (WARP_TAGS.has(tagName)) {
        const index = tagCounter++;
        const openTag = buildOpeningTag(node);
        const closeTag = `</${tagName}>`;
        tagMap.set(`TAG_${index}`, {
          openTag,
          closeTag,
        });
        masks.push({
          key: `TAG_${index}`,
          original: `${openTag}${innerContent}${closeTag}`,
        });
        return `<t${index}>${innerContent}</t${index}>`;
      }

      return innerContent;
    }
    return "";
  };

  let masked = "";
  for (const child of Array.from(tempDoc.body.childNodes)) {
    masked += traverse(child);
  }

  masks.tagMap = tagMap;
  masks.placeholderMap = placeholderMap;

  return {
    masked: masked.trim(),
    masks,
  };
}

/**
 * 还原占位符，支持成对语义标签 <t0>...</t0> 自底向上还原、自闭合占位符还原及旧版数组兼容
 * @param {string} text 翻译后的文本
 * @param {Object|Array} masks 占位符映射对象或列表
 * @returns {string} 还原后的富文本 HTML
 */
export function unmaskEpubInlineElements(text, masks = []) {
  if (!text || !masks) return text || "";

  const tagMap = masks.tagMap || null;
  const placeholderMap = masks.placeholderMap || null;
  const legacyArray = Array.isArray(masks) ? masks : masks.legacyArray || [];

  let result = text;

  // 1. 成对语义标签 <t0>...</t0> 自底向上还原
  if (tagMap && tagMap.size > 0) {
    try {
      const openRegex = /<t(\d+)\b[^>]*>/gi;
      const restoreAttr = "data-kt-restore";

      // 统一替换为临时标记 <span data-kt-restore="序号">...</span>
      // 容错匹配 </t> 或 </t0> 闭合标签
      let textToParse = result.replace(openRegex, `<span ${restoreAttr}="$1">`);
      textToParse = textToParse.replace(/<\/t(?:\d+)?>/gi, "</span>");

      const parser = new DOMParser();
      const doc = parser.parseFromString(
        `<body>${textToParse}</body>`,
        "text/html"
      );
      const placeholders = Array.from(
        doc.querySelectorAll(`span[${restoreAttr}]`)
      );

      // 自底向上（倒序）替换节点，保证嵌套结构的正确性
      placeholders.reverse().forEach((node) => {
        const index = node.getAttribute(restoreAttr);
        if (index !== null) {
          const tagPair = tagMap.get(`TAG_${index}`);
          if (tagPair) {
            node.outerHTML = `${tagPair.openTag}${node.innerHTML}${tagPair.closeTag}`;
          }
        }
      });

      result = doc.body.innerHTML;
    } catch (e) {
      // 解析异常时正则降级
      tagMap.forEach((tagPair, key) => {
        const id = key.replace("TAG_", "");
        const reg = new RegExp(`<t${id}>([\\s\\S]*?)<\\/t(?:${id})?>`, "gi");
        result = result.replace(reg, `${tagPair.openTag}$1${tagPair.closeTag}`);
      });
    }
  }

  // 2. 还原自闭合占位符（如 {{KTIMG_0}}）
  if (placeholderMap && placeholderMap.size > 0) {
    placeholderMap.forEach((original, key) => {
      const cleanKey = key.replace(/^\{\{/, "").replace(/\}\}$/, "");
      const reg = new RegExp(`\\{\\{\\s*${cleanKey}\\s*\\}\\}`, "gi");
      result = result.replace(reg, original);
    });
  }

  // 3. 兼容旧版下划线占位符形式 masks: [{ key, original }]
  if (legacyArray && legacyArray.length) {
    for (const { key, original } of legacyArray) {
      if (typeof key === "string" && key.startsWith("__")) {
        const cleanKey = key.replace(/^__/, "").replace(/__$/, "");
        const reg = new RegExp(`__\\s*${cleanKey}\\s*__`, "gi");
        result = result.replace(reg, original);
      }
    }
  }

  return result;
}

/**
 * 采用 AutoScan 前序深度优先遍历方式收集章节中所有叶子块级元素
 * @param {Element} node 节点
 * @param {Array<Element>} leaves 收集结果
 * @returns {Array<Element>}
 */
function collectLeafBlocks(node, leaves = []) {
  if (!node || node.nodeType !== 1) return leaves;
  if (isIgnoredNode(node)) return leaves;

  const tag = node.tagName.toLowerCase();
  const isDocRoot = tag === "html" || tag === "body";

  if (isDocRoot || hasBlockChildren(node)) {
    // 存在子块：若同时包含直接非空白文本节点，进行混合内容包裹
    if (hasDirectNonEmptyText(node) && tag !== "html") {
      wrapMixedTextNodes(node);
    }
    // 按照文档严格前序递归遍历所有子元素
    for (const child of Array.from(node.children)) {
      collectLeafBlocks(child, leaves);
    }
  } else {
    // 不包含任何块级子元素：若为块级元素或动态叶子块，且包含有效文本，则认定为叶子块容器
    if (BLOCK_TAGS.has(tag) || node.classList?.contains("kt-text-leaf")) {
      const text = node.textContent?.trim();
      if (text && !isPureNoise(text)) {
        leaves.push(node);
      }
    }
  }
  return leaves;
}

/**
 * 从章节 DOM 中提取所有可翻译单元（支持 AutoScan 遍历与 <br> 换行逐行切分）
 * @param {Document} doc 章节 DOM 文档
 * @param {Object} [options={}] 配置选项（如 hasRichText）
 * @returns {Array<{ id: number, element: Element, rawHtml: string, maskedText: string, masks: Array }>}
 */
export function extractTranslatableUnits(doc, options = {}) {
  if (!doc) return [];
  const root = doc.body || doc.documentElement;
  if (!root) return [];

  const { hasRichText = "true" } = options;
  const leaves = collectLeafBlocks(root);
  const units = [];
  let unitId = 0;

  leaves.forEach((leaf) => {
    // 检查叶子块内是否包含换行标签（br, wbr）
    const hasBr = Boolean(leaf.querySelector("br, wbr"));

    if (!hasBr) {
      // 无换行标签：整块作为一个翻译单元
      const rawHtml = leaf.innerHTML;
      const { masked, masks } = maskEpubInlineElements(rawHtml, hasRichText);
      units.push({
        id: unitId++,
        element: leaf,
        rawHtml,
        maskedText: masked,
        masks,
        targetHtml: "",
      });
    } else {
      // 包含换行标签：按 <br>/<wbr> 分界线将子节点切分成多个独立行级单元（nodeGroup）
      const childNodes = Array.from(leaf.childNodes);
      let lineGroup = [];

      const flushLineGroup = () => {
        if (!lineGroup.length) return;
        const lineText = lineGroup
          .map((n) => n.textContent || "")
          .join("")
          .trim();
        if (lineText && !isPureNoise(lineText)) {
          const span = leaf.ownerDocument.createElement("span");
          span.className = "kt-line-unit";
          leaf.insertBefore(span, lineGroup[0]);
          for (const node of lineGroup) {
            span.appendChild(node);
          }
          const rawHtml = span.innerHTML;
          const { masked, masks } = maskEpubInlineElements(
            rawHtml,
            hasRichText
          );
          units.push({
            id: unitId++,
            element: span,
            rawHtml,
            maskedText: masked,
            masks,
            targetHtml: "",
          });
        }
        lineGroup = [];
      };

      for (const child of childNodes) {
        if (isBreakTag(child)) {
          flushLineGroup();
        } else {
          lineGroup.push(child);
        }
      }
      flushLineGroup();
    }
  });

  return units;
}

/**
 * EPUB 导出与写回专用的 DOMPurify 安全白名单配置
 */
export const EPUB_EXPORT_PURIFY_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_ATTR: ["xlink:href", "epub:type"],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|blob|data):|[^a-z]|[-a-z+.]+(?:[^-a-z+.:]|$))/i,
};

/**
 * 标准 CSS 反转义（根据 W3C CSS Syntax Module Level 3 规范）
 * 支持还原十六进制转义（如 \68 -> h，\2f -> /，\000068 -> h）及非十六进制转义（如 \: -> :）
 * @param {string} str 待反转义的 CSS 字符串
 * @returns {string} 反转义后的纯文本字符串
 */
export function cssUnescape(str) {
  if (!str || typeof str !== "string" || !str.includes("\\")) return str;
  return str.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|([\r\n\f]|\r\n)|(.))/g,
    (_, hex, newline, char) => {
      if (hex) {
        const cp = parseInt(hex, 16);
        if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) {
          return "\uFFFD";
        }
        return String.fromCodePoint(cp);
      }
      if (newline) {
        return "";
      }
      return char;
    }
  );
}

/**
 * 彻底清洗 CSS 样式中的远程网络资源引用 url(...)
 * 即使通过 CSS 反斜杠转义（例如 url(\68ttps://...) 或 \75rl(...)）也一律还原并识别阻断，替换为 none
 * @param {string} styleValue CSS 样式文本
 * @returns {string} 清洗后的 CSS 样式文本
 */
export function cleanCssRemoteUrls(styleValue) {
  if (!styleValue || typeof styleValue !== "string") {
    return styleValue;
  }
  return styleValue.replace(
    /([a-zA-Z0-9_\-\\]+)\s*\(\s*([^)]*)\s*\)/gi,
    (match, rawFn, rawInner) => {
      const fn = cssUnescape(rawFn).toLowerCase();
      if (fn !== "url") return match;
      const unquoted = rawInner
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .trim();
      const unescaped = cssUnescape(unquoted);
      if (/^(?:https?:)?\/\//i.test(unescaped.trim())) {
        return "none";
      }
      return match;
    }
  );
}

/**
 * 净化 EPUB 译文 HTML 片段，限制可用标签和属性，防范脚本与内联事件注入
 * @param {string} markup 待净化的 HTML 字符串
 * @returns {string} 净化后的安全 HTML 字符串
 */
export function sanitizeEpubMarkup(markup) {
  if (!markup) return "";
  if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) {
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

    if (DOMPurify.addHook) {
      DOMPurify.addHook("uponSanitizeAttribute", uponSanitizeAttrHook);
      DOMPurify.addHook("uponSanitizeElement", uponSanitizeElemHook);
    }
    try {
      return DOMPurify.sanitize(markup, EPUB_EXPORT_PURIFY_CONFIG);
    } finally {
      if (DOMPurify.removeHook) {
        DOMPurify.removeHook("uponSanitizeAttribute", uponSanitizeAttrHook);
        DOMPurify.removeHook("uponSanitizeElement", uponSanitizeElemHook);
      }
    }
  }
  return markup;
}

export const XHTML_NS = "http://www.w3.org/1999/xhtml";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const MATHML_NS = "http://www.w3.org/1998/Math/MathML";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * 递归将 HTML 文档中的节点安全转换并导入到 XML/XHTML 宿主文档中
 * @param {Document} xmlDoc 宿主 XML 文档
 * @param {Node} node 待转换的 HTML 节点
 * @param {string|null} [inheritedNs=null] 继承的父级命名空间
 * @returns {Node|null}
 */
export function importHtmlNodeToXmlDoc(xmlDoc, node, inheritedNs = null) {
  if (!xmlDoc || !node) return null;
  const nodeType = node.nodeType;

  // 1. 文本节点：即使包含未转义的 & 或 < 也是合法的纯文本，杜绝 XML 实体语法错误
  if (nodeType === 3) {
    return xmlDoc.createTextNode(node.nodeValue || "");
  }

  // 2. 元素节点：保留真实的 MathML / SVG 命名空间与 XHTML 命名空间
  if (nodeType === 1) {
    const tagName = (node.tagName || "span").toLowerCase();
    // 拦截高危可执行标签
    if (
      tagName === "script" ||
      tagName === "iframe" ||
      tagName === "object" ||
      tagName === "embed"
    ) {
      return null;
    }

    let ns = node.namespaceURI;
    if (ns === SVG_NS || ns === MATHML_NS) {
      // 保持解析所得的 SVG / MathML 命名空间
    } else if (tagName === "svg") {
      ns = SVG_NS;
    } else if (tagName === "math") {
      ns = MATHML_NS;
    } else if (inheritedNs === SVG_NS && tagName !== "foreignobject") {
      ns = SVG_NS;
    } else if (inheritedNs === MATHML_NS && tagName !== "annotation-xml") {
      ns = MATHML_NS;
    } else {
      ns = xmlDoc.documentElement?.namespaceURI || XHTML_NS;
    }

    const elem = ns
      ? xmlDoc.createElementNS(ns, tagName)
      : xmlDoc.createElement(tagName);
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        const attrName = attr.name.toLowerCase();
        // 严格拦截 on* 内联事件属性（如 onerror, onload, onclick）
        if (attrName.startsWith("on")) {
          continue;
        }
        // 严格拦截 javascript: 伪协议
        if (
          (attrName === "href" ||
            attrName === "src" ||
            attrName === "xlink:href") &&
          /^\s*javascript:/i.test(attr.value)
        ) {
          continue;
        }
        if (attrName === "xlink:href" || attrName.startsWith("xlink:")) {
          elem.setAttributeNS(XLINK_NS, attr.name, attr.value);
        } else {
          elem.setAttribute(attr.name, attr.value);
        }
      }
    }
    const children = Array.from(node.childNodes);
    for (const child of children) {
      const importedChild = importHtmlNodeToXmlDoc(xmlDoc, child, ns);
      if (importedChild) {
        elem.appendChild(importedChild);
      }
    }
    return elem;
  }

  // 3. 注释节点
  if (nodeType === 8) {
    return xmlDoc.createComment(node.nodeValue || "");
  }

  return null;
}

/**
 * 安全设置 XML 元素的内容，具备 HTML5 容错解析与实体自动清洗能力，彻底杜绝 invalid XML 错误
 * @param {Element} el 目标 XML/XHTML 元素
 * @param {string} markup 待插入的 HTML/XHTML 字符串
 */
export function setSafeXmlInnerHtml(el, markup) {
  if (!el) return;
  if (!markup) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    return;
  }

  // 1. 首先尝试原生 innerHTML 快速赋值并清洗任何内联危险属性与脚本
  try {
    el.innerHTML = markup;
    if (el.querySelectorAll) {
      const scripts = el.querySelectorAll("script, iframe, object, embed");
      for (const s of scripts) s.remove();
      const allEls = el.querySelectorAll("*");
      for (const child of allEls) {
        const toRemove = [];
        for (let i = 0; i < child.attributes.length; i++) {
          const attr = child.attributes[i];
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) {
            toRemove.push(attr.name);
          } else if (
            (name === "href" || name === "src" || name === "xlink:href") &&
            /^\s*javascript:/i.test(attr.value)
          ) {
            toRemove.push(attr.name);
          }
        }
        for (const name of toRemove) {
          child.removeAttribute(name);
        }
      }
    }
    return;
  } catch (err) {
    // 捕获 XML 格式非法异常（例如未转义的 &、<、HTML 专用实体或不闭合标签）
  }

  // 2. 降级使用浏览器的容错 HTML5 DOMParser 解析，清洗并纠正为合规 DOM 树
  try {
    const parser = new DOMParser();
    const cleanMarkup = sanitizeEpubMarkup(markup);
    const tempDoc = parser.parseFromString(
      `<body>${cleanMarkup}</body>`,
      "text/html"
    );
    const doc = el.ownerDocument;

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    const children = Array.from(tempDoc.body.childNodes);
    for (const child of children) {
      const imported = importHtmlNodeToXmlDoc(doc, child);
      if (imported) {
        el.appendChild(imported);
      }
    }
  } catch (fallbackErr) {
    // 3. 极端保底：作为纯文本节点插入，保证翻译流程绝不崩溃中断
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    el.appendChild(el.ownerDocument.createTextNode(markup));
  }
}

/**
 * 将翻译结果应用回 DOM（支持仅译文模式与行内双语对照模式）
 * @param {Array<Object>} units 单元列表
 * @param {string} mode "target" 纯译文 | "bilingual" 双语对照
 * @param {string} [customStyleClass] 用户自定义的 CSS 样式类名
 */
export function applyTranslationToDoc(
  units,
  mode = "bilingual",
  customStyleClass = ""
) {
  if (!units || !units.length) return;

  const styleCls = customStyleClass ? ` ${customStyleClass}` : "";

  units.forEach((unit) => {
    if (!unit.targetHtml) return;
    const el = unit.element;
    const safeTarget = sanitizeEpubMarkup(unit.targetHtml);

    if (mode === "target") {
      // 纯译文模式：安全写回纯译文 HTML
      setSafeXmlInnerHtml(el, safeTarget);
    } else {
      // 双语对照模式（行内插入）：在原内容末尾追加换行与译文容器
      const originalHtml = unit.rawHtml;
      const combined = `${originalHtml}<br class="kt-bilingual-br" /><span class="kt-bilingual-target${styleCls}">${safeTarget}</span>`;
      setSafeXmlInnerHtml(el, combined);
    }
  });
}

/**
 * 序列化 DOM 为合规、严格的 XML/XHTML 字符串
 * @param {Document} doc DOM 文档
 * @returns {string} XHTML 字符串
 */
export function serializeDocToXhtml(doc) {
  if (!doc) return "";
  const root = doc.documentElement;
  // 确保根节点拥有标准的 xmlns 声明
  if (!root.getAttribute("xmlns") && !root.namespaceURI) {
    root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  }

  const serializer = new XMLSerializer();
  let xhtml = serializer.serializeToString(doc);

  // 修复常见的 XML 实体问题：将未在 XML 预定义的 &nbsp; 及不可见字符 \u00A0 替换为标准数值实体 &#160;
  xhtml = xhtml.replace(/&nbsp;/g, "&#160;").replace(/\u00A0/g, "&#160;");

  // 若无 XML 声明，补齐头部
  if (!xhtml.startsWith("<?xml")) {
    xhtml = `<?xml version="1.0" encoding="utf-8"?>\n${xhtml}`;
  }

  return xhtml;
}

/**
 * 根据文件后缀推断 MIME 类型
 * @param {string} path 文件路径
 * @returns {string} MIME 类型
 */
export function getMimeTypeByExt(path = "") {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

/**
 * 将 XHTML DOM 中的相对路径图片资源解析为基于 filesMap 的 Blob URL
 * @param {Document} doc XHTML DOM 文档
 * @param {string} chapterFullPath 当前章节的规范化完整路径（如 "OEBPS/wrap0000.xhtml"）
 * @param {Object} filesMap 解压出来的 filesMap 文件字典
 * @returns {Array<string>} 本次解析生成的 Blob URLs 数组，供组件在卸载时 revokeObjectURL 释放
 */
export function resolveEpubImages(doc, chapterFullPath = "", filesMap = {}) {
  const createdUrls = [];
  if (!doc || !filesMap) return createdUrls;

  const chapterDir = chapterFullPath.includes("/")
    ? chapterFullPath.slice(0, chapterFullPath.lastIndexOf("/") + 1)
    : "";

  // 1. 处理 <img> 标签与响应式属性
  const imgEls = doc.querySelectorAll ? doc.querySelectorAll("img") : [];
  imgEls.forEach((img) => {
    const rawSrcset = img.getAttribute("srcset");
    if (rawSrcset && /(?:^|[\s,])(?:https?:)?\/\//i.test(rawSrcset)) {
      img.removeAttribute("srcset");
    }
    const rawSrc = img.getAttribute("src");
    if (!rawSrc) return;
    // 阻断远程图片请求，捍卫离线阅读隐私
    if (/^(?:https?:)?\/\//i.test(rawSrc.trim())) {
      img.removeAttribute("src");
      return;
    }
    if (rawSrc.startsWith("data:") || rawSrc.startsWith("blob:")) {
      return;
    }
    const cleanSrc = rawSrc.split("#")[0].split("?")[0];
    const imageFullPath = normalizePath(chapterDir + safeDecodeURI(cleanSrc));
    const bytes =
      filesMap[imageFullPath] || filesMap[normalizePath(chapterDir + cleanSrc)];
    if (bytes && typeof URL !== "undefined" && URL.createObjectURL) {
      const mime = getMimeTypeByExt(imageFullPath);
      const blob = new Blob([bytes], { type: mime });
      const objectUrl = URL.createObjectURL(blob);
      createdUrls.push(objectUrl);
      img.setAttribute("src", objectUrl);
    }
  });

  // 2. 处理 SVG <image> 标签 (epub 中封面包装常使用 SVG <image xlink:href="..." />)
  const svgImages = doc.querySelectorAll ? doc.querySelectorAll("image") : [];
  svgImages.forEach((img) => {
    const rawHref =
      img.getAttribute("xlink:href") ||
      img.getAttribute("href") ||
      img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!rawHref) return;
    // 阻断远程矢量图片请求
    if (/^(?:https?:)?\/\//i.test(rawHref.trim())) {
      img.removeAttribute("xlink:href");
      img.removeAttribute("href");
      return;
    }
    if (rawHref.startsWith("data:") || rawHref.startsWith("blob:")) {
      return;
    }
    const cleanHref = rawHref.split("#")[0].split("?")[0];
    const imageFullPath = normalizePath(chapterDir + safeDecodeURI(cleanHref));
    const bytes =
      filesMap[imageFullPath] ||
      filesMap[normalizePath(chapterDir + cleanHref)];
    if (bytes && typeof URL !== "undefined" && URL.createObjectURL) {
      const mime = getMimeTypeByExt(imageFullPath);
      const blob = new Blob([bytes], { type: mime });
      const objectUrl = URL.createObjectURL(blob);
      createdUrls.push(objectUrl);
      img.setAttribute("href", objectUrl);
      img.setAttribute("xlink:href", objectUrl);
    }
  });

  // 3. 处理 <video> 与 <audio> 媒体标签中的远程资源
  const mediaEls = doc.querySelectorAll
    ? doc.querySelectorAll("video, audio")
    : [];
  mediaEls.forEach((media) => {
    const poster = media.getAttribute("poster");
    if (poster && /^(?:https?:)?\/\//i.test(poster.trim())) {
      media.removeAttribute("poster");
    }
    const rawSrc = media.getAttribute("src");
    if (rawSrc && /^(?:https?:)?\/\//i.test(rawSrc.trim())) {
      media.removeAttribute("src");
    }
  });

  // 4. 清理元素内联 style 中的远程背景图与字体资源（防范 CSS 转义绕过）
  const styledEls = doc.querySelectorAll ? doc.querySelectorAll("[style]") : [];
  styledEls.forEach((el) => {
    const style = el.getAttribute("style");
    if (style) {
      el.setAttribute("style", cleanCssRemoteUrls(style));
    }
  });

  // 5. 处理 <source> 标签中的远程资源
  const sourceEls = doc.querySelectorAll ? doc.querySelectorAll("source") : [];
  sourceEls.forEach((source) => {
    const rawSrcset = source.getAttribute("srcset");
    if (rawSrcset && /(?:^|[\s,])(?:https?:)?\/\//i.test(rawSrcset)) {
      source.removeAttribute("srcset");
    }
    const rawSrc = source.getAttribute("src");
    if (rawSrc && /^(?:https?:)?\/\//i.test(rawSrc.trim())) {
      source.removeAttribute("src");
    }
  });

  return createdUrls;
}

/**
 * 将 XHTML DOM 中的相对路径图片资源转换为 Base64 Data URL 内嵌（用于单章 HTML 独立离线导出）
 * @param {Document} doc XHTML DOM 文档
 * @param {string} chapterFullPath 当前章节的规范化完整路径
 * @param {Object} filesMap 解压出来的 filesMap 文件字典
 */
export function embedEpubImagesAsDataUrls(
  doc,
  chapterFullPath = "",
  filesMap = {}
) {
  if (!doc || !filesMap) return;

  const chapterDir = chapterFullPath.includes("/")
    ? chapterFullPath.slice(0, chapterFullPath.lastIndexOf("/") + 1)
    : "";

  const toDataUrl = (bytes, mime) => {
    if (typeof Buffer !== "undefined") {
      return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mime};base64,${btoa(binary)}`;
  };

  // 1. 处理 <img> 标签与响应式属性
  const imgEls = doc.querySelectorAll ? doc.querySelectorAll("img") : [];
  imgEls.forEach((img) => {
    const rawSrcset = img.getAttribute("srcset");
    if (rawSrcset && /(?:^|[\s,])(?:https?:)?\/\//i.test(rawSrcset)) {
      img.removeAttribute("srcset");
    }
    const rawSrc = img.getAttribute("src");
    if (!rawSrc) return;
    if (/^(?:https?:)?\/\//i.test(rawSrc.trim())) {
      img.removeAttribute("src");
      return;
    }
    if (rawSrc.startsWith("data:")) {
      return;
    }
    const cleanSrc = rawSrc.split("#")[0].split("?")[0];
    const imageFullPath = normalizePath(chapterDir + safeDecodeURI(cleanSrc));
    const bytes =
      filesMap[imageFullPath] || filesMap[normalizePath(chapterDir + cleanSrc)];
    if (bytes) {
      const mime = getMimeTypeByExt(imageFullPath);
      img.setAttribute("src", toDataUrl(bytes, mime));
    }
  });

  // 2. 处理 SVG <image> 标签
  const svgImages = doc.querySelectorAll ? doc.querySelectorAll("image") : [];
  svgImages.forEach((img) => {
    const rawHref =
      img.getAttribute("xlink:href") ||
      img.getAttribute("href") ||
      img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!rawHref) return;
    if (/^(?:https?:)?\/\//i.test(rawHref.trim())) {
      img.removeAttribute("xlink:href");
      img.removeAttribute("href");
      return;
    }
    if (rawHref.startsWith("data:")) {
      return;
    }
    const cleanHref = rawHref.split("#")[0].split("?")[0];
    const imageFullPath = normalizePath(chapterDir + safeDecodeURI(cleanHref));
    const bytes =
      filesMap[imageFullPath] ||
      filesMap[normalizePath(chapterDir + cleanHref)];
    if (bytes) {
      const mime = getMimeTypeByExt(imageFullPath);
      const dataUrl = toDataUrl(bytes, mime);
      img.setAttribute("href", dataUrl);
      img.setAttribute("xlink:href", dataUrl);
    }
  });

  // 3. 处理 <video> 与 <audio> 媒体标签中的远程资源
  const mediaEls = doc.querySelectorAll
    ? doc.querySelectorAll("video, audio")
    : [];
  mediaEls.forEach((media) => {
    const poster = media.getAttribute("poster");
    if (poster && /^(?:https?:)?\/\//i.test(poster.trim())) {
      media.removeAttribute("poster");
    }
    const rawSrc = media.getAttribute("src");
    if (rawSrc && /^(?:https?:)?\/\//i.test(rawSrc.trim())) {
      media.removeAttribute("src");
    }
  });

  // 4. 清理元素内联 style 中的远程背景图与字体资源（防范 CSS 转义绕过）
  const styledEls = doc.querySelectorAll ? doc.querySelectorAll("[style]") : [];
  styledEls.forEach((el) => {
    const style = el.getAttribute("style");
    if (style) {
      el.setAttribute("style", cleanCssRemoteUrls(style));
    }
  });

  // 5. 处理 <source> 标签中的远程资源
  const sourceEls = doc.querySelectorAll ? doc.querySelectorAll("source") : [];
  sourceEls.forEach((source) => {
    const rawSrcset = source.getAttribute("srcset");
    if (rawSrcset && /(?:^|[\s,])(?:https?:)?\/\//i.test(rawSrcset)) {
      source.removeAttribute("srcset");
    }
    const rawSrc = source.getAttribute("src");
    if (rawSrc && /^(?:https?:)?\/\//i.test(rawSrc.trim())) {
      source.removeAttribute("src");
    }
  });
}
