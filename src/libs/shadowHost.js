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

export function isolateShadowHost(host) {
  if (!host) return host;

  host.setAttribute(SHADOW_HOST_ATTRIBUTE, "");
  host.style.setProperty("all", "initial", IMPORTANT);
  host.style.setProperty("display", "block", IMPORTANT);
  host.style.setProperty("direction", "ltr", IMPORTANT);
  host.style.setProperty("unicode-bidi", "normal", IMPORTANT);
  return host;
}

export function setShadowHostVisible(host, visible) {
  if (!host) return;
  host.style.setProperty("display", visible ? "block" : "none", IMPORTANT);
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

  if (!moved) root.appendChild(host);
  // Either move can replace CSSStyleSheet objects and erase insertRule data.
  restoreStyleRules(host, snapshots);
}

export function mountShadowHost(host, rootElement) {
  if (rootElement !== undefined) {
    rootElement.appendChild(host);
    return () => {};
  }

  const doc = host.ownerDocument;
  const reconcileRoot = () => {
    const root = getFullscreenRoot(host);
    if (host.parentNode !== root) moveShadowHost(host, root);
  };
  const handleFullscreenChange = () => {
    // A directly removed host belongs to a disposed or stale manager.
    if (host.parentNode) reconcileRoot();
  };

  reconcileRoot();
  FULLSCREEN_EVENTS.forEach((eventName) => {
    doc.addEventListener(eventName, handleFullscreenChange);
  });

  return () => {
    FULLSCREEN_EVENTS.forEach((eventName) => {
      doc.removeEventListener(eventName, handleFullscreenChange);
    });
  };
}
