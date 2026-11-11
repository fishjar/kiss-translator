import { scriptFocus } from "../hooks/focusModality";

export const getMenuActiveElement = (menu) =>
  menu?.getRootNode()?.activeElement || menu?.ownerDocument?.activeElement;

// 菜单打开期焦点交接的统一候选口径：选中项族 + 可聚焦条目族，
// 全部排除 .Mui-disabled、aria-disabled 与原生 disabled（MUI 禁用项前两者
// 兼备，双闸防漏；原生 disabled 属第三种形态，只挡前两者会漏选禁用项）。
// 候选角色集与键盘导航的 [role^="menuitem"] + [role="option"] 对齐。
const SELECTED_TARGET_SELECTOR =
  '[role="option"][aria-selected="true"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), [role="menuitemradio"][aria-checked="true"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), .MuiMenuItem-root.Mui-selected:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled)';
const AVAILABLE_TARGET_SELECTOR =
  '[role="menuitem"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), [role="menuitemcheckbox"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), [role="menuitemradio"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), [role="radio"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), [role="option"]:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled), .MuiMenuItem-root:not(.Mui-disabled):not([aria-disabled="true"]):not(:disabled)';

// 元素实际可见性（两组焦点候选共用）：hidden 属性只是派生态之一，
// 自身或祖先链上的 display:none / visibility:hidden 同样不可聚焦，
// 而 CSS 选择器无法表达祖先态。沿 parentElement 上行至 boundary（menu
// 或 paper）为止——菜单外的祖先布局与候选可见性无关，不读它们的
// 计算样式；boundary 自身仍参与判定。getComputedStyle 不可用时
// （极老环境）退化为 hidden 判定。
const isElementVisible = (element, boundary) => {
  if (element.hidden) return false;
  let node = element;
  while (node) {
    if (node.nodeType === 1) {
      const style = node.ownerDocument?.defaultView?.getComputedStyle?.(node);
      if (
        style &&
        (style.display === "none" || style.visibility === "hidden")
      ) {
        return false;
      }
    }
    if (node === boundary) return true;
    node = node.parentElement || node.getRootNode?.()?.host || null;
  }
  return true;
};

/**
 * 菜单打开期的脚本化焦点交接（PopupMenu.focusFirstItem、Selection 的
 * focusSelectedOption 与 Options/DropdownRoot 挂载期 effect 三处共用）：
 * ① 守卫——Paper 内已有焦点（含 ShadowRoot.activeElement 判据）则让位，
 * 不把键盘光标位置强行拉回选中项；② 按调用方策略选目标（选中项 first/last，
 * 无则落可用条目族；无任何可聚焦项不聚焦容器）；③ scriptFocus 聚焦后用
 * getBoundingClientRect 视口增量把目标滚入 Paper 可视区——不依赖 offsetTop
 * （MUI 弹层 offsetParent 未必是 paper，会算错），只动 paper.scrollTop，
 * 不碰外层页面滚动。
 */
export function focusMenuTarget(
  paper,
  { pick = "first", reclaim = false } = {}
) {
  if (!paper) return null;
  const active = getMenuActiveElement(paper);
  if (!reclaim && active && paper.contains(active)) return null;
  // 已选目标按 getMenuItems 同口径先做实际可见性过滤：选择器不吃 hidden
  // 派生态，也表达不了祖先链上的 display:none / visibility:hidden，不可见
  // 的已选项会抢走初始焦点；可见已选为空再回退可用条目族。
  const selected = Array.from(
    paper.querySelectorAll(SELECTED_TARGET_SELECTOR)
  ).filter((item) => isElementVisible(item, paper));
  const ordered = pick === "last" ? selected.reverse() : selected;
  const fallback = Array.from(
    paper.querySelectorAll(AVAILABLE_TARGET_SELECTOR)
  ).find((item) => isElementVisible(item, paper));
  const target = ordered[0] ?? fallback ?? null;
  scriptFocus(target);
  if (target) {
    const t = target.getBoundingClientRect();
    const s = paper.getBoundingClientRect();
    // Grow 缩放过渡期 rect 为视觉坐标：按 paper 视觉/布局高度比把纵向差值
    // 换算回布局坐标再叠加居中偏移；高度不可用按 1 兜底。
    const ratio =
      s.height > 0 && paper.offsetHeight > 0
        ? s.height / paper.offsetHeight
        : 1;
    paper.scrollTop +=
      (t.top - s.top) / ratio - (paper.clientHeight - target.offsetHeight) / 2;
  }
  return target;
}

const getMenuItems = (menu) =>
  Array.from(
    menu.querySelectorAll('[role^="menuitem"], [role="option"]')
  ).filter(
    (item) =>
      !item.disabled &&
      item.getAttribute("aria-disabled") !== "true" &&
      isElementVisible(item, menu)
  );

// Capture navigation before MUI reads document.activeElement, which is the host
// when focus belongs to a shadow tree. Leave activation and dismissal to callers.
export function createMenuKeyDownHandler({
  shadowOnly = false,
  disableListWrap = false,
} = {}) {
  let previousMenu;
  let prefix = "";
  let lastKeyTime = 0;

  return (event) => {
    const menu = event.currentTarget;
    if (shadowOnly && !menu.getRootNode()?.host) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing)
      return;

    if (menu !== previousMenu) {
      previousMenu = menu;
      prefix = "";
      lastKeyTime = 0;
    }

    const items = getMenuItems(menu);
    if (!items.length) return;
    const currentIndex = items.indexOf(getMenuActiveElement(menu));
    let nextIndex;

    switch (event.key) {
      case "ArrowDown":
        nextIndex = disableListWrap
          ? Math.min(currentIndex + 1, items.length - 1)
          : (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex = disableListWrap
          ? Math.max(currentIndex - 1, 0)
          : currentIndex <= 0
            ? items.length - 1
            : currentIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default: {
        // Space activates a menu item instead of joining the search prefix.
        if (event.key.length !== 1 || event.key === " ") return;
        const now = Date.now();
        if (now - lastKeyTime > 500) prefix = "";
        lastKeyTime = now;
        prefix += event.key.toLocaleLowerCase();
        const repeating = [...prefix].every((key) => key === prefix[0]);
        const search = repeating ? prefix[0] : prefix;
        const startIndex = repeating
          ? currentIndex + 1
          : Math.max(currentIndex, 0);

        for (let offset = 0; offset < items.length; offset += 1) {
          const index = (startIndex + offset) % items.length;
          const label = (
            items[index].innerText ||
            items[index].textContent ||
            ""
          )
            .trim()
            .toLocaleLowerCase();
          if (label.startsWith(search)) {
            nextIndex = index;
            break;
          }
        }
        // An unmatched prefix must not reach MUI's document-based navigation.
        event.stopPropagation();
        if (nextIndex === undefined) return;
      }
    }

    event.preventDefault();
    event.stopPropagation();
    items[nextIndex].focus();
  };
}
