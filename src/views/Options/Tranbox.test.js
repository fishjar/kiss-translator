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
  useApiList: () => ({ enabledApis: [], aiEnabledApis: [] }),
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

jest.mock("../../libs/client", () => ({ isExt: false }));

jest.mock("./ShortcutInput", () => () => null);
jest.mock("../../hooks/ValidationInput", () => () => null);

describe("Tranbox language defaults", () => {
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
});
