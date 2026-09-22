// Shared, read-only traversal. The runtime attaches observers in `visit`;
// the editor only collects nodes. Neither traversal creates translation DOM.
export function visitTranslationTargets(root, options, visit) {
  const { autoScan, selector, ignoreSelector, isBlock, hasText, wrapperClass } =
    options;
  if (
    !root ||
    ![1, 11].includes(root.nodeType) ||
    root.closest?.(ignoreSelector)
  )
    return;
  if (autoScan === "false") {
    if (!selector?.trim()) return;
    if (root.matches?.(selector)) visit(root);
    root.querySelectorAll(selector).forEach((node) => {
      if (!node.closest(ignoreSelector)) visit(node);
    });
    return;
  }
  // An explicit stack also tolerates deeply nested dynamic pages.
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.matches?.(ignoreSelector)) continue;
    const text = hasText(node);
    if (
      !text &&
      node.children.length === 1 &&
      !node.children[0].classList.contains(wrapperClass)
    ) {
      stack.push(node.children[0]);
      continue;
    }
    const children = Array.from(node.children);
    const block = children.some(isBlock);
    if (text || !block) visit(node);
    if (block) {
      for (let i = children.length - 1; i >= 0; i--) {
        if (!text || isBlock(children[i])) stack.push(children[i]);
      }
    }
  }
}
