import { supportsTouch } from "./touchCapability";
// Gesture recognition is independent from translation and never emulates a mouse.
export const touchParent = (node) =>
  node?.parentElement || node?.getRootNode?.()?.host;

const notOwned = () => false;
const interactiveSelector =
  "a, button, input, textarea, select, summary, [role='button'], [role='link'], [contenteditable]:not([contenteditable='false']), [data-kiss-touch-ui]";
const isHorizontalScroller = (node) =>
  node.scrollWidth > node.clientWidth + 1 &&
  /auto|scroll/.test(getComputedStyle(node).overflowX);

export function isTouchExcluded(
  node,
  isOwned = notOwned,
  cache = new Map(),
  scrollCache = new Map()
) {
  if (!node || node.nodeType !== 1) return false;
  if (cache.has(node)) return cache.get(node);
  if (!scrollCache.has(node)) scrollCache.set(node, isHorizontalScroller(node));
  const excluded =
    node.matches(interactiveSelector) ||
    (node.matches(".notranslate") && !isOwned(node)) ||
    scrollCache.get(node) ||
    isTouchExcluded(touchParent(node), isOwned, cache, scrollCache);
  cache.set(node, excluded);
  return excluded;
}

function containsHorizontalScroller(node, cache, scrollCache) {
  if (cache.has(node)) return cache.get(node);
  const result = Array.from(node.children).some((child) => {
    if (!scrollCache.has(child))
      scrollCache.set(child, isHorizontalScroller(child));
    return (
      scrollCache.get(child) ||
      containsHorizontalScroller(child, cache, scrollCache)
    );
  });
  cache.set(node, result);
  return result;
}

export class TouchParagraph {
  constructor({ resolve, toggle, isOwned = notOwned, allowed = () => true }) {
    this.resolve = resolve;
    this.isOwned = isOwned;
    this.allowed = allowed;
    this.candidates = new Set();
    this.pending = new Set();
    this.ownStyles = new WeakMap();
    this.frame = null;
    this.observer = null;
    this.roots = new Set();
    this.toggle = toggle;
    this.mode = "off";
    this.styles = new Map();
    this.pointers = new Set();
    this.listeners = [];
  }

  observe(node) {
    if (
      !node ||
      node.nodeType !== 1 ||
      node === document.body ||
      node === document.documentElement ||
      this.mode !== "swipe"
    )
      return;
    this.candidates.add(node);
    this.pending.add(node);
    const root = node.getRootNode();
    if (!this.roots.has(root)) {
      this.roots.add(root);
      this.observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "contenteditable"],
      });
    }
    this.schedule();
  }

  schedule() {
    if (this.frame === null)
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.flush();
      });
  }

  invalidate(target, subtree = false) {
    for (let ancestor = target; ancestor; ancestor = touchParent(ancestor)) {
      if (this.candidates.has(ancestor)) this.pending.add(ancestor);
    }
    if (subtree) {
      for (const node of this.candidates) {
        for (let ancestor = node; ancestor; ancestor = touchParent(ancestor)) {
          if (ancestor === target) {
            this.pending.add(node);
            break;
          }
        }
      }
    }
    if (this.pending.size) this.schedule();
  }

  flush() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.mode !== "swipe") return;
    const excluded = new Map(),
      descendants = new Map(),
      scrollers = new Map();
    const changes = [];
    // Complete every layout read before writing any touch-action styles.
    for (const node of this.pending) {
      const eligible =
        node.isConnected &&
        this.allowed(node) &&
        !isTouchExcluded(node, this.isOwned, excluded, scrollers) &&
        !containsHorizontalScroller(node, descendants, scrollers);
      if (
        eligible &&
        (!this.styles.has(node) ||
          node.style.getPropertyValue("touch-action") !== "pan-y pinch-zoom")
      )
        changes.push([
          node,
          [
            node.style.getPropertyValue("touch-action"),
            node.style.getPropertyPriority("touch-action"),
          ],
        ]);
      else if (!eligible && this.styles.has(node)) changes.push([node, null]);
      if (!node.isConnected) this.candidates.delete(node);
    }
    this.pending.clear();
    for (const [node, previous] of changes) {
      if (previous) {
        this.styles.set(node, previous);
        node.style.setProperty("touch-action", "pan-y pinch-zoom", "important");
      } else this.restore(node);
      this.ownStyles.set(node, node.getAttribute("style"));
    }
  }

  restore(node) {
    const previous = this.styles.get(node);
    if (!previous) return;
    if (node.style.getPropertyValue("touch-action") === "pan-y pinch-zoom") {
      if (previous[0]) node.style.setProperty("touch-action", ...previous);
      else node.style.removeProperty("touch-action");
    }
    this.styles.delete(node);
  }

  setMode(mode, direction = "right") {
    this.destroy();
    this.mode = supportsTouch() ? mode : "off";
    this.direction = direction;
    if (this.mode === "off") return;
    if (this.mode === "swipe") {
      this.observer = new MutationObserver((records) => {
        for (const record of records) {
          if (
            record.type === "attributes" &&
            record.attributeName === "style" &&
            this.ownStyles.has(record.target) &&
            this.ownStyles.get(record.target) ===
              record.target.getAttribute("style")
          )
            continue;
          this.invalidate(
            record.target.nodeType === 3
              ? record.target.parentElement
              : record.target,
            record.type === "attributes"
          );
          for (const removed of record.removedNodes || [])
            this.invalidate(removed, true);
        }
      });
    }
    const listen = (target, name, handler) => {
      target.addEventListener(name, handler, true);
      this.listeners.push(() =>
        target.removeEventListener(name, handler, true)
      );
    };
    listen(window, "resize", () => {
      for (const node of this.candidates) this.pending.add(node);
      if (this.pending.size) this.schedule();
    });
    const cancel = () => {
      this.gesture = null;
    };
    listen(document, "pointerdown", (event) => {
      this.click = null;
      if (event.pointerType !== "touch") return;
      this.pointers.add(event.pointerId);
      if (this.pointers.size !== 1 || window.getSelection()?.toString().trim())
        return cancel();
      const origin = event.composedPath()[0];
      if (isTouchExcluded(origin, this.isOwned)) return cancel();
      if (
        this.mode === "swipe" &&
        (event.clientX < 32 || event.clientX > window.innerWidth - 32)
      )
        return cancel();
      const node = this.resolve(origin);
      if (
        !node ||
        (this.mode === "swipe" &&
          (!this.styles.has(node) || this.pending.has(node)))
      )
        return cancel();
      this.gesture = {
        id: event.pointerId,
        node,
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
    });
    listen(document, "pointermove", (event) => {
      const g = this.gesture;
      if (!g || event.pointerId !== g.id) return;
      const dx = event.clientX - g.x,
        dy = event.clientY - g.y;
      if (
        Math.abs(dy) > (this.mode === "tap" ? 10 : 20) ||
        (this.mode === "tap" && Math.hypot(dx, dy) > 10)
      )
        cancel();
    });
    listen(document, "pointerup", (event) => {
      this.pointers.delete(event.pointerId);
      const g = this.gesture;
      if (!g || event.pointerId !== g.id) return;
      cancel();
      const dx = event.clientX - g.x,
        dy = event.clientY - g.y;
      const elapsed = Date.now() - g.time;
      const valid =
        this.mode === "tap"
          ? elapsed <= 300 && Math.hypot(dx, dy) <= 10
          : elapsed <= 700 &&
            Math.abs(dy) <= 20 &&
            dx * (this.direction === "left" ? -1 : 1) >= 60;
      if (
        !valid ||
        !g.node.isConnected ||
        window.getSelection()?.toString().trim()
      )
        return;
      if (this.toggle(g.node))
        this.click = {
          node: g.node,
          until: Date.now() + 500,
          x: event.clientX,
          y: event.clientY,
        };
    });
    listen(document, "pointercancel", (event) => {
      this.pointers.delete(event.pointerId);
      cancel();
    });
    listen(document, "scroll", cancel);
    listen(window, "blur", () => {
      this.pointers.clear();
      cancel();
    });
    listen(document, "visibilitychange", () => {
      this.pointers.clear();
      cancel();
    });
    listen(document, "contextmenu", cancel);
    listen(document, "click", (event) => {
      const click = this.click;
      this.click = null;
      if (!click || Date.now() > click.until || event.detail === 0) return;
      if (Math.hypot(event.clientX - click.x, event.clientY - click.y) > 10)
        return;
      if (!event.composedPath().includes(click.node)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    });
  }

  destroy() {
    this.listeners.splice(0).forEach((remove) => remove());
    this.observer?.disconnect();
    this.observer = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    for (const node of this.styles.keys()) this.restore(node);
    this.candidates.clear();
    this.pending.clear();
    this.roots.clear();
    this.ownStyles = new WeakMap();
    this.styles.clear();
    this.pointers.clear();
    this.gesture = null;
    this.click = null;
    this.mode = "off";
  }
}
