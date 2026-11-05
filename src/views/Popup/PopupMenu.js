import Menu from "@mui/material/Menu";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scriptFocus } from "../../hooks/focusModality";

const focusFirstItem = (paper) => {
  if (!paper) return;
  // 样式网格场景 PopupCont 打开路径已把焦点交给网格项；本函数的兜底会把焦点
  // 抢到 role="menu" 的 MenuList 上，令网格方向键导航失效（网格 chip 是
  // aria-pressed 普通按钮，不命中 menuitem/option selector，必落 MenuList 兜底）。
  // shadow 宿主下 document.activeElement 只返回 shadow host（本仓
  // TextareaResizeGrip.js activeElementOf 同口径）：取 paper 所属文档片段
  // （ShadowRoot 或 document）的 activeElement，守卫在生产 shadow popup 内
  // 才认得出网格 chip 的焦点。
  const root =
    typeof paper.getRootNode === "function" ? paper.getRootNode() : null;
  const activeElement =
    root?.activeElement ?? paper.ownerDocument.activeElement;
  if (activeElement && paper.contains(activeElement)) return;
  const target =
    paper.querySelector(
      '[role="option"][aria-selected="true"]:not(.Mui-disabled), .MuiMenuItem-root.Mui-selected:not(.Mui-disabled)'
    ) ||
    paper.querySelector(
      '[role="menuitem"]:not(.Mui-disabled), [role="menuitemcheckbox"]:not(.Mui-disabled), [role="radio"]:not(.Mui-disabled), .MuiMenuItem-root:not(.Mui-disabled)'
    ) ||
    paper.querySelector('[role="menu"], [role="listbox"]');
  scriptFocus(target);
};

/** Keep popup menus outside the scrolling panel and within its viewport. */
export default function PopupMenu({
  anchorEl,
  open,
  onClose,
  children,
  className = "",
  id,
  ariaLabel,
  maxHeight = 320,
  estimatedHeight = 200,
  align = "auto",
  direction = "auto",
  position,
  menuRole = "menu",
}) {
  // 焦点约束的判据取菜单最终挂载容器的根节点，而非锚点的根节点：容器解析
  // （closest(".kt-m3-root") || body）可能把菜单挂回 document（锚点在影子内
  // 但影子内无 .kt-m3-root），此时焦点约束必须保持；仅当菜单实际落在
  // ShadowRoot 中才禁用 enforceFocus——影子拓扑下 MUI 焦点陷阱在 document 级
  // focusin 里把影子内目标重定向为宿主，误判"焦点离开弹层"而把焦点拽到
  // Paper 根上，吞掉 scriptFocus 交给网格 chip/菜单项的焦点（同款问题与解法
  // 见 TranForm selectMenuProps 的 disableEnforceFocus 在册注释）。跨 realm
  // 锚点（另一 window 的 ShadowRoot）以 host 存在性判定（instanceof 会漏判）。
  const resolveMenuContainer = () =>
    anchorEl?.closest(".kt-m3-root") || anchorEl?.ownerDocument.body;
  const isShadowMenu = Boolean(resolveMenuContainer()?.getRootNode?.()?.host);
  const [placement, setPlacement] = useState(null);
  const placementReady = placement !== null;
  const paperRef = useRef(null);
  const positionTop = position?.top;
  const positionLeft = position?.left;
  useLayoutEffect(() => {
    if (!open || !anchorEl) return undefined;
    const update = () => {
      let rect = anchorEl.getBoundingClientRect();
      const viewport = anchorEl.ownerDocument.defaultView;
      const scrollingElement = anchorEl.ownerDocument.scrollingElement;
      const minimumHeight = Math.min(60, estimatedHeight, maxHeight);
      // In a short native popup, make room for at least one style row before
      // positioning downward. Injected panels must not scroll the host page.
      if (
        direction === "down" &&
        positionTop === undefined &&
        anchorEl.ownerDocument.documentElement.classList.contains(
          "kt-toolbar-popup"
        ) &&
        scrollingElement
      ) {
        const missing =
          minimumHeight - (viewport.innerHeight - rect.bottom - 12);
        const remaining =
          scrollingElement.scrollHeight -
          scrollingElement.clientHeight -
          scrollingElement.scrollTop;
        const distance = Math.min(missing, remaining);
        if (distance > 0) {
          viewport.scrollBy({ top: Math.ceil(distance), behavior: "instant" });
          rect = anchorEl.getBoundingClientRect();
        }
      }
      const below = Math.max(0, viewport.innerHeight - rect.bottom - 12);
      const above = Math.max(0, rect.top - 12);
      const upwards =
        direction === "auto" &&
        positionTop === undefined &&
        below < Math.min(estimatedHeight, maxHeight) &&
        above > below;
      const right =
        align === "right" ||
        (align === "auto" &&
          rect.left + rect.width / 2 > viewport.innerWidth / 2);
      setPlacement({
        top: positionTop ?? (upwards ? rect.top - 4 : rect.bottom + 4),
        left: positionLeft ?? (right ? rect.right : rect.left),
        vertical: upwards ? "bottom" : "top",
        horizontal: right ? "right" : "left",
        height: Math.max(
          direction === "down" ? 0 : 36,
          Math.min(
            maxHeight,
            positionTop !== undefined
              ? viewport.innerHeight - positionTop - 8
              : upwards
                ? above
                : Math.floor(below)
          )
        ),
      });
    };
    update();
    const viewport = anchorEl.ownerDocument.defaultView;
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update, true);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update, true);
    };
  }, [
    open,
    anchorEl,
    maxHeight,
    estimatedHeight,
    align,
    direction,
    positionTop,
    positionLeft,
  ]);
// MUI's own auto-focus moves focus into the list on every open, including
// pointer opens, so Chromium hands the item :focus-visible and a focus ring
// appears that nobody asked for. Ownership of that focus move (and of whether
// the ring shows) belongs to scriptFocus(), so MUI autofocus is switched off.

  useEffect(() => {
    if (!open || !anchorEl || !placementReady) return undefined;
    const frame = requestAnimationFrame(() => focusFirstItem(paperRef.current));
    return () => cancelAnimationFrame(frame);
  }, [open, anchorEl, placementReady]);

  // Unmount immediately on dismissal. Changing a portal's container during
  // MUI's exit transition can leave an invisible modal intercepting clicks.
  if (!open || !anchorEl || !placement) return null;
  return (
    <Menu
      id={id}
      open
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        placement ? { top: placement.top, left: placement.left } : undefined
      }
      transformOrigin={{
        vertical: placement?.vertical || "top",
        horizontal: placement?.horizontal || "left",
      }}
      container={resolveMenuContainer}
      disableScrollLock
      marginThreshold={8}
      transitionDuration={0}
      sx={{ zIndex: 2147483647 }}
      // 三键同给缺一不可（对齐 TranForm selectMenuProps 在册契约）：
      // autoFocus=false 关 Menu.js:192 的 MenuList 容器聚焦腿；disableAutoFocusItem
      // 关项腿；disableAutoFocus 让 Popover/Modal 不再自己拓焦——焦点交接只归
      // 本组件的 scriptFocus（focusFirstItem）。
      autoFocus={false}
      disableAutoFocus
      disableAutoFocusItem
      disableEnforceFocus={isShadowMenu}
      PaperProps={{
        ref: paperRef,
        className: `kt-popup-menu ${className}`,
        elevation: 0,
        style: {
          maxHeight: placement?.height,
          maxWidth: "calc(100% - 16px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
        },
      }}
      MenuListProps={{
        "aria-label": ariaLabel,
        role: menuRole,
        dense: true,
      }}
    >
      {children}
    </Menu>
  );
}
