import { isPageElement } from "./ruleEditorDom";

const containsPoint = (rect, x, y) =>
  rect.width > 0 &&
  rect.height > 0 &&
  rect.left <= x &&
  x <= rect.right &&
  rect.top <= y &&
  y <= rect.bottom;
const unsupported = (element) =>
  /^(?:iframe|canvas|svg)$/.test(element.localName) || element.shadowRoot;

function visibleAtPoint(element, x, y, styles) {
  for (let node = element; node; node = node.parentElement) {
    const style = styles(node);
    if (
      style.display === "none" ||
      /^(hidden|collapse)$/.test(style.visibility) ||
      style.opacity === "0"
    )
      return false;
    // Ranges can extend beyond ellipsis, line-clamp and scrolling containers.
    const clipX = /^(hidden|clip|scroll|auto)$/.test(style.overflowX);
    const clipY = /^(hidden|clip|scroll|auto)$/.test(style.overflowY);
    if (clipX || clipY) {
      const rect = node.getBoundingClientRect();
      if (
        (clipX && (x < rect.left || x > rect.right)) ||
        (clipY && (y < rect.top || y > rect.bottom))
      )
        return false;
    }
  }
  return true;
}

function paintedAfter(element, hit, styles) {
  if (element === hit || element.contains(hit) || hit.contains(element))
    return true;
  const path = (node) => {
    const nodes = [];
    for (; node; node = node.parentElement) nodes.unshift(node);
    return nodes;
  };
  const left = path(element);
  const right = path(hit);
  let index = 0;
  while (left[index] === right[index]) index++;
  // Compare the first stacking context in each branch, then positioned layers
  // and document order. A later modal must not expose text behind it.
  const layer = (nodes) => {
    let positioned = false;
    for (const node of nodes) {
      const style = styles(node);
      positioned ||= style.position !== "static";
      if (
        (style.position !== "static" && style.zIndex !== "auto") ||
        /^(fixed|sticky)$/.test(style.position) ||
        (style.transform && style.transform !== "none") ||
        (style.opacity && Number(style.opacity) < 1) ||
        style.isolation === "isolate"
      )
        return { z: Number.parseInt(style.zIndex, 10) || 0, positioned: true };
    }
    return { z: 0, positioned };
  };
  const a = layer(left.slice(index));
  const b = layer(right.slice(index));
  if (a.z !== b.z) return a.z > b.z;
  if (a.positioned !== b.positioned) return a.positioned;
  return Boolean(right[index].compareDocumentPosition(left[index]) & 4);
}

// Cache text nodes, never rectangles: coordinates must reflect every scroll and
// layout change. Work is bounded to nearby subtrees rather than the entire page.
export class RuleElementPicker {
  constructor() {
    this.cache = new Map();
  }
  invalidate() {
    this.cache.clear();
  }
  texts(root) {
    if (this.cache.has(root)) return this.cache.get(root);
    if (this.cache.size >= 8) this.cache.clear();
    const texts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (element) =>
        !isPageElement(element) ||
        unsupported(element) ||
        /^(?:script|style|noscript|input|textarea|select)$/.test(
          element.localName
        )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    let visited = 0;
    for (let node = root; node && visited < 500; node = walker.nextNode()) {
      visited++;
      if (
        !isPageElement(node) ||
        unsupported(node) ||
        /^(?:script|style|noscript|input|textarea|select)$/.test(node.localName)
      )
        continue;
      for (const text of node.childNodes)
        if (text.nodeType === 3 && /\S/.test(text.textContent))
          texts.push(text);
    }
    this.cache.set(root, texts);
    return texts;
  }
  elementsAtPoint(x, y, fallback) {
    const stack = document.elementsFromPoint?.(x, y) || [];
    const hit = stack.find(isPageElement) || fallback;
    if (!isPageElement(hit)) return [];
    if (unsupported(hit)) return [hit];
    const cache = new Map();
    const styles = (element) => {
      if (!cache.has(element)) cache.set(element, getComputedStyle(element));
      return cache.get(element);
    };
    const checked = new Set();
    let textMatches = [];
    let root = hit;
    for (
      let depth = 0;
      root &&
      root !== document.body &&
      root !== document.documentElement &&
      depth < 4;
      depth++, root = root.parentElement
    ) {
      for (const text of this.texts(root)) {
        if (checked.has(text)) continue;
        checked.add(text);
        const element = text.parentElement;
        if (!element || !isPageElement(element)) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        if (
          Array.from(range.getClientRects?.() || []).some((rect) =>
            containsPoint(rect, x, y)
          ) &&
          visibleAtPoint(element, x, y, styles) &&
          paintedAfter(element, hit, styles)
        )
          textMatches.push(element);
      }
      if (textMatches.length) break;
    }
    textMatches = [...new Set(textMatches)].sort((a, b) => {
      if (a.contains(b)) return 1;
      if (b.contains(a)) return -1;
      return paintedAfter(a, b, styles) ? -1 : 1;
    });
    return [...new Set([...textMatches, hit, ...stack])]
      .filter(
        (element) =>
          isPageElement(element) &&
          element !== document.body &&
          element !== document.documentElement
      )
      .slice(0, 10);
  }
}
