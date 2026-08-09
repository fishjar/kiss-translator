import { act } from "react";
import { createRoot } from "react-dom/client";
import About from "./About";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockUseI18nMd = jest.fn();

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
  useI18nMd: (...args) => {
    mockUseI18nMd(...args);
    return {
      data: "# Project details",
      loading: false,
      error: null,
    };
  },
}));

jest.mock("react-markdown", () => {
  const React = require("react");
  return ({ children }) => React.createElement("div", null, children);
});

describe("About", () => {
  test("loads project details only after expansion", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<About />));

    expect(mockUseI18nMd).not.toHaveBeenCalled();
    const summary = container.querySelector(".MuiAccordionSummary-root");
    act(() => {
      summary.click();
    });
    expect(mockUseI18nMd).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Project details");

    act(() => summary.click());
    act(() => summary.click());
    expect(mockUseI18nMd).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
