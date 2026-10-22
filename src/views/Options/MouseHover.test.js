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

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

jest.mock("./ShortcutInput", () => () => null);

const enabledApis = [
  { apiSlug: "page-api", apiType: "Microsoft", apiName: "Page API" },
  { apiSlug: "bubble-api", apiType: "Microsoft", apiName: "Bubble API" },
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
    const input = view.container.querySelector(".kt-settings-select input");
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
    const input = view.container.querySelector(".kt-settings-select input");
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

  test("offers left and right button choices for the hold trigger", () => {
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "left",
    });

    const rightButton = view.container.querySelector(
      "button[aria-label='mousehover_hold_button_right']"
    );
    expect(
      view.container
        .querySelector("button[aria-label='mousehover_hold_button_left']")
        .getAttribute("aria-checked")
    ).toBe("true");

    act(() => rightButton.click());

    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverHoldButton: "right",
    });
    view.cleanup();
  });

  test("remembers the context-menu suppression choice when switching buttons", () => {
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "right",
      mouseHoverSuppressContextMenu: false,
    });

    // 切到左键：不得覆盖用户已保存的右键屏蔽菜单设置
    act(() =>
      view.container
        .querySelector("button[aria-label='mousehover_hold_button_left']")
        .click()
    );

    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverHoldButton: "left",
    });
    view.cleanup();
  });

  test("disables context-menu suppression outside right-button mode", () => {
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "left",
      mouseHoverSuppressContextMenu: true,
    });
    const input = view.container.querySelector(
      "input[aria-label='mousehover_hold_suppress_menu']"
    );

    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
    view.cleanup();
  });

  test.each([
    [true, true],
    [false, false],
  ])(
    "reflects the stored suppression value %s in right-button mode",
    (stored, expected) => {
      const view = renderMouseHover({
        mouseHoverKeyHold: true,
        mouseHoverHoldButton: "right",
        mouseHoverSuppressContextMenu: stored,
      });
      const input = view.container.querySelector(
        "input[aria-label='mousehover_hold_suppress_menu']"
      );

      expect(input.disabled).toBe(false);
      expect(input.checked).toBe(expected);
      view.cleanup();
    }
  );

  test("disables click suppression in right-button mode without changing its value", () => {
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "right",
      mouseHoverPreventClick: true,
    });
    const input = view.container.querySelector(
      "input[aria-label='mousehover_hold_prevent_click']"
    );

    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
    view.cleanup();
  });

  test("disables gesture revert outside right-button mode", () => {
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "left",
      mouseHoverHoldRevertOnGesture: true,
    });
    const input = view.container.querySelector(
      "input[aria-label='mousehover_hold_revert_on_gesture']"
    );

    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
    view.cleanup();
  });

  test("reflects and updates the stored gesture revert value in right-button mode", () => {
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "right",
      mouseHoverHoldRevertOnGesture: true,
    });
    const input = view.container.querySelector(
      "input[aria-label='mousehover_hold_revert_on_gesture']"
    );

    expect(input.disabled).toBe(false);
    expect(input.checked).toBe(true);

    act(() => input.click());

    expect(view.updateMouseHoverSetting).toHaveBeenLastCalledWith({
      mouseHoverHoldRevertOnGesture: false,
    });
    view.cleanup();
  });

  test("keeps gesture revert off when the setting key is not stored", () => {
    // 默认值必须与 DEFAULT_MOUSE_HOVER_SETTING 一致：未配置时显示为关，
    // 否则界面显示“开”而运行时按“关”执行
    const view = renderMouseHover({
      mouseHoverKeyHold: true,
      mouseHoverHoldButton: "right",
    });
    const input = view.container.querySelector(
      "input[aria-label='mousehover_hold_revert_on_gesture']"
    );

    expect(input.disabled).toBe(false);
    expect(input.checked).toBe(false);
    view.cleanup();
  });
});
