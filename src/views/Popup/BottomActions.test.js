/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { tryClearCaches } from "../../libs/cache";

// 三键 stub 工厂：勾选/清除字形与 i18n、缓存清理由分发器与 libs 注入，
// 不依赖 MUI createSvgIcon 的渲染细节。
jest.mock("../../components/icons", () => {
  const React = require("react");
  const stub = (testid) =>
    function IconStub(props) {
      return React.createElement("svg", { "data-testid": testid, ...props });
    };
  return {
    CheckRoundedIcon: stub("check-rounded"),
    DeleteSweepRoundedIcon: stub("delete-sweep-rounded"),
  };
});
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../libs/cache", () => ({
  tryClearCaches: jest.fn(),
}));
jest.mock("../../libs/log", () => ({
  logger: { child: () => ({ error: jest.fn() }) },
}));

import BottomActions from "./BottomActions";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mount = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<BottomActions />));
  return { container, root };
};

// react-scripts jest resetMocks:true（createJestConfig.js:68）：每个用例前
// mock 实现被清零，须逐用例重武装，done 路径才可达。
beforeEach(() => {
  tryClearCaches.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

test("cache button swaps through dispatcher glyphs across the clear lifecycle", async () => {
  jest.useFakeTimers();
  const { container, root } = mount();
  try {
    const button = container.querySelector(".kt-popup-cache-button");
    expect(
      button.querySelector('[data-testid="delete-sweep-rounded"]')
    ).not.toBeNull();
    expect(button.querySelector('[data-testid="check-rounded"]')).toBeNull();

    await act(async () => button.click());
    expect(tryClearCaches).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("data-status")).toBe("done");
    expect(button.disabled).toBe(true);
    expect(
      button.querySelector('[data-testid="check-rounded"]')
    ).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(button.getAttribute("data-status")).toBe("idle");
    expect(
      button.querySelector('[data-testid="delete-sweep-rounded"]')
    ).not.toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

test("pending guard coalesces double clicks and failure keeps the sweep glyph", async () => {
  jest.useFakeTimers();
  tryClearCaches.mockResolvedValueOnce(false);
  const { container, root } = mount();
  try {
    const button = container.querySelector(".kt-popup-cache-button");
    await act(async () => {
      button.click();
      button.click();
    });
    expect(tryClearCaches).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("data-status")).toBe("error");
    expect(button.querySelector('[data-testid="check-rounded"]')).toBeNull();
    expect(
      button.querySelector('[data-testid="delete-sweep-rounded"]')
    ).not.toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
