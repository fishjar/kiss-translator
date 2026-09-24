import { act } from "react";
import { createRoot } from "react-dom/client";
import MouseHoverSetting from "./MouseHover";
import { useMouseHoverSetting } from "../../hooks/MouseHover";
import { useApiList } from "../../hooks/Api";
import { DEFAULT_MOUSE_HOVER_HOLD_DELAY } from "../../config";

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

describe("MouseHover settings", () => {
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

  test("hides hold controls when both triggers use shortcuts", () => {
    const view = renderMouseHover({});

    expect(
      view.container.querySelector("input[name='mouseHoverHoldDelay']")
    ).toBeNull();
    expect(
      view.container.querySelector("input[name='mouseHoverTransMode']")
    ).toBeNull();
    expect(
      view.container.querySelector("input[name='mouseHoverTransDisplay']")
    ).toBeNull();
    view.cleanup();
  });

  test.each(["mouseHoverKeyHold", "mouseHoverKey2Hold"])(
    "shows shared hold defaults when %s is enabled",
    (trigger) => {
      const view = renderMouseHover({ [trigger]: true });

      expect(
        view.container.querySelector("input[name='mouseHoverHoldDelay']").value
      ).toBe(String(DEFAULT_MOUSE_HOVER_HOLD_DELAY));
      expect(
        view.container.querySelector("input[name='mouseHoverTransMode']").value
      ).toBe("area");
      expect(
        view.container.querySelector("input[name='mouseHoverTransDisplay']")
          .value
      ).toBe("block");
      view.cleanup();
    }
  );

  test("updates the primary and alternative hold switches independently", () => {
    const view = renderMouseHover({});
    const primary = view.container.querySelector(
      "input[aria-label='mousehover_hold_key']"
    );

    act(() => primary.click());
    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverKeyHold: true,
    });

    act(() =>
      view.container.querySelector(".MuiAccordionSummary-root").click()
    );
    const alternative = view.container.querySelector(
      "input[aria-label='mousehover_hold_key 2']"
    );
    act(() => alternative.click());
    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverKey2Hold: true,
    });
    view.cleanup();
  });

  test.each([
    ["1200", 1200],
    ["0", DEFAULT_MOUSE_HOVER_HOLD_DELAY],
    ["-1", DEFAULT_MOUSE_HOVER_HOLD_DELAY],
    ["", DEFAULT_MOUSE_HOVER_HOLD_DELAY],
  ])("normalizes hold delay input %s to %s", (value, expected) => {
    const view = renderMouseHover({ mouseHoverKeyHold: true });
    const input = view.container.querySelector(
      "input[name='mouseHoverHoldDelay']"
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    act(() => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverHoldDelay: expected,
    });
    view.cleanup();
  });

  test.each([
    ["mouseHoverTransMode", "paragraph"],
    ["mouseHoverTransMode", "region"],
    ["mouseHoverTransDisplay", "inline"],
  ])("updates the shared %s setting to %s", (name, value) => {
    const view = renderMouseHover({ mouseHoverKey2Hold: true });
    const input = view.container.querySelector(`input[name='${name}']`);
    const select = input.parentElement.querySelector("[role='combobox']");

    act(() => {
      select.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      );
    });
    act(() => {
      document.body.querySelector(`[data-value='${value}']`).click();
    });

    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      [name]: value,
    });
    view.cleanup();
  });

  test("updates click suppression without changing the hold trigger", () => {
    const view = renderMouseHover({ mouseHoverKeyHold: true });
    const input = view.container.querySelector(
      "input[aria-label='mousehover_hold_prevent_click']"
    );

    act(() => input.click());

    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverPreventClick: true,
    });
    view.cleanup();
  });
});
