import { act } from "react";
import { createRoot } from "react-dom/client";
import TranForm from "./TranForm";
import { apiDict } from "../../apis";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({
  apiDict: jest.fn(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../libs/detect", () => ({
  tryDetectLang: jest.fn(async () => "en"),
}));

jest.mock("react-markdown", () => {
  const React = require("react");

  return ({ children }) => React.createElement("div", null, children);
});

jest.mock("./TranCont", () => {
  const React = require("react");

  return ({ apiSlug }) =>
    React.createElement("div", {
      "data-testid": "tran-cont",
      "data-api-slug": apiSlug,
    });
});

jest.mock("./DictCont", () => {
  const React = require("react");

  return () => React.createElement("div", { "data-testid": "default-dict" });
});

jest.mock("./Zdic", () => () => null);
jest.mock("./SugCont", () => () => null);

jest.mock("./AudioBtn", () => {
  const React = require("react");

  return {
    BrowserTtsBtn: () =>
      React.createElement("button", { type: "button" }, "speak"),
  };
});

jest.mock("./CopyBtn", () => {
  const React = require("react");

  return () => React.createElement("button", { type: "button" }, "copy");
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderTranForm(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TranForm
        text="library"
        setText={jest.fn()}
        apiSlugs={[]}
        fromLang="en"
        toLang="zh-CN"
        toLang2="-"
        transApis={[
          {
            apiSlug: "openai",
            apiName: "OpenAI",
            apiType: "OpenAI",
            dictPrompt: "Dictionary prompt",
          },
        ]}
        simpleStyle
        langDetector="-"
        enDict="Bing"
        enSug="-"
        aiDictApiSlug="openai"
        selectionContext="The library is open."
        {...props}
      />
    );
  });

  return { container, root };
}

describe("TranForm AI dictionary tab", () => {
  beforeEach(() => {
    apiDict.mockReset();
    apiDict.mockResolvedValue("## library");
    document.body.innerHTML = "";
  });

  test.each([true, false])(
    "opens the AI dictionary tab once with selection context when simpleStyle is %s",
    async (simpleStyle) => {
      const { container, root } = renderTranForm({ simpleStyle });
      await flushEffects();

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(2);
      expect(apiDict).not.toHaveBeenCalled();

      await act(async () => {
        tabs[1].dispatchEvent(
          new MouseEvent("click", { bubbles: true, button: 0 })
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(apiDict).toHaveBeenCalledTimes(1);
      expect(apiDict).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "library",
          context: "The library is open.",
        })
      );

      act(() => {
        root.unmount();
      });
    }
  );

  test("keeps the AI dictionary tab selected when text changes", async () => {
    const { container, root } = renderTranForm();
    await flushEffects();

    let tabs = container.querySelectorAll('[role="tab"]');
    await act(async () => {
      tabs[1].dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiDict).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <TranForm
          text="baseline"
          setText={jest.fn()}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[
            {
              apiSlug: "openai",
              apiName: "OpenAI",
              apiType: "OpenAI",
              dictPrompt: "Dictionary prompt",
            },
          ]}
          simpleStyle
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="openai"
          selectionContext="If you create a baseline at this point."
        />
      );
    });
    await flushEffects();

    tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(apiDict).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "baseline",
        context: "If you create a baseline at this point.",
      })
    );

    act(() => {
      root.unmount();
    });
  });
});

describe("TranForm translation service selection", () => {
  beforeEach(() => {
    apiDict.mockReset();
    document.body.innerHTML = "";
  });

  test("keeps user-selected services when text changes", async () => {
    const setText = jest.fn();
    const transApis = [
      {
        apiSlug: "google",
        apiName: "Google",
        apiType: "Google",
      },
      {
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
      },
    ];
    const { container, root } = renderTranForm({
      text: "hello",
      setText,
      apiSlugs: ["google"],
      transApis,
      simpleStyle: false,
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    const apiSlugsInput = container.querySelector('input[name="apiSlugs"]');
    const apiSlugsButton = apiSlugsInput
      .closest(".MuiInputBase-root")
      .querySelector(
        '[role="combobox"], [role="button"], [aria-haspopup="listbox"]'
      );
    await act(async () => {
      apiSlugsButton.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      await Promise.resolve();
    });

    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "openai")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google", "openai"]);

    act(() => {
      root.render(
        <TranForm
          text="hello world"
          setText={setText}
          apiSlugs={["google"]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={transApis}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
        />
      );
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google", "openai"]);

    act(() => {
      root.unmount();
    });
  });
});
