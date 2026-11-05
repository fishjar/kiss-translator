/**
 * 焦点环模态单源。
 *
 * 浏览器对脚本化聚焦沿用上一次交互的模态：鼠标点开下拉时把焦点移到选中项、
 * 关闭时送回触发器，`:focus-visible` 因此在纯鼠标路径上命中，长出用户从未
 * 请求的焦点框。本模块把模态变成显式事实——pointerdown 置假、键盘导航键置真；
 * 由脚本移动焦点一律经 scriptFocus()，指针模态下给落点元素挂一次性
 * data-kt-focus-silent，由 M3_GLOBAL_CSS 的抑制规则清零其 :focus-visible 绘制，
 * 并在该元素 focusout 时自动摘除，故"指针打开后再按方向键"仍照常出现环。
 */
export const FOCUS_SILENT_ATTR = "data-kt-focus-silent";

const KEYBOARD_NAV_KEYS = new Set([
  "Tab",
  "Enter",
  " ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Escape",
]);

let keyboardModality = false;
const listeners = new Set();
// per-document 注册表：每个 document 各持一份独立 handlers，第二个 document
// 安装不再静默摘掉第一个 document 的监听（对齐 M3Theme 的 per-document 契约）。
const installedHandlers = new Map();

const isEditableTarget = (target) => {
  if (!target || typeof target.tagName !== "string") return false;
  const tag = target.tagName.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
};

// 扩展自有文档（chrome-extension: / moz-extension: / safari-web-extension:）
// 整体在作用域内；宿主页面限挂在 .kt-m3-root 或 .kt-focus-silent-scope
// （M3Theme 外的自建域，如 FileTranslate）下的扩展自有 UI。
const isExtensionOwnedDocument = (doc) =>
  /-extension:$/.test(doc?.defaultView?.location?.protocol ?? "");

// 生产拓扑把 .kt-m3-root 放在 shadowRoot 内，document 捕获到的 event.target
// 却重定向为外层 host；只查 host.closest 会漏掉整个扩展 UI。composedPath
// 同时包含 shadow 内真实节点与 light 侧宿主链，两种挂载形态都可命中各自的根。
// 字幕菜单挂在宿主 YouTube 文档 #kiss-subtitle-menus（根 div 类
// kt-subtitle-menus），M3Theme/State 的安装路径均不覆盖该文档，故该挂载点
// 单独入列。
const isExtensionUiEvent = (event) => {
  if (isExtensionOwnedDocument(event?.target?.ownerDocument)) return true;
  const path = event?.composedPath?.();
  return (path?.length ? path : [event?.target]).some(
    (node) =>
      typeof node?.closest === "function" &&
      node.closest(".kt-m3-root, .kt-focus-silent-scope, .kt-subtitle-menus") !=
        null
  );
};

function setKeyboardModality(next) {
  if (keyboardModality === next) return;
  keyboardModality = next;
  for (const listener of listeners) listener();
}

export function isKeyboardModality() {
  return keyboardModality;
}

export function subscribeFocusModality(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notePointerInteraction() {
  setKeyboardModality(false);
}

// shadow 组合事件冒泡出根后 event.target 重定向为 shadow host，须取派发原始节点。
const resolveRealTarget = (event) => event?.composedPath?.()[0] ?? event?.target ?? null;

// 生产拓扑把扩展 UI 挂在 shadowRoot 内，document.activeElement 只到宿主元素，
// 静默标记却落在 shadow 内的真实节点上；不下钻就摘不到标记，键盘环永久缺席。
// 逐层取 shadowRoot.activeElement；同节点自指即停，防御异常实现造成死循环。
function deepActiveElement(ownerDocument) {
  let node = ownerDocument?.activeElement ?? null;
  while (node?.shadowRoot && node.shadowRoot.activeElement) {
    if (node.shadowRoot.activeElement === node) break;
    node = node.shadowRoot.activeElement;
  }
  return node;
}

// 指针模态下挂的静默标记只对指针语境成立：一旦转入键盘模态，残留标记会继续
// 吞掉 :focus-visible 绘制。只在 pointer→keyboard 的真实跃迁上摘除，避免覆盖
// 调用方显式 scriptFocus(…, { silent: true }) 的有意抑制（其清理仍归 focusout）。
// 事件无 target 时回退到已安装的文档或全局 document（契约：无任何文档可查即真正"解析不出宿主文档"，只翻模态）。
function revealActiveSilentFocus(ownerDocument) {
  const doc = ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return;
  const active = deepActiveElement(doc);
  if (active && active.hasAttribute?.(FOCUS_SILENT_ATTR)) {
    active.removeAttribute(FOCUS_SILENT_ATTR);
  }
}

function enterKeyboardModality(ownerDocument) {
  const transitioning = !keyboardModality;
  setKeyboardModality(true);
  if (transitioning) revealActiveSilentFocus(ownerDocument);
}

export function noteKeyboardInteraction(event) {
  const realTarget = resolveRealTarget(event);
  const ownerDocument =
    realTarget?.ownerDocument ?? event?.target?.ownerDocument ?? null;
  if (event && event.key === "Tab") {
    enterKeyboardModality(ownerDocument);
    return;
  }
  if (!event || isEditableTarget(realTarget)) return;
  if (KEYBOARD_NAV_KEYS.has(event.key)) enterKeyboardModality(ownerDocument);
}

function handleFocusIn(event) {
  // 键盘模态不做元素级标记，键盘环由既有环族照常驱动。
  // shadow 组合事件冒泡出根后 event.target 重定向为 shadow host，须取派发原始节点。
  if (keyboardModality) return;
  const target = resolveRealTarget(event);
  // M3_GLOBAL_CSS 的 focus-silent 抑制规则一旦注入宿主文档即全文档生效，
  // 作用域外目标（宿主页面普通元素）不得挂标记/注册 focusout 监听。
  if (!isExtensionUiEvent(event)) return;
  markSilentFocus(target);
}

/** 安装模态监听；同一 document 重复调用为幂等空操作。 */
export function installFocusModality(ownerDocument) {
  const doc =
    ownerDocument || (typeof document === "undefined" ? null : document);
  if (!doc || typeof doc.addEventListener !== "function") return false;
  if (installedHandlers.has(doc)) return true;
  const handlers = {
    pointerdown: () => notePointerInteraction(),
    keydown: (event) => noteKeyboardInteraction(event),
    focusin: handleFocusIn,
  };
  doc.addEventListener("pointerdown", handlers.pointerdown, true);
  doc.addEventListener("keydown", handlers.keydown, true);
  doc.addEventListener("focusin", handlers.focusin, true);
  installedHandlers.set(doc, handlers);
  return true;
}

/** 卸载模态监听：无参＝清理全部 document（向后兼容既有测试）；传 doc＝只清该 document。返回是否清理了任何一项。 */
export function uninstallFocusModality(targetDocument) {
  if (targetDocument === undefined) {
    let cleaned = false;
    for (const [doc, handlers] of installedHandlers) {
      doc.removeEventListener("pointerdown", handlers.pointerdown, true);
      doc.removeEventListener("keydown", handlers.keydown, true);
      doc.removeEventListener("focusin", handlers.focusin, true);
      installedHandlers.delete(doc);
      cleaned = true;
    }
    return cleaned;
  }
  const handlers = installedHandlers.get(targetDocument);
  if (!handlers) return false;
  targetDocument.removeEventListener("pointerdown", handlers.pointerdown, true);
  targetDocument.removeEventListener("keydown", handlers.keydown, true);
  targetDocument.removeEventListener("focusin", handlers.focusin, true);
  installedHandlers.delete(targetDocument);
  return true;
}

function clearSilentFocus(event) {
  event.currentTarget?.removeAttribute?.(FOCUS_SILENT_ATTR);
}

/** 给元素挂一次性静默标记；已挂载则不重复注册监听。 */
export function markSilentFocus(element) {
  if (!element || typeof element.setAttribute !== "function") return false;
  if (element.getAttribute(FOCUS_SILENT_ATTR) === "true") return true;
  element.setAttribute(FOCUS_SILENT_ATTR, "true");
  element.addEventListener("focusout", clearSilentFocus, { once: true });
  return true;
}

/**
 * 脚本化聚焦的唯一入口。
 * silent 缺省由模态决定（指针态静默、键盘态不静默）；显式传 true/false 可覆盖。
 * 返回是否真的执行了 focus()，调用方不得据此改变业务分支。
 */
export function scriptFocus(element, options = {}) {
  if (!element || typeof element.focus !== "function") return false;
  installFocusModality(element.ownerDocument);
  const silent =
    options.silent === undefined ? !keyboardModality : Boolean(options.silent);
  if (options.preventScroll === false) element.focus();
  else element.focus({ preventScroll: true });
  // focus 失败时 focusin 不派发、focusout 永不发生，无条件标记会留下永不
  // 清理的 data-kt-focus-silent，抑制后续真实键盘聚焦。getRootNode 对 light
  // DOM 返回 document、对 shadow 内元素返回 ShadowRoot（两者均有
  // activeElement），对游离元素返回其自身/片段（无 activeElement → 不标记）。
  const root =
    typeof element.getRootNode === "function" ? element.getRootNode() : null;
  const landed = root != null && root.activeElement === element;
  // silent:false 是调用方对"本次聚焦必须出环"的显式声明：先前遗留的标记必须
  // 当场失效。与 silent:true 同一时序约束——只在 landed 之后处置标记，focus
  // 未落地时既不留下也不清除任何痕迹。
  if (silent && landed) markSilentFocus(element);
  else if (landed) element.removeAttribute(FOCUS_SILENT_ATTR);
  return true;
}
