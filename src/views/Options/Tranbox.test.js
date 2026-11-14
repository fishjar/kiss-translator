import { act } from "react";
import { createRoot } from "react-dom/client";
import Tranbox from "./Tranbox";
import { useTranbox } from "../../hooks/Tranbox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@mui/material/Slider", () => {
  const React = jest.requireActual("react");
  return function Slider({
    name,
    value,
    min,
    max,
    step,
    onChange,
    onChangeCommitted,
    "aria-label": label,
  }) {
    return React.createElement("input", {
      name,
      type: "range",
      value,
      min,
      max,
      step,
      "aria-label": label,
      onInput: (event) => onChange(event, Number(event.currentTarget.value)),
      onMouseUp: (event) =>
        onChangeCommitted(event, Number(event.currentTarget.value)),
    });
  };
});

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Tranbox", () => ({
  useTranbox: jest.fn(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [],
    aiEnabledApis: [],
    transApis: mockServices,
  }),
}));
let mockServices = [];

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

jest.mock("../../libs/client", () => ({ isExt: false }));

jest.mock("./ShortcutInput", () => () => null);
jest.mock("../../hooks/ValidationInput", () => () => null);

describe("Tranbox language defaults", () => {
  test("legacy native speech and suggestion instances remain selectable while disabled instances are excluded", () => {
    mockServices = [
      {
        apiSlug: "legacy-tts",
        apiName: "Legacy speech",
        apiType: "LocalAI",
        modelRef: "kokoro-82m",
      },
      {
        apiSlug: "legacy-sug",
        apiName: "Legacy suggestions",
        apiType: "Baidu",
      },
      {
        apiSlug: "disabled-tts",
        apiName: "Disabled speech",
        apiType: "SystemTTS",
        isDisabled: true,
      },
    ];
    useTranbox.mockReturnValue({
      tranboxSetting: {
        apiSlugs: [],
        ttsApiSlug: "legacy-tts",
        enSug: "legacy-sug",
      },
      updateTranbox: jest.fn(),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<Tranbox />));
      act(() => container.querySelector(".MuiAccordionSummary-root").click());
      expect(container.textContent).toContain("Legacy speech");
      expect(container.textContent).toContain("Legacy suggestions");
      const field = [...container.querySelectorAll("input")]
        .find((input) => input.value === "legacy-tts")
        .closest(".MuiFormControl-root");
      act(() =>
        field
          .querySelector('[role="combobox"]')
          .dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, button: 0 })
          )
      );
      expect(
        [...document.querySelectorAll('[role="option"]')].map(
          (option) => option.textContent
        )
      ).not.toContain("Disabled speech");
    } finally {
      act(() => root.unmount());
      container.remove();
      mockServices = [];
    }
  });
  test("shows no ignored language when legacy settings omit skipLangs", () => {
    useTranbox.mockReturnValue({
      tranboxSetting: {
        transOpen: true,
        apiSlugs: [],
        fromLang: "auto",
        toLang: "zh-CN",
        tranboxShortcut: [],
        btnOffsetX: 0,
        btnOffsetY: 0,
      },
      updateTranbox: jest.fn(),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Tranbox />);
    });

    const skipLanguagesRow = Array.from(
      container.querySelectorAll(".kt-settings-row")
    ).find((row) => row.textContent.includes("selection_skip_langs"));
    expect(skipLanguagesRow).toBeDefined();
    expect(skipLanguagesRow.querySelector("input").value).toBe("");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("uses a full-width trigger control and a flat advanced grid", () => {
    useTranbox.mockReturnValue({
      tranboxSetting: {
        transOpen: true,
        apiSlugs: [],
        fromLang: "auto",
        toLang: "zh-CN",
        tranboxShortcut: [],
        btnOffsetX: 0,
        btnOffsetY: 0,
      },
      updateTranbox: jest.fn(),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Tranbox />));

    const triggerRow = Array.from(
      container.querySelectorAll(".kt-settings-row")
    ).find((row) => row.textContent.includes("trigger_mode"));
    expect(triggerRow.classList.contains("kt-settings-row--stacked")).toBe(
      true
    );
    expect(triggerRow.classList.contains("kt-settings-row--trigger")).toBe(
      true
    );

    act(() => container.querySelector(".MuiAccordionSummary-root").click());
    const content = container.querySelector(".kt-settings-advanced__content");
    expect(
      content.firstElementChild.classList.contains("MuiGrid-container")
    ).toBe(true);
    expect(
      content.querySelectorAll(".MuiGrid-grid-lg-6").length
    ).toBeGreaterThan(0);
    expect(content.querySelector(".MuiGrid-grid-lg-3")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  test("renders translation prompt select with default follow api", () => {
    const updateTranbox = jest.fn();
    useTranbox.mockReturnValue({
      tranboxSetting: {
        transOpen: true,
        apiSlugs: ["google"],
        promptSlug: "",
        fromLang: "auto",
        toLang: "zh-CN",
        tranboxShortcut: [],
      },
      updateTranbox,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Tranbox />));

    act(() => container.querySelector(".MuiAccordionSummary-root").click());

    const labels = Array.from(container.querySelectorAll("label")).map(
      (el) => el.textContent
    );
    expect(labels).toContain("translation_prompt");

    act(() => root.unmount());
    container.remove();
  });
});

test("previews and saves reading size, then reflects external changes", () => {
  const updateTranbox = jest.fn();
  useTranbox.mockReturnValue({
    tranboxSetting: { fontSize: 16 },
    updateTranbox,
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    act(() => root.render(<Tranbox />));
    const input = host.querySelector('input[name="tranboxFontSize"]');
    expect([input.min, input.max, input.step, input.value]).toEqual([
      "12",
      "24",
      "1",
      "16",
    ]);
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, "24");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.parentElement.querySelector("output").textContent).toBe(
      "24px"
    );
    expect(updateTranbox).not.toHaveBeenCalled();
    act(() =>
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    );
    expect(updateTranbox).toHaveBeenCalledWith({ fontSize: 24 });
    useTranbox.mockReturnValue({
      tranboxSetting: { fontSize: 12 },
      updateTranbox,
    });
    act(() => root.render(<Tranbox />));
    expect(input.value).toBe("12");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
