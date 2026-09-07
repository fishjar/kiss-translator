import { APP_LCNAME } from "../config/app";

const IMPORTANT = "important";
const FULLSCREEN_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "msfullscreenchange",
];
const UNSUPPORTED_FULLSCREEN_ROOTS = new Set([
  "area",
  "audio",
  "base",
  "br",
  "canvas",
  "col",
  "embed",
  "hr",
  "iframe",
  "img",
  "input",
  "link",
  "meta",
  "object",
  "param",
  "select",
  "source",
  "textarea",
  "track",
  "video",
  "wbr",
]);
export const SHADOW_HOST_ATTRIBUTE = `data-${APP_LCNAME}-shadow-host`;
const SHADOW_HOST_DISPOSE_EVENT = `${APP_LCNAME}-shadow-host-dispose`;
const movingShadowHosts = new WeakSet();

export function isShadowHostMoving(node) {
  for (
    let ancestor = node;
    ancestor;
    ancestor = ancestor.parentNode || ancestor.host
  ) {
    if (movingShadowHosts.has(ancestor)) return true;
  }
  return false;
}

export function isolateShadowHost(host) {
  if (!host) return host;

  host.setAttribute(SHADOW_HOST_ATTRIBUTE, "");
  host.style.setProperty("all", "initial", IMPORTANT);
  host.style.setProperty("display", "block", IMPORTANT);
  // Stay out of fullscreen flex/grid layout without creating a containing block
  // for fixed descendants or a stacking context around their overlays.
  host.style.setProperty("position", "absolute", IMPORTANT);
  host.style.setProperty("top", "0", IMPORTANT);
  host.style.setProperty("left", "0", IMPORTANT);
  host.style.setProperty("width", "0", IMPORTANT);
  host.style.setProperty("height", "0", IMPORTANT);
  host.style.setProperty("direction", "ltr", IMPORTANT);
  host.style.setProperty("unicode-bidi", "normal", IMPORTANT);
  return host;
}

export function setShadowHostVisible(host, visible) {
  if (!host) return;
  host.style.setProperty("display", visible ? "block" : "none", IMPORTANT);
}

// The DOM marker also lets a newer injected runtime retire an older host.
export function disposeShadowHost(host) {
  if (!host) return;
  host.setAttribute(SHADOW_HOST_ATTRIBUTE, "disposed");
  host.dispatchEvent(new Event(SHADOW_HOST_DISPOSE_EVENT));
}

function getFullscreenRoot(host) {
  const doc = host.ownerDocument;
  let fullscreenElement =
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement;

  while (fullscreenElement?.shadowRoot?.fullscreenElement) {
    fullscreenElement = fullscreenElement.shadowRoot.fullscreenElement;
  }

  if (
    !fullscreenElement?.isConnected ||
    fullscreenElement.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    UNSUPPORTED_FULLSCREEN_ROOTS.has(fullscreenElement.localName)
  ) {
    return doc.documentElement;
  }

  for (
    let ancestor = fullscreenElement;
    ancestor;
    ancestor = ancestor.parentNode || ancestor.host
  ) {
    if (ancestor === host) return doc.documentElement;
  }

  return fullscreenElement.shadowRoot || fullscreenElement;
}

function snapshotStyleRules(root, snapshots = []) {
  for (const element of root.querySelectorAll("*")) {
    if (element.localName === "style" && element.sheet) {
      try {
        snapshots.push({
          element,
          rules: Array.from(element.sheet.cssRules, (rule) => rule.cssText),
        });
      } catch {
        // An unreadable sheet must not prevent the other sheets from moving.
      }
    }
    if (element.shadowRoot) snapshotStyleRules(element.shadowRoot, snapshots);
  }
  if (root.shadowRoot) snapshotStyleRules(root.shadowRoot, snapshots);
  return snapshots;
}

function restoreStyleRules(host, snapshots) {
  for (const { element, rules } of snapshots) {
    let ancestor = element;
    while (ancestor && ancestor !== host) {
      ancestor = ancestor.parentNode || ancestor.host;
    }
    if (ancestor !== host) continue;

    const sheet = element.sheet;
    if (!sheet) continue;

    let currentRules;
    try {
      currentRules = Array.from(sheet.cssRules, (rule) => rule.cssText);
    } catch {
      continue;
    }

    let nextIndex = 0;
    for (const rule of rules) {
      const existingIndex = currentRules.indexOf(rule, nextIndex);
      if (existingIndex !== -1) {
        nextIndex = existingIndex + 1;
        continue;
      }

      try {
        sheet.insertRule(rule, nextIndex);
      } catch {
        // One rejected browser-specific rule must not block the other sheets.
        continue;
      }
      currentRules.splice(nextIndex, 0, rule);
      nextIndex += 1;
    }
  }
}

function snapshotFocusState(host) {
  let element = host.ownerDocument.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }

  let ancestor = element;
  while (ancestor && ancestor !== host) {
    ancestor = ancestor.parentNode || ancestor.host;
  }
  if (ancestor !== host || typeof element?.focus !== "function") return null;

  const scrollPositions = [];
  for (let node = element; node; node = node.parentNode || node.host) {
    if (node.nodeType === 1) {
      scrollPositions.push({
        element: node,
        top: node.scrollTop,
        left: node.scrollLeft,
      });
    }
  }

  return {
    element,
    selection:
      typeof element.selectionStart === "number"
        ? [
            element.selectionStart,
            element.selectionEnd,
            element.selectionDirection,
          ]
        : null,
    scrollPositions,
  };
}

function restoreFocusState(host, snapshot) {
  if (!snapshot) return;
  const { element, selection, scrollPositions } = snapshot;
  let ancestor = element;
  while (ancestor && ancestor !== host) {
    ancestor = ancestor.parentNode || ancestor.host;
  }
  if (ancestor !== host || !element.isConnected) return;

  element.focus({ preventScroll: true });
  if (selection) element.setSelectionRange(...selection);
  // Restoring selection can scroll a textarea even when focus prevents scrolling.
  for (const { element: scroller, top, left } of scrollPositions) {
    if (!scroller.isConnected) continue;
    scroller.scrollTop = top;
    scroller.scrollLeft = left;
  }
}

function moveShadowHost(host, root) {
  const snapshots = snapshotStyleRules(host);
  let moved = false;
  if (host.isConnected && typeof root.moveBefore === "function") {
    try {
      root.moveBefore(host, null);
      moved = true;
    } catch {
      // Older implementations can reject a move between different roots.
    }
  }

  if (moved) {
    // Either move can replace CSSStyleSheet objects and erase insertRule data.
    restoreStyleRules(host, snapshots);
    return;
  }

  const focusState = snapshotFocusState(host);
  movingShadowHosts.add(host);
  try {
    // Reparenting emits blur synchronously. Input handlers can ignore that blur
    // until the existing focused element and its editing state are restored.
    root.appendChild(host);
    restoreStyleRules(host, snapshots);
    restoreFocusState(host, focusState);
  } finally {
    movingShadowHosts.delete(host);
  }
}

export function mountShadowHost(host, rootElement, { onReconnect } = {}) {
  if (rootElement !== undefined) {
    rootElement.appendChild(host);
    return () => disposeShadowHost(host);
  }

  const doc = host.ownerDocument;
  let active = true;
  let mounted = false;
  let needsStyleRefresh = false;
  let observedAncestors = new Set();
  const observer = new MutationObserver((records) => {
    if (!active) return;
    const removedAncestor = records.some((record) =>
      Array.from(record.removedNodes).some((node) =>
        observedAncestors.has(node)
      )
    );
    if (!removedAncestor) return;
    // Removal and reinsertion in one task can leave the host connected by the
    // time this runs, even though its CSSOM was already discarded.
    needsStyleRefresh = true;
    reconcileRoot();
  });
  const observeFullscreenRoot = (root) => {
    observer.disconnect();
    observedAncestors = new Set([host]);
    if (root === doc.documentElement) return;

    // Watch only child lists along the fullscreen ancestor chain. No document
    // subtree scans or polling are needed to detect removal of this host.
    for (let node = root; node; node = node.parentNode || node.host) {
      observedAncestors.add(node);
      observer.observe(node, { childList: true });
    }
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    observer.disconnect();
    observedAncestors.clear();
    host.setAttribute(SHADOW_HOST_ATTRIBUTE, "disposed");
    host.removeEventListener(SHADOW_HOST_DISPOSE_EVENT, cleanup);
    FULLSCREEN_EVENTS.forEach((eventName) => {
      doc.removeEventListener(eventName, reconcileRoot);
    });
  };
  const reconcileRoot = () => {
    if (!active) return;
    if (host.getAttribute(SHADOW_HOST_ATTRIBUTE) === "disposed") {
      cleanup();
      return;
    }

    const refreshStyles = mounted && (!host.isConnected || needsStyleRefresh);
    const root = getFullscreenRoot(host);
    if (host.parentNode !== root) moveShadowHost(host, root);
    mounted = true;
    needsStyleRefresh = false;
    observeFullscreenRoot(root);
    // Page-owned removal can erase CSSOM before a move can snapshot it. Let the
    // owner refresh its style cache while keeping the existing React tree alive.
    if (refreshStyles && host.isConnected) onReconnect?.();
  };

  reconcileRoot();
  host.addEventListener(SHADOW_HOST_DISPOSE_EVENT, cleanup);
  FULLSCREEN_EVENTS.forEach((eventName) => {
    doc.addEventListener(eventName, reconcileRoot);
  });

  return cleanup;
}
