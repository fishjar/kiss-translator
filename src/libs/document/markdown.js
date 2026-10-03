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
const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
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
export const DOCUMENT_CSS =
  "body{font-family:system-ui,sans-serif;line-height:1.7;margin:24px auto;max-width:1000px;padding:0 20px}img{max-width:100%}pre{overflow:auto;padding:12px;background:#8881}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}th,td{border:1px solid #8886;padding:6px 10px}.kt-source{color:#666}.kt-target{margin-top:.4em}.katex-display{overflow:auto}.kt-document-warning{color:#9b6600;border-left:3px solid;padding-left:12px}";

export function renderDocumentMarkdown(markdown) {
  return DOMPurify.sanitize(String(renderer.processSync(markdown)), {
    ADD_TAGS: ["math", "annotation", "semantics"],
    ADD_ATTR: ["xmlns", "encoding"],
  });
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
    if (n.children) n.children = n.children.map(walk);
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
  let restored = text;
  for (const { token, node, raw, link } of masks) {
    if (restored.split(token).length !== 2)
      throw new Error("译文中的公式／链接占位符损坏，请重试");
    if (link) continue;
    restored = restored.replace(
      token,
      () => raw || stringify({ type: "paragraph", children: [node] })
    );
  }
  const parsed = parser.parse(restored);
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
  return paragraph.children;
}
function withoutResources(nodes) {
  return nodes
    .filter(
      (n) =>
        !["inlineMath", "inlineCode", "image", "imageReference"].includes(
          n.type
        )
    )
    .map((n) => ({
      ...copy(n),
      ...(n.children ? { children: withoutResources(n.children) } : {}),
    }));
}
export function isTranslatableBlock(block) {
  if (block.ast?.type === "html") {
    const body = sanitizedHtml(block.raw);
    body
      .querySelectorAll("pre,code,math,.katex,img")
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
  let done = blocks.filter(
    (b) => isTranslatableBlock(b) && b.status === "done"
  ).length;
  const total = blocks.filter(isTranslatableBlock).length;
  await runTranslationTasks(
    blocks.map((block) => async (signal) => {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (!isTranslatableBlock(block) || block.status === "done") return;
      block.status = "busy";
      delete block.error;
      progress(done, total, block);
      try {
        if (block.ast.type === "html") {
          const body = sanitizedHtml(block.raw),
            table = body.querySelector("table") || body,
            bilingual = table.cloneNode(true);
          const sourceCells =
              table.tagName === "TABLE"
                ? [...table.querySelectorAll("th,td")]
                : [table],
            bilingualCells =
              table.tagName === "TABLE"
                ? [...bilingual.querySelectorAll("th,td")]
                : [bilingual];
          await runTranslationTasks(
            sourceCells.map((cell, i) => async (signal) => {
              if (!cell.textContent.trim()) return;
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              const source = cell.innerHTML,
                masked = [],
                clone = cell.cloneNode(true);
              clone
                .querySelectorAll("pre,code,math,.katex,img")
                .forEach((el) => {
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
              let result = await translate(input, signal);
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              result = escape(result);
              for (const mask of masked) {
                if (result.split(mask.token).length !== 2)
                  throw new Error("表格占位符损坏");
                result = result.replace(mask.token, () => mask.raw);
              }
              cell.innerHTML = result;
              const translatedPreview = cell.cloneNode(true);
              translatedPreview
                .querySelectorAll("pre,code,math,.katex,img")
                .forEach((el) => el.remove());
              translatedPreview.innerHTML = translatedPreview.innerHTML.replace(
                /\$[^$\n]+\$/g,
                ""
              );
              bilingualCells[i].innerHTML =
                `<div class="kt-source">${source}</div><div class="kt-target">${translatedPreview.innerHTML}</div>`;
            }),
            signal
          );
          if (signal.aborted) throw new DOMException("已取消", "AbortError");
          block.targetRaw =
            table.tagName === "BODY" ? table.innerHTML : table.outerHTML;
          block.bilingualRaw =
            table.tagName === "BODY"
              ? bilingual.innerHTML
              : bilingual.outerHTML;
        } else {
          const target = copy(block.ast),
            units = translationUnits(target),
            originalUnits = translationUnits(block.ast),
            bilingual = copy(block.ast),
            bilingualUnits = translationUnits(bilingual);
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
              const result = await translate(masked.text, signal);
              if (signal?.aborted)
                throw new DOMException("已取消", "AbortError");
              units[i].children = restoreUnit(result, masked.masks);
              bilingualUnits[i].children = [
                ...copy(originalUnits[i].children),
                { type: "break" },
                ...withoutResources(units[i].children),
              ];
            }),
            signal
          );
          if (signal.aborted) throw new DOMException("已取消", "AbortError");
          block.targetAst = target;
          block.targetRaw = stringify(target);
          block.bilingualRaw = stringify(bilingual);
        }
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
  documentBlocks = []
) {
  const definitions = (block.definitions || [])
    .map((n) => {
      const translated = documentBlocks.find(
        (b) => b.ast.type === n.type && b.ast.identifier === n.identifier
      );
      return translated ? blockMarkdown(translated, mode) : stringify(n);
    })
    .join("\n\n");
  const html = renderDocumentMarkdown(
    blockMarkdown(block, mode) + (definitions ? `\n\n${definitions}` : "")
  );
  // Per-block footnotes need distinct DOM identities when the same note is
  // referenced by several paragraphs in one reading pane.
  return html.replace(
    /(id="|href="#)(user-content-fn[^" ]*)/g,
    (_, prefix, id) => `${prefix}${id}-${block.id.replace(/[^\w-]/g, "")}`
  );
}
