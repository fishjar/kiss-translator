import { textRegion, sourceAnchor } from "./formulaGeometry";

export const TEXT_GEOMETRY_VERSION = 1;

const union = (rects) => [
  Math.min(...rects.map((r) => r[0])),
  Math.min(...rects.map((r) => r[1])),
  Math.max(...rects.map((r) => r[2])),
  Math.max(...rects.map((r) => r[3])),
];
const escape = (s) => s.replace(/([\\`*_[\]<>])/g, "\\$1");
export const rectUnion = union;
export function rawPageFromText(textContent, viewport, pageNumber) {
  const spans = [];
  let markedContentId = null;
  const markedStack = [];
  textContent.items.forEach((item, i) => {
    if (["beginMarkedContentProps", "beginMarkedContent"].includes(item.type)) {
      markedStack.push(markedContentId);
      markedContentId = item.id || markedContentId;
      return;
    }
    if (item.type === "endMarkedContent") {
      markedContentId = markedStack.pop() ?? null;
      return;
    }
    if (!item.str?.trim()) return;
    const t = item.transform,
      v = viewport.transform;
    const transform = [
      v[0] * t[0] + v[2] * t[1],
      v[1] * t[0] + v[3] * t[1],
      v[0] * t[2] + v[2] * t[3],
      v[1] * t[2] + v[3] * t[3],
      v[0] * t[4] + v[2] * t[5] + v[4],
      v[1] * t[4] + v[3] * t[5] + v[5],
    ];
    const size = Math.hypot(transform[2], transform[3]) || item.height || 10,
      baseline = transform[5];
    const style = textContent.styles[item.fontName] || {},
      ascent = Number.isFinite(style.ascent) && style.ascent > 0
        ? style.ascent
        : Number.isFinite(style.descent) && style.descent < 0 && 1 + style.descent > 0
          ? 1 + style.descent
          : 0.8;
    const angle = Math.atan2(transform[1], transform[0]);
    const x = transform[4],
      y = baseline - ascent * size;
    const width = Math.abs(item.width * viewport.scale),
      height = Math.abs(size);
    const corners = [
      [x, y],
      [x + Math.cos(angle) * width, y + Math.sin(angle) * width],
      [x - Math.sin(angle) * height, y + Math.cos(angle) * height],
      [
        x + Math.cos(angle) * width - Math.sin(angle) * height,
        y + Math.sin(angle) * width + Math.cos(angle) * height,
      ],
    ];
    spans.push({
      id: `p${pageNumber}-s${i}`,
      markedContentId,
      text: item.str,
      font: item.fontName,
      fontFamily: style.fontFamily,
      fontSize: size,
      baseline,
      dir: item.dir,
      transform,
      bbox: [
        Math.min(...corners.map((p) => p[0])),
        Math.min(...corners.map((p) => p[1])),
        Math.max(...corners.map((p) => p[0])),
        Math.max(...corners.map((p) => p[1])),
      ],
      vertical: Math.abs(Math.sin(angle)) > 0.8,
      hasEOL: item.hasEOL,
    });
  });
  return {
    page: pageNumber,
    textGeometryVersion: TEXT_GEOMETRY_VERSION,
    width: viewport.width,
    height: viewport.height,
    rotation: viewport.rotation,
    transform: viewport.transform,
    spans,
  };
}
function joinSpans(spans) {
  let text = "";
  const base = spans.reduce((a, b) => (a.fontSize > b.fontSize ? a : b));
  const superChars = {
    0: "⁰",
    1: "¹",
    2: "²",
    3: "³",
    4: "⁴",
    5: "⁵",
    6: "⁶",
    7: "⁷",
    8: "⁸",
    9: "⁹",
    "+": "⁺",
    "-": "⁻",
    "(": "⁽",
    ")": "⁾",
    n: "ⁿ",
  };
  const subChars = {
    0: "₀",
    1: "₁",
    2: "₂",
    3: "₃",
    4: "₄",
    5: "₅",
    6: "₆",
    7: "₇",
    8: "₈",
    9: "₉",
    "+": "₊",
    "-": "₋",
    "(": "₍",
    ")": "₎",
  };
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i],
      prev = spans[i - 1];
    if (
      prev &&
      s.bbox[0] - prev.bbox[2] > Math.min(s.fontSize, prev.fontSize) * 0.12 &&
      !/[\s]$/.test(text) &&
      !/^[,.;:!?)]/.test(s.text) &&
      !/[\u3400-\u9fff]$/.test(text)
    )
      text += " ";
    const shifted =
      s.fontSize < base.fontSize * 0.85 &&
      Math.abs(s.baseline - base.baseline) > base.fontSize * 0.15;
    const chars = s.baseline < base.baseline ? superChars : subChars;
    text +=
      shifted && [...s.text].every((c) => chars[c])
        ? [...s.text].map((c) => chars[c]).join("")
        : s.text;
  }
  return text;
}
export function buildLines(raw, regions = []) {
  const owner = (span) => textRegion(span.bbox, regions.filter((region) =>
    ["paragraph", "text", "heading", "caption"].includes(region.type)))?.id;
  const groups = [];
  for (const span of [...raw.spans]
    .filter((s) => !s.vertical)
    .sort((a, b) => Math.round(a.baseline * 1000) - Math.round(b.baseline * 1000) || a.bbox[0] - b.bbox[0])) {
    const matches = groups.filter(
      (g) =>
        g.owner === owner(span) &&
        Math.abs(g.baseline - span.baseline) <
          Math.min(g.fontSize, span.fontSize) * 0.3 &&
        span.bbox[0] - Math.max(...g.spans.map((s) => s.bbox[2])) <
          span.fontSize * 1.25 &&
        span.bbox[2] >=
          Math.min(...g.spans.map((s) => s.bbox[0])) - span.fontSize * 1.25
    );
    const line = matches[0];
    if (line) {
      line.spans.push(span, ...matches.slice(1).flatMap((g) => g.spans));
      for (const merged of matches.slice(1)) groups.splice(groups.indexOf(merged), 1);
      const main = [...line.spans].sort((a, b) => b.text.length - a.text.length)[0];
      line.baseline = main.baseline;
      line.fontSize = main.fontSize;
    }
    else
      groups.push({
        owner: owner(span),
        baseline: span.baseline,
        fontSize: span.fontSize,
        spans: [span],
      });
  }
  // Attach small baseline-shifted runs to an adjacent normal-size line.
  for (const group of [...groups]) {
    if (!groups.includes(group)) continue;
    const box = union(group.spans.map((s) => s.bbox));
    const parent = groups.find(
      (g) =>
        g !== group &&
        g.owner === group.owner &&
        group.fontSize < g.fontSize * 0.85 &&
        Math.abs(group.baseline - g.baseline) < g.fontSize * 0.9 &&
        g.spans.some(
          (s) =>
            Math.abs(box[0] - s.bbox[2]) < g.fontSize * 0.7 ||
            Math.abs(box[2] - s.bbox[0]) < g.fontSize * 0.7
        )
    );
    if (parent) {
      parent.spans.push(...group.spans);
      groups.splice(groups.indexOf(group), 1);
    }
  }
  return groups.map((line, i) => {
    line.spans.sort((a, b) => a.bbox[0] - b.bbox[0]);
    return {
      ...line,
      id: `p${raw.page}-l${i}`,
      bbox: union(line.spans.map((s) => s.bbox)),
      text: joinSpans(line.spans),
    };
  });
}
export function readingOrder(lines, width, height) {
  // Whitespace partitioning separates columns before sorting lines.
  if (lines.length < 2) return lines;
  let cut = null;
  for (let x = width * 0.25; x < width * 0.75; x += width / 100) {
    const left = lines.filter((l) => l.bbox[2] < x),
      right = lines.filter((l) => l.bbox[0] > x),
      cross = lines.filter((l) => l.bbox[0] <= x && l.bbox[2] >= x);
    if (
      left.length >= 2 &&
      right.length >= 2 &&
      // Equation numbers aligned in the margin do not form a reading column.
      !left.every((line) => line.type === "formula_number" || /^\(\d+[a-z]?\)$/.test(line.text || "")) &&
      !right.every((line) => line.type === "formula_number" || /^\(\d+[a-z]?\)$/.test(line.text || "")) &&
      cross.length <= Math.max(2, lines.length * 0.35)
    ) {
      const gap =
        Math.min(...right.map((l) => l.bbox[0])) -
        Math.max(...left.map((l) => l.bbox[2]));
      if (gap > width * 0.012 && (!cut || gap > cut.gap))
        cut = { left, right, cross, gap };
    }
  }
  if (!cut)
    return [...lines].sort(
      (a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]
    );
  const ordered = [],
    crossing = [...cut.cross].sort((a, b) => a.bbox[1] - b.bbox[1]);
  let top = -Infinity;
  for (const boundary of [...crossing, { bbox: [0, Infinity, 0, Infinity] }]) {
    const bandTop = top;
    const band = (items) =>
      items
        .filter((l) => l.bbox[1] >= bandTop && l.bbox[1] < boundary.bbox[1])
        .sort((a, b) => a.bbox[1] - b.bbox[1]);
    ordered.push(...band(cut.left), ...band(cut.right));
    if (Number.isFinite(boundary.bbox[1])) ordered.push(boundary);
    top = boundary.bbox[1];
  }
  return ordered;
}
export function paragraphBlocks(raw, lines, regions = []) {
  // Compute ownership before inserting formulas; native bounds anchor reading order.
  lines = (raw.spans?.length ? buildLines(raw, regions) : lines).map((line) => ({ ...line, spans: [...line.spans] }));
  const claimed = new Set();
  const assignments = regions.filter((region) => region.type === "inline-formula" &&
    (region.latex || region.formulaMarkdown || region.pendingRecognition)).map((region, index) => {
    const owned = lines.flatMap((line) => line.spans.filter((span) =>
      !claimed.has(span.id) && textRegion(span.bbox, regions)?.id === region.id));
    owned.forEach((span) => claimed.add(span.id));
    const hosts = lines.filter((line) => line.spans.some((span) => owned.includes(span)));
    const bodyLength = (line) => line.spans.filter((span) => !owned.includes(span))
      .reduce((length, span) => length + span.text.length, 0);
    const host = [...hosts].sort((a, b) => bodyLength(b) - bodyLength(a) || a.baseline - b.baseline)[0];
    return { region, owned, host, token: `KTPDFINLINE${index}END` };
  });
  for (const { region, owned, host, token } of assignments) {
    if (!host || !owned.length) continue;
    for (const line of lines) line.spans = line.spans.filter((span) => !owned.includes(span));
    host.spans.push({ ...owned[0], id: `inline-${region.id}`, text: token,
      baseline: host.baseline, fontSize: host.fontSize,
      bbox: [region.bbox[0], host.bbox[1], region.bbox[2], host.bbox[3]],
      inlineFormula: { text: token, token: true, regionId: region.id, latex: region.latex,
        markdown: region.formulaMarkdown || (!region.latex && region.pendingRecognition ? "_待识别…_" : undefined),
        pending: !region.latex && !region.formulaMarkdown && region.pendingRecognition,
        diagnostic: region.formulaDiagnostic, sourceBBox: region.bbox, sourceAnchor: sourceAnchor(raw.page, region), spanIds: owned.map((span) => span.id) } });
  }
  lines = lines.filter((line) => line.spans.length).map((line) => {
    if (!line.spans.every((span) => span.bbox && span.text !== undefined)) return line;
    line.spans.sort((a, b) => a.bbox[0] - b.bbox[0]);
    return { ...line, text: joinSpans(line.spans) };
  });
  const roles = new Map();
  const visit = (node, role) => {
    const next = node.role || role;
    for (const child of node.children || []) {
      if (child.type === "content") roles.set(child.id, next);
      else visit(child, next);
    }
  };
  if (raw.structTree) visit(raw.structTree, null);
  const medianSize =
    lines.map((l) => l.fontSize).sort((a, b) => a - b)[
      Math.floor(lines.length / 2)
    ] || 10;
  const fontCounts = new Map();
  for (const line of lines)
    for (const span of line.spans.filter((span) => !span.inlineFormula))
      fontCounts.set(
        span.font,
        (fontCounts.get(span.font) || 0) + (span.text?.length || 0)
      );
  const bodyFont = [...fontCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sizeCounts = new Map();
  for (const line of lines)
    for (const span of line.spans.filter((s) => s.font === bodyFont)) {
      const size = Math.round(span.fontSize * 10) / 10;
      sizeCounts.set(
        size,
        (sizeCounts.get(size) || 0) + (span.text?.length || 0)
      );
    }
  const bodySize =
    [...sizeCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || medianSize;
  const ordered = readingOrder(lines, raw.width, raw.height),
    blocks = [];
  for (const line of ordered) {
    const inlineMath = line.spans.filter((span) => span.inlineFormula).map((span) => span.inlineFormula);
    for (const region of regions.filter((r) => r.type === "inline-formula" && !r.pendingRecognition && !r.latex && !r.formulaMarkdown)) {
      const spans = line.spans.filter((span) => !span.inlineFormula && textRegion(span.bbox, regions)?.id === region.id);
      if (spans.length) inlineMath.push({ text: joinSpans(spans), latex: joinSpans(spans), sourceBBox: region.bbox, sourceAnchor: sourceAnchor(raw.page, region) });
    }
    const sourceBBox = union([line.bbox, ...inlineMath.map((formula) => formula.sourceBBox)]);
    const links = (raw.links || []).flatMap((link) => {
      const spans = line.spans.filter((s) => {
        const x = (s.bbox[0] + s.bbox[2]) / 2,
          y = (s.bbox[1] + s.bbox[3]) / 2;
        return (
          x >= link.bbox[0] &&
          x <= link.bbox[2] &&
          y >= link.bbox[1] &&
          y <= link.bbox[3]
        );
      });
      return spans.length ? [{ text: joinSpans(spans), url: link.url }] : [];
    });
    const region = textRegion(line.bbox, regions.filter((r) => r.type !== "inline-formula"));
    const anchor = sourceAnchor(raw.page, region);
    const taggedRole = line.spans
      .map((s) => roles.get(s.markedContentId))
      .find(Boolean);
    const nativeSpans = line.spans.filter((span) => !span.inlineFormula);
    const lineFont = [...(nativeSpans.length ? nativeSpans : line.spans)].sort(
      (a, b) => (b.text?.length || 0) - (a.text?.length || 0)
    )[0]?.font;
    const heading =
      /^H[1-6]?$/.test(taggedRole || "") ||
      region?.type === "heading" ||
      (line.fontSize > bodySize * 1.12 &&
        line.text.length >= 8 &&
        line.text.length < 180 &&
        /[A-Z\u3400-\u9fff]/.test(line.text[0])) ||
      (/^[1-9]\d?(?:\.\d+)*\s+[A-Z\u3400-\u9fff]/.test(line.text) &&
        lineFont !== bodyFont &&
        !/^\d+\s+(?:GeV|TeV|MeV|Hz|mm|cm|km)\b/.test(line.text));
    const caption =
      /^(?:(?:Figure|Fig\.|Table)\s*\d+[.:：]|[图表]\s*\d+)/i.test(line.text);
    let type =
      region?.type ||
      (caption
        ? "caption"
        : heading
          ? "heading"
          : /^(?:[•●▪]|\d+[.)]|[-–])\s+/.test(line.text)
            ? "list"
            : "paragraph");
    const prior = blocks[blocks.length - 1];
    if (
      !region &&
      prior?.type === "heading" &&
      type === "paragraph" &&
      lineFont === prior.font &&
      Math.abs(line.fontSize - prior.fontSize) < 0.2 &&
      line.baseline - prior.lastBaseline > 0 &&
      line.baseline - prior.lastBaseline < line.fontSize * 1.8 &&
      line.text.length < 120
    )
      type = "heading";
    if (
      !region &&
      prior?.type === "caption" &&
      type === "paragraph" &&
      lineFont === prior.font &&
      Math.abs(line.fontSize - prior.fontSize) < 0.2 &&
      line.baseline - prior.lastBaseline > 0 &&
      line.baseline - prior.lastBaseline < line.fontSize * 1.8
    )
      type = "caption";
    const sameColumn =
      prior &&
      (Math.abs(prior.bbox[0] - line.bbox[0]) <
        bodySize * (type === "heading" ? 2.4 : 1.8) ||
        (type === "heading" &&
          Math.abs(
            (prior.bbox[0] + prior.bbox[2] - line.bbox[0] - line.bbox[2]) / 2
          ) <
            bodySize * 4)) &&
      line.bbox[0] < prior.bbox[2] &&
      line.bbox[2] > prior.bbox[0];
    const gap = prior ? line.baseline - prior.lastBaseline : Infinity;
    if (
      prior &&
      ["paragraph", "caption", "heading"].includes(type) &&
      prior.type === type &&
      sameColumn &&
      gap > 0 &&
      gap <
        (type === "heading"
          ? Math.max(prior.fontSize, line.fontSize)
          : bodySize) *
          1.8 &&
      Math.abs(prior.fontSize - line.fontSize) < bodySize * 0.2 &&
      (region?.id === prior.regionId) &&
      !(type === "heading" && /^\d+(?:\.\d+)*\s/.test(line.text))
    ) {
      const textOffset = prior.text.replace(/([a-z])-$/, "$1").length + (/[a-z]-$/.test(prior.lastText) ? 0 : 1);
      prior.textSources.push(...(anchor ? [{ start: textOffset, end: textOffset + line.text.length, anchor }] : []));
      prior.sourceAnchors.push(...(anchor ? [anchor] : []), ...inlineMath.map((formula) => formula.sourceAnchor).filter(Boolean));
      prior.text =
        prior.text.replace(/([a-z])-$/, "$1") +
        (/[a-z]-$/.test(prior.lastText) ? "" : " ") +
        line.text;
      prior.lastText = line.text;
      prior.lastBaseline = line.baseline;
      prior.bbox = union([prior.bbox, line.bbox]);
      prior.fragments[0].bbox = union([prior.fragments[0].bbox, sourceBBox]);
      prior.fragments[0].lineIds.push(line.id);
      prior.spanIds.push(...line.spans.flatMap((s) => s.inlineFormula?.spanIds || [s.id]));
      prior.links.push(...links);
      prior.inlineMath.push(...inlineMath);
    } else
      blocks.push({
        id: `p${raw.page}-b${blocks.length}`,
        type,
        level:
          type === "heading"
            ? /^H[1-6]$/.test(taggedRole || "")
              ? Number(taggedRole[1])
              : /^\d+(?:\.\d+)*\s/.test(line.text)
                ? Math.min(
                    6,
                    line.text.match(/^\d+(?:\.\d+)*/)[0].split(".").length
                  )
                : line.fontSize > bodySize * 1.35
                  ? 1
                  : 2
            : undefined,
        text: line.text,
        textSources: anchor ? [{ start: 0, end: line.text.length, anchor }] : [],
        sourceAnchors: [...(anchor ? [anchor] : []), ...inlineMath.map((formula) => formula.sourceAnchor).filter(Boolean)],
        links,
        inlineMath,
        lastText: line.text,
        lastBaseline: line.baseline,
        font: lineFont,
        bbox: line.bbox,
        fontSize: line.fontSize,
        regionId: region?.id,
        order: region?.order,
        source: "native",
        spanIds: line.spans.flatMap((s) => s.inlineFormula?.spanIds || [s.id]),
        fragments: [{ page: raw.page, bbox: sourceBBox, lineIds: [line.id] }],
      });
  }
  return blocks;
}
export function blockToMarkdown(block, sourceRanges) {
  const record = (start, end, anchor) => {
    if (!sourceRanges || !anchor || start === end) return;
    const prior = sourceRanges.at(-1);
    if (prior?.end === start && prior.anchor.id === anchor.id) prior.end = end;
    else sourceRanges.push({ start, end, anchor });
  };
  if (block.markdown !== undefined) {
    record(0, block.markdown.length, block.sourceAnchors?.[0]);
    return block.markdown;
  }
  const original = block.text || "";
  const formulas = (block.inlineMath || []).map((value) =>
    typeof value === "string" ? { text: value, latex: value } : value);
  const candidates = [...formulas.filter((value) => value.text?.trim()).map((value) => ({
    ...value, kind: "math",
  })), ...(block.links || []).filter((link) => link.text && /^(?:https?:|mailto:)/i.test(link.url))
    .map((link) => ({ ...link, kind: "link" }))].sort((a, b) => b.text.length - a.text.length);
  let text = "", position = 0, previousMath = false;
  while (position < original.length) {
    const start = position;
    const value = candidates.find((candidate) => original.startsWith(candidate.text, start) &&
      (candidate.token || (!/[\p{L}\p{N}]/u.test(original[start - 1] || "") &&
        !/[\p{L}\p{N}]/u.test(original[start + candidate.text.length] || ""))));
    const bodyAnchor = block.textSources?.find((range) => start >= range.start && start < range.end)?.anchor;
    if (!value) {
      const offset = text.length;
      text += escape(original[position++]);
      record(offset, text.length, bodyAnchor);
      previousMath = false;
      continue;
    }
    if (value.kind === "math") {
      if (previousMath) text += " ";
      const offset = text.length;
      text += value.markdown || `$${value.latex.replace(/\$/g, "\\$").replace(/[\r\n]/g, " ")}$`;
      record(offset, text.length, value.sourceAnchor || bodyAnchor);
      previousMath = true;
    } else {
      const offset = text.length;
      text += `[${escape(value.text)}](<${value.url.replace(/[<>\n\r]/g, (c) => encodeURIComponent(c))}>)`;
      record(offset, text.length, bodyAnchor);
      previousMath = false;
    }
    position += value.text.length;
  }
  const markdown = block.type === "heading" ? `${"#".repeat(block.level || 2)} ${text}` :
    block.type === "list" ? `- ${text.replace(/^(?:[•●▪]|\d+[.)]|[-–])\s+/, "")}` : text;
  const shift = markdown.length - text.length;
  sourceRanges?.forEach((range) => { range.start = Math.max(0, range.start + shift); range.end += shift; });
  return markdown;
}
export function mergeAcrossPages(blocks, pages) {
  const merged = [];
  for (const original of blocks) {
    // Never mutate cached per-page blocks: retries must merge fresh copies.
    const block = {
      ...original,
      fragments: original.fragments.map((f) => ({
        ...f,
        bbox: [...f.bbox],
        lineIds: [...(f.lineIds || [])],
      })),
      spanIds: [...(original.spanIds || [])],
      textSources: [...(original.textSources || [])],
      sourceAnchors: [...(original.sourceAnchors || [])],
      cells: original.cells?.map((c) => ({ ...c })),
    };
    const prior = merged[merged.length - 1],
      first = block.fragments[0],
      last = prior?.fragments.at(-1),
      prevPage = pages.find((p) => p.page === last?.page),
      nextPage = pages.find((p) => p.page === first.page);
    const acrossBoundary =
      last &&
      first.page === last.page + 1 &&
      last.bbox[3] > prevPage.height * 0.82 &&
      first.bbox[1] < nextPage.height * 0.2;
    const headers = (b) =>
      b.cells
        ?.filter((c) => c.rowStart === 0)
        .map((c) => c.text.trim())
        .join("\u0000");
    const tableContinuation =
      prior?.type === "table" &&
      block.type === "table" &&
      prior.source === "native" &&
      block.source === "native" &&
      acrossBoundary &&
      prior.cells?.length &&
      block.cells?.length &&
      headers(prior) === headers(block) &&
      Math.abs(last.bbox[0] / prevPage.width - first.bbox[0] / nextPage.width) <
        0.02 &&
      Math.abs(last.bbox[2] / prevPage.width - first.bbox[2] / nextPage.width) <
        0.02 &&
      /^\|/.test(prior.markdown || "") &&
      /^\|/.test(block.markdown || "");
    if (tableContinuation) {
      const rowOffset = Math.max(...prior.cells.map((c) => c.rowEnd)) - 1;
      prior.cells.push(
        ...block.cells
          .filter((c) => c.rowStart > 0)
          .map((c) => ({
            ...c,
            rowStart: c.rowStart + rowOffset,
            rowEnd: c.rowEnd + rowOffset,
          }))
      );
      prior.markdown += "\n" + block.markdown.split("\n").slice(2).join("\n");
      prior.fragments.push(...block.fragments);
      prior.spanIds.push(...block.spanIds);
      prior.links = [...(prior.links || []), ...(block.links || [])];
      prior.inlineMath = [
        ...(prior.inlineMath || []),
        ...(block.inlineMath || []),
      ];
      continue;
    }
    const can =
      prior?.type === "paragraph" &&
      block.type === "paragraph" &&
      prior.source === "native" &&
      block.source === "native" &&
      first.page === last.page + 1 &&
      last.bbox[3] > prevPage.height * 0.82 &&
      first.bbox[1] < nextPage.height * 0.2 &&
      Math.abs(prior.fontSize - block.fontSize) < block.fontSize * 0.15 &&
      Math.abs(last.bbox[0] / prevPage.width - first.bbox[0] / nextPage.width) <
        0.04 &&
      !/[.!?:;。！？：；]$/.test(prior.text.trim()) &&
      /^[a-z]/.test(block.text.trim());
    if (can) {
      const hyphen = /[a-z]-$/.test(prior.text);
      const trimmedLength = prior.text.replace(/([a-z])-$/, "$1").length;
      const offset = trimmedLength + (hyphen ? 0 : 1);
      if (hyphen) prior.textSources = prior.textSources.map((range) => ({ ...range, end: Math.min(range.end, trimmedLength) }));
      prior.textSources.push(...block.textSources.map((range) => ({ ...range, start: range.start + offset, end: range.end + offset })));
      prior.sourceAnchors.push(...block.sourceAnchors);
      prior.text =
        prior.text.replace(/([a-z])-$/, "$1") +
        (hyphen ? "" : " ") +
        block.text;
      prior.fragments.push(...block.fragments);
      prior.spanIds.push(...block.spanIds);
      prior.links = [...(prior.links || []), ...(block.links || [])];
      prior.inlineMath = [
        ...(prior.inlineMath || []),
        ...(block.inlineMath || []),
      ];
    } else merged.push(block);
  }
  return merged;
}
export function buildToc(bookmarks, blocks, pageCount) {
  const headings = blocks.filter((b) => b.type === "heading"),
    entries = bookmarks.map((b) => ({ ...b }));
  for (const entry of entries) {
    const heading = headings
      .filter((b) => b.fragments[0].page === entry.page)
      .sort(
        (a, b) =>
          Math.abs(a.fragments[0].bbox[1] - entry.y) -
          Math.abs(b.fragments[0].bbox[1] - entry.y)
      )[0];
    if (
      heading &&
      (Math.abs(heading.fragments[0].bbox[1] - entry.y) < 72 ||
        heading.text.toLowerCase().includes(entry.title.toLowerCase()))
    )
      entry.blockId = heading.id;
  }
  for (const block of headings) {
    if (entries.some((e) => e.blockId === block.id)) continue;
    const fragment = block.fragments[0];
    const supplement = {
      id: `toc-${block.id}`,
      title: block.text,
      page: fragment.page,
      y: fragment.bbox[1],
      depth: Math.max(0, (block.level || 2) - 1),
      blockId: block.id,
    };
    if (!bookmarks.length) entries.push(supplement);
    else {
      // Preserve the author's bookmark sequence and levels. Add headings next to
      // the nearest mapped preceding bookmark without reordering existing items.
      const blockIndex = blocks.indexOf(block);
      let after = -1;
      for (let i = 0; i < entries.length; i++) {
        const mapped = blocks.findIndex((b) => b.id === entries[i].blockId);
        if (mapped >= 0 && mapped < blockIndex) after = i;
      }
      entries.splice(after + 1, 0, supplement);
    }
  }
  if (!entries.length)
    return Array.from({ length: pageCount }, (_, i) => ({
      id: `page-${i + 1}`,
      title: `第 ${i + 1} 页`,
      page: i + 1,
      y: 0,
      depth: 0,
      blockId: blocks.find((b) => b.fragments[0].page === i + 1)?.id,
    }));
  return entries;
}
