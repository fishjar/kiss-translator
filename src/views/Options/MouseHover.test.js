import { act } from "react";
import { createRoot } from "react-dom/client";
import MouseHoverSetting from "./MouseHover";
import { useMouseHoverSetting } from "../../hooks/MouseHover";
import { useApiList } from "../../hooks/Api";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/MouseHover", () => ({
  useMouseHoverSetting: jest.fn(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: jest.fn(),
}));

jest.mock("./ShortcutInput", () => () => null);

const enabledApis = [
  { apiSlug: "page-api", apiName: "Page API" },
  { apiSlug: "bubble-api", apiName: "Bubble API" },
];

function renderMouseHover(mouseHoverSetting) {
  const updateMouseHoverSetting = jest.fn();
  useMouseHoverSetting.mockReturnValue({
    mouseHoverSetting,
    updateMouseHoverSetting,
  });
  useApiList.mockReturnValue({ enabledApis });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MouseHoverSetting />);
  });

  return {
    container,
    updateMouseHoverSetting,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("MouseHover bubble translation service", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("hides the service selector in inline bilingual mode", () => {
    const view = renderMouseHover({
      useMouseHover: true,
      displayMode: "bilingual",
    });

    expect(view.container.querySelector("input[name='apiSlug']")).toBeNull();
    view.cleanup();
  });

  test("shows follow-page and enabled services in bubble mode", () => {
    const view = renderMouseHover({
      useMouseHover: true,
      displayMode: "bubble",
      apiSlug: "*",
    });
    const input = view.container.querySelector("input[name='apiSlug']");
    const select = input.parentElement.querySelector("[role='combobox']");

    expect(input.value).toBe("*");
    act(() => {
      select.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      );
    });

    expect(document.body.textContent).toContain("mousehover_follow_page_rule");
    expect(document.body.textContent).toContain("Page API");
    expect(document.body.textContent).toContain("Bubble API");
    view.cleanup();
  });

  test("updates only the bubble apiSlug selection", () => {
    const view = renderMouseHover({
      useMouseHover: true,
      displayMode: "bubble",
      apiSlug: "*",
    });
    const input = view.container.querySelector("input[name='apiSlug']");
    const select = input.parentElement.querySelector("[role='combobox']");

    act(() => {
      select.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      );
    });
    const option = document.body.querySelector("[data-value='bubble-api']");
    act(() => {
      option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.updateMouseHoverSetting).toHaveBeenCalledWith({
      apiSlug: "bubble-api",
    });
    view.cleanup();
  });
});
