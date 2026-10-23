/**
 * 图钉消歧契约：划词弹窗头部「固定弹窗」按钮独家使用 PushPin/Outlined，
 * 「跟随选中文本」菜单项使用 MyLocation/Outlined。期望值由契约推导
 * （两控件图标在 hideClickAway × followSelection 全部四种组合下互不相同，
 * 且「跟随」开启=实心、关闭=空心），非抄录当前实现。
 */
import { act } from "react";
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

      const pin = container.querySelector(
        'button[title="btn_tip_click_away"]'
      );
      const follow = container.querySelector('[role="menuitemcheckbox"]');
      expect(pin).not.toBeNull();
      expect(follow).not.toBeNull();
      expect(follow.getAttribute("aria-checked")).toBe(
        String(followSelection)
      );
      expect(iconSignature(follow)).not.toBe("");
      expect(iconSignature(pin)).not.toBe("");
      expect(iconSignature(follow)).not.toBe(iconSignature(pin));
    }
  );
});
