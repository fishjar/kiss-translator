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

    expect(container.querySelector("input[name='skipLangs']").value).toBe("");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
