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
// 无 <g>（MUI 经典裸 path）回落 path d 拼接。
// 空签名防护内置：两种口径皆空即抛错，令 locate/locate-fixed 这类
// "无 path 或路径空"情形直接炸红，而非返回空串造成假绿（r2 N-7）。
const iconSignature = (element) => {
  const svg = element?.tagName === "svg" ? element : element?.querySelector("svg");
  if (!svg) throw new Error("no svg found in element");
  const group = svg.querySelector("g");
  const sig = group
    ? group.outerHTML
    : Array.from(svg.querySelectorAll("path"))
        .map((path) => path.getAttribute("d"))
        .join("|");
  if (!sig) throw new Error("empty icon signature");
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
