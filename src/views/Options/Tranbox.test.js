import { act } from "react";
import { createRoot } from "react-dom/client";
import Tranbox from "./Tranbox";
import { useTranbox } from "../../hooks/Tranbox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Tranbox", () => ({
  useTranbox: jest.fn(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({ enabledApis: [], aiEnabledApis: [], transApis: mockServices }),
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
      { apiSlug: "legacy-tts", apiName: "Legacy speech", apiType: "LocalAI", modelRef: "kokoro-82m" },
      { apiSlug: "legacy-sug", apiName: "Legacy suggestions", apiType: "Baidu" },
      { apiSlug: "disabled-tts", apiName: "Disabled speech", apiType: "SystemTTS", isDisabled: true },
    ];
    useTranbox.mockReturnValue({ tranboxSetting: { apiSlugs: [], ttsApiSlug: "legacy-tts", enSug: "legacy-sug" }, updateTranbox: jest.fn() });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<Tranbox />));
      act(() => container.querySelector(".MuiAccordionSummary-root").click());
      expect(container.textContent).toContain("Legacy speech");
      expect(container.textContent).toContain("Legacy suggestions");
      const field = [...container.querySelectorAll("input")].find((input) => input.value === "legacy-tts").closest(".MuiFormControl-root");
      act(() => field.querySelector('[role="combobox"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
      expect([...document.querySelectorAll('[role="option"]')].map((option) => option.textContent)).not.toContain("Disabled speech");
    } finally { act(() => root.unmount()); container.remove(); mockServices = []; }
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
