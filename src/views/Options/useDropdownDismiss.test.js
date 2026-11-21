import { act } from "react";
import { createRoot } from "react-dom/client";
import useDropdownDismiss from "./useDropdownDismiss";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 期望值由 useDropdownDismiss.js 契约推导：focusin 捕获监听按落点归属分流——
// 落点在另一 MuiModal-root 面内（该面不含本弹层）让位，落点在普通外部
// 控件照常以 (event, "blur") 关闭。
describe("useDropdownDismiss", () => {
  let container;
  let root;
  let popup;
  let anchor;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    anchor = document.createElement("button");
    popup = document.createElement("div");
    document.body.appendChild(anchor);
    document.body.appendChild(popup);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    anchor.remove();
    popup.remove();
  });

  function mountHook(onClose) {
    const popupRef = { current: popup };
    function Harness() {
      useDropdownDismiss({ open: true, popupRef, anchorEl: anchor, onClose });
      return null;
    }
    act(() => root.render(<Harness />));
  }

  const dispatchFocusIn = (target) =>
    act(() =>
      target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    );

  test("yields the blur close to another open MUI modal surface", () => {
    const onClose = jest.fn();
    mountHook(onClose);
    const modal = document.createElement("div");
    modal.className = "MuiModal-root";
    const modalInput = document.createElement("input");
    modal.appendChild(modalInput);
    document.body.appendChild(modal);
    try {
      dispatchFocusIn(modalInput);
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      modal.remove();
    }
  });

  test("closes with (event, blur) when focus lands on a plain outside element", () => {
    const onClose = jest.fn();
    mountHook(onClose);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    try {
      dispatchFocusIn(outside);
      expect(onClose).toHaveBeenCalledTimes(1);
      const [event, reason] = onClose.mock.calls[0];
      expect(event).toBeInstanceOf(FocusEvent);
      expect(reason).toBe("blur");
    } finally {
      outside.remove();
    }
  });
});
