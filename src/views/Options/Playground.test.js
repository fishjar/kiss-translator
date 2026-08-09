import { act } from "react";
import { createRoot } from "react-dom/client";
import Playground, { normalizePlaygroundLineBreaks } from "./Playground";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockTranForm = jest.fn();

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
  return (props) => {
    mockTranForm(props);
    return React.createElement("div", { "data-testid": "translation-tab" });
  };
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

test.each([
  ["First\nSecond", "First Second"],
  ["First\r\nSecond", "First Second"],
  ["First\rSecond", "First Second"],
  ["First  \n\tSecond", "First Second"],
  ["First\n\nSecond", "First\n\nSecond"],
  ["First\n \t\nSecond", "First\n\nSecond"],
  ["First\n\n\nSecond", "First\n\nSecond"],
])("normalizes Playground line breaks in %j", (source, expected) => {
  expect(normalizePlaygroundLineBreaks(source)).toBe(expected);
});

test("keeps the original input while toggling request-only normalization", async () => {
  mockTranForm.mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  const source = "First line\nSecond line\n\nNext paragraph";
  act(() => {
    mockTranForm.mock.calls.at(-1)[0].setText(source);
  });

  let props = mockTranForm.mock.calls.at(-1)[0];
  expect(props.text).toBe(source);
  expect(props.translationText).toBe(source);

  await act(async () => {
    container
      .querySelector('input[type="checkbox"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  props = mockTranForm.mock.calls.at(-1)[0];
  expect(props.text).toBe(source);
  expect(props.translationText).toBe(
    "First line Second line\n\nNext paragraph"
  );
  act(() => root.unmount());
});
