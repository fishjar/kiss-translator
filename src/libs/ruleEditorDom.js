import { APP_CONSTS, APP_LCNAME } from "../config";

export const RULE_EDITOR_ID = "kiss-rule-editor";
const OVERLAY_ID = "kiss-rule-highlights";
const ownSelector =
  [
    RULE_EDITOR_ID,
    OVERLAY_ID,
    ...Object.values(APP_CONSTS).filter(
      (v) => typeof v === "string" && v.startsWith(APP_LCNAME)
    ),
  ]
    .map((id) => `[id="${id}"]`)
    .join(", ") +
  ", .kiss-caption-container, .kiss-subtitle-controls, #kiss-youtube-subtitle-list-container";

export const isEditorElement = (element) =>
  Boolean(element?.closest?.(ownSelector));
export const isPageElement = (element) =>
  element?.nodeType === 1 &&
  element.getRootNode() === document &&
  !isEditorElement(element) &&
  !element.closest(
    `.${APP_LCNAME}-wrapper, .${APP_LCNAME}-original, .${APP_LCNAME}-hover-bubble`
  );

const escapeId = (value) =>
  globalThis.CSS?.escape
    ? CSS.escape(value)
    : /^[a-zA-Z_][\w-]*$/.test(value)
      ? value
      : Array.from(
          value,
          (char) => `\\${char.codePointAt(0).toString(16)} `
        ).join("");
const stable = (value) =>
  value.length <= 64 &&
  !/(?:\d{5}|[a-f0-9]{10}|^(?:css|sc)-|^m_[a-f0-9]{6,}$|module.*__|^(?:active|selected|hover|focus|open)$)/i.test(
    value
  );
const stableId = (value) =>
  stable(value) &&
  !/^(?:mantine-|radix-|:r)|^(?=.{6,16}$)(?=.*[a-z])(?=.*\d)[a-z\d]+$/i.test(
    value
  ) &&
  !/^(?=.{6,16}$)(?=.*[a-z])(?=.*[A-Z].*[A-Z])[a-zA-Z]+$/.test(value);
const utilityClass = (value) =>
  /^(?:mantine-focus-|(?:dark:|hover:|focus:|sm:|md:|lg:)|(?:flex|grid|block|inline|hidden|relative|absolute|fixed|sticky)$|(?:flex|grid|items|justify|gap|space|w|h|min|max|size|p|px|py|m|mx|my|bg|text|border|rounded|shadow|overflow|pointer-events)-)/.test(
    value
  );

// CSS Modules keep the component and local names while changing the build hash.
// Partial selectors deliberately omit that hash; exact classes remain fallbacks.
const moduleClass = /^([\w-]+-module(?:-scss-module)?)__[^_]+__([\w-]+)$/;
const classTokenBoundary = (value, start) => {
  // Class tokens can be separated by any of the five CSS whitespace characters.
  const separators = [" ", "\t", "\\a ", "\\c ", "\\d "];
  return `:is([class${start ? "^" : "$"}="${value}"],${separators
    .map((space) => `[class*="${start ? space + value : value + space}"]`)
    .join(",")})`;
};
function classDescriptor(name) {
  const module = name.match(moduleClass);
  if (module) {
    const selector =
      classTokenBoundary(`${module[1]}__`, true) +
      classTokenBoundary(`__${module[2]}`, false);
    // Attribute fragments can belong to different tokens. Do not offer a
    // component selector if it also matches such collisions on the page.
    try {
      const unambiguous = queryPage(selector).every((element) =>
        Array.from(element.classList).some((token) => {
          const other = token.match(moduleClass);
          return other && other[1] === module[1] && other[2] === module[2];
        })
      );
      if (unambiguous) return { selector, quality: 75 };
    } catch {
      /* Keep the exact class fallback if this browser cannot use :is(). */
    }
  }
  return {
    selector: `.${escapeId(name)}`,
    fragile: !stable(name),
    quality: utilityClass(name) ? 5 : /^mantine-/.test(name) ? 25 : 70,
  };
}

const classDescriptors = (element) =>
  Array.from(element.classList)
    .map(classDescriptor)
    .filter((entry) => !entry.fragile)
    .sort((a, b) => b.quality - a.quality);

export function elementTextPreview(element) {
  if (!isPageElement(element)) return "";
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        node.nodeType === 1 &&
        (!isPageElement(node) ||
          /^(?:script|style|noscript|input|textarea|select)$/.test(
            node.localName
          ) ||
          node.getAttribute("aria-hidden") === "true")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    }
  );
  let text = "";
  let visited = 0;
  for (
    let node = walker.nextNode();
    node && visited < 150 && text.length < 80;
    node = walker.nextNode()
  ) {
    visited++;
    if (node.nodeType === 3)
      text += ` ${node.textContent.replace(/\s+/g, " ").trim()}`;
  }
  return text.trim().slice(0, 80);
}
export const describeElement = (element) =>
  element
    ? `${element.localName}${
        element.id
          ? `#${element.id}`
          : Array.from(element.classList)
              .slice(0, 2)
              .map((c) => `.${c}`)
              .join("")
      }`
    : "";

export function queryPage(selector) {
  if (!selector?.trim()) return [];
  return Array.from(document.querySelectorAll(selector)).filter(isPageElement);
}

export const compareCandidates = (a, b) =>
  a.count - b.count || Number(a.fragile) - Number(b.fragile);

export const recommendSelector = (candidates) =>
  [...candidates].sort(
    (a, b) =>
      Number(a.fragile) - Number(b.fragile) ||
      b.quality - a.quality ||
      a.count - b.count ||
      a.selector.length - b.selector.length
  )[0];

export function selectorCandidates(element) {
  if (!isPageElement(element)) return [];
  const candidates = new Map();
  const add = (selector, kind, fragile = false, quality = 0) => {
    if (candidates.has(selector)) return;
    try {
      const matches = queryPage(selector);
      if (matches.includes(element))
        candidates.set(selector, {
          selector,
          kind,
          fragile,
          quality,
          count: matches.length,
        });
    } catch {
      /* Only offer selectors supported by this browser. */
    }
  };
  const tag = element.localName;
  const classes = classDescriptors(element);
  const useful = classes.filter((entry) => entry.quality >= 70).slice(0, 3);
  const local = `${tag}${useful.map((entry) => entry.selector).join("")}`;
  if (element.id)
    add(`#${escapeId(element.id)}`, "id", !stableId(element.id), 100);
  // Only a small allowlist of structural attributes; no text, URLs or form values.
  for (const key of ["role", "itemprop", "data-testid", "data-test"]) {
    const value = element.getAttribute(key);
    if (value && stable(value) && /^[\w -]+$/.test(value))
      add(`${tag}[${key}="${value}"]`, "attribute", false, 90);
  }
  // Presentation attributes become useful only together with a component scope.
  const variants = ["data-size", "data-line-clamp"]
    .map((key) => {
      const value = element.getAttribute(key);
      return value && stable(value) && /^[\w-]+$/.test(value)
        ? `[${key}="${value}"]`
        : "";
    })
    .join("");
  add(local, "similar", false, useful.length ? 80 : 10);
  if (variants && useful.length)
    add(`${local}${variants}`, "attribute", false, 85);
  classes.forEach(({ selector, quality }) =>
    add(
      selector,
      selector.startsWith(".") ? "class" : "structure",
      false,
      quality
    )
  );
  Array.from(element.classList)
    .filter((name) => !stable(name))
    .slice(0, 3)
    .forEach((name) => add(`.${escapeId(name)}`, "class", true));
  let parent = element.parentElement;
  for (
    let depth = 0;
    parent && parent !== document.body && depth < 4;
    depth++, parent = parent.parentElement
  ) {
    if (parent.id)
      add(
        `#${escapeId(parent.id)} ${local}`,
        "container",
        !stableId(parent.id),
        85
      );
    const cls = classDescriptors(parent).find((entry) => entry.quality >= 70);
    if (cls) {
      add(`${cls.selector} ${local}`, "container", false, 85);
      if (variants)
        add(`${cls.selector} ${local}${variants}`, "structure", false, 95);
    }
  }
  add(tag, "tag", false, 10);
  const parts = [];
  let node = element;
  while (node && node !== document.documentElement) {
    if (node.id) {
      parts.unshift(`#${escapeId(node.id)}`);
      if (queryPage(parts.join(" > ")).length === 1) break;
      parts.shift();
    }
    const currentTag = node.localName;
    const siblings = Array.from(node.parentElement?.children || []).filter(
      (s) => s.localName === currentTag
    );
    parts.unshift(
      `${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`
    );
    node = node.parentElement;
  }
  add(parts.join(" > "), "position", true);
  const all = Array.from(candidates.values()).sort(compareCandidates);
  const result = all.slice(0, 14);
  const recommended = recommendSelector(all);
  if (recommended && !result.includes(recommended)) {
    result[result.length - 1] = recommended;
    result.sort(compareCandidates);
  }
  return result;
}

export function ancestorElements(element) {
  const ancestors = [];
  for (
    let current = element;
    current && current !== document.documentElement;
    current = current.parentElement
  )
    ancestors.unshift(current);
  return ancestors;
}

export class RuleHighlights {
  constructor() {
    this.host = document.createElement("div");
    this.host.id = OVERLAY_ID;
    this.host.className = "notranslate";
    this.host.style.cssText =
      "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none";
    this.host.attachShadow({ mode: "open" }).append(this.canvas);
    document.documentElement.append(this.host);
    this.entries = [];
    this.observed = new Set();
    this.visible = new Set();
    this.visibility = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting) this.visible.add(target);
          else this.visible.delete(target);
        });
        this.schedule();
      },
      { rootMargin: "32px" }
    );
    this.schedule = () => {
      if (!this.frame)
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          this.draw();
        });
    };
    window.addEventListener("scroll", this.schedule, true);
    window.addEventListener("resize", this.schedule);
    this.resize = new ResizeObserver(this.schedule);
    if (document.body) this.resize.observe(document.body);
  }
  show(entries, activeElement = null) {
    this.entries = entries;
    this.activeElement = activeElement;
    const next = new Set(entries.map(({ element }) => element));
    for (const element of this.observed) {
      if (!next.has(element)) {
        this.visibility.unobserve(element);
        this.visible.delete(element);
      }
    }
    for (const element of next)
      if (!this.observed.has(element)) this.visibility.observe(element);
    this.observed = next;
    this.schedule();
  }
  draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    const ctx = this.canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    // Draw the active match last so overlapping containers cannot hide it.
    const active = this.entries.find(
      ({ element }) => element === this.activeElement
    );
    const entries = active
      ? [...this.entries.filter((entry) => entry !== active), active]
      : this.entries;
    for (const { element, excluded = false } of entries) {
      if (
        !this.visible.has(element) ||
        !element.isConnected ||
        getComputedStyle(element).visibility === "hidden"
      )
        continue;
      const current = element === this.activeElement;
      ctx.lineWidth = current ? 4 : 2;
      ctx.strokeStyle = current ? "#e11d48" : excluded ? "#d97706" : "#168aad";
      ctx.fillStyle = "rgba(225, 29, 72, 0.16)";
      ctx.setLineDash(excluded ? [5, 4] : []);
      for (const rect of element.getClientRects()) {
        if (
          !rect.width ||
          !rect.height ||
          rect.bottom < 0 ||
          rect.top > window.innerHeight ||
          rect.right < 0 ||
          rect.left > window.innerWidth
        )
          continue;
        if (current) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }
  destroy() {
    this.visibility.disconnect();
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    window.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
    this.host.remove();
  }
}
