// Shared, read-only traversal. The runtime attaches observers in `visit`;
// the editor only collects nodes. Neither traversal creates translation DOM.

// Not page prose. Kept even when the built-in ignore list is omitted
// (manual selectors, scan-all, and plain-text mode).
export const NON_CONTENT_SELECTOR =
  "script, style, noscript, template, textarea, iframe";

// Only used when the DOM implementation supplies no computed display value.
export const BLOCK_LAYOUT_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "CANVAS",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "NOSCRIPT",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TFOOT",
  "UL",
  "VIDEO",
]);

// Layout and content policy are independent: an ignored inline node is not a
// paragraph boundary, and an atomic inline box does not expose internal blocks.
export function getNodeLayout(node) {
  if (node?.nodeType === 11) return "contents";
  if (node?.nodeType !== 1) return "inline";
  const win = node.ownerDocument?.defaultView || window;
  const display = win.getComputedStyle(node).display;
  if (display === "none") return "hidden";
  if (display === "contents") return "contents";
  if (!display)
    return BLOCK_LAYOUT_TAGS.has(node.tagName.toUpperCase())
      ? "block"
      : "inline";
  if (display === "inline" || display === "inline flow") return "inline";
  if (
    display.startsWith("inline") ||
    display.startsWith("ruby") ||
    display === "math"
  )
    return "atomic";
  return "block";
}

// Inline flow and display:contents can contain real block boundaries. Walk
// either kind of wrapper, stopping at kept/ignored content and atomic boxes.
export function hasBlockLayout(
  node,
  isForcedBlock,
  isPreservedInline,
  readLayout = getNodeLayout
) {
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (isForcedBlock?.(current)) return true;
    const layout = readLayout(current);
    if (layout === "hidden" || layout === "atomic") continue;
    if (layout === "block") return true;
    const children = current.children;
    if (!children?.length || isPreservedInline?.(current)) continue;
    for (const child of children) stack.push(child);
  }
  return false;
}

export function isInNonContent(node) {
  const element = node?.nodeType === 3 ? node.parentElement : node;
  return Boolean(element?.closest?.(NON_CONTENT_SELECTOR));
}

export function isInlineHidden(node) {
  if (node?.nodeType !== 1) return false;
  const win = node.ownerDocument?.defaultView || window;
  return win.getComputedStyle(node).display === "none";
}

export function isInInlineHidden(node) {
  let current = node?.nodeType === 3 ? node.parentNode : node;
  while (current) {
    if (isInlineHidden(current)) return true;
    current = current.parentNode || current.host;
  }
  return false;
}

// Read the live source before translation-only mode moves it into a backup.
export function getInlineVisibleText(node, shouldSkipElement) {
  if (!node || isInInlineHidden(node)) return "";
  const parts = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (isInlineHidden(current)) continue;
    if (current.nodeType === 1 && shouldSkipElement?.(current)) continue;
    if (current.nodeType === 3) parts.push(current.textContent);
    else {
      const children = current.childNodes;
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
  return parts.join("");
}

export function cloneWithoutInlineHidden(node) {
  if (!node) return node;
  const clone = node.cloneNode(true);
  const stack = [[node, clone]];
  while (stack.length) {
    const [source, target] = stack.pop();
    if (source !== node && isInlineHidden(source)) {
      target.remove();
      continue;
    }
    Array.from(source.childNodes).forEach((child, index) => {
      const copy = target.childNodes[index];
      stack.push([child, copy]);
    });
  }
  return clone;
}

export function getPreservedInlineAncestor(node, isPreservedInline) {
  if (!isPreservedInline) return null;
  let preserved = null;
  for (let current = node; current; current = current.parentElement) {
    if (current.nodeType === 1 && isPreservedInline(current))
      preserved = current;
  }
  return preserved;
}

export function visitTranslationTargets(root, options, visit) {
  const {
    autoScan,
    selector,
    ignoreSelector,
    isBlock,
    hasText,
    wrapperClass,
    isPreservedInline,
    getLayout = getNodeLayout,
  } = options;
  const isHidden = (node) => getLayout(node) === "hidden";
  if (
    !root ||
    ![1, 11].includes(root.nodeType) ||
    isInInlineHidden(root) ||
    root.closest?.(ignoreSelector) ||
    getPreservedInlineAncestor(root, isPreservedInline)
  )
    return;
  if (autoScan === "false") {
    if (!selector?.trim()) return;
    if (root.matches?.(selector)) visit(root);
    root.querySelectorAll(selector).forEach((node) => {
      if (
        !isInInlineHidden(node) &&
        !node.closest(ignoreSelector) &&
        !getPreservedInlineAncestor(node, isPreservedInline)
      )
        visit(node);
    });
    return;
  }
  // An explicit stack also tolerates deeply nested dynamic pages.
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (
      isHidden(node) ||
      node.matches?.(ignoreSelector) ||
      isPreservedInline?.(node)
    )
      continue;
    const text = hasText(node);
    const children = Array.from(node.children).filter(
      (child) => !isHidden(child)
    );
    if (
      !text &&
      children.length === 1 &&
      !isPreservedInline?.(children[0]) &&
      !children[0].classList.contains(wrapperClass)
    ) {
      stack.push(children[0]);
      continue;
    }
    const block = children.some(isBlock);
    if (text || !block) visit(node);
    if (block) {
      for (let i = children.length - 1; i >= 0; i--) {
        if (!text || isBlock(children[i])) stack.push(children[i]);
      }
    }
  }
}
