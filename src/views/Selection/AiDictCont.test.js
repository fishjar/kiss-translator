import { act } from "react";
import { createRoot } from "react-dom/client";
import AiDictCont from "./AiDictCont";
import { apiDict } from "../../apis";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({
  apiDict: jest.fn(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("react-markdown", () => {
  const React = require("react");

  return ({ children, components = {} }) => {
    const H2 = components.h2 || "h2";

    return React.createElement(
      "div",
      null,
      React.createElement(H2, null, "library"),
      React.createElement(
        "ul",
        null,
        React.createElement("li", null, "book room")
      ),
      React.createElement("pre", null, children)
    );
  };
});

jest.mock("./AudioBtn", () => {
  const React = require("react");

  return {
    BrowserTtsBtn: ({ text, lang }) =>
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "browser-tts",
          "data-text": text,
          "data-lang": lang,
        },
        "speak"
      ),
  };
});

jest.mock("./CopyBtn", () => {
  const React = require("react");

  return ({ text }) =>
    React.createElement(
      "button",
      { type: "button", "data-copy-text": text },
      "copy"
    );
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderAiDictCont(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <AiDictCont
        text="library"
        fromLang="en"
        toLang="zh-CN"
        context="The library is open."
        apiSetting={{
          apiSlug: "openai",
          apiType: "OpenAI",
          dictPrompt: "prompt",
        }}
        {...props}
      />
    );
  });

  return { container, root };
}

describe("AiDictCont", () => {
  beforeEach(() => {
    apiDict.mockReset();
    document.body.innerHTML = "";
  });

  test("renders markdown returned from apiDict", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont();
    await flushEffects();

    expect(apiDict).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "library",
        context: "The library is open.",
      })
    );
    expect(container.querySelector("h2")?.textContent).toContain("library");
    expect(container.querySelector("li")?.textContent).toBe("book room");
    const speechButton = container.querySelector("[data-testid='browser-tts']");
    expect(speechButton?.getAttribute("data-text")).toBe("library");
    expect(speechButton?.getAttribute("data-lang")).toBe("en");

    act(() => {
      root.unmount();
    });
  });

  test("uses detected language for speech when provided", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont({
      fromLang: "auto",
      speechLang: "ja",
    });
    await flushEffects();

    const speechButton = container.querySelector("[data-testid='browser-tts']");
    expect(speechButton?.getAttribute("data-lang")).toBe("ja");

    act(() => {
      root.unmount();
    });
  });

  test("does not render speech button without dictionary markdown", async () => {
    const { container, root } = renderAiDictCont({ text: "" });
    await flushEffects();

    expect(container.querySelector("[data-testid='browser-tts']")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  test("does not render speech button while initial result is loading", () => {
    apiDict.mockReturnValueOnce(new Promise(() => {}));

    const { container, root } = renderAiDictCont({ text: "loading-library" });

    expect(container.querySelector("[data-testid='browser-tts']")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  test("does not render speech button on dictionary error", async () => {
    apiDict.mockRejectedValueOnce(new Error("dictionary failed"));

    const { container, root } = renderAiDictCont();
    await flushEffects();

    expect(container.textContent).toContain("dictionary failed");
    expect(container.querySelector("[data-testid='browser-tts']")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  test("dedupes the same pending dictionary request", async () => {
    let resolveRequest;
    apiDict.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { root } = renderAiDictCont();

    act(() => {
      root.render(
        <AiDictCont
          text="library"
          fromLang="en"
          toLang="zh-CN"
          context="The library is open."
          apiSetting={{
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPrompt: "prompt",
          }}
        />
      );
    });

    expect(apiDict).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest("## library\n\n- book room");
      await Promise.resolve();
    });

    act(() => {
      root.unmount();
    });
  });
});
