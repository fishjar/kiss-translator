/**
 * 图钉消歧契约：划词弹窗头部「固定弹窗」按钮独家使用 PushPin/Outlined，
 * 「跟随选中文本」菜单项使用 MyLocation/Outlined。期望值由契约推导
 * （两控件图标在 hideClickAway × followSelection 全部四种组合下互不相同，
 * 且「跟随」开启=实心、关闭=空心），非抄录当前实现。
 */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import TranslationPanelHeader from "./Header";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light", toggleDarkMode: jest.fn() }),
}));
jest.mock("../Logo", () => () => null);

const iconSignature = (element) =>
  Array.from(element.querySelectorAll("svg path"))
    .map((path) => path.getAttribute("d"))
    .join("|");

describe("TranslationPanelHeader pin/follow icon exclusivity", () => {
  let host;
  let container;
  let root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    container = document.createElement("div");
    host.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const renderHeader = ({ hideClickAway, followSelection }) => {
    act(() => {
      root.render(
        <TranslationPanelHeader
          hideClickAway={hideClickAway}
          setHideClickAway={() => {}}
          followSelection={followSelection}
          setFollowSelection={() => {}}
        />
      );
    });
    act(() => container.querySelector('button[title="more"]').click());
  };

  test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "pin and follow controls never share an icon (hideClickAway=%p, followSelection=%p)",
    (hideClickAway, followSelection) => {
      renderHeader({ hideClickAway, followSelection });

      const pin = container.querySelector('button[title="btn_tip_click_away"]');
      const follow = container.querySelector('[role="menuitemcheckbox"]');
      expect(pin).not.toBeNull();
      expect(follow).not.toBeNull();
      expect(follow.getAttribute("aria-checked")).toBe(String(followSelection));
      expect(iconSignature(follow)).not.toBe("");
      expect(iconSignature(pin)).not.toBe("");
      expect(iconSignature(follow)).not.toBe(iconSignature(pin));
    }
  );
});

test("adjusts reading size repeatedly without closing the menu and preserves keyboard dismissal", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(23);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    const trigger = host.querySelector('button[title="more"]');
    act(() => trigger.click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');
    const decrease = host.querySelector('[aria-label="tranbox_font_decrease"]');
    act(() => increase.click());
    expect(increase.disabled).toBe(true);
    expect(host.querySelector("output").textContent).toBe("24px");
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 12; i++) act(() => decrease.click());
    expect(decrease.disabled).toBe(true);
    expect(host.querySelector("output").textContent).toBe("12px");
    act(() => {
      increase.focus();
      increase.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      );
    });
    expect(document.activeElement).toBe(
      host.querySelector('[role="menuitem"]')
    );
    act(() =>
      host
        .querySelector('[role="menu"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
    );
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

test("renders the font-size row as a plain action row with a leading icon and a split capsule", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    act(() => {
      root.render(
        <TranslationPanelHeader fontSize={16} onFontSizeChange={() => {}} />
      );
    });
    act(() => host.querySelector('button[title="more"]').click());

    // 菜单是纯动作项列表：行容器不得携带复合控件语义，−/＋ 以独立
    // menuitem 承载动作语义，数值为只读 output 文本。
    expect(host.querySelector('[role="menu"] [role="group"]')).toBeNull();

    const row = host.querySelector(".kt-tranbox-header__font-size");
    expect(row).not.toBeNull();
    // 行首前置图标与其他菜单行的图标槽同构。
    expect(row.firstElementChild.tagName.toLowerCase()).toBe("svg");

    // 行尾分体式胶囊：−/数值/＋ 三段一体，DOM 序为 −、output、＋。
    const capsule = row.querySelector(".kt-tranbox-header__font-size-capsule");
    expect(capsule).not.toBeNull();
    expect(capsule.children).toHaveLength(3);
    expect(capsule.children[1].tagName.toLowerCase()).toBe("output");
    const decrease = capsule.querySelector(
      '[aria-label="tranbox_font_decrease"]'
    );
    const increase = capsule.querySelector(
      '[aria-label="tranbox_font_increase"]'
    );
    expect(decrease).not.toBeNull();
    expect(increase).not.toBeNull();
    expect(decrease.getAttribute("role")).toBe("menuitem");
    expect(increase.getAttribute("role")).toBe("menuitem");
    expect(decrease.querySelector("svg")).not.toBeNull();
    expect(increase.querySelector("svg")).not.toBeNull();
    expect(capsule.querySelector("output").textContent).toBe("16px");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

test("repeats font size stepping while a capsule button is held and suppresses the trailing click", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(16);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');
    const decrease = host.querySelector('[aria-label="tranbox_font_decrease"]');

    // 短点在阈值内抬起：仅 click 一步 16→17。
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      increase.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(host.querySelector("output").textContent).toBe("17px");

    // 长按越过阈值起振：第一格 17→18，连发 18→19；抬起后连发停止。
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(3);
    act(() => {
      increase.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(3);

    // 长按后的尾随 click 被抑制；再下一次 click 恢复正常单步 19→20。
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(3);
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(4);

    // 到界自停：步进至 24 后长按不再步进。
    act(() => increase.click());
    act(() => increase.click());
    act(() => increase.click());
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(8);
    expect(increase.disabled).toBe(true);
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(8);

    // 到界长按结束（按钮禁用、无尾随 click）后，下一次独立激活仍能步进。
    act(() => decrease.click());
    expect(onChange).toHaveBeenCalledTimes(9);
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("a release-generated pointerleave does not add an extra step after a long press", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(16);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    const trigger = host.querySelector('button[title="more"]');
    act(() => trigger.click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');

    // 长按越过阈值：首步 16→17，节拍 17→18。
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(2);

    // 触屏释放真实事件序：pointerup → pointerout → pointerleave → click。
    // 释放产生的 pointerleave 不得清抑制标记，尾随 click 须被吞掉。
    act(() => {
      increase.dispatchEvent(new Event("pointerup", { bubbles: true }));
      const out = new Event("pointerout", { bubbles: true });
      out.relatedTarget = trigger;
      increase.dispatchEvent(out);
      increase.dispatchEvent(new Event("pointerleave", { bubbles: true }));
    });
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(host.querySelector("output").textContent).toBe("18px");

    // 标记已被该 click 消费：下一次独立激活恢复单步 18→19。
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(host.querySelector("output").textContent).toBe("19px");
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("ignores non-primary pointer buttons when starting the font size repeat", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(16);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');

    // 中键按下不进入长按会话：越过起振阈值也不步进。
    act(() => {
      const middleDown = new Event("pointerdown", { bubbles: true });
      middleDown.button = 1;
      increase.dispatchEvent(middleDown);
    });
    act(() => jest.advanceTimersByTime(700));
    expect(onChange).not.toHaveBeenCalled();

    // 主键长按仍起振步进；抬起后连发停止（现有行为保持）。
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      increase.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("reaches the max during the repeat interval and still steps on the first release-time activation", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(23);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');
    const decrease = host.querySelector('[aria-label="tranbox_font_decrease"]');

    // 长按越过阈值步进 23→24；下一节拍触顶：连发停止并结束本次长按会话。
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      increase.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });

    // 释放后的首次独立激活不得被残留抑制标记吞掉；真实浏览器中 Enter 对
    // 聚焦按钮原生合成 click，jsdom 不模拟，按该契约直接派发 click。
    decrease.focus();
    act(() => decrease.click());
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(host.querySelector("output").textContent).toBe("23px");
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("clears the held marker when the repeat reaches the boundary before the next tick", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(23);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');
    const decrease = host.querySelector('[aria-label="tranbox_font_decrease"]');

    // 长按首步 23→24 即触顶；在 150ms 下一节拍到来前释放。
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      increase.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });

    // 释放后的首次独立激活不得被残留抑制标记吞掉。
    decrease.focus();
    act(() => decrease.click());
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(host.querySelector("output").textContent).toBe("23px");
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("moves focus to the other button when a long-press reaches the boundary", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(23);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');
    const decrease = host.querySelector('[aria-label="tranbox_font_decrease"]');

    increase.focus();
    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(increase.disabled).toBe(true);
    // 当前按钮禁用后焦点交给另一侧可用按钮，不掉出菜单。
    expect(document.activeElement).toBe(decrease);
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("stops the font size repeat when the menu closes while the button is held", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(16);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');

    act(() => {
      increase.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(400));
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(2);

    // 按住期间菜单收起（Escape 路径）：连发立即停止，隐藏菜单不得继续步进。
    act(() => {
      host
        .querySelector(".kt-tranbox-header__menu")
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
    });
    act(() => jest.advanceTimersByTime(1000));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".kt-tranbox-header__menu")).toBeNull();
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("a foreign pointer's document-level release does not stop another pointer's repeat", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(16);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');

    // 指针 1 按住起振：16→17。
    const withPointerId = (type) => {
      const event = new Event(type, { bubbles: true });
      event.pointerId = 1;
      return event;
    };
    act(() => {
      increase.dispatchEvent(withPointerId("pointerdown"));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(1);

    // 指针 2 在文档任意处抬起：不得替指针 1 收尾，连发继续 17→18。
    const foreignUp = new Event("pointerup", { bubbles: true });
    foreignUp.pointerId = 2;
    act(() => {
      document.dispatchEvent(foreignUp);
    });
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(2);

    // 指针 2 的 pointercancel 同样不中止指针 1 的会话：继续 18→19。
    const foreignCancel = new Event("pointercancel", { bubbles: true });
    foreignCancel.pointerId = 2;
    act(() => {
      document.dispatchEvent(foreignCancel);
    });
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(3);

    // 同指针抬起才收尾：连发停止，尾随 click 被抑制标记吞掉。
    act(() => {
      increase.dispatchEvent(withPointerId("pointerup"));
    });
    act(() => jest.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(3);
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(3);
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});

test("button-level pointerup, pointerleave, and pointercancel only respond to the owning pointer", () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = jest.fn();
  function Header() {
    const [size, setSize] = useState(16);
    return (
      <TranslationPanelHeader
        fontSize={size}
        onFontSizeChange={(value) => {
          onChange(value);
          setSize(value);
        }}
      />
    );
  }
  try {
    act(() => root.render(<Header />));
    act(() => host.querySelector('button[title="more"]').click());
    const increase = host.querySelector('[aria-label="tranbox_font_increase"]');

    const withPointerId = (type, pointerId) => {
      const event = new Event(type, { bubbles: true });
      event.pointerId = pointerId;
      return event;
    };

    // 指针 1 长按起振：16→17。
    act(() => {
      increase.dispatchEvent(withPointerId("pointerdown", 1));
    });
    act(() => jest.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledTimes(1);

    // 指针 2 在按钮上抬起/滑离/取消：均不中止指针 1 的连发，17→18。
    // React 18 的 onPointerLeave 由 pointerout 推导（simple event 表不含
    // pointerleave）：滑离段派发 pointerout(pid=2)＋relatedTarget 落在
    // 按钮外，使离开门控路径真实可达。
    const trigger = host.querySelector('button[title="more"]');
    act(() => {
      increase.dispatchEvent(withPointerId("pointerup", 2));
      const foreignOut = withPointerId("pointerout", 2);
      foreignOut.relatedTarget = trigger;
      increase.dispatchEvent(foreignOut);
      increase.dispatchEvent(withPointerId("pointercancel", 2));
    });
    act(() => jest.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(2);

    // 同指针拖离按钮：真实中止（连发活跃时清抑制标记），尾随 click 恢复单步 18→19。
    // pointerleave 在 React 18 下不被合成，改派 pointerout(pid=1)＋
    // relatedTarget 落在按钮外以真实触发离开路径。
    act(() => {
      const ownOut = withPointerId("pointerout", 1);
      ownOut.relatedTarget = trigger;
      increase.dispatchEvent(ownOut);
    });
    act(() => jest.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => increase.click());
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(host.querySelector("output").textContent).toBe("19px");
  } finally {
    jest.useRealTimers();
    act(() => root.unmount());
    host.remove();
  }
});
