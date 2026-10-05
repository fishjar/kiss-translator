/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { apiTranslate } from "../../apis";
import { tryDetectLang } from "../../libs/detect";
import PopupTextPanel, {
  DEFAULT_SOURCE_RATIO,
  SOURCE_RATIO_STORAGE_KEY,
} from "./PopupTextPanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: { uiTweak: {} } }),
}));
jest.mock("../../libs/detect", () => ({ tryDetectLang: jest.fn() }));
jest.mock("../../libs/browser", () => ({ browser: {} }));
jest.mock("../Selection/CopyBtn", () => () => null);
jest.mock("../Selection/AudioBtn", () => ({ BrowserTtsBtn: () => null }));

const transApis = [
  {
    apiSlug: "microsoft",
    apiName: "Microsoft",
    apiType: "Microsoft",
    sortOrder: 2,
  },
  { apiSlug: "google", apiName: "Google", apiType: "Google", sortOrder: 1 },
  { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI", sortOrder: 3 },
];

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Popup text translation card", () => {
  let container;
  let root;
  let props;
  let geometry;
  let setText;
  let cardHeight;
  let resultOverflowHeight;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    container.className = "kt-m3-root";
    document.body.appendChild(container);
    root = createRoot(container);
    setText = jest.fn();
    props = {
      text: "Source text",
      setText,
      apiSlugs: ["microsoft"],
      transApis,
      fromLang: "en",
      toLang: "zh-CN",
      autoFocusInput: false,
    };
    apiTranslate.mockReset();
    apiTranslate.mockImplementation(() => new Promise(() => {}));
    tryDetectLang.mockReset();
    tryDetectLang.mockResolvedValue("en");
    cardHeight = 400;
    resultOverflowHeight = 0;
    geometry = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        const height = this.classList.contains("kt-popup-text-base-size")
          ? cardHeight
          : this.classList.contains("kt-popup-text-card")
            ? cardHeight + resultOverflowHeight
            : 30;
        const top = this.classList.contains("kt-popup-text-services") ? 200 : 0;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          right: 360,
          bottom: top + height,
          width: 360,
          height,
          toJSON: () => ({}),
        };
      });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    geometry.mockRestore();
    window.localStorage.clear();
  });

  const render = async (overrides = {}) => {
    props = { ...props, ...overrides };
    act(() => root.render(<PopupTextPanel {...props} />));
    await flushEffects();
  };

  const click = (element) =>
    act(() =>
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
  const key = (element, key, extra = {}) =>
    act(() =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...extra })
      )
    );
  const getResultSlugs = () =>
    [...container.querySelectorAll(".kt-popup-text-result")].map(
      (element) => element.dataset.apiSlug
    );
  const serviceOption = (name) =>
    [...container.querySelectorAll('[role="menuitemcheckbox"]')].find(
      (element) => element.textContent === name
    );

  function edit(value) {
    const input = container.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }

  test("appends selected providers while keeping every existing request alive", async () => {
    await render();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    const originalRequest = apiTranslate.mock.calls[0][0];
    const originalResult = container.querySelector(
      '.kt-popup-text-result[data-api-slug="microsoft"]'
    );
    click(container.querySelector(".kt-popup-text-services"));
    expect(
      [...container.querySelectorAll('[role="menuitemcheckbox"]')].map(
        (item) => item.textContent
      )
    ).toEqual(["Google", "Microsoft", "OpenAI"]);

    click(serviceOption("OpenAI"));
    await flushEffects();
    expect(getResultSlugs()).toEqual(["microsoft", "openai"]);
    expect(apiTranslate).toHaveBeenCalledTimes(2);
    expect(originalRequest.signal.aborted).toBe(false);
    expect(
      container.querySelector(
        '.kt-popup-text-result[data-api-slug="microsoft"]'
      )
    ).toBe(originalResult);

    click(serviceOption("Google"));
    await flushEffects();
    expect(getResultSlugs()).toEqual(["microsoft", "openai", "google"]);
    expect(apiTranslate).toHaveBeenCalledTimes(3);
    expect(originalRequest.signal.aborted).toBe(false);

    click(serviceOption("OpenAI"));
    await flushEffects();
    expect(getResultSlugs()).toEqual(["microsoft", "google"]);
    click(serviceOption("OpenAI"));
    await flushEffects();
    expect(getResultSlugs()).toEqual(["microsoft", "google", "openai"]);
    expect(apiTranslate).toHaveBeenCalledTimes(4);
    expect(originalRequest.signal.aborted).toBe(false);
  });

  test("keeps the single-provider actions in the target row and adds headers for multiple providers", async () => {
    await render({ text: "" });
    expect(
      container.querySelector(".kt-popup-text-result__provider")
    ).toBeNull();
    expect(
      container.querySelector(
        ".kt-popup-text-target-actions .kt-popup-text-result__actions"
      )
    ).not.toBeNull();
    click(container.querySelector(".kt-popup-text-services"));
    click(serviceOption("Google"));
    await flushEffects();
    expect(
      container.querySelectorAll(".kt-popup-text-result__provider")
    ).toHaveLength(2);
    expect(
      container.querySelector(".kt-popup-text-target-actions").children
    ).toHaveLength(0);
  });

  test("changes only the internal split with keyboard, stores it, and resets with a double click", async () => {
    await render();
    const card = container.querySelector(".kt-popup-text-card");
    const divider = container.querySelector('[role="separator"]');
    expect(divider.getAttribute("aria-valuenow")).toBe("40");
    key(divider, "ArrowDown");
    expect(
      parseFloat(card.style.getPropertyValue("--kt-popup-text-source-fraction"))
    ).toBeCloseTo(0.425);
    expect(
      Number(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY))
    ).toBeCloseTo(0.425);
    key(divider, "Home");
    expect(
      Number(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY))
    ).toBeCloseTo(86 / 400);
    key(divider, "End");
    expect(
      Number(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY))
    ).toBeCloseTo(0.78);
    act(() =>
      divider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    );
    expect(Number(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY))).toBe(
      DEFAULT_SOURCE_RATIO
    );
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(card.style.height).toBe("");
  });

  test("drags against the baseline when results grow and restores the ratio after remount", async () => {
    await render();
    click(container.querySelector(".kt-popup-text-services"));
    click(serviceOption("Google"));
    await flushEffects();
    key(container.querySelector(".kt-popup-text-services"), "Escape");
    // Simulate long results extending the card independently of provider count.
    resultOverflowHeight = 400;
    const divider = container.querySelector('[role="separator"]');
    divider.setPointerCapture = jest.fn();
    divider.hasPointerCapture = jest.fn(() => true);
    divider.releasePointerCapture = jest.fn();
    const pointer = (type, clientY) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
      Object.defineProperty(event, "pointerId", { value: 7 });
      act(() => divider.dispatchEvent(event));
    };
    pointer("pointerdown", 160);
    pointer("pointermove", 210);
    pointer("pointerup", 210);
    expect(divider.setPointerCapture).toHaveBeenCalledWith(7);
    expect(divider.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(
      Number(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY))
    ).toBeCloseTo(0.525);
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(
      container
        .querySelector('[role="separator"]')
        .getAttribute("aria-valuenow")
    ).toBe("53");
  });

  test("fits both panes into a shorter popup and restores the stored preference when space returns", async () => {
    window.localStorage.setItem(SOURCE_RATIO_STORAGE_KEY, "0.78");
    cardHeight = 240;
    await render();
    const card = container.querySelector(".kt-popup-text-card");
    expect(
      parseFloat(card.style.getPropertyValue("--kt-popup-text-source-fraction"))
    ).toBeCloseTo(1 - 86 / 240);
    expect(
      container
        .querySelector('[role="separator"]')
        .getAttribute("aria-valuenow")
    ).toBe("64");
    expect(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY)).toBe("0.78");
    cardHeight = 400;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(card.style.getPropertyValue("--kt-popup-text-source-fraction")).toBe(
      "0.78"
    );
    expect(window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY)).toBe("0.78");
    expect(apiTranslate).toHaveBeenCalledTimes(1);
  });

  test("uses local detection only when the user selects no translation services", async () => {
    await render({ apiSlugs: [], langDetector: "Google" });
    expect(apiTranslate).not.toHaveBeenCalled();
    expect(tryDetectLang).toHaveBeenLastCalledWith("Source text", "-");
    expect(
      container.querySelector(".kt-popup-text-no-services")
    ).not.toBeNull();
    expect(container.querySelector(".kt-popup-text-services").disabled).toBe(
      false
    );
    expect(
      container.querySelector(".kt-popup-text-services__name").textContent
    ).toBe("popup_text_select_service");
    expect(
      container.querySelector('[aria-label="popup_text_reload"]').disabled
    ).toBe(true);
  });

  test("shows the unavailable-services state when every provider is disabled without issuing requests", async () => {
    await render({
      transApis: transApis.map((api) => ({ ...api, isDisabled: true })),
      langDetector: "Google",
    });
    expect(apiTranslate).not.toHaveBeenCalled();
    expect(tryDetectLang).toHaveBeenLastCalledWith("Source text", "-");
    expect(container.querySelector(".kt-popup-text-services").disabled).toBe(
      true
    );
    expect(
      container.querySelector(".kt-popup-text-services__name").textContent
    ).toBe("popup_no_services");
    expect(
      container.querySelector(".kt-popup-text-no-services").textContent
    ).toBe("popup_no_services");
    expect(
      container.querySelector('[aria-label="popup_text_reload"]').disabled
    ).toBe(true);
    click(container.querySelector(".kt-popup-text-services"));
    expect(container.querySelector(".kt-popup-text-service-menu")).toBeNull();
  });

  test.each([false, true])(
    "waits for a secondary-target decision before requesting providers (append while pending: %s)",
    async (appendProvider) => {
      let finishDetection;
      tryDetectLang.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishDetection = resolve;
          })
      );
      await render({ fromLang: "auto", toLang: "zh-CN", toLang2: "en" });
      expect(apiTranslate).not.toHaveBeenCalled();
      if (appendProvider) {
        click(container.querySelector(".kt-popup-text-services"));
        click(serviceOption("Google"));
        await flushEffects();
      }
      expect(apiTranslate).not.toHaveBeenCalled();
      expect(tryDetectLang).toHaveBeenCalledTimes(1);
      act(() => finishDetection("zh-CN"));
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(appendProvider ? 2 : 1);
      const requests = apiTranslate.mock.calls.map(([request]) => request);
      expect(requests.map((request) => request.apiSetting.apiSlug)).toEqual(
        appendProvider ? ["microsoft", "google"] : ["microsoft"]
      );
      requests.forEach((request) => {
        expect(request.toLang).toBe("en");
        expect(request.signal.aborted).toBe(false);
      });
      expect(tryDetectLang).toHaveBeenCalledTimes(1);
    }
  );

  test("swaps the two language choices through the centered button", async () => {
    await render();
    click(container.querySelector(".kt-popup-text-swap"));
    await flushEffects();
    const request =
      apiTranslate.mock.calls[apiTranslate.mock.calls.length - 1][0];
    expect(request.fromLang).toBe("zh-CN");
    expect(request.toLang).toBe("en");
  });

  test("waits for the actual detected source before swapping automatic detection", async () => {
    let finishDetection;
    tryDetectLang.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDetection = resolve;
        })
    );
    await render({ fromLang: "auto" });
    expect(container.querySelector(".kt-popup-text-swap").disabled).toBe(true);
    act(() => finishDetection("en"));
    await flushEffects();
    expect(container.querySelector(".kt-popup-text-auto").textContent).toBe(
      "popup_text_auto_badge"
    );
    expect(container.querySelector(".kt-popup-text-swap").disabled).toBe(false);
    click(container.querySelector(".kt-popup-text-swap"));
    await flushEffects();
    const request =
      apiTranslate.mock.calls[apiTranslate.mock.calls.length - 1][0];
    expect(request.fromLang).toBe("zh-CN");
    expect(request.toLang).toBe("en");
  });

  test("keeps draft typing local and submits only with a command or when focus leaves the card", async () => {
    await render();
    const input = edit("New draft");
    expect(setText).not.toHaveBeenCalled();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    key(input, "Enter", { ctrlKey: true });
    expect(setText).toHaveBeenLastCalledWith("New draft");
    await render({ text: "New draft" });
    edit("Another draft");
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    act(() => {
      input.focus();
      outside.focus();
    });
    expect(setText).toHaveBeenLastCalledWith("Another draft");
    outside.remove();
  });

  test("syncs new clipboard text into the focused editor without submitting its replaced draft", async () => {
    await render();
    const input = edit("Unsubmitted draft");
    act(() => input.focus());
    await render({ text: "Clipboard replacement" });
    expect(input.value).toBe("Clipboard replacement");
    expect(setText).not.toHaveBeenCalled();
    expect(apiTranslate).toHaveBeenCalledTimes(2);
  });

  test("preserves the draft, service choices, and active requests while hidden and dismisses its menus", async () => {
    await render();
    click(container.querySelector(".kt-popup-text-services"));
    click(serviceOption("Google"));
    await flushEffects();
    const requests = apiTranslate.mock.calls.map(([request]) => request);
    key(container.querySelector('[role="menu"]'), "Escape");
    const input = edit("Unsubmitted draft");
    const tabs = document.createElement("div");
    tabs.className = "kt-popup-tabs";
    const pageTab = document.createElement("button");
    pageTab.setAttribute("role", "tab");
    tabs.appendChild(pageTab);
    document.body.appendChild(tabs);
    act(() => {
      input.focus();
      pageTab.focus();
    });
    expect(setText).not.toHaveBeenCalled();
    click(container.querySelector(".kt-popup-text-services"));
    expect(
      container.querySelector(".kt-popup-text-service-menu")
    ).not.toBeNull();
    await render({ isVisible: false });
    expect(container.querySelector(".kt-popup-text-service-menu")).toBeNull();
    expect(input.value).toBe("Unsubmitted draft");
    await render({ isVisible: true });
    expect(input.value).toBe("Unsubmitted draft");
    expect(getResultSlugs()).toEqual(["microsoft", "google"]);
    expect(apiTranslate).toHaveBeenCalledTimes(2);
    requests.forEach((request) => expect(request.signal.aborted).toBe(false));
    click(
      container.querySelector('.kt-popup-text-language[aria-label="from_lang"]')
    );
    expect(container.querySelector(".kt-popup-language-menu")).not.toBeNull();
    await render({ isVisible: false });
    expect(container.querySelector(".kt-popup-language-menu")).toBeNull();
    expect(setText).not.toHaveBeenCalled();
    tabs.remove();
  });
});
