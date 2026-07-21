import { act } from "react";
import { createRoot } from "react-dom/client";
import Playground from "./Playground";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      transApis: [],
      prompts: [],
      subtitleSetting: {},
      tranboxSetting: {},
    },
  }),
}));

// 子组件使用轻量替身，当前测试只关注 Playground 的页签归属和切换行为。
jest.mock("../Selection/TranForm", () => {
  const React = require("react");
  return () => React.createElement("div", { "data-testid": "translation-tab" });
});

jest.mock("./SubtitleSegmentationPlayground", () => {
  const React = require("react");
  return () =>
    React.createElement("div", { "data-testid": "segmentation-tab" });
});

test("moves the existing translator into the text tab and exposes segmentation testing", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  expect(
    container.querySelector('[data-testid="translation-tab"]')
  ).not.toBeNull();
  const segmentationTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "字幕断句"
  );
  await act(async () => {
    segmentationTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(container.querySelector('[data-testid="translation-tab"]')).toBeNull();
  expect(
    container.querySelector('[data-testid="segmentation-tab"]')
  ).not.toBeNull();
  act(() => root.unmount());
});
