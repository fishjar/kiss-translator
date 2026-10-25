// Shared, read-only traversal. The runtime attaches observers in `visit`;
// the editor only collects nodes. Neither traversal creates translation DOM.

// Not page prose. Kept even when the built-in ignore list is omitted
// (manual selectors, scan-all, and plain-text mode).
export const NON_CONTENT_SELECTOR =
  "script, style, noscript, template, textarea, iframe";

export function isInNonContent(node) {
  const element = node?.nodeType === 3 ? node.parentElement : node;
  return Boolean(element?.closest?.(NON_CONTENT_SELECTOR));
}

export function isInlineHidden(node) {
  return node?.style?.display === "none";
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

export function visitTranslationTargets(root, options, visit) {
  const { autoScan, selector, ignoreSelector, isBlock, hasText, wrapperClass } =
    options;
  if (
    !root ||
    ![1, 11].includes(root.nodeType) ||
    isInNonContent(root) ||
    isInInlineHidden(root) ||
    root.closest?.(ignoreSelector)
  )
    return;
  if (autoScan === "false") {
    if (!selector?.trim()) return;
    if (root.matches?.(selector)) visit(root);
    root.querySelectorAll(selector).forEach((node) => {
      if (
        !isInNonContent(node) &&
        !isInInlineHidden(node) &&
        !node.closest(ignoreSelector)
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
      isInNonContent(node) ||
      isInlineHidden(node) ||
      node.matches?.(ignoreSelector)
    )
      continue;
    const text = hasText(node);
    const children = Array.from(node.children).filter(
      (child) => !isInlineHidden(child)
    );
    if (
      !text &&
      children.length === 1 &&
      !isInNonContent(children[0]) &&
      !children[0].classList.contains(wrapperClass)
    ) {
      stack.push(children[0]);
      continue;
    }
    const contentChildren = children.filter((child) => !isInNonContent(child));
    const block = contentChildren.some(isBlock);
    // A parent of only embedded code is not a host, so selectStyle cannot
    // unhide it. Empty elements and real inline text stay hosts.
    if (
      (text || !block) &&
      (text || contentChildren.length > 0 || children.length === 0)
    ) {
      visit(node);
    }
    if (block) {
      for (let i = contentChildren.length - 1; i >= 0; i--) {
        if (!text || isBlock(contentChildren[i])) {
          stack.push(contentChildren[i]);
        }
      }
    }
  }
}
