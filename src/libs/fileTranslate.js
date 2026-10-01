import * as fflate from "fflate";
import { translateFileText } from "../fileTranslation/client";
import {
  parseEpubBook,
  parseXml,
  normalizePath,
  safeDecodeURI,
} from "./epub/epubParser";
import {
  parseXhtmlToDoc,
  extractTranslatableUnits,
  applyTranslationToDoc,
  serializeDocToXhtml,
  unmaskEpubInlineElements,
} from "./epub/epubDomHandler";
import {
  DEFAULT_EPUB_BILINGUAL_CSS,
  updateOpfDocument,
  getRelativePath,
  injectCssIntoXhtml,
  injectFooterIntoXhtml,
  getEpubFooterHtml,
  EPUB_FOOTER_HTML,
  EPUB_FOOTER_LINK,
  packEpub,
  packEpubUint8Array,
  updateNavDocument,
  updateNcxDocument,
  extractTitleMapFromChapterStates,
} from "./epub/epubPacker";

export { translateFileText } from "../fileTranslation/client";

export async function translateTxt(
  content,
  scene,
  setting,
  signal,
  onProgress,
  localContext
) {
  const parts = content.split(/(\r\n|\n|\r)/);
  const output = [];
  const comparisons = [];
  const lines = parts.filter(
    (_, index) => index % 2 === 0 && parts[index]?.trim()
  ).length;
  let completed = 0;
  for (let index = 0; index < parts.length; index += 2) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const source = parts[index] || "";
    if (!source.trim()) {
      output.push(source);
    } else {
      const prefix = source.match(/^\s*/)?.[0] || "";
      const suffix = source.match(/\s*$/)?.[0] || "";
      const body = source.slice(prefix.length, source.length - suffix.length);
      const chunks = body.match(/[\s\S]{1,2000}/g) || [];
      const translated = [];
      for (const chunk of chunks) {
        translated.push(
          await translateFileText(chunk, scene, setting, signal, localContext)
        );
      }
      const target = `${prefix}${translated.join("")}${suffix}`;
      output.push(target);
      comparisons.push({ source, target });
      completed++;
      onProgress?.(completed, lines, { source, target });
    }
    if (index + 1 < parts.length) output.push(parts[index + 1]);
  }
  return { text: output.join(""), comparisons };
}

/**
 * 保护行内代码、数学公式、链接 URL、图片等特殊 Markdown 语法，避免被翻译接口破坏
 */
export function maskInlineElements(text) {
  if (!text) return { masked: "", masks: [] };
  const masks = [];

  // 1. 保护行内代码 `...`
  let current = text.replace(/`([^`\n]+)`/g, (match) => {
    const key = `__KTCODE_${masks.length}__`;
    masks.push({ key, original: match });
    return key;
  });

  // 2. 保护行内数学公式 $...$
  current = current.replace(/\$([^$\n]+)\$/g, (match) => {
    const key = `__KTMATH_${masks.length}__`;
    masks.push({ key, original: match });
    return key;
  });

  // 3. 保护图片 ![[alt]](url) 中的 url
  current = current.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (match, alt, url, title) => {
      const key = `__KTIMGURL_${masks.length}__`;
      masks.push({ key, original: url });
      return title ? `![${alt}](${key} "${title}")` : `![${alt}](${key})`;
    }
  );

  // 4. 保护链接 [text](url) 中的 url 部分（排除图片）
  current = current.replace(
    /(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (match, lead, linkText, url, title) => {
      const key = `__KTURL_${masks.length}__`;
      masks.push({ key, original: url });
      const linkStr = title
        ? `[${linkText}](${key} "${title}")`
        : `[${linkText}](${key})`;
      return `${lead}${linkStr}`;
    }
  );

  // 5. 保护纯 HTML 标签 <tag ...>
  current = current.replace(/<[^>\n]+>/g, (match) => {
    const key = `__KTHTML_${masks.length}__`;
    masks.push({ key, original: match });
    return key;
  });

  return { masked: current, masks };
}

/**
 * 还原被保护的特殊语法占位符，具备对翻译模型可能引入空格的宽容匹配能力
 */
export function unmaskInlineElements(text, masks = []) {
  if (!text || !masks.length) return text || "";
  let result = text;
  for (const { key, original } of masks) {
    const cleanKey = key.replace(/^__/, "").replace(/__$/, "");
    const reg = new RegExp(`__\\s*${cleanKey}\\s*__`, "gi");
    result = result.replace(reg, original);
  }
  return result;
}

/**
 * 解析并切分 Markdown 结构块（代码块、公式块、标题、列表项、表格、引用块、段落等）
 */
export function splitMarkdownBlocks(content) {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      blocks.push({ type: "blank", raw: line });
      i++;
      continue;
    }

    // 1. 代码块 ``` 或 ~~~
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const fenceMarker = fenceMatch[2][0];
      const fenceLen = fenceMatch[2].length;
      const fenceLang = fenceMatch[3].trim();
      const codeLines = [line];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        codeLines.push(nextLine);
        i++;
        const closeMatch = nextLine.match(/^(\s*)(`{3,}|~{3,})\s*$/);
        if (
          closeMatch &&
          closeMatch[2][0] === fenceMarker &&
          closeMatch[2].length >= fenceLen
        ) {
          break;
        }
      }
      blocks.push({
        type: "code",
        raw: codeLines.join("\n"),
        codeLang: fenceLang,
        translatable: false,
      });
      continue;
    }

    // 2. 多行/单行公式块 $$
    const trimmed = line.trim();
    if (trimmed.startsWith("$$")) {
      const mathLines = [line];
      i++;
      const isSingleLineMath =
        trimmed.length > 2 && trimmed.slice(2).includes("$$");
      if (!isSingleLineMath) {
        while (i < lines.length) {
          const nextLine = lines[i];
          mathLines.push(nextLine);
          i++;
          if (nextLine.trim().endsWith("$$")) {
            break;
          }
        }
      }
      blocks.push({
        type: "math",
        raw: mathLines.join("\n"),
        translatable: false,
      });
      continue;
    }

    // 3. 分割线
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push({ type: "hr", raw: line, translatable: false });
      i++;
      continue;
    }

    // 4. 标题 # ~ ######
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const prefix = `${headingMatch[1]} `;
      const text = headingMatch[2];
      blocks.push({
        type: "heading",
        raw: line,
        level,
        prefix,
        text,
        translatable: true,
      });
      i++;
      continue;
    }

    // 5. 引用块 >
    const quoteMatch = line.match(/^(\s*>+\s*)(.*)$/);
    if (quoteMatch) {
      const prefix = quoteMatch[1];
      const text = quoteMatch[2];
      blocks.push({
        type: "blockquote",
        raw: line,
        prefix,
        text,
        translatable: Boolean(text.trim()),
      });
      i++;
      continue;
    }

    // 6. 表格检测
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("|") &&
      /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "table",
        raw: tableLines.join("\n"),
        tableLines,
        translatable: true,
      });
      continue;
    }

    // 7. 列表项
    const listMatch = line.match(
      /^(\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)(.*)$/
    );
    if (listMatch) {
      const prefix = listMatch[1];
      const text = listMatch[2];
      blocks.push({
        type: "list_item",
        raw: line,
        prefix,
        text,
        translatable: Boolean(text.trim()),
      });
      i++;
      continue;
    }

    // 8. 普通段落
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith(">") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("~~~") &&
      !lines[i].startsWith("$$") &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i]) &&
      !lines[i].match(/^\s*(?:[-*+]|\d+\.)\s+/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    const text = paraLines.join("\n");
    blocks.push({
      type: "paragraph",
      raw: text,
      prefix: "",
      text,
      translatable: Boolean(text.trim()),
    });
  }

  return blocks;
}

/**
 * 将行内 Markdown 语法渲染为安全 HTML
 */
export function renderInlineHtml(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 行内代码
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="kt-md-inline-code">$1</code>'
  );
  // 数学公式
  html = html.replace(/\$([^$\n]+)\$/g, '<span class="kt-md-math">$1</span>');
  // 图片
  html = html.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    '<img src="$2" alt="$1" style="max-width:100%; border-radius:4px;" />'
  );
  // 链接
  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // 粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // 斜体
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  // 删除线
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // 换行
  html = html.replace(/\n/g, "<br />");

  return html;
}

/**
 * 将 Markdown 块渲染为 HTML 富文本（支持 "source" 原文、"target" 纯译文、"bilingual" 双语穿插三种模式）
 */
export function renderMarkdownBlocksToHtml(
  blocks,
  { mode = "target", textStyleClass = "" } = {}
) {
  if (!blocks || !blocks.length) return "";

  const isBlockCompleted = (b) => {
    if (!b || !b.translatable) return false;
    if (b.type === "table") {
      return Boolean(b.targetHeaderCells && b.targetDataRows);
    }
    return b.targetText !== undefined;
  };

  let lastCompletedIndex = -1;
  if (mode !== "source") {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (isBlockCompleted(blocks[i])) {
        lastCompletedIndex = i;
        break;
      }
    }
    // 未开始翻译或没有任何可翻译块完成时，结果保持空白
    if (lastCompletedIndex === -1) {
      return "";
    }
  }

  const parts = [];
  const effectiveStyle =
    textStyleClass && textStyleClass !== "style_none" ? textStyleClass : "";
  const styleCls = effectiveStyle ? ` ${effectiveStyle}` : "";

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      parts.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      parts.push("</ol>");
      inOl = false;
    }
  };

  const maxIndex = mode === "source" ? blocks.length - 1 : lastCompletedIndex;
  for (let i = 0; i <= maxIndex; i++) {
    const block = blocks[i];

    // 翻译模式下：仅上屏已完成翻译的块，未完成的块绝不上屏
    if (mode !== "source" && block.translatable && !isBlockCompleted(block)) {
      continue;
    }

    if (block.type !== "list_item") {
      closeLists();
    }

    if (block.type === "blank") {
      parts.push('<div class="kt-md-blank-gap" style="height: 12px;"></div>');
      continue;
    }

    if (block.type === "hr") {
      parts.push(
        '<hr class="kt-md-hr" style="border:none; border-top:1px solid rgba(128,128,128,0.3); margin: 16px 0;" />'
      );
      continue;
    }

    if (block.type === "code") {
      const codeContent = block.raw
        .replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n?/, "")
        .replace(/\n?(\s*)(`{3,}|~{3,})\s*$/, "");
      const escaped = codeContent
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const langClass = block.codeLang ? `language-${block.codeLang}` : "";
      parts.push(
        `<pre class="kt-md-code-block" style="background: rgba(128,128,128,0.1); padding: 12px 14px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 13px; margin: 10px 0;"><code class="${langClass}">${escaped}</code></pre>`
      );
      continue;
    }

    if (block.type === "math") {
      const escaped = block.raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      parts.push(
        `<div class="kt-md-math-block" style="text-align: center; margin: 12px 0; font-family: serif; font-size: 16px;">${escaped}</div>`
      );
      continue;
    }

    const srcText = block.text || block.raw;
    const tgtText = block.targetText || srcText;

    if (block.type === "heading") {
      const tag = `h${block.level || 1}`;
      if (mode === "source") {
        parts.push(
          `<${tag} class="kt-md-heading" style="margin: 14px 0 8px; font-weight: 700;">${renderInlineHtml(srcText)}</${tag}>`
        );
      } else if (mode === "target") {
        parts.push(
          `<${tag} class="kt-md-heading${styleCls}" style="margin: 14px 0 8px; font-weight: 700;">${renderInlineHtml(tgtText)}</${tag}>`
        );
      } else {
        parts.push(
          `<div class="kt-md-bilingual-block" style="margin: 14px 0 8px;">
            <${tag} class="kt-md-source" style="margin: 0 0 4px; font-weight: 700; color: rgba(128,128,128,0.9); font-size: ${Math.max(14, 24 - (block.level || 1) * 2)}px;">${renderInlineHtml(srcText)}</${tag}>
            <div class="kt-md-target kt-md-target-heading${styleCls}" style="font-weight: 700; font-size: ${Math.max(15, 26 - (block.level || 1) * 2)}px;">${renderInlineHtml(tgtText)}</div>
          </div>`
        );
      }
      continue;
    }

    if (block.type === "blockquote") {
      if (mode === "source") {
        parts.push(
          `<blockquote class="kt-md-quote" style="border-left: 4px solid rgba(128,128,128,0.4); margin: 10px 0; padding-left: 12px; color: inherit;">${renderInlineHtml(srcText)}</blockquote>`
        );
      } else if (mode === "target") {
        parts.push(
          `<blockquote class="kt-md-quote${styleCls}" style="border-left: 4px solid rgba(128,128,128,0.4); margin: 10px 0; padding-left: 12px; color: inherit;">${renderInlineHtml(tgtText)}</blockquote>`
        );
      } else {
        parts.push(
          `<blockquote class="kt-md-quote kt-md-bilingual-block" style="border-left: 4px solid rgba(128,128,128,0.4); margin: 10px 0; padding-left: 12px; color: inherit;">
            <div class="kt-md-source" style="color: rgba(128,128,128,0.85); margin-bottom: 4px;">${renderInlineHtml(srcText)}</div>
            <div class="kt-md-target${styleCls}">${renderInlineHtml(tgtText)}</div>
          </blockquote>`
        );
      }
      continue;
    }

    if (block.type === "list_item") {
      const isOrdered = /^\s*\d+\./.test(block.prefix || "");
      if (isOrdered) {
        if (!inOl) {
          closeLists();
          parts.push(
            '<ol class="kt-md-ol" style="margin: 6px 0; padding-left: 24px;">'
          );
          inOl = true;
        }
      } else {
        if (!inUl) {
          closeLists();
          parts.push(
            '<ul class="kt-md-ul" style="margin: 6px 0; padding-left: 24px;">'
          );
          inUl = true;
        }
      }

      if (mode === "source") {
        parts.push(
          `<li style="margin: 4px 0;">${renderInlineHtml(srcText)}</li>`
        );
      } else if (mode === "target") {
        const liClassAttr = effectiveStyle ? ` class="${effectiveStyle}"` : "";
        parts.push(
          `<li${liClassAttr} style="margin: 4px 0;">${renderInlineHtml(tgtText)}</li>`
        );
      } else {
        parts.push(
          `<li style="margin: 6px 0;">
            <div class="kt-md-source" style="color: rgba(128,128,128,0.85); font-size: 13px;">${renderInlineHtml(srcText)}</div>
            <div class="kt-md-target${styleCls}" style="margin-top: 2px;">${renderInlineHtml(tgtText)}</div>
          </li>`
        );
      }
      continue;
    }

    if (block.type === "table") {
      const lines = block.tableLines || [];
      if (lines.length >= 2) {
        const headerCells = lines[0]
          .split("|")
          .slice(1, -1)
          .map((s) => s.trim());
        const dataRows = lines.slice(2).map((rowLine) =>
          rowLine
            .split("|")
            .slice(1, -1)
            .map((s) => s.trim())
        );
        const tgtHeaderCells = block.targetHeaderCells || headerCells;
        const tgtDataRows = block.targetDataRows || dataRows;

        let tableHtml =
          '<table class="kt-md-table" style="border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px;"><thead><tr>';
        for (let col = 0; col < headerCells.length; col++) {
          const hSrc = headerCells[col] || "";
          const hTgt = tgtHeaderCells[col] || hSrc;
          tableHtml +=
            '<th style="border: 1px solid rgba(128,128,128,0.3); padding: 6px 10px; background: rgba(128,128,128,0.08); text-align: left;">';
          if (mode === "source") {
            tableHtml += renderInlineHtml(hSrc);
          } else if (mode === "target") {
            tableHtml += effectiveStyle
              ? `<span class="${effectiveStyle}">${renderInlineHtml(hTgt)}</span>`
              : renderInlineHtml(hTgt);
          } else {
            tableHtml += `<div style="color:rgba(128,128,128,0.8); font-size:12px;">${renderInlineHtml(hSrc)}</div><div class="kt-md-target${styleCls}">${renderInlineHtml(hTgt)}</div>`;
          }
          tableHtml += "</th>";
        }
        tableHtml += "</tr></thead><tbody>";

        for (let r = 0; r < dataRows.length; r++) {
          tableHtml += "<tr>";
          const rowSrc = dataRows[r] || [];
          const rowTgt = tgtDataRows?.[r] || rowSrc;
          for (let col = 0; col < headerCells.length; col++) {
            const cellSrc = rowSrc[col] || "";
            const cellTgt = rowTgt[col] || cellSrc;
            tableHtml +=
              '<td style="border: 1px solid rgba(128,128,128,0.3); padding: 6px 10px;">';
            if (mode === "source") {
              tableHtml += renderInlineHtml(cellSrc);
            } else if (mode === "target") {
              tableHtml += effectiveStyle
                ? `<span class="${effectiveStyle}">${renderInlineHtml(cellTgt)}</span>`
                : renderInlineHtml(cellTgt);
            } else {
              tableHtml += `<div style="color:rgba(128,128,128,0.8); font-size:12px;">${renderInlineHtml(cellSrc)}</div><div class="kt-md-target${styleCls}">${renderInlineHtml(cellTgt)}</div>`;
            }
            tableHtml += "</td>";
          }
          tableHtml += "</tr>";
        }
        tableHtml += "</tbody></table>";
        parts.push(tableHtml);
      }
      continue;
    }

    // 普通段落
    if (mode === "source") {
      parts.push(
        `<p class="kt-md-paragraph" style="margin: 8px 0; line-height: 1.7;">${renderInlineHtml(srcText)}</p>`
      );
    } else if (mode === "target") {
      parts.push(
        `<p class="kt-md-paragraph${styleCls}" style="margin: 8px 0; line-height: 1.7;">${renderInlineHtml(tgtText)}</p>`
      );
    } else {
      parts.push(
        `<div class="kt-md-bilingual-block" style="margin: 10px 0;">
          <p class="kt-md-source" style="margin: 0 0 3px; line-height: 1.6; color: rgba(128,128,128,0.85); font-size: 13.5px;">${renderInlineHtml(srcText)}</p>
          <p class="kt-md-target${styleCls}" style="margin: 0; line-height: 1.75; font-size: 14.5px;">${renderInlineHtml(tgtText)}</p>
        </div>`
      );
    }
  }

  closeLists();
  return parts.join("\n");
}

/**
 * 转义 HTML 特殊字符，防止在标签或文本节点中发生 XSS 注入
 */
export function escapeHtmlText(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 包装为独立、美观的完整 HTML 网页文件字符串
 */
export function generateStandaloneHtml(
  bodyHtml,
  title = "Translation Result",
  customCss = "",
  lang = "zh-CN"
) {
  const safeTitle = escapeHtmlText(title);
  const safeLang = escapeHtmlText(lang || "zh-CN");
  return `<!DOCTYPE html>
<html lang="${safeLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #24292e;
      background-color: #ffffff;
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #c9d1d9;
        background-color: #0d1117;
      }
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
    p { margin-top: 0; margin-bottom: 16px; }
    code { font-family: monospace; font-size: 85%; padding: 0.2em 0.4em; border-radius: 4px; background-color: rgba(128,128,128,0.15); }
    pre { padding: 16px; overflow: auto; line-height: 1.45; background-color: rgba(128,128,128,0.1); border-radius: 6px; }
    blockquote { padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; margin: 0 0 16px; }
    table { border-spacing: 0; border-collapse: collapse; margin-bottom: 16px; width: 100%; }
    table th, table td { padding: 6px 13px; border: 1px solid #dfe2e5; }
    .kt-md-source { opacity: 0.75; font-size: 0.95em; }
    .kt-md-target { font-weight: 500; }
    .kt-bilingual-target { ${customCss} }
    .kt-epub-footer { display: flex; align-items: center; justify-content: center; margin-top: 3.5em; margin-bottom: 2em; padding: 0; text-align: center; clear: both; width: 100%; }
    .kt-epub-footer, .kt-epub-footer * { text-align: center; }
    .kt-epub-footer-line { display: inline-block; width: 48px; height: 1px; background-color: #d1d5db; vertical-align: middle; flex-shrink: 0; }
    .kt-epub-footer-text { display: inline-block; margin: 0 14px; padding: 0; text-align: center; font-size: 0.82em; line-height: 1.5; color: #888888; white-space: nowrap; }
    .kt-epub-footer a { color: #2563eb; text-decoration: none; word-break: break-all; }
    .kt-epub-footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

/**
 * 翻译 Markdown 文档主流程
 * 采用并发入队调度，触发底层 BatchQueue 批量合并与 TaskPool 请求频率管控
 */
export async function translateMarkdown(
  content,
  scene,
  setting,
  signal,
  onProgress,
  localContext
) {
  const blocks = splitMarkdownBlocks(content);
  const comparisons = [];

  // 统计总共待翻译的单元数量
  let totalUnits = 0;
  for (const block of blocks) {
    if (!block.translatable) continue;
    if (block.type === "table") {
      const lines = block.tableLines || [];
      const headerCells = lines[0]
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim());
      const dataRows = lines.slice(2).map((r) =>
        r
          .split("|")
          .slice(1, -1)
          .map((s) => s.trim())
      );
      totalUnits += headerCells.filter(Boolean).length;
      for (const row of dataRows) {
        totalUnits += row.filter(Boolean).length;
      }
    } else {
      totalUnits++;
    }
  }

  let completedUnits = 0;

  // 辅助：翻译单个文本并保护其行内语法，翻译完成时流式回传快照
  const translateUnit = async (rawText, onResolved) => {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    if (!rawText || !rawText.trim()) {
      onResolved(rawText);
      return;
    }

    const { masked, masks } = maskInlineElements(rawText);
    const translatedMasked = await translateFileText(
      masked,
      scene,
      setting,
      signal,
      localContext
    );
    const target = unmaskInlineElements(translatedMasked, masks);

    onResolved(target);
    completedUnits++;
    comparisons.push({ source: rawText, target });
    onProgress?.(
      completedUnits,
      totalUnits,
      { source: rawText, target },
      blocks
    );
  };

  // 收集待翻译任务队列并预设存储槽位
  const tasks = [];
  for (const block of blocks) {
    if (!block.translatable) continue;

    if (block.type === "table") {
      const lines = block.tableLines || [];
      const headerCells = lines[0]
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim());
      const dataRows = lines.slice(2).map((r) =>
        r
          .split("|")
          .slice(1, -1)
          .map((s) => s.trim())
      );
      block.targetHeaderCells = new Array(headerCells.length).fill(undefined);
      block.targetDataRows = dataRows.map((r) =>
        new Array(r.length).fill(undefined)
      );

      headerCells.forEach((cell, colIdx) => {
        if (!cell) {
          block.targetHeaderCells[colIdx] = "";
          return;
        }
        tasks.push(() =>
          translateUnit(cell, (res) => {
            block.targetHeaderCells[colIdx] = res;
          })
        );
      });

      dataRows.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
          if (!cell) {
            block.targetDataRows[rowIdx][colIdx] = "";
            return;
          }
          tasks.push(() =>
            translateUnit(cell, (res) => {
              block.targetDataRows[rowIdx][colIdx] = res;
            })
          );
        });
      });
    } else {
      block.targetText = undefined;
      tasks.push(() =>
        translateUnit(block.text, (res) => {
          block.targetText = res;
        })
      );
    }
  }

  // 并发窗口：50 个任务并发推进。
  // 这确保能在 BatchQueue 的窗口时间内迅速集齐 batchSize 任务触发聚合合并，
  // 产生的真实网络请求则交由底层统一的 FetchPool / TaskPool 调度并发与间隔。
  const concurrencyLimit = 50;
  let taskIndex = 0;
  const activePromises = new Set();

  while (taskIndex < tasks.length || activePromises.size > 0) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    while (taskIndex < tasks.length && activePromises.size < concurrencyLimit) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      const task = tasks[taskIndex++];
      const p = Promise.resolve().then(task);
      activePromises.add(p);
      p.finally(() => activePromises.delete(p));
    }
    if (activePromises.size > 0) {
      await Promise.race(activePromises);
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    }
  }

  if (signal?.aborted) throw new DOMException("已取消", "AbortError");

  // 组装纯译文 Markdown (translatedMd)
  const translatedMdParts = [];
  // 组装双语对照 Markdown (bilingualMd)
  const bilingualMdParts = [];

  for (const block of blocks) {
    if (block.type === "blank") {
      translatedMdParts.push(block.raw);
      bilingualMdParts.push(block.raw);
      continue;
    }

    if (block.type === "code" || block.type === "math" || block.type === "hr") {
      translatedMdParts.push(block.raw);
      bilingualMdParts.push(block.raw);
      continue;
    }

    if (block.type === "table") {
      const lines = block.tableLines || [];
      const delimiter = lines[1] || "";
      const tgtHeaders = block.targetHeaderCells || [];
      const tgtRows = block.targetDataRows || [];

      const tgtTableMd = [
        `| ${tgtHeaders.join(" | ")} |`,
        delimiter,
        ...tgtRows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");

      translatedMdParts.push(tgtTableMd);
      // 双语表格：原文表格与译文表格依次排列
      bilingualMdParts.push(`${block.raw}\n\n${tgtTableMd}`);
      continue;
    }

    const prefix = block.prefix || "";
    const srcText = block.text || block.raw;
    const tgtText = block.targetText || srcText;

    translatedMdParts.push(`${prefix}${tgtText}`);

    if (block.type === "heading") {
      bilingualMdParts.push(`${block.raw}\n${prefix}${tgtText}`);
    } else if (block.type === "list_item") {
      bilingualMdParts.push(`${block.raw}\n${prefix}${tgtText}`);
    } else if (block.type === "blockquote") {
      bilingualMdParts.push(`${block.raw}\n${prefix}${tgtText}`);
    } else {
      bilingualMdParts.push(`${srcText}\n\n${tgtText}`);
    }
  }

  const translatedMd = translatedMdParts.join("\n");
  const bilingualMd = bilingualMdParts.join("\n");
  const textStyle = scene?.textStyle || "style_none";

  const translatedHtml = renderMarkdownBlocksToHtml(blocks, {
    mode: "target",
    textStyleClass: textStyle,
  });
  const bilingualHtml = renderMarkdownBlocksToHtml(blocks, {
    mode: "bilingual",
    textStyleClass: textStyle,
  });
  const sourceHtml = renderMarkdownBlocksToHtml(blocks, { mode: "source" });

  return {
    text: translatedMd,
    translatedMd,
    bilingualMd,
    translatedHtml,
    bilingualHtml,
    sourceHtml,
    blocks,
    comparisons,
  };
}

/**
 * 保护整篇 Markdown 中的代码块和公式块，避免在整篇翻译时被破坏
 */
export function maskCodeAndMathBlocks(content) {
  if (!content) return { masked: "", masks: [] };
  const masks = [];
  // 保护多行代码块 ```...``` 或 ~~~...~~~
  let masked = content.replace(
    /(^|\n)(\s*(?:`{3,}|~{3,})[\s\S]*?\n\s*(?:`{3,}|~{3,})\s*)/g,
    (match, prefix, block) => {
      const key = `__KTCODEBLOCK_${masks.length}__`;
      masks.push({ key, original: block });
      return `${prefix}${key}`;
    }
  );
  // 保护数学公式块 $$...$$
  masked = masked.replace(
    /(^|\n)(\s*\$\$[\s\S]*?\$\$\s*)/g,
    (match, prefix, block) => {
      const key = `__KTMATHBLOCK_${masks.length}__`;
      masks.push({ key, original: block });
      return `${prefix}${key}`;
    }
  );
  return { masked, masks };
}

/**
 * 还原整篇 Markdown 中被保护的代码块与数学公式块
 */
export function unmaskCodeAndMathBlocks(content, masks = []) {
  if (!content || !masks.length) return content || "";
  let result = content;
  for (const { key, original } of masks) {
    const cleanKey = key.replace(/^__/, "").replace(/__$/, "");
    const reg = new RegExp(`__\\s*${cleanKey}\\s*__`, "gi");
    result = result.replace(reg, original);
  }
  return result;
}

/**
 * 整篇 TXT 文档一次性翻译
 */
export async function translateEntireTxt(
  content,
  scene,
  setting,
  signal,
  localContext
) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const translated = await translateFileText(
    content,
    scene,
    setting,
    signal,
    localContext
  );
  return {
    text: translated,
    comparisons: [],
    isEntire: true,
  };
}

/**
 * 整篇 Markdown 文档一次性翻译
 */
export async function translateEntireMarkdown(
  content,
  scene,
  setting,
  signal,
  localContext
) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const { masked, masks } = maskCodeAndMathBlocks(content);
  const translatedMasked = await translateFileText(
    masked,
    scene,
    setting,
    signal,
    localContext
  );
  const translatedText = unmaskCodeAndMathBlocks(translatedMasked, masks);

  const blocks = splitMarkdownBlocks(translatedText);
  for (const block of blocks) {
    if (block.translatable) {
      block.targetText = block.text;
    }
  }

  const textStyle = scene?.textStyle || "style_none";
  const translatedHtml = renderMarkdownBlocksToHtml(blocks, {
    mode: "target",
    textStyleClass: textStyle,
  });
  const sourceHtml = renderMarkdownBlocksToHtml(splitMarkdownBlocks(content), {
    mode: "source",
  });

  return {
    text: translatedText,
    translatedMd: translatedText,
    bilingualMd: "",
    translatedHtml,
    bilingualHtml: "",
    sourceHtml,
    blocks,
    comparisons: [],
    isEntire: true,
  };
}

export const IMAGE_FONT_OPTIONS = [
  {
    value: "default",
    label: "系统默认 (无衬线)",
    font: 'sans-serif, "PingFang SC", "Microsoft YaHei", "Segoe UI"',
  },
  {
    value: "yahei",
    label: "微软雅黑 / 苹方",
    font: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  },
  {
    value: "simsun",
    label: "宋体 (衬线明体)",
    font: 'SimSun, "Songti SC", STSong, "Source Han Serif CN", serif',
  },
  {
    value: "kaiti",
    label: "楷体 (传统书法)",
    font: 'KaiTi, "Kaiti SC", STKaiti, serif',
  },
  {
    value: "youyuan",
    label: "幼圆 / 圆体 (圆润可爱)",
    font: '"YouYuan", "Yuanti SC", "Rounded Mplus 1c", sans-serif',
  },
  {
    value: "comic",
    label: "手写 / 漫画体",
    font: '"Comic Sans MS", "Chalkboard SE", "KaiTi", cursive, sans-serif',
  },
  {
    value: "monospace",
    label: "等宽字体 (代码/终端)",
    font: 'Consolas, Menlo, Monaco, "Courier New", monospace',
  },
];

export function resolveFontFamily(fontKeyOrCss) {
  if (!fontKeyOrCss) {
    return 'sans-serif, "PingFang SC", "Microsoft YaHei", "Segoe UI"';
  }
  const found = IMAGE_FONT_OPTIONS.find((opt) => opt.value === fontKeyOrCss);
  return found ? found.font : fontKeyOrCss;
}

/**
 * 基于 Canvas 将 OCR 识别框中的原文替换绘制为译文，生成译图 Blob
 */
export async function synthesizeTranslatedImage(imageBlob, rows, options = {}) {
  if (!imageBlob || !rows || rows.length === 0) return null;
  const hasPoly = rows.some((r) => r.poly && r.poly.length >= 3);
  if (!hasPoly) return null;
  if (typeof window === "undefined" || typeof document === "undefined")
    return null;
  const fontCss = resolveFontFamily(options?.fontFamily || options?.font);

  try {
    let img;
    if (typeof createImageBitmap === "function") {
      img = await createImageBitmap(imageBlob);
    } else {
      img = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(imageBlob);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        image.src = url;
      });
    }

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      if (typeof img.close === "function") img.close();
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (typeof img.close === "function") img.close();
      return null;
    }

    // 绘制原图底层
    ctx.drawImage(img, 0, 0, width, height);
    if (typeof img.close === "function") {
      img.close();
    }

    // 逐个替换文字位置
    for (const row of rows) {
      if (!row.target || !row.poly || row.poly.length < 3) continue;

      const xs = row.poly.map((p) => p[0]);
      const ys = row.poly.map((p) => p[1]);
      const minX = Math.max(0, Math.min(...xs));
      const maxX = Math.min(width, Math.max(...xs));
      const minY = Math.max(0, Math.min(...ys));
      const maxY = Math.min(height, Math.max(...ys));
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      if (boxW <= 2 || boxH <= 2) continue;

      // 采样文字区域边缘背景色
      let avgR = 255;
      let avgG = 255;
      let avgB = 255;
      try {
        const samplePoints = [
          [minX, minY],
          [maxX, minY],
          [minX, maxY],
          [maxX, maxY],
          [minX, (minY + maxY) / 2],
          [maxX, (minY + maxY) / 2],
        ];
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        for (const [sx, sy] of samplePoints) {
          const px = Math.floor(Math.max(0, Math.min(width - 1, sx)));
          const py = Math.floor(Math.max(0, Math.min(height - 1, sy)));
          const pixel = ctx.getImageData(px, py, 1, 1).data;
          totalR += pixel[0];
          totalG += pixel[1];
          totalB += pixel[2];
        }
        avgR = Math.round(totalR / samplePoints.length);
        avgG = Math.round(totalG / samplePoints.length);
        avgB = Math.round(totalB / samplePoints.length);
      } catch {
        avgR = 250;
        avgG = 250;
        avgB = 250;
      }

      // 绘制背景遮罩覆盖原文字
      const padX = Math.max(2, Math.round(boxW * 0.02));
      const padY = Math.max(2, Math.round(boxH * 0.04));
      ctx.fillStyle = `rgb(${avgR}, ${avgG}, ${avgB})`;
      ctx.fillRect(
        Math.max(0, minX - padX),
        Math.max(0, minY - padY),
        Math.min(width - minX + padX, boxW + padX * 2),
        Math.min(height - minY + padY, boxH + padY * 2)
      );

      // 根据底色亮度选择文字颜色（高对比度）
      const brightness = (avgR * 299 + avgG * 587 + avgB * 114) / 1000;
      const textColor = brightness > 128 ? "#111827" : "#F9FAFB";

      // 自适应字号并绘制译文
      const text = String(row.target).trim();
      let fontSize = Math.max(10, Math.min(Math.round(boxH * 0.72), 64));
      ctx.font = `bold ${fontSize}px ${fontCss}`;
      let textWidth = ctx.measureText(text).width;

      if (textWidth > boxW && fontSize > 10) {
        fontSize = Math.max(10, Math.floor(fontSize * (boxW / textWidth)));
        ctx.font = `bold ${fontSize}px ${fontCss}`;
      }

      ctx.fillStyle = textColor;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(text, minX + boxW / 2, minY + boxH / 2, boxW);
    }

    if (canvas.toBlob) {
      return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    }
    return null;
  } catch (e) {
    console.error("synthesizeTranslatedImage error:", e);
    return null;
  }
}

/**
 * 单个 EPUB 章节独立试译
 */
export async function translateEpubChapter(
  chapterPath,
  filesMap,
  scene,
  setting,
  signal,
  onProgress,
  localContext
) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const bytes = filesMap[chapterPath];
  if (!bytes) {
    throw new Error(`找不到章节文件: ${chapterPath}`);
  }
  const xhtmlStr = fflate.strFromU8(bytes);
  const doc = parseXhtmlToDoc(xhtmlStr);
  const sourceHtml = serializeDocToXhtml(doc);

  const hasRichText = scene?.hasRichText ?? "true";
  const units = extractTranslatableUnits(doc, { hasRichText });
  if (!units.length) {
    return {
      sourceHtml,
      targetHtml: sourceHtml,
      bilingualHtml: sourceHtml,
      targetXhtml: sourceHtml,
      bilingualXhtml: sourceHtml,
      unitsCount: 0,
      comparisons: [],
    };
  }

  const textStyle = scene?.textStyle || "style_none";
  const bilingualDoc = parseXhtmlToDoc(xhtmlStr);
  const bilingualUnits = extractTranslatableUnits(bilingualDoc, { hasRichText });
  const targetDoc = parseXhtmlToDoc(xhtmlStr);
  const targetUnits = extractTranslatableUnits(targetDoc, { hasRichText });

  const chapterAbort = new AbortController();
  const onParentAbort = () => chapterAbort.abort();
  if (signal?.aborted) {
    chapterAbort.abort();
  } else if (signal) {
    signal.addEventListener("abort", onParentAbort, { once: true });
  }

  const comparisons = [];
  let completedUnits = 0;
  let lastEmitTime = 0;
  let emitTimer = null;
  let isCancelledOrFailed = false;

  const emitLiveProgress = (lastPair, force = false) => {
    if (isCancelledOrFailed || chapterAbort.signal.aborted) {
      if (emitTimer) {
        clearTimeout(emitTimer);
        emitTimer = null;
      }
      return;
    }
    const now = Date.now();
    const doEmit = () => {
      if (isCancelledOrFailed || chapterAbort.signal.aborted) return;
      lastEmitTime = Date.now();
      try {
        const partialBilingualHtml = serializeDocToXhtml(bilingualDoc);
        const partialTargetHtml = serializeDocToXhtml(targetDoc);
        onProgress?.(completedUnits, units.length, {
          ...lastPair,
          partialBilingualHtml,
          partialTargetHtml,
        });
      } catch {
        onProgress?.(completedUnits, units.length, lastPair);
      }
    };

    if (force || now - lastEmitTime >= 120) {
      if (emitTimer) {
        clearTimeout(emitTimer);
        emitTimer = null;
      }
      doEmit();
    } else if (!emitTimer) {
      emitTimer = setTimeout(() => {
        emitTimer = null;
        doEmit();
      }, 120 - (now - lastEmitTime));
    }
  };

  const translateUnit = async (unit) => {
    if (chapterAbort.signal.aborted) throw new DOMException("已取消", "AbortError");
    if (!unit.maskedText?.trim()) {
      unit.targetHtml = unit.rawHtml;
      return;
    }

    const translatedMasked = await translateFileText(
      unit.maskedText,
      scene,
      setting,
      chapterAbort.signal,
      localContext
    );
    if (chapterAbort.signal.aborted) return;
    const targetHtml = unmaskEpubInlineElements(translatedMasked, unit.masks);
    unit.targetHtml = targetHtml;
    completedUnits++;
    const pair = { source: unit.rawHtml, target: targetHtml };
    comparisons.push(pair);

    // 实时同步更新到 live bilingualDoc 与 live targetDoc
    const uIdx = units.indexOf(unit);
    if (uIdx !== -1) {
      if (bilingualUnits[uIdx]) {
        bilingualUnits[uIdx].targetHtml = targetHtml;
        applyTranslationToDoc([bilingualUnits[uIdx]], "bilingual", textStyle);
      }
      if (targetUnits[uIdx]) {
        targetUnits[uIdx].targetHtml = targetHtml;
        applyTranslationToDoc([targetUnits[uIdx]], "target");
      }
    }
    emitLiveProgress(pair, false);
  };

  // 并发控制窗口 (类似 Markdown，最大 50 并发触发底层 BatchQueue)
  const concurrencyLimit = 50;
  let taskIndex = 0;
  const activePromises = new Set();
  let firstError = null;

  try {
    while (taskIndex < units.length || activePromises.size > 0) {
      if (chapterAbort.signal.aborted) throw new DOMException("已取消", "AbortError");
      while (taskIndex < units.length && activePromises.size < concurrencyLimit) {
        if (chapterAbort.signal.aborted) throw new DOMException("已取消", "AbortError");
        const unit = units[taskIndex++];
        let p;
        p = Promise.resolve()
          .then(() => translateUnit(unit))
          .finally(() => activePromises.delete(p));
        activePromises.add(p);
      }
      if (activePromises.size > 0) {
        await Promise.race(activePromises);
        if (chapterAbort.signal.aborted) throw new DOMException("已取消", "AbortError");
      }
    }
  } catch (err) {
    firstError = err;
    isCancelledOrFailed = true;
    chapterAbort.abort();
  } finally {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    if (signal) {
      signal.removeEventListener("abort", onParentAbort);
    }
    if (firstError) {
      isCancelledOrFailed = true;
      if (activePromises.size > 0) {
        await Promise.allSettled(Array.from(activePromises));
      }
      throw firstError;
    }
  }

  const targetHtml = serializeDocToXhtml(targetDoc);
  const bilingualHtml = serializeDocToXhtml(bilingualDoc);
  emitLiveProgress({ source: "", target: "" }, true);

  return {
    sourceHtml,
    targetHtml,
    bilingualHtml,
    targetXhtml: targetHtml,
    bilingualXhtml: bilingualHtml,
    unitsCount: units.length,
    comparisons,
  };
}

/**
 * 全本 EPUB 流式逐章翻译与合规重打包导出
 */
export async function translateEpubBook(
  epubBook,
  scene,
  setting,
  signal,
  onProgress,
  localContext,
  options = {}
) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const { filesMap, spineItems } = epubBook;
  const chapterResults = {};

  // 1. 收集待翻译项：spine 章节 + 未列入 spine 的 EPUB 3 导航文档 (nav.xhtml)
  const itemsToTranslate = [...spineItems];
  const hasNavOutsideSpine =
    epubBook.navItemHref &&
    filesMap[epubBook.navItemHref] &&
    !spineItems.some((s) => s.fullPath === epubBook.navItemHref);
  if (hasNavOutsideSpine) {
    itemsToTranslate.push({
      id: "kt-nav-toc",
      href: epubBook.navItemHref,
      fullPath: epubBook.navItemHref,
      title: "目录导航",
      isNavDoc: true,
    });
  }

  const totalChapters = itemsToTranslate.length;
  let completedChapters = 0;
  let totalParagraphsCount = 0;

  for (let cIdx = 0; cIdx < itemsToTranslate.length; cIdx++) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const item = itemsToTranslate[cIdx];
    const chapterDoneCount = cIdx;
    const chapterRes = await translateEpubChapter(
      item.fullPath,
      filesMap,
      scene,
      setting,
      signal,
      (currentPara, totalParas, lastPair) => {
        onProgress?.(
          chapterDoneCount,
          totalChapters,
          currentPara,
          totalParas,
          {
            currentChapter: item,
            currentPara,
            totalParas,
            lastPair,
            partialBilingualHtml: lastPair?.partialBilingualHtml,
            partialTargetHtml: lastPair?.partialTargetHtml,
          }
        );
      },
      localContext,
      options
    );

    chapterResults[item.fullPath] = chapterRes;
    completedChapters++;
    totalParagraphsCount += chapterRes.unitsCount;

    onProgress?.(
      completedChapters,
      totalChapters,
      chapterRes.unitsCount,
      chapterRes.unitsCount,
      {
        currentChapter: item,
        chapterCompleted: true,
        bilingualHtml: chapterRes.bilingualHtml,
        targetHtml: chapterRes.targetHtml,
        sourceHtml: chapterRes.sourceHtml,
      }
    );
  }

  // 组装章节状态并提供双语与仅译文打包结果（通过惰性 getter 按需打包，避免翻译收尾时对整书重复全量打包）
  const chapterStates = {};
  for (const [path, res] of Object.entries(chapterResults)) {
    chapterStates[path] = {
      status: "done",
      targetLang: scene?.toLang,
      sourceHtml: res.sourceHtml,
      targetHtml: res.targetHtml,
      bilingualHtml: res.bilingualHtml,
      targetXhtml: res.targetXhtml || res.targetHtml,
      bilingualXhtml: res.bilingualXhtml || res.bilingualHtml,
    };
  }

  // 同步更新 EPUB 2 NCX 目录（若有未匹配到正文标题的目录条目，进行补充翻译）
  if (epubBook.ncxItemHref && filesMap[epubBook.ncxItemHref]) {
    try {
      const titleMap = extractTitleMapFromChapterStates(
        epubBook,
        chapterStates,
        "target"
      );
      const rawNcx = fflate.strFromU8(filesMap[epubBook.ncxItemHref]);
      const ncxDoc = parseXml(rawNcx);
      const ncxDir = epubBook.ncxItemHref.includes("/")
        ? epubBook.ncxItemHref.slice(
            0,
            epubBook.ncxItemHref.lastIndexOf("/") + 1
          )
        : "";

      const navPoints = Array.from(
        ncxDoc.getElementsByTagName ? ncxDoc.getElementsByTagName("*") : []
      ).filter(
        (el) => el.localName === "navPoint" || el.nodeName?.endsWith("navPoint")
      );

      for (const navPoint of navPoints) {
        const allChildren = Array.from(
          navPoint.getElementsByTagName ? navPoint.getElementsByTagName("*") : []
        );
        const contentEl = allChildren.find(
          (el) => el.localName === "content" || el.nodeName?.endsWith("content")
        );
        const rawSrc = contentEl?.getAttribute("src");
        if (!rawSrc) continue;

        const [cleanSrc, rawHash = ""] = rawSrc.split("#");
        const targetFullPath = normalizePath(ncxDir + safeDecodeURI(cleanSrc));
        const fullKey = rawHash
          ? `${targetFullPath}#${safeDecodeURI(rawHash)}`
          : targetFullPath;

        const hasEntry = rawHash
          ? titleMap.has(fullKey)
          : (titleMap.has(fullKey) || titleMap.has(targetFullPath));

        if (!hasEntry) {
          const labelEl = allChildren.find(
            (el) =>
              el.localName === "navLabel" || el.nodeName?.endsWith("navLabel")
          );
          const textEl = labelEl
            ? Array.from(
                labelEl.getElementsByTagName
                  ? labelEl.getElementsByTagName("*")
                  : []
              ).find(
                (el) => el.localName === "text" || el.nodeName?.endsWith("text")
              )
            : null;
          const origText = textEl?.textContent?.trim();
          if (origText) {
            try {
              const transTitle = await translateFileText(
                origText,
                scene,
                setting,
                signal,
                localContext
              );
              if (transTitle) {
                titleMap.set(fullKey, transTitle.trim());
                if (!rawHash) {
                  titleMap.set(targetFullPath, transTitle.trim());
                }
              }
            } catch (e) {
              console.warn("翻译 NCX 目录条目失败:", origText, e);
            }
          }
        }
      }

      if (titleMap.size > 0) {
        const updatedNcx = updateNcxDocument(rawNcx, titleMap, ncxDir);
        // 保存改写后的 NCX 到章节结果与状态中，不污染原始 epubBook.filesMap
        chapterResults[epubBook.ncxItemHref] = {
          sourceHtml: rawNcx,
          targetHtml: updatedNcx,
          bilingualHtml: updatedNcx,
          targetXhtml: updatedNcx,
          bilingualXhtml: updatedNcx,
          unitsCount: 0,
        };
        chapterStates[epubBook.ncxItemHref] = {
          status: "done",
          targetLang: scene?.toLang,
          sourceHtml: rawNcx,
          targetHtml: updatedNcx,
          bilingualHtml: updatedNcx,
          targetXhtml: updatedNcx,
          bilingualXhtml: updatedNcx,
        };
      }
    } catch (e) {
      console.warn("全书翻译 NCX 同步更新失败:", e);
    }
  }

  let cachedBilingualExport = null;
  let cachedTargetExport = null;

  return {
    get targetBlob() {
      if (!cachedTargetExport) {
        cachedTargetExport = exportEpubFromChapterStates(
          epubBook,
          chapterStates,
          scene,
          options,
          "target"
        );
      }
      return cachedTargetExport.blob;
    },
    get bilingualBlob() {
      if (!cachedBilingualExport) {
        cachedBilingualExport = exportEpubFromChapterStates(
          epubBook,
          chapterStates,
          scene,
          options,
          "bilingual"
        );
      }
      return cachedBilingualExport.blob;
    },
    get targetFilesMap() {
      if (!cachedTargetExport) {
        cachedTargetExport = exportEpubFromChapterStates(
          epubBook,
          chapterStates,
          scene,
          options,
          "target"
        );
      }
      return cachedTargetExport.filesMap;
    },
    get bilingualFilesMap() {
      if (!cachedBilingualExport) {
        cachedBilingualExport = exportEpubFromChapterStates(
          epubBook,
          chapterStates,
          scene,
          options,
          "bilingual"
        );
      }
      return cachedBilingualExport.filesMap;
    },
    chapterResults,
    chapterStates,
    totalParagraphsCount,
  };
}

/**
 * 基于当前章节翻译状态与阅读排版样式导出完整的 EPUB 电子书
 * 支持全书未翻译（纯调整字体/样式）、部分章节翻译或全书翻译完成三种场景
 * @param {Object} epubBook parseEpubBook 解析出的图书对象
 * @param {Object} chapterStates 章节状态字典（包含 bilingualXhtml / targetXhtml）
 * @param {Object} scene 翻译场景配置（包含 toLang 等）
 * @param {Object} options 导出选项（textStyleCode, fontFamily, fontCss 等）
 * @param {string} mode "bilingual" 双语对照 | "target" 仅译文
 * @returns {{ blob: Blob, filename: string, hasAnyTranslated: boolean }}
 */
export function exportEpubFromChapterStates(
  epubBook,
  chapterStates = {},
  scene = {},
  options = {},
  mode = "bilingual"
) {
  if (!epubBook || !epubBook.filesMap) {
    throw new Error("缺少有效的 EPUB 图书数据");
  }

  const spineItems = epubBook.spineItems || [];
  const filesMap = { ...epubBook.filesMap, ...(options?.extraFilesMap || {}) };
  const opfPath = epubBook.opfPath;
  const opfDir = epubBook.opfDir || "";

  // 1. 判断是否有任何章节被完整翻译（必须为 done 状态且目标语言匹配，防止未完成草稿或旧语言译文被误判）
  const hasAnyTranslated = spineItems.some((item) => {
    const state = chapterStates[item.fullPath];
    const isLangMatch = !state?.targetLang || !scene?.toLang || state.targetLang === scene.toLang;
    const isDone = state?.status === "done" && isLangMatch;
    const content =
      mode === "target"
        ? state?.targetXhtml || state?.targetHtml
        : state?.bilingualXhtml || state?.bilingualHtml;
    return isDone && Boolean(content);
  });

  // 2. 组装各章节内容（仅已完整翻译完成且目标语言匹配的章节应用翻译结果，未完成、失败或非当前目标语言章节保持原文件字节）
  for (const spineItem of spineItems) {
    const state = chapterStates[spineItem.fullPath];
    const isLangMatch = !state?.targetLang || !scene?.toLang || state.targetLang === scene.toLang;
    const isDone = state?.status === "done" && isLangMatch;
    const targetContent = state?.targetXhtml || state?.targetHtml;
    const bilingualContent = state?.bilingualXhtml || state?.bilingualHtml;

    if (isDone && mode === "target" && targetContent) {
      filesMap[spineItem.fullPath] = fflate.strToU8(targetContent);
    } else if (isDone && mode === "bilingual" && bilingualContent) {
      filesMap[spineItem.fullPath] = fflate.strToU8(bilingualContent);
    } else {
      // 保持原始章节字节不变
      filesMap[spineItem.fullPath] = epubBook.filesMap[spineItem.fullPath];
    }
  }

  // 3. 构建并注入样式（译文样式 + 用户设置的正文字体）
  let customCss = DEFAULT_EPUB_BILINGUAL_CSS;

  // 注入正文字体样式规则
  if (options.fontCss) {
    customCss += `\n${options.fontCss}\n`;
  } else if (options.fontFamily === "serif") {
    customCss += `\nbody, p, div {\n  font-family: SimSun, "Songti SC", STSong, "Source Han Serif CN", Georgia, serif;\n}\n`;
  } else if (options.fontFamily === "kaiti") {
    customCss += `\nbody, p, div {\n  font-family: KaiTi, "Kaiti SC", STKaiti, BiauKai, serif;\n}\n`;
  }

  // 注入译文样式规则
  if (options.textStyleCode) {
    customCss += `\n.kt-bilingual-target {\n  ${options.textStyleCode}\n}\n`;
  }

  const cssRelativePath = "styles/kiss-translator-epub.css";
  const cssFullPath = opfDir
    ? `${opfDir}${cssRelativePath}`
    : cssRelativePath;
  filesMap[cssFullPath] = fflate.strToU8(customCss);

  // 为每个章节的 head 注入样式表 link，并在 body 底部注入 KISS Translator 注明与链接
  const exportLang =
    options?.lang ||
    (hasAnyTranslated
      ? scene?.toLang
      : options?.uiLang || scene?.uiLang || "zh");
  for (const spineItem of spineItems) {
    const originalXhtml = fflate.strFromU8(filesMap[spineItem.fullPath]);
    const relCss = getRelativePath(spineItem.fullPath, cssFullPath);
    const injected = injectFooterIntoXhtml(
      injectCssIntoXhtml(originalXhtml, relCss),
      exportLang
    );
    filesMap[spineItem.fullPath] = fflate.strToU8(injected);
  }

  // 4. 更新 OPF 元数据
  if (opfPath && filesMap[opfPath]) {
    const rawOpf = fflate.strFromU8(filesMap[opfPath]);
    let titleSuffix = "";
    let toLang = undefined;

    if (hasAnyTranslated) {
      titleSuffix = mode === "target" ? " [译]" : " [双语对照]";
      toLang = scene?.toLang || options?.toLang || options?.targetLang || "zh-CN";
    }

    const updatedOpf = updateOpfDocument(rawOpf, {
      toLang,
      titleSuffix,
      cssHref: cssRelativePath,
    });
    filesMap[opfPath] = fflate.strToU8(updatedOpf);
  }

  // 5. 同步改写目录文件 (EPUB 3 NAV XHTML 与 EPUB 2 NCX XML)
  const titleMap = extractTitleMapFromChapterStates(epubBook, chapterStates, mode);

  // 5.1 更新 EPUB 3 导航文档 (navItemHref)
  if (epubBook.navItemHref && filesMap[epubBook.navItemHref]) {
    const navState = chapterStates[epubBook.navItemHref];
    const isLangMatch =
      !navState?.targetLang ||
      !scene?.toLang ||
      navState.targetLang === scene.toLang;
    const isDone = navState?.status === "done" && isLangMatch;
    const navContent =
      mode === "target"
        ? navState?.targetXhtml || navState?.targetHtml
        : navState?.bilingualXhtml || navState?.bilingualHtml;

    if (isDone && navContent) {
      filesMap[epubBook.navItemHref] = fflate.strToU8(navContent);
    } else if (titleMap.size > 0) {
      try {
        const rawNav = fflate.strFromU8(filesMap[epubBook.navItemHref]);
        const navDir = epubBook.navItemHref.includes("/")
          ? epubBook.navItemHref.slice(
              0,
              epubBook.navItemHref.lastIndexOf("/") + 1
            )
          : "";
        const updatedNav = updateNavDocument(rawNav, titleMap, navDir);
        filesMap[epubBook.navItemHref] = fflate.strToU8(updatedNav);
      } catch (err) {
        console.warn("更新 NAV 目录失败:", err);
      }
    }

    // 确保未在 spine 中的导航文档也获得样式表注入和页脚注明
    if (!spineItems.some((s) => s.fullPath === epubBook.navItemHref)) {
      const relCss = getRelativePath(epubBook.navItemHref, cssFullPath);
      const navXhtml = fflate.strFromU8(filesMap[epubBook.navItemHref]);
      filesMap[epubBook.navItemHref] = fflate.strToU8(
        injectFooterIntoXhtml(injectCssIntoXhtml(navXhtml, relCss), exportLang)
      );
    }
  }

  // 5.2 更新 EPUB 2 NCX 目录 (ncxItemHref)
  if (epubBook.ncxItemHref && filesMap[epubBook.ncxItemHref]) {
    const ncxState = chapterStates[epubBook.ncxItemHref];
    const isLangMatch =
      !ncxState?.targetLang ||
      !scene?.toLang ||
      ncxState.targetLang === scene.toLang;
    const isDone = ncxState?.status === "done" && isLangMatch;
    const ncxContent =
      mode === "target"
        ? ncxState?.targetXhtml || ncxState?.targetHtml
        : ncxState?.bilingualXhtml || ncxState?.bilingualHtml;

    if (isDone && ncxContent) {
      filesMap[epubBook.ncxItemHref] = fflate.strToU8(ncxContent);
    } else if (titleMap.size > 0) {
      try {
        const rawNcx = fflate.strFromU8(
          epubBook.filesMap?.[epubBook.ncxItemHref] ||
            filesMap[epubBook.ncxItemHref]
        );
        const ncxDir = epubBook.ncxItemHref.includes("/")
          ? epubBook.ncxItemHref.slice(
              0,
              epubBook.ncxItemHref.lastIndexOf("/") + 1
            )
          : "";
        const updatedNcx = updateNcxDocument(rawNcx, titleMap, ncxDir);
        filesMap[epubBook.ncxItemHref] = fflate.strToU8(updatedNcx);
      } catch (err) {
        console.warn("更新 NCX 目录失败:", err);
      }
    }
  }

  // 6. 生成二进制 Blob 与智能文件名
  const uint8Array = packEpubUint8Array(filesMap);
  const blob = new Blob([uint8Array], { type: "application/epub+zip" });
  const baseName =
    epubBook.title ||
    (options.fallbackBaseName ? options.fallbackBaseName : "book");

  const targetLang =
    scene?.toLang ||
    options?.targetLang ||
    options?.toLang ||
    "zh";
  const targetLangSuffix =
    targetLang.toLowerCase().split("-")[0] || "zh";

  let filename;
  if (!hasAnyTranslated) {
    filename = `${baseName}.custom.epub`;
  } else if (mode === "target") {
    filename = `${baseName}.${targetLangSuffix}.epub`;
  } else {
    filename = `${baseName}.bilingual.epub`;
  }

  return {
    blob,
    uint8Array,
    filename,
    hasAnyTranslated,
    filesMap,
  };
}

export {
  parseEpubBook,
  packEpub,
  packEpubUint8Array,
  DEFAULT_EPUB_BILINGUAL_CSS,
  getEpubFooterHtml,
  EPUB_FOOTER_HTML,
  EPUB_FOOTER_LINK,
  injectFooterIntoXhtml,
};
export { openFileTranslatePage } from "./navigation";
