import { act } from "react";
import { createRoot } from "react-dom/client";
import { css as mockCss } from "@emotion/css";
import StylesSetting, { StyleAccordion } from "./StylesSetting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DANGEROUS_STYLE_CODE = "position: fixed; inset: 0; z-index: 2147483647;";
const CUSTOM_STYLE = {
  styleSlug: "custom-dangerous",
  styleName: "Custom Dangerous",
  styleCode: DANGEROUS_STYLE_CODE,
  source: "custom",
  isBuiltin: false,
};
const BUILTIN_STYLE = {
  styleSlug: "under_line",
  styleName: "Underline",
  styleCode: "text-decoration: underline;",
  source: "builtin",
  isBuiltin: true,
};

jest.mock("@emotion/css", () => ({
  css: jest.fn(() => "mock-preview-class"),
  keyframes: jest.fn(() => "mock-keyframes"),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Setting", () => {
  const setting = {
    uiLang: "en",
    darkMode: "auto",
    customStyles: [
      {
        styleSlug: "custom-dangerous",
        styleName: "Custom Dangerous",
        styleCode: "position: fixed; inset: 0; z-index: 2147483647;",
      },
    ],
  };
  const updateSetting = jest.fn();

  return {
    useSetting: () => ({ setting, updateSetting }),
  };
});

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(async () => true),
}));

function renderStyleAccordion(customStyle) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = (nextStyle) => {
    root.render(
      <StyleAccordion
        customStyle={nextStyle}
        deleteStyle={jest.fn()}
        updateStyle={jest.fn()}
      />
    );
  };

  act(() => {
    render(customStyle);
  });

  return {
    container,
    rerender(nextStyle) {
      act(() => {
        render(nextStyle);
      });
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderStylesSetting() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<StylesSetting />);
  });

  return {
    container,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function getCompiledStyleCode() {
  return mockCss.mock.calls.flatMap((call) => call.slice(1)).join("\n");
}

function getSummaryTranslation(container) {
  return Array.from(
    container.querySelectorAll(".kt-style-card__summary span")
  ).find((span) => span.textContent === "style_preview_translation");
}

describe("StylesSetting style previews", () => {
  beforeEach(() => {
    mockCss.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("keeps custom CSS out of compact summaries while previewing built-ins", () => {
    const customView = renderStyleAccordion(CUSTOM_STYLE);

    expect(getCompiledStyleCode()).not.toContain(DANGEROUS_STYLE_CODE);
    expect(getSummaryTranslation(customView.container).className).toBe("");
    customView.cleanup();

    mockCss.mockClear();
    const builtinView = renderStyleAccordion(BUILTIN_STYLE);

    expect(getCompiledStyleCode()).toContain(BUILTIN_STYLE.styleCode);
    expect(mockCss).toHaveBeenCalledTimes(1);
    builtinView.cleanup();
  });

  test("retains full custom CSS in the expanded editor", () => {
    const view = renderStyleAccordion(CUSTOM_STYLE);

    expect(getCompiledStyleCode()).not.toContain(DANGEROUS_STYLE_CODE);
    act(() => {
      view.container.querySelector(".MuiAccordionSummary-root").click();
    });
    expect(getCompiledStyleCode()).toContain(DANGEROUS_STYLE_CODE);
    view.cleanup();
  });

  test("keeps a local draft until the persisted style changes", () => {
    const view = renderStyleAccordion(CUSTOM_STYLE);
    act(() => {
      view.container.querySelector(".MuiAccordionSummary-root").click();
    });

    const nameInput = view.container.querySelector('input[name="styleName"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    view.rerender(CUSTOM_STYLE);
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Local style draft"
    );

    const persistedUpdate = {
      ...CUSTOM_STYLE,
      styleName: "Persisted style",
      styleCode: "color: rebeccapurple;",
    };
    view.rerender(persistedUpdate);
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Persisted style"
    );
    const saveButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    expect(saveButton.disabled).toBe(true);

    view.cleanup();
  });

  test("keeps an expanded style draft mounted while the manager is hidden", () => {
    const view = renderStylesSetting();

    expect(view.container.querySelector(".kt-style-manager")).toBeNull();

    const openButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "edit");
    act(() => openButton.click());

    const manager = view.container.querySelector(".kt-style-manager");
    expect(manager).not.toBeNull();
    expect(manager.hidden).toBe(false);

    act(() => {
      manager.querySelector(".MuiAccordionSummary-root").click();
    });

    const nameInput = manager.querySelector('input[name="styleName"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Unsaved style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const hideButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "hide");
    act(() => hideButton.click());

    expect(view.container.querySelector(".kt-style-manager")).toBe(manager);
    expect(manager.hidden).toBe(true);

    const reopenButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "edit");
    act(() => reopenButton.click());

    expect(manager.hidden).toBe(false);
    expect(manager.querySelector('input[name="styleName"]')).toBe(nameInput);
    expect(nameInput.value).toBe("Unsaved style draft");

    view.cleanup();
  });
});
