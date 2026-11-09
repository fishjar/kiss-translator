import { forwardRef, useLayoutEffect, useRef } from "react";
import { scriptFocus } from "../../hooks/focusModality";
import { focusMenuTarget, getMenuActiveElement } from "../../libs/menuFocus";
import Portal from "@mui/material/Portal";
import Popper from "@mui/material/Popper";
import { useTheme } from "@mui/material/styles";
import { useForkRef } from "@mui/material/utils";
import useDropdownDismiss from "./useDropdownDismiss";

// Keep MUI's MenuList navigation and use Popper's flip/overflow positioning:
// settings behind a dropdown remain scrollable, focusable and clickable.
const DropdownSurface = forwardRef(function DropdownSurface(
  { children, className, id, onClose, open, ownerState, style },
  ref
) {
  const popupRef = useRef(null);
  const handleRef = useForkRef(ref, popupRef);
  const theme = useTheme();
  const anchorEl =
    typeof ownerState.anchorEl === "function"
      ? ownerState.anchorEl()
      : ownerState.anchorEl;
  const trigger = anchorEl?.querySelector('[role="combobox"]') || anchorEl;

  useDropdownDismiss({
    open,
    popupRef,
    anchorEl,
    onClose,
    toggleOnAnchor: trigger !== anchorEl,
  });
  useLayoutEffect(() => {
    if (!open) return undefined;
    const paper = popupRef.current?.querySelector(".MuiPaper-root");
    // 取"首个选中项"，无则落可用条目族。reclaim：本 effect 挂在 Popper 容器上，
    // 子级 MenuList 的 autofocus effect 先行（layout effects 自底向上），
    // 焦点已在 Paper 内——但那是 MUI 的无 preventScroll autofocus（会拖动
    // 宿主页面滚动），必须重经 scriptFocus 夺回（preventScroll＋指针静默
    // 标记）并居中滚动，故 mount 场景不适用守卫的让位语义。
    // 无任何可聚焦菜单项（全 disabled 或空菜单）时不聚焦任何元素，
    // [role=listbox]/[role=menu] 容器不得被脚本聚焦（容器兜底腿已移除）。
    focusMenuTarget(paper, { reclaim: true });
    return () => {
      // 影子拓扑下 ownerDocument.activeElement＝影子宿主而非纸内元素，
      // document 口径的 contains 判定恒假、清理时不复原触发器；
      // getMenuActiveElement 取 getRootNode().activeElement 同口径判据，
      // 影子树内焦点同样成立。
      const active = getMenuActiveElement(paper);
      if (paper && active && paper.contains(active)) {
        scriptFocus(trigger);
      }
    };
  }, [open, trigger]);
  // 空菜单/全禁用菜单的焦点始终留在触发器上，Escape/Tab 事件到不了
  // Popper 的 capture handler（事件路径不经过弹层）——在 document capture
  // 层兜底同款关闭语义：落点在弹层内则让位给 surface 自身的 handler，
  // 容器不聚焦规则与触发器复原行为两路一致。
  useLayoutEffect(() => {
    if (!open) return undefined;
    const doc = anchorEl?.ownerDocument || document;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      // 影子组合事件冒泡出根后 target 重定向为宿主（宿主是弹层祖先，
      // contains 恒假）：落点取组合路径起始节点，缺失时回退 target。
      const landing = event.composedPath?.()[0] ?? event.target ?? null;
      if (popupRef.current?.contains(landing)) return;
      // 落点属另一个已打开的 MUI Modal 面（嵌套 Dialog/Popover/Autocomplete
      // 共用 MuiModal-root 门户）时让位：关闭语义归该面自身，本兜底腿不代
      // 关本层、不抢焦点（对齐 PopupMenu 兜底腿的同款守卫）。
      const landingModal = landing?.closest?.(".MuiModal-root");
      if (landingModal && !landingModal.contains(popupRef.current)) return;
      // 不阻断传播：弹层外按键的关闭语义与下游监听（嵌套弹层、宿主
      // 处理器）互不排斥。
      if (event.key === "Escape") event.preventDefault();
      scriptFocus(trigger);
      onClose?.(event, event.key === "Escape" ? "escapeKeyDown" : "tabKeyDown");
    };
    doc.addEventListener("keydown", onKeyDown, true);
    return () => doc.removeEventListener("keydown", onKeyDown, true);
  }, [open, anchorEl, trigger, onClose]);

  return (
    <Popper
      ref={handleRef}
      id={id}
      className={className}
      role="presentation"
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      disablePortal
      popperOptions={{ strategy: "fixed" }}
      modifiers={[
        { name: "offset", options: { offset: [0, 4] } },
        // The outer Portal already escaped the field's clipping ancestors.
        { name: "flip", options: { padding: 16, altBoundary: false } },
        {
          name: "preventOverflow",
          options: { padding: 16, altAxis: true, altBoundary: false },
        },
      ]}
      style={{
        ...style,
        zIndex: theme.zIndex.modal,
        minWidth: anchorEl?.getBoundingClientRect().width,
        maxWidth: "calc(100vw - 32px)",
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" && event.key !== "Tab") return;
        // Restore the trigger before native Tab navigation, so the same
        // keystroke advances to the next setting instead of trapping focus.
        event.stopPropagation();
        if (event.key === "Escape") event.preventDefault();
        scriptFocus(trigger);
        onClose?.(
          event,
          event.key === "Escape" ? "escapeKeyDown" : "tabKeyDown"
        );
      }}
    >
      {children}
    </Popper>
  );
});

const DropdownRoot = forwardRef(function DropdownRoot(
  { container, open, ...props },
  ref
) {
  // Unmount on dismissal so an exit transition never delays the next action.
  if (!open) return null;
  return (
    <Portal container={container}>
      <DropdownSurface {...props} open ref={ref} />
    </Portal>
  );
});

export default DropdownRoot;
