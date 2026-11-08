import Menu from "@mui/material/Menu";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scriptFocus } from "../../hooks/focusModality";
import { createMenuKeyDownHandler } from "../../libs/menuFocus";

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
  // 初始焦点优先级：选中 option → Mui-selected MenuItem → menuitem 族。
  // 排除 ARIA 禁用项：自绘 menuitem/menuitemcheckbox 可只带 aria-disabled
  // 而无 .Mui-disabled 类，仅排类会漏——两腿均加 :not([aria-disabled="true"])，
  // querySelector 取首个命中即自动落后续可用项。
  // 容器兜底禁令：找不到可聚焦项就不聚焦（宁缺勿错，容器零焦点同源）；
  // 砍掉 paper.querySelector('[role="menu"], [role="listbox"]') 容器兜底腿，
  // 避免焦点误入 MenuList 本体。
  const target =
    paper.querySelector(
      '[role="option"][aria-selected="true"]:not(.Mui-disabled):not([aria-disabled="true"]), .MuiMenuItem-root.Mui-selected:not(.Mui-disabled):not([aria-disabled="true"])'
    ) ||
    paper.querySelector(
      '[role="menuitem"]:not(.Mui-disabled):not([aria-disabled="true"]), [role="menuitemcheckbox"]:not(.Mui-disabled):not([aria-disabled="true"]), [role="radio"]:not(.Mui-disabled):not([aria-disabled="true"]), [role="option"]:not(.Mui-disabled):not([aria-disabled="true"]), .MuiMenuItem-root:not(.Mui-disabled):not([aria-disabled="true"])'
    );
  scriptFocus(target);
  // scriptFocus 缺省 preventScroll:true（脚本聚焦不拖宿主页面），聚焦后当前项若
  // 在折线外，焦点就与滚动条脱节：重开时"焦点在末项、滚动条仍在顶部"。必须在
  // paper 内把它滚入视区。用视口矩形算增量、只加到 paper.scrollTop：不依赖
  // offsetTop（MUI 弹层 offsetParent 未必是 paper，会算错），也不碰外层页面滚动。
  if (target) {
    const t = target.getBoundingClientRect();
    const s = paper.getBoundingClientRect();
    paper.scrollTop +=
      t.top - s.top - (paper.clientHeight - target.offsetHeight) / 2;
  }
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
  paperMaxWidth = "calc(100% - 16px)",
}) {
  // 焦点约束的判据取菜单最终挂载容器的根节点，而非锚点的根节点：容器解析
  // （closest(".kt-m3-root") || body）可能把菜单挂回 document（锚点在影子内
  // 但影子内无 .kt-m3-root），此时焦点约束必须保持；仅当菜单实际落在
  // ShadowRoot 中才禁用 enforceFocus——影子拓扑下 MUI 焦点陷阱在 document 级
  // focusin 里把影子内目标重定向为宿主，误判"焦点离开弹层"而把焦点拽到
  // Paper 根上，吞掉 scriptFocus 交给网格 chip/菜单项的焦点（同款问题与解法
  // 见 TranForm selectMenuProps 的 disableEnforceFocus 注释）。跨 realm
  // 锚点（另一 window 的 ShadowRoot）以 host 存在性判定（instanceof 会漏判）。
  const resolveMenuContainer = () =>
    anchorEl?.closest(".kt-m3-root") || anchorEl?.ownerDocument.body;
  const isShadowMenu = Boolean(resolveMenuContainer()?.getRootNode?.()?.host);
  // 方向键导航沿用扩展既有下拉口径（libs/menuFocus），与 TranForm/EditorSelect/
  // ContentFab/TouchTranslateControl/TranslationPanel 同源：MUI MenuList 经
  // ownerDocument().activeElement 取当前项，shadow 宿主下被重定向为 host，导致
  // ArrowDown 恒落 list.firstChild、ArrowUp 恒落 list.lastChild（到不了中部项、
  // 焦点环随焦点不出现）。getMenuActiveElement 读 getRootNode().activeElement
  // 绕开该重定向逐项移动；shadowOnly 让非 shadow 的窗口内菜单仍交给 MUI 原生。
  // listbox 取值型不越界（同 Select），menu 型环绕（同 ContentFab）。
  const navigateMenu = useMemo(
    () =>
      createMenuKeyDownHandler({
        shadowOnly: true,
        disableListWrap: menuRole === "listbox",
      }),
    [menuRole]
  );
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
      // 三键同给缺一不可：autoFocus=false 关 MenuList 容器聚焦腿；
      // disableAutoFocusItem 关项腿；disableAutoFocus 让 Popover/Modal 不再
      // 自己拓焦——焦点交接只归本组件的 scriptFocus（focusFirstItem）。
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
          maxWidth: paperMaxWidth,
          overflowY: "auto",
          overscrollBehavior: "contain",
        },
      }}
      MenuListProps={{
        "aria-label": ariaLabel,
        role: menuRole,
        dense: true,
        id,
        onKeyDownCapture: navigateMenu,
      }}
    >
      {children}
    </Menu>
  );
}
