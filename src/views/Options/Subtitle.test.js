import { act } from "react";
import { createRoot } from "react-dom/client";
import SubtitleSetting from "./Subtitle";
import { useSubtitle } from "../../hooks/Subtitle";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Subtitle", () => ({
  useSubtitle: jest.fn(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({ enabledApis: [], aiEnabledApis: [] }),
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

jest.mock("../../hooks/ValidationInput", () => () => null);

function renderSubtitle() {
  useSubtitle.mockReturnValue({
    subtitleSetting: {
      enabled: true,
      apiSlug: "",
      segSlug: "-",
      chunkLength: 500,
      toLang: "zh-CN",
      isBilingual: true,
      enhanceMode: "desktop",
      windowStyle: "",
      originStyle: "",
      translationStyle: "",
    },
    updateSubtitle: jest.fn(),
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<SubtitleSetting />);
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Subtitle style editor layout", () => {
  test("preserves the spaced grid gutters inside its stack", () => {
    const view = renderSubtitle();
    const sourceTitle = Array.from(
      view.container.querySelectorAll(".MuiTypography-subtitle2")
    ).find((element) => element.textContent === "origin_styles");
    const grid = sourceTitle.closest(".MuiGrid-item").parentElement;
    const stack = grid.parentElement;

    expect(window.getComputedStyle(stack).gap).toBe("16px");
    expect(window.getComputedStyle(grid).marginLeft).toBe("-16px");
    expect(window.getComputedStyle(grid).marginTop).toBe("-16px");

    view.unmount();
  });
});
