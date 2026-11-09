import Menu from "@mui/material/Menu";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createMenuKeyDownHandler,
  focusMenuTarget,
  getMenuActiveElement,
} from "../../libs/menuFocus";

// 取"首个选中项"，无则落可用条目族；守卫/聚焦/滚动统一走 libs/menuFocus。
// 样式网格场景 PopupCont 打开路径已把焦点交给网格项，Paper 内已有焦点时
// 守卫让位（网格 chip 是 aria-pressed 普通按钮，不命中 menuitem/option
// selector，无守卫会把焦点抢到 MenuList 兜底、令网格方向键导航失效）。
// 容器兜底禁令：找不到可聚焦项就不聚焦（宁缺勿错，容器零焦点同源）。
const focusFirstItem = (paper, options) => focusMenuTarget(paper, options);

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

  // 首项焦点交接的统一尝试：可聚焦项集合变化（children 换组、稳定 child
  // 内部异步插项）后旧项可能已卸载，须重做交接。重触发无害——
  // focusMenuTarget 对 Paper 内已有条目焦点让位，未变化的重复触发不抢焦。
  const attemptFocusRef = useRef(() => {});
  useEffect(() => {
    attemptFocusRef.current = () => {
      const paper = paperRef.current;
      if (!paper) return;
      // 归属判据取 getRootNode().activeElement：影子拓扑下
      // ownerDocument.activeElement 被 retarget 为宿主，纸内焦点会漏判。
      const active = getMenuActiveElement(paper);
      // children 异步换组重挂后，被聚焦旧项卸载，浏览器焦点回收可能落在
      // paper 容器自身（contains 含自，守卫会误让位）。容器持有焦点违反
      // 容器零焦点契约，此时 reclaim 重做首项交接；真实条目持有焦点仍
      // 让位（网格 chip 方向键导航不抢）。
      focusFirstItem(paper, { reclaim: active === paper });
    };
  });
  useEffect(() => {
    if (!open || !anchorEl || !placementReady) return undefined;
    const frame = requestAnimationFrame(() => attemptFocusRef.current());
    return () => cancelAnimationFrame(frame);
  }, [open, anchorEl, placementReady, children]);
  // 稳定 child 内部异步装载（children 引用不变）不触发本组件重渲染，任何
  // 渲染期签名都观测不到——以 paper 子树 childList 变更为信号补做交接
  // 尝试。paper 挂载晚于 effect（placement 就绪先于 portal 内容），观察器
  // 也须等 rAF 后 paper 在场再挂。
  useEffect(() => {
    if (!open || !anchorEl || !placementReady) return undefined;
    let observer = null;
    const frame = requestAnimationFrame(() => {
      const paper = paperRef.current;
      if (!paper || typeof MutationObserver === "undefined") return;
      observer = new MutationObserver(() => attemptFocusRef.current());
      observer.observe(paper, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "disabled", "aria-disabled"],
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [open, anchorEl, placementReady]);

  // Escape/Tab 兜底腿：MUI 的 Escape 缝（modal 根 onKeyDown 与 MenuList
  // keydown）与 tabKeyDown 兜底都要求事件路径经过弹层子树，而空菜单/全禁
  // 用时焦点停在触发器上、按键不经弹层，菜单将关不掉。document capture
  // 层兜底同款关闭语义：落点在弹层内则让位给 MUI 自身处理（不双关），
  // 容器不聚焦契约与触发器复原行为两路一致；不阻断传播，嵌套弹层与宿主
  // 处理器互不排斥。落点属另一个已打开的弹层面（Dialog/Popover/
  // Autocomplete 共用 MUI Modal 门户）时同样让位：关闭语义归该面自身，
  // 本兜底不代关本层。Tab 腿不阻断焦点转移（默认行为保留）；Escape 仍
  // preventDefault 抑制宿主默认行为。onClose 调用方全为状态置空，与 MUI
  // Modal 自身 tabKeyDown 双触发时重复调用无副作用。onClose 经 latest-ref
  // 捕获，监听不随回调身份逐渲染重挂。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open || !anchorEl || !placementReady) return undefined;
    const doc = anchorEl.ownerDocument || document;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      const landing = event.composedPath?.()[0] ?? event.target ?? null;
      if (landing && paperRef.current?.contains(landing)) return;
      const landingModal = landing?.closest?.(".MuiModal-root");
      if (landingModal && !landingModal.contains(paperRef.current)) return;
      if (event.key === "Escape") event.preventDefault();
      onCloseRef.current?.(
        event,
        event.key === "Escape" ? "escapeKeyDown" : "tabKeyDown"
      );
    };
    doc.addEventListener("keydown", onKeyDown, true);
    return () => doc.removeEventListener("keydown", onKeyDown, true);
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
      // 三键同给缺一不可（对齐 TranForm selectMenuProps 的同一契约）：
      // autoFocus=false 与 disableAutoFocusItem 联用关掉 MUI Menu/MenuList 的
      // 容器聚焦腿与项腿；disableAutoFocus 让 Popover/Modal 不再自己拓焦——
      // 焦点交接只归本组件的 scriptFocus（focusFirstItem）。
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
        id,
        // listbox（取值型）不越界同 Select，menu 型保持环绕。两条路径各执
        // 一半：文档路径菜单交给 MUI 原生导航（本 handler shadowOnly 让位），
        // 绕行语义须落在 MUI MenuList 自身；shadow 路径由 navigateMenu 的
        // 同名键执行。
        disableListWrap: menuRole === "listbox",
        onKeyDownCapture: navigateMenu,
      }}
    >
      {children}
    </Menu>
  );
}
