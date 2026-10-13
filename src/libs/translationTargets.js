// Shared, read-only traversal. The runtime attaches observers in `visit`;
// the editor only collects nodes. Neither traversal creates translation DOM.

// Not page prose. Kept even when the built-in ignore list is omitted
// (manual selectors, scan-all, and plain-text mode).
const NON_CONTENT_SELECTOR =
  "script, style, noscript, template, textarea, iframe";

export function isInNonContent(node) {
  const element = node?.nodeType === 3 ? node.parentElement : node;
  return Boolean(element?.closest?.(NON_CONTENT_SELECTOR));
}

export function visitTranslationTargets(root, options, visit) {
  const { autoScan, selector, ignoreSelector, isBlock, hasText, wrapperClass } =
    options;
  if (
    !root ||
    ![1, 11].includes(root.nodeType) ||
    isInNonContent(root) ||
    root.closest?.(ignoreSelector)
  )
    return;
  if (autoScan === "false") {
    if (!selector?.trim()) return;
    if (root.matches?.(selector)) visit(root);
    root.querySelectorAll(selector).forEach((node) => {
      if (!isInNonContent(node) && !node.closest(ignoreSelector)) visit(node);
    });
    return;
  }
  // An explicit stack also tolerates deeply nested dynamic pages.
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (isInNonContent(node) || node.matches?.(ignoreSelector)) continue;
    const text = hasText(node);
    const children = Array.from(node.children);
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
