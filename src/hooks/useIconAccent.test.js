/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setIconColorSnapshot } from "../styles/m3";
import { useIconAccent } from "./useIconAccent";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 期望值由 m3.js 契约推导（resolveIconHue + calculateAdaptivePrimaryFamily(_, "light")）：
//   #ba9090 → hue 0；   light primary = hslToHex(0, 32, 34) = "#723b3b"，onPrimary = "#FFFFFF"。
//   #a590ba → hue 270； light primary = hslToHex(270, 32, 34) = "#573b72"（= 薰衣草 lightHex）。
function Probe() {
  const { hue, accent } = useIconAccent();
  return (
    <div
      data-testid="accent"
      data-hue={String(hue)}
      data-primary={accent.primary}
      data-onprimary={accent.onPrimary}
    />
  );
}

describe("useIconAccent", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setIconColorSnapshot("#90b2ba");
  });

  test("returns the light primary family for the snapshot hue", () => {
    setIconColorSnapshot("#ba9090");
    act(() => {
      root.render(<Probe />);
    });
    const accent = container.querySelector("[data-testid='accent']");
    expect(accent.getAttribute("data-primary")).toBe("#723b3b");
    expect(accent.getAttribute("data-onprimary")).toBe("#FFFFFF");
    expect(accent.getAttribute("data-hue")).toBe("0");
  });

  test("re-renders when the icon-color snapshot changes", () => {
    setIconColorSnapshot("#ba9090");
    act(() => {
      root.render(<Probe />);
    });
    expect(
      container
        .querySelector("[data-testid='accent']")
        .getAttribute("data-primary")
    ).toBe("#723b3b");
    act(() => {
      setIconColorSnapshot("#a590ba");
    });
    const accent = container.querySelector("[data-testid='accent']");
    expect(accent.getAttribute("data-primary")).toBe("#573b72");
    expect(accent.getAttribute("data-hue")).toBe("270");
  });

  test("tolerates a dirty snapshot write via a finite light family (no NaN/loop)", () => {
    // 归一单点：setIconColorSnapshot 入口即归一（m3.js:194-198），
    // 脏值经 store→hook 仍得合法 light 家族；断言 hue 有限且 primary 为
    // 6 位 hex，证明 hook 不脏读、不 NaN、useSyncExternalStore 透传
    // getIconColorSnapshot（返回稳定字符串）不触发 React18 无限重渲染。
    setIconColorSnapshot("#nope");
    act(() => {
      root.render(<Probe />);
    });
    const accent = container.querySelector("[data-testid='accent']");
    expect(accent.getAttribute("data-onprimary")).toBe("#FFFFFF");
    expect(accent.getAttribute("data-primary")).toMatch(/^#[0-9a-f]{6}$/);
    const hue = Number(accent.getAttribute("data-hue"));
    expect(Number.isFinite(hue)).toBe(true);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});
