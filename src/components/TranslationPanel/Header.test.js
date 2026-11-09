/**
 * 图钉消歧契约：划词弹窗头部「固定弹窗」按钮独家使用 PushPin/Outlined，
 * 「跟随选中文本」菜单项使用 MyLocation/Outlined。期望值由契约推导
 * （两控件图标在 hideClickAway × followSelection 全部四种组合下互不相同，
 * 且「跟随」开启=实心、关闭=空心），非抄录当前实现。
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import TranslationPanelHeader from "./Header";
import {
  PushPinIcon as LucidePushPinIcon,
  PushPinOutlinedIcon as LucidePushPinOutlinedIcon,
  MyLocationIcon as LucideMyLocationIcon,
  MyLocationOutlinedIcon as LucideMyLocationOutlinedIcon,
} from "../icons/lucide";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light", toggleDarkMode: jest.fn() }),
}));
jest.mock("../Logo", () => () => null);

// 签名序列化优先取 <g> 子树 outerHTML（容纳同字形不同 fill：Lucide 用
// fill 属性区分 Favorite/FavoriteBorder、PushPin/PushPinOutlined）；
// 无 <g>（MUI 经典裸 path）回落 path d 拼接，path 亦为空时退到子树序列化，
// 使仅含 rect/circle 的合法字形仍能产出可比较且互异的签名。
// 有效性防护两步前置：无 <svg> 直接抛错；<svg> 内无任何可绘制标签（含空 <g>
// 与仅 defs/title 两种"骨架在、字形丢"形态）直接抛错，令图标缺体炸红，
// 而不是靠非空 outerHTML 蒙过数量与互异断言。
const DRAWABLE_SELECTOR =
  "path,circle,line,polyline,polygon,rect,ellipse,image,use";

const iconSignature = (element) => {
  const svg = element?.tagName === "svg" ? element : element?.querySelector("svg");
  if (!svg) throw new Error("no svg found in element");
  // 空签名防护的前置半环：outerHTML 对空 <g></g> 同样非空，只判 !sig 无法察觉
  // "骨架在、字形丢"，图标缺体会把数量断言与互异断言一起带成假绿。
  if (!svg.querySelector(DRAWABLE_SELECTOR)) {
    throw new Error("icon has no drawable element");
  }
  const group = svg.querySelector("g");
  if (group) return group.outerHTML;
  // 无 <g>（MUI 经典裸 path）保持原 path-d 口径不变；path 缺失或 d 全空时退到
  // 子树序列化，避免"只含 rect/circle 的合法字形"被空串误杀成红（值域见行为契约 #15）。
  const pathD = Array.from(svg.querySelectorAll("path"))
    .map((path) => path.getAttribute("d"))
    .join("|");
  const sig = pathD || svg.innerHTML;
  return sig;
};

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
      // 勾标恒占首位字形位，互异性须比状态字形而非按钮首个 svg。
      const followStatus = follow.querySelector(
        'svg[data-testid^="MyLocation"]'
      );
      expect(followStatus).not.toBeNull();
      expect(iconSignature(followStatus)).not.toBe("");
      expect(iconSignature(pin)).not.toBe("");
      expect(iconSignature(followStatus)).not.toBe(iconSignature(pin));
    }
  );
});

describe("TranslationPanelHeader renders lucide glyphs", () => {
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

  const glyphSignature = (Icon) => {
    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const iconRoot = createRoot(holder);
    act(() => {
      iconRoot.render(<Icon />);
    });
    // React 18 并发 root 的 DOM 提交发生在 act() 退出时，须在回调外查询。
    const signature = iconSignature(holder);
    act(() => iconRoot.unmount());
    holder.remove();
    return signature;
  };

  test.each([false, true])(
    "pin button uses the lucide push_pin glyph pair (hideClickAway=%p)",
    (hideClickAway) => {
      renderHeader({ hideClickAway, followSelection: false });
      const pin = container.querySelector('button[title="btn_tip_click_away"]');
      const expected = hideClickAway
        ? glyphSignature(LucidePushPinOutlinedIcon)
        : glyphSignature(LucidePushPinIcon);
      expect(iconSignature(pin)).toBe(expected);
      // displayName 沿用 MUI 名 → testid 迁移前后稳定（回归锁）。
      expect(pin.querySelector("svg").getAttribute("data-testid")).toBe(
        hideClickAway ? "PushPinOutlinedIcon" : "PushPinIcon"
      );
    }
  );

  test.each([false, true])(
    "follow menu item uses the lucide my_location glyph pair (followSelection=%p)",
    (followSelection) => {
      renderHeader({ hideClickAway: false, followSelection });
      const follow = container.querySelector('[role="menuitemcheckbox"]');
      // 前置勾标（M3 菜单结构规范）占据按钮首个字形位：状态字形按
      // data-testid 定位；勾恒渲染恒占位，选中与否只翻 visibility。
      const statusGlyph = follow.querySelector(
        'svg[data-testid^="MyLocation"]'
      );
      const expected = followSelection
        ? glyphSignature(LucideMyLocationIcon)
        : glyphSignature(LucideMyLocationOutlinedIcon);
      expect(iconSignature(statusGlyph)).toBe(expected);
      expect(statusGlyph.getAttribute("data-testid")).toBe(
        followSelection ? "MyLocationIcon" : "MyLocationOutlinedIcon"
      );
      // 伪下拉对勾已移除：菜单行内不存在 CheckIcon SVG。
      expect(
        follow.querySelector('svg[data-testid="CheckIcon"]')
      ).toBeNull();
    }
  );

  test("pin and follow glyphs stay mutually distinct across all four combinations", () => {
    // 反自证：pin≠locate、locate≠locate-fixed、PushPin(实心)≠PushPinOutlined(描边)，
    // 四组合的 pin/follow 签名须两两互异。
    const pinSigs = new Set();
    const followSigs = new Set();
    for (const hideClickAway of [false, true]) {
      for (const followSelection of [false, true]) {
        act(() => root.unmount());
        root = createRoot(container);
        renderHeader({ hideClickAway, followSelection });
        const pin = container.querySelector(
          'button[title="btn_tip_click_away"]'
        );
        const follow = container.querySelector('[role="menuitemcheckbox"]');
        expect(pin).not.toBeNull();
        expect(follow).not.toBeNull();
        const pinSig = iconSignature(pin);
        // 勾标常驻按钮首位，互异性取「跟随」状态字形对（MyLocation/Outlined）。
        const followStatus = follow.querySelector(
          'svg[data-testid^="MyLocation"]'
        );
        expect(followStatus).not.toBeNull();
        const followSig = iconSignature(followStatus);
        expect(pinSig).not.toBe(followSig);
        pinSigs.add(pinSig);
        followSigs.add(followSig);
      }
    }
    expect(pinSigs.size).toBe(2);
    expect(followSigs.size).toBe(2);
  });
});

describe("TranslationPanelHeader menu labels are wrapped for ellipsis", () => {
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

  const renderHeader = () => {
    act(() => {
      root.render(
        <TranslationPanelHeader
          hideClickAway={false}
          setHideClickAway={() => {}}
          followSelection={false}
          setFollowSelection={() => {}}
          onOpenSeparateWindow={() => {}}
        />
      );
    });
    act(() => container.querySelector('button[title="more"]').click());
  };

  // 溢出省略样式挂在 .kt-tranbox-header__menu-label 包装类上，裸文本节点
  // 承载不了 ellipsis：两个动作菜单项的标签必须包进该 span。
  test("separate-window menu item wraps its label in the menu-label span", () => {
    renderHeader();
    const item = container.querySelector('[role="menuitem"]');
    expect(item).not.toBeNull();
    expect(item.textContent).toContain("open_separate_window");
    const label = item.querySelector("span.kt-tranbox-header__menu-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("open_separate_window");
  });

  test("dark-mode menu item wraps its label in the menu-label span", () => {
    renderHeader();
    const items = Array.from(
      container.querySelectorAll('button[role="menuitem"]')
    );
    const darkItem = items.find((el) =>
      el.textContent.includes("btn_tip_dark_mode")
    );
    expect(darkItem).not.toBeUndefined();
    const label = darkItem.querySelector("span.kt-tranbox-header__menu-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("btn_tip_dark_mode");
  });
});

describe("iconSignature guard", () => {
  test("a group with no drawable child is not a valid signature", () => {
    // 契约：图标缺体必须炸红。空 <g></g> 的 outerHTML 非空，只判 !sig 会把
    // "有骨架无字形"当作有效签名，令数量断言与互异断言一起假绿。
    const box = document.createElement("div");
    box.innerHTML = '<svg viewBox="0 0 24 24"><g fill="none"></g></svg>';
    expect(() => iconSignature(box.firstChild)).toThrow(
      "icon has no drawable element"
    );
  });

  test("a defs-only svg is not a valid signature", () => {
    const box = document.createElement("div");
    box.innerHTML =
      '<svg viewBox="0 0 24 24"><defs><linearGradient id="x"/></defs></svg>';
    expect(() => iconSignature(box.firstChild)).toThrow(
      "icon has no drawable element"
    );
  });

  test("a stroked path still yields a signature", () => {
    // 防误伤：合格字形不得被新守卫误杀（否则互异性用例整体塌红）。
    const box = document.createElement("div");
    box.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';
    expect(iconSignature(box.firstChild)).toContain("M5 12h14");
  });

  test("a path-free drawable glyph yields a signature, not an error", () => {
    // 值域第 ③ 类：只有 rect 的合法字形不得因"path-d 为空"被误杀成红。
    const box = document.createElement("div");
    box.innerHTML = '<svg viewBox="0 0 24 24"><rect width="10" height="4"/></svg>';
    expect(() => iconSignature(box.firstChild)).not.toThrow();
    expect(iconSignature(box.firstChild)).not.toBe("");
  });

  test("two rects of different geometry do not collapse to one signature", () => {
    // 防签名塌缩：若不同几何产出同一串，"缺体蒙混"就能借相等断言过关。
    const a = document.createElement("div");
    a.innerHTML = '<svg viewBox="0 0 24 24"><rect width="10" height="4"/></svg>';
    const b = document.createElement("div");
    b.innerHTML = '<svg viewBox="0 0 24 24"><rect width="20" height="4"/></svg>';
    expect(iconSignature(a.firstChild)).not.toBe(iconSignature(b.firstChild));
  });

  test("a group wrapping a rect is still a valid signature", () => {
    const box = document.createElement("div");
    box.innerHTML =
      '<svg viewBox="0 0 24 24"><g fill="none"><rect width="8" height="8"/></g></svg>';
    expect(iconSignature(box.firstChild)).toContain("rect");
  });
});
