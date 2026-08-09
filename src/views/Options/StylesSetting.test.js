import { act } from "react";
import { createRoot } from "react-dom/client";
import { css as mockCss } from "@emotion/css";
import { StyleAccordion } from "./StylesSetting";

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

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: { uiLang: "en" },
    updateSetting: jest.fn(),
  }),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(async () => true),
}));

jest.mock("../../hooks/Rules", () => ({
  useRules: () => ({ list: [], put: jest.fn() }),
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

  test("accepts clean updates without discarding a dirty style draft", () => {
    const view = renderStyleAccordion(CUSTOM_STYLE);
    act(() => {
      view.container.querySelector(".MuiAccordionSummary-root").click();
    });
    const cleanUpdate = {
      ...CUSTOM_STYLE,
      styleName: "Remote clean style",
    };

    view.rerender(cleanUpdate);
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Remote clean style"
    );

    const nameInput = view.container.querySelector('input[name="styleName"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    view.rerender({ ...cleanUpdate });
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Local style draft"
    );

    view.rerender({
      ...cleanUpdate,
      styleCode: "color: rebeccapurple;",
    });
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Local style draft"
    );
    const saveButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    expect(saveButton.disabled).toBe(false);

    view.cleanup();
  });
});
