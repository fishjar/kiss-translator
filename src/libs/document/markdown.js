import { runTranslationTasks } from "../translationTasks";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import DOMPurify from "dompurify";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const writer = unified()
  .use(remarkStringify, { bullet: "-" })
  .use(remarkGfm)
  .use(remarkMath);
function equationFallbacks() {
  return (tree) => {
    const visit = (node) => {
      const children = node.children;
      if (node.type === "paragraph" && children?.length === 2 && children[0].type === "image" &&
        ["text", "pdfSourceText"].includes(children[1].type) && /^\s+\([^()\n]+\)$/.test(children[1].value)) {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, className: ["kt-equation-fallback"] } };
        children[1].type = "pdfSourceText";
        children[1].data = { ...children[1].data, hProperties: { ...children[1].data?.hProperties, className: ["kt-equation-number"] } };
      }
      children?.forEach(visit);
    };
    visit(tree);
  };
}
const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(equationFallbacks)
  .use(remarkRehype, { allowDangerousHtml: true, handlers: {
    pdfSourceText: (_state, node) => ({ type: "element", tagName: "span",
      properties: node.data.hProperties, children: [{ type: "text", value: node.value }] }),
    pdfRecognitionPending: (_state, node) => ({ type: "element", tagName: "span",
      properties: { ...node.data.hProperties, className: ["kt-pdf-recognition-pending"], role: "progressbar", "aria-busy": "true" }, children: [] }),
  } })
  .use(rehypeRaw)
  .use(rehypeKatex, { throwOnError: false, trust: false })
  .use(rehypeStringify);
const copy = (n) => JSON.parse(JSON.stringify(n));
const stringify = (node) =>
  writer
    .stringify({ type: "root", children: Array.isArray(node) ? node : [node] })
    .trimEnd();
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
export const EQUATION_FALLBACK_CSS = ".kt-equation-fallback{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px}.kt-equation-fallback img{display:block;margin:auto;max-width:100%}.kt-equation-number{white-space:nowrap}";
export const DOCUMENT_CSS =
  "body{font-family:system-ui,sans-serif;line-height:1.7;margin:24px auto;max-width:1000px;padding:0 20px}img{max-width:100%}pre{overflow:auto;padding:12px;background:#8881}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}th,td{border:1px solid #8886;padding:6px 10px}.kt-source{color:#666}.kt-target{margin-top:.4em}.katex-display{overflow-x:auto;overflow-y:hidden;padding:.5em 0;height:auto}.kt-document-warning{color:#9b6600;border-left:3px solid;padding-left:12px}" + EQUATION_FALLBACK_CSS;

function sanitizeRenderedHtml(html, imageUrls) {
  const purifier = DOMPurify(window);
  const allowed = new Set(imageUrls);
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName === "IMG" && data.attrName === "src" && allowed.has(data.attrValue))
      data.forceKeepAttr = true;
  });
  return purifier.sanitize(html, {
    ADD_TAGS: ["math", "annotation", "semantics"],
    ADD_ATTR: ["xmlns", "encoding"],
  });
}

export function renderDocumentMarkdown(markdown, imageUrls = []) {
  return sanitizeRenderedHtml(String(renderer.processSync(markdown)), imageUrls);
}

// Source ranges refer to serialized Markdown, not to formula strings or DOM order.
export function bindDocumentSources(ast, ranges, markdown) {
  const ids = (start, end) => {
    const matches = ranges.filter((range) => range.start < end && range.end > start);
    const containing = matches.filter((range) => range.start <= start && range.end >= end);
    const shortest = Math.min(...containing.map((range) => range.end - range.start));
    const selected = containing.length ? containing.filter((range) => range.end - range.start === shortest) : matches;
    return [...new Set(selected.flatMap((range) => range.sourceIds || (range.anchor ? [range.anchor.id] : [])))];
  };
  const visit = (node) => {
    if (node.children) node.children = node.children.flatMap(visit);
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (!["text", "inlineMath", "math", "image", "imageReference"].includes(node.type) || start === undefined) return [node];
    const sourceIds = ids(start, end);
    if (!sourceIds.length) return [node];
    if (node.type === "text" && sourceIds.length > 1) {
      const cuts = [...new Set([start, end, ...ranges.flatMap((range) => [range.start, range.end])
        .filter((offset) => offset > start && offset < end)])].sort((a, b) => a - b);
      const parts = cuts.slice(0, -1).map((offset, index) => ({ ...node,
        value: markdown.slice(offset, cuts[index + 1]).replace(/\\([\\`*_[\]<>])/g, "$1"),
        data: { ...node.data, pdfSourceIds: ids(offset, cuts[index + 1]) } }));
      if (parts.map((part) => part.value).join("") === node.value) return parts;
    }
    node.data = { ...node.data, pdfSourceIds: sourceIds };
    return [node];
  };
  visit(ast);
}

export function parseDocumentMarkdown(content, prefix = "md") {
  const root = parser.parse(content);
  // Keep definitions with the document so references work in per-block preview.
  const definitions = root.children.filter((n) =>
    ["definition", "footnoteDefinition"].includes(n.type)
  );
  return root.children.map((node, index) => ({
    id: `${prefix}-${index}`,
    type: node.type,
    level: node.depth,
    raw: content.slice(node.position.start.offset, node.position.end.offset),
    ast: node,
    definitions,
    status: "idle",
    fragments: [],
  }));
}

function sanitizedHtml(raw) {
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(raw),
    "text/html"
  );
  return doc.body;
}
function sanitizedTable(raw) {
  return sanitizedHtml(raw).querySelector("table");
}
export function tableCellsFromHtml(raw) {
  const table = sanitizedTable(raw);
  if (!table) throw new Error("未识别到有效表格");
  const occupied = new Set(),
    cells = [];
  [...table.rows].forEach((row, r) => {
    let c = 0;
    [...row.cells].forEach((cell) => {
      while (occupied.has(`${r}:${c}`)) c++;
      const rows = Math.max(1, Math.min(100, cell.rowSpan || 1)),
        cols = Math.max(1, Math.min(100, cell.colSpan || 1));
      cells.push({
        rowStart: r,
        rowEnd: r + rows,
        colStart: c,
        colEnd: c + cols,
        text: cell.textContent || "",
        html: cell.innerHTML,
        header: cell.tagName === "TH",
      });
      for (let y = r; y < r + rows; y++)
        for (let x = c; x < c + cols; x++) occupied.add(`${y}:${x}`);
      c += cols;
    });
  });
  return cells;
}

function protectedInline(node) {
  return [
    "inlineCode",
    "inlineMath",
    "image",
    "imageReference",
    "footnoteReference",
    "html",
  ].includes(node.type);
}
function translationUnits(ast) {
  const units = [];
  const walk = (node) => {
    if (
      ["code", "math", "definition", "thematicBreak"].includes(node.type) ||
      protectedInline(node)
    )
      return;
    if (node.type === "html") return;
    if (["paragraph", "heading", "tableCell"].includes(node.type)) {
      units.push(node);
      return;
    }
    node.children?.forEach(walk);
  };
  walk(ast);
  return units;
}
function maskUnit(node) {
  const masks = [];
  const inline = copy(node);
  const walk = (n) => {
    if (protectedInline(n)) {
      const token = `KTDOCMASK${masks.length}END`;
      masks.push({ token, node: copy(n) });
      return { type: "text", value: token };
    }
    if (n.children) n.children = inlineGroups(n.children).map((group) => {
      if (group.length === 1) return walk(group[0]);
      const token = `KTDOCMASK${masks.length}END`;
      masks.push({ token, nodes: copy(group) });
      return { type: "text", value: token };
    });
    if (n.type === "link") {
      const token = `KTDOCMASK${masks.length}END`;
      masks.push({ token, link: { url: n.url, title: n.title } });
      n.url = token;
      n.title = null;
    }
    return n;
  };
  walk(inline);
  // Preserve inline markup and link targets through placeholders too.
  const text = stringify({ type: "paragraph", children: inline.children });
  return { text, masks };
}
function restoreUnit(text, masks) {
  for (const { token } of masks)
    if (text.split(token).length !== 2) throw new Error("译文中的公式／链接占位符损坏，请重试");
  const byToken = new Map(masks.map((mask) => [mask.token, mask]));
  const parsed = parser.parse(text);
  if (
    parsed.children.length !== 1 ||
    !["paragraph", "heading"].includes(parsed.children[0].type)
  )
    throw new Error("译文改变了文字块结构，请重试");
  const paragraph = parsed.children.find(
    (n) => n.type === "paragraph" || n.type === "heading"
  );
  if (!paragraph) throw new Error("译文没有有效文字块");
  for (const mask of masks.filter((m) => m.link)) {
    let restoredLink = false;
    const walk = (n) => {
      if (n.type === "link" && n.url === mask.token) {
        Object.assign(n, mask.link);
        restoredLink = true;
      }
      n.children?.forEach(walk);
    };
    walk(paragraph);
    if (!restoredLink) throw new Error("译文改变了链接结构，请重试");
  }
  const restoreNodes = (node) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== "text") { restoreNodes(child); return [child]; }
      const parts = [], matches = [...child.value.matchAll(/KTDOCMASK\d+END/g)];
      let offset = 0;
      for (const match of matches) {
        const mask = byToken.get(match[0]);
        if (!mask?.node && !mask?.nodes) continue;
        if (match.index > offset) parts.push({ ...child, value: child.value.slice(offset, match.index) });
        parts.push(...copy(mask.nodes || [mask.node]));
        offset = match.index + match[0].length;
      }
      if (offset < child.value.length) parts.push({ ...child, value: child.value.slice(offset) });
      return parts;
    });
    node.children = node.children.flatMap((child, index, children) => child.type === "inlineMath" && children[index - 1]?.type === "inlineMath"
      ? [{ type: "text", value: " " }, child] : [child]);
  };
  restoreNodes(paragraph);
  return paragraph.children;
}
export const BILINGUAL_RESULT_VERSION = 1;
const PROTECTED_HTML = "pre,code,math,.katex,img,svg,sub,sup,kbd,samp,var,abbr,dfn,time,output,rt,rp,[translate='no'],.notranslate";
const protectedHtmlElements = (root) => [...root.querySelectorAll(PROTECTED_HTML)]
  .filter((element) => !element.parentElement?.closest(PROTECTED_HTML));
function inlineGroups(children) {
  const groups = [];
  for (let index = 0; index < children.length; index++) {
    const child = children[index], opening = child.type === "html" && /^<([\w-]+)\b[^>]*>$/.exec(child.value);
    const element = opening ? new DOMParser().parseFromString(child.value, "text/html").body.firstElementChild : null;
    let end = index;
    if (element?.matches(PROTECTED_HTML)) {
      let depth = 1;
      for (let cursor = index + 1; cursor < children.length; cursor++) {
        const node = children[cursor];
        if (node.type !== "html") continue;
        if (new RegExp(`^<${opening[1]}(?:\\s[^>]*)?>$`, "i").test(node.value)) depth++;
        if (new RegExp(`^</${opening[1]}\\s*>$`, "i").test(node.value) && --depth === 0) { end = cursor; break; }
      }
    }
    groups.push(children.slice(index, end + 1));
    index = end;
  }
  return groups;
}
const resourceSignatures = (node) => {
  const resources = [];
  const walk = (item) => {
    if (protectedInline(item)) { resources.push(stringify(item)); return; }
    if (item.type === "link") resources.push(JSON.stringify([item.url, item.title || ""]));
    if (item.children) inlineGroups(item.children).forEach((group) => {
      if (group.length > 1) resources.push(stringify({ type: "paragraph", children: group }));
      else walk(group[0]);
    });
  };
  walk(node);
  return resources.sort();
};
const sameResources = (source, target) => JSON.stringify(source) === JSON.stringify(target);
function bilingualResult(block) {
  if (block.ast.type === "html") {
    const sourceBody = sanitizedHtml(block.raw), targetBody = sanitizedHtml(block.targetRaw || "");
    const source = sourceBody.querySelector("table") || sourceBody, target = targetBody.querySelector("table") || targetBody;
    const cells = (root) => root.tagName === "TABLE" ? [...root.querySelectorAll("th,td")] : [root];
    const sourceCells = cells(source), targetCells = cells(target), bilingual = source.cloneNode(true), bilingualCells = cells(bilingual);
    const skeleton = (root) => [...root.querySelectorAll("*")].map((element) =>
      JSON.stringify([element.tagName, [...element.attributes].map((attr) => [attr.name, attr.value]).sort()])).sort();
    if (source.tagName !== target.tagName || sourceCells.length !== targetCells.length || !sameResources(skeleton(source), skeleton(target)))
      throw new Error("旧译文结构或受保护内容不完整，请重试");
    sourceCells.forEach((cell, index) => {
      const translated = targetCells[index];
      const resources = (root) => [...protectedHtmlElements(root).map((element) => element.outerHTML), ...(root.textContent.match(/\$[^$\n]+\$/g) || [])].sort();
      if (!sameResources(resources(cell), resources(translated)))
        throw new Error("旧译文缺少受保护内容，请重试");
      bilingualCells[index].innerHTML = `<div class="kt-source">${cell.innerHTML}</div><div class="kt-target">${translated.innerHTML}</div>`;
    });
    return { bilingualRaw: bilingual.tagName === "BODY" ? bilingual.innerHTML : bilingual.outerHTML };
  }
  if (!block.targetAst || block.targetAst.type !== block.ast.type) throw new Error("旧译文缺少完整节点，请重试");
  const bilingual = copy(block.ast), sourceUnits = translationUnits(block.ast), targetUnits = translationUnits(block.targetAst), units = translationUnits(bilingual);
  if (sourceUnits.length !== targetUnits.length) throw new Error("旧译文结构不完整，请重试");
  sourceUnits.forEach((source, index) => {
    if (!sameResources(resourceSignatures(source), resourceSignatures(targetUnits[index])))
      throw new Error("旧译文缺少受保护内容，请重试");
    units[index].children = [...copy(source.children), { type: "break" }, ...copy(targetUnits[index].children)];
  });
  return { bilingualAst: bilingual, bilingualRaw: stringify(bilingual) };
}
export function restoreDocumentBilingual(block) {
  if (block.status !== "done" || block.bilingualVersion === BILINGUAL_RESULT_VERSION || !isTranslatableBlock(block)) return block;
  try {
    return { ...block, ...bilingualResult(block), bilingualVersion: BILINGUAL_RESULT_VERSION, translationRepairRequired: false };
  } catch (error) {
    return { ...block, status: "error", error: error.message, translationRepairRequired: true };
  }
}
export function isTranslatableBlock(block) {
  if (block.type === "formula_number" || block.equationNumber) return false;
  if (block.ast?.type === "html") {
    const body = sanitizedHtml(block.raw);
    body
      .querySelectorAll(PROTECTED_HTML)
      .forEach((el) => el.remove());
    return !!body.textContent.trim();
  }
  return translationUnits(block.ast).some(
    (n) =>
      n.children?.some((c) => c.type === "text" && c.value.trim()) ||
      n.children?.some((c) => !protectedInline(c))
  );
}

export async function translateDocumentBlocks(
  blocks,
  translate,
  signal,
  progress = () => {}
) {
  const repairRequired = new Set();
  for (const block of blocks) {
    const restored = restoreDocumentBilingual(block);
    if (restored !== block) {
      Object.assign(block, restored);
      if (restored.translationRepairRequired) repairRequired.add(block);
    }
  }
  let done = blocks.filter(
    (b) => isTranslatableBlock(b) && b.status === "done"
  ).length;
  const total = blocks.filter(isTranslatableBlock).length;
  await runTranslationTasks(
    blocks.map((block) => async (signal) => {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (repairRequired.has(block) || !isTranslatableBlock(block) || block.status === "done") return;
      block.status = "busy";
      delete block.error;
      progress(done, total, block);
      try {
        if (block.ast.type === "html") {
          const body = sanitizedHtml(block.raw),
            table = body.querySelector("table") || body;
          const sourceCells =
              table.tagName === "TABLE"
                ? [...table.querySelectorAll("th,td")]
                : [table];
          await runTranslationTasks(
            sourceCells.map((cell, i) => async (signal) => {
              if (!cell.textContent.trim()) return;
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              const masked = [],
                clone = cell.cloneNode(true);
              protectedHtmlElements(clone).forEach((el) => {
                  const token = `KTDOCMASK${masked.length}END`;
                  masked.push({ token, raw: el.outerHTML });
                  el.replaceWith(token);
                });
              const input = clone.innerHTML.replace(
                /<[^>]+>|\$[^$\n]+\$/g,
                (raw) => {
                  const token = `KTDOCMASK${masked.length}END`;
                  masked.push({ token, raw });
                  return token;
                }
              );
              let result = await translate(input, signal, block);
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              result = escape(result);
              for (const mask of masked) {
                if (result.split(mask.token).length !== 2)
                  throw new Error("表格占位符损坏");
                result = result.replace(mask.token, () => mask.raw);
              }
              cell.innerHTML = result;

            }),
            signal
          );
          if (signal.aborted) throw new DOMException("已取消", "AbortError");
          block.targetRaw =
            table.tagName === "BODY" ? table.innerHTML : table.outerHTML;

        } else {
          const target = copy(block.ast),
            units = translationUnits(target),
            originalUnits = translationUnits(block.ast);
          await runTranslationTasks(
            units.map((unit, i) => async (signal) => {
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              const masked = maskUnit(originalUnits[i]);
              if (
                !masked.text.trim() ||
                /^KTDOCMASK\d+END$/.test(masked.text.trim())
              )
                return;
              const result = await translate(masked.text, signal, block);
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              units[i].children = restoreUnit(result, masked.masks);

            }),
            signal
          );
          if (signal.aborted) throw new DOMException("已取消", "AbortError");
          block.targetAst = target;
          block.targetRaw = stringify(target);
        }
        Object.assign(block, bilingualResult(block), { bilingualVersion: BILINGUAL_RESULT_VERSION, translationRepairRequired: false });
        block.status = "done";
        done++;
      } catch (e) {
        if (signal?.aborted) {
          block.status = "idle";
          throw e;
        }
        block.status = "error";
        block.error = e.message;
      }
      progress(done, total, block);
    }),
    signal
  );
  return blocks;
}
export function blockMarkdown(block, mode = "source") {
  block = restoreDocumentBilingual(block);
  if (mode === "source" || !isTranslatableBlock(block)) return block.raw;
  if (block.status !== "done")
    return `${block.raw}\n\n> ${block.status === "error" ? "翻译失败：" + block.error : "尚未完成翻译"}`;
  return mode === "target" ? block.targetRaw : block.bilingualRaw;
}
export function documentMarkdown(blocks, mode = "source", warnings = []) {
  const content = blocks.map((b) => blockMarkdown(b, mode)).join("\n\n");
  return (
    content +
    (warnings.length
      ? "\n\n---\n\n" +
        warnings
          .map(
            (w) => `> 解析提示：${String(w.message || w).replace(/\n/g, " ")}`
          )
          .join("\n\n")
      : "")
  );
}
export function renderDocumentBlock(
  block,
  mode = "source",
  documentBlocks = [],
  imageUrls = [],
  assetUrls,
  assetError = "Image resource unavailable"
) {
  block = restoreDocumentBilingual(block);
  const definitions = (block.definitions || [])
    .map((n) => {
      const translated = documentBlocks.find(
        (b) => b.ast.type === n.type && b.ast.identifier === n.identifier
      );
      return translated ? blockMarkdown(translated, mode) : stringify(n);
    })
    .join("\n\n");
  let html;
  if (block.sourceAnchors?.length) {
    const complete = mode === "source" || !isTranslatableBlock(block) || block.status === "done";
    const selected = mode === "source" || !isTranslatableBlock(block) || !complete ? block.ast :
      mode === "target" ? block.targetAst : block.bilingualAst;
    const root = selected ? { type: "root", children: [copy(selected)] } : parser.parse(blockMarkdown(block, mode));
    if (!complete) root.children.push(...parser.parse(blockMarkdown(block, mode).slice(block.raw.length)).children);
    if (definitions) root.children.push(...parser.parse(definitions).children);
    const allowed = new Set(block.sourceAnchors.map((anchor) => anchor.id));
    const bodyIds = block.sourceAnchors.filter((anchor) => !["formula", "inline-formula", "formula_number"].includes(anchor.type)).map((anchor) => anchor.id);
    const pending = new Set(block.pendingSourceIds || []);
    const decorate = (node) => {
      const placeholder = node.type === "emphasis" && node.children?.length === 1 && node.children[0].type === "text"
        ? node.children[0] : node.type === "text" ? node : null;
      if (placeholder && ["待识别…", "待提取图片…", "_待识别…_", "_待提取图片…_"].includes(placeholder.value)) {
        const ids = (placeholder.data?.pdfSourceIds || node.data?.pdfSourceIds || bodyIds).filter((id) => allowed.has(id));
        if (ids.some((id) => pending.has(id))) {
          node.type = "pdfRecognitionPending";
          node.data = { ...node.data, hProperties: { "data-pdf-source": ids.join(" "), tabIndex: 0 } };
          delete node.children;
          return;
        }
      }
      if (["text", "inlineMath", "math", "image", "imageReference"].includes(node.type)) {
        const ids = (node.data?.pdfSourceIds || bodyIds).filter((id) => allowed.has(id));
        if (ids.length) {
          if (node.type === "text") node.type = "pdfSourceText";
          node.data = { ...node.data,
            hProperties: { ...node.data?.hProperties, "data-pdf-source": [...new Set(ids)].join(" "), tabIndex: 0 } };
        }
      }
      node.children?.forEach(decorate);
    };
    decorate(root);
    html = sanitizeRenderedHtml(String(renderer.stringify(renderer.runSync(root))), imageUrls);
  } else html = renderDocumentMarkdown(
    blockMarkdown(block, mode) + (definitions ? `\n\n${definitions}` : ""), imageUrls
  );
  if (block.equationNumber?.anchor) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const tag of doc.querySelectorAll(".katex-html .tag")) {
      tag.setAttribute("data-pdf-source", block.equationNumber.anchor.id);
      tag.setAttribute("tabindex", "0");
    }
    html = doc.body.innerHTML;
  }
  if (assetUrls) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const image of doc.querySelectorAll("img")) {
      const path = image.getAttribute("src"), url = assetUrls.get(path);
      if (url) {
        image.setAttribute("src", url);
        image.setAttribute("data-document-asset", path);
      } else {
        const failed = doc.createElement("span");
        failed.className = "kt-document-warning";
        failed.textContent = assetError;
        for (const attr of ["data-pdf-source", "tabindex"])
          if (image.hasAttribute(attr)) failed.setAttribute(attr, image.getAttribute(attr));
        image.replaceWith(failed);
      }
    }
    html = doc.body.innerHTML;
  }
  // Per-block footnotes need distinct DOM identities when the same note is
  // referenced by several paragraphs in one reading pane.
  return html.replace(
    /(id="|href="#)(user-content-fn[^" ]*)/g,
    (_, prefix, id) => `${prefix}${id}-${block.id.replace(/[^\w-]/g, "")}`
  );
}
