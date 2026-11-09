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

  test("renders copy button before speech button in dict actions", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont();
    await flushEffects();

    const copyButton = container.querySelector("[data-copy-text]");
    const speechButton = container.querySelector("[data-testid='browser-tts']");

    expect(copyButton).not.toBeNull();
    expect(speechButton).not.toBeNull();
    expect(
      copyButton.compareDocumentPosition(speechButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

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

  test("retries a failed dictionary request when requestRevision increases", async () => {
    apiDict
      .mockRejectedValueOnce(new Error("Provider invocation timed out."))
      .mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont();
    await flushEffects();

    expect(container.textContent).toContain("Provider invocation timed out.");
    expect(apiDict).toHaveBeenCalledTimes(1);

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
          requestRevision={1}
        />
      );
    });
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain(
      "Provider invocation timed out."
    );
    expect(container.querySelector("h2")?.textContent).toContain("library");

    act(() => {
      root.unmount();
    });
  });

  test("does not disturb the pending dictionary request when requestRevision increases mid-flight", async () => {
    apiDict.mockReturnValueOnce(new Promise(() => {}));

    const { root } = renderAiDictCont({ text: "inflight-library" });

    act(() => {
      root.render(
        <AiDictCont
          text="inflight-library"
          fromLang="en"
          toLang="zh-CN"
          context="The library is open."
          apiSetting={{
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPrompt: "prompt",
          }}
          requestRevision={1}
        />
      );
    });

    expect(apiDict).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  test("does not resend the dictionary request when requestRevision is unchanged", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont({
      text: "unchanged-library",
    });
    await flushEffects();
    expect(apiDict).toHaveBeenCalledTimes(1);
    expect(container.querySelector("h2")?.textContent).toContain("library");

    act(() => {
      root.render(
        <AiDictCont
          text="unchanged-library"
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
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  test("keeps partial streamed markdown and does not disturb the pending request when requestRevision increases mid-flight", async () => {
    apiDict.mockReturnValueOnce(new Promise(() => {}));

    const { container, root } = renderAiDictCont({
      text: "streamed-library",
    });

    await act(async () => {
      apiDict.mock.calls[0][0].onStreamChunk({
        markdown: "## partial library",
      });
    });
    expect(container.textContent).toContain("partial library");

    act(() => {
      root.render(
        <AiDictCont
          text="streamed-library"
          fromLang="en"
          toLang="zh-CN"
          context="The library is open."
          apiSetting={{
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPrompt: "prompt",
          }}
          requestRevision={1}
        />
      );
    });
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("partial library");
    expect(container.querySelector("h2")?.textContent).toContain("library");

    act(() => {
      root.unmount();
    });
  });

  test("stays silent after a successful dictionary request when requestRevision increases", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont({
      text: "silent-library",
    });
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(1);
    expect(container.querySelector("h2")?.textContent).toContain("library");

    act(() => {
      root.render(
        <AiDictCont
          text="silent-library"
          fromLang="en"
          toLang="zh-CN"
          context="The library is open."
          apiSetting={{
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPrompt: "prompt",
          }}
          requestRevision={1}
        />
      );
    });
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(1);
    expect(container.querySelector("h2")?.textContent).toContain("library");
    expect(container.querySelector(".MuiCircularProgress-root")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  test("keeps the retry gate closed after a successful retry", async () => {
    apiDict
      .mockRejectedValueOnce(new Error("Provider invocation timed out."))
      .mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont({
      text: "gated-library",
    });
    await flushEffects();

    expect(container.textContent).toContain("Provider invocation timed out.");
    expect(apiDict).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <AiDictCont
          text="gated-library"
          fromLang="en"
          toLang="zh-CN"
          context="The library is open."
          apiSetting={{
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPrompt: "prompt",
          }}
          requestRevision={1}
        />
      );
    });
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(2);
    expect(container.querySelector("h2")?.textContent).toContain("library");

    act(() => {
      root.render(
        <AiDictCont
          text="gated-library"
          fromLang="en"
          toLang="zh-CN"
          context="The library is open."
          apiSetting={{
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPrompt: "prompt",
          }}
          requestRevision={2}
        />
      );
    });
    await flushEffects();

    expect(apiDict).toHaveBeenCalledTimes(2);
    expect(container.querySelector("h2")?.textContent).toContain("library");

    act(() => {
      root.unmount();
    });
  });

  test("does not resend the dictionary request when a failed request is followed by a new text submission", async () => {
    apiDict
      .mockRejectedValueOnce(new Error("Provider invocation timed out."))
      .mockResolvedValueOnce("## new library\n\n- book room");

    const { container, root } = renderAiDictCont({ text: "old-library" });
    await flushEffects();

    expect(container.textContent).toContain("Provider invocation timed out.");
    expect(apiDict).toHaveBeenCalledTimes(1);

    // Production-timing reproduction: text and requestRevision land in one
    // commit, the passive-effect flush and the re-render triggered by the
    // retry-sync bump are separate macrotasks, so a fast response settles and
    // deregisters itself from pendingRequests in between. act() would collapse
    // that gap, so this render deliberately runs outside it.
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    root.render(
      <AiDictCont
        text="new-library"
        fromLang="en"
        toLang="zh-CN"
        context="The library is open."
        apiSetting={{
          apiSlug: "openai",
          apiType: "OpenAI",
          dictPrompt: "prompt",
        }}
        requestRevision={1}
      />
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    expect(apiDict).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("new library");

    act(() => {
      root.unmount();
    });
  });

  test("keeps dict actions in flow without reserved padding when width is unmeasured", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    const { container, root } = renderAiDictCont();
    await flushEffects();

    const panel = container.firstElementChild;
    const actions = panel.querySelector("[data-testid='ai-dict-actions']");
    const typography = panel.lastElementChild;
    expect(actions).not.toBeNull();
    expect(typography).not.toBeNull();

    // Emotion injects via CSSOM (speedy) in this environment: the style tag's
    // textContent is empty and the rules live in style.sheet.cssRules. Read
    // both sources and strip whitespace, since cssText re-serializes with
    // spaces after colons while the sx contract is spacing-insensitive.
    const ruleText = Array.from(document.querySelectorAll("style[data-emotion]"))
      .flatMap((style) => [
        style.textContent,
        ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
      ])
      .join("\n")
      .replace(/\s+/g, "");
    const classRules = (element) =>
      Array.from(element.classList)
        .flatMap((cls) =>
          Array.from(
            ruleText.matchAll(new RegExp("\\." + cls + "[^{}]*\\{[^}]*\\}", "g"))
          ).map((match) => match[0])
        )
        .join("\n");

    const actionsRules = classRules(actions);
    const panelRules = classRules(panel);
    const typographyRules = classRules(typography);

    // 未测得态契约：操作区流内布局（relative，不绝对定位），Typography 不
    // 输出 end padding；jsdom 无 ResizeObserver，本用例恒走未测得分支。
    expect(actionsRules).toContain("position:relative");
    expect(actionsRules).not.toContain("position:absolute");
    expect(actionsRules).toContain("justify-self:end");
    expect(actionsRules).toContain("gap:8px");
    expect(panelRules).toContain("position:relative");
    expect(typographyRules).not.toContain("padding-inline-end");

    act(() => {
      root.unmount();
    });
  });

  test("reserves text end padding by measured actions width via ResizeObserver", async () => {
    apiDict.mockResolvedValueOnce("## library\n\n- book room");

    let resizeCallback = null;
    const originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    };

    // container/root 须在 try 外声明：const 解构在 try 块内声明时
    // finally 块不可见（实测 ReferenceError）。
    let container, root;
    try {
      ({ container, root } = renderAiDictCont());
      await flushEffects();

      // 与既有夹具同构的元素获取（AiDictCont.test.js:528-530 口径）：
      // panel = container.firstElementChild、actions = panel.querySelector(...)、
      // typography = panel.lastElementChild。
      const panel = container.firstElementChild;
      const actions = panel.querySelector("[data-testid='ai-dict-actions']");
      const typography = panel.lastElementChild;
      expect(actions).not.toBeNull();
      expect(typography).not.toBeNull();
      expect(resizeCallback).not.toBeNull();

      // Emotion speedy 模式：规则注入走 CSSOM，style 标签 textContent 为空，
      // 照既有 ruleText/classRules 管道读取并 strip 空白后匹配（同 :538-552）。
      // 规则文本在每次断言时现采：setActionsWidth 会注入新类规则，
      // 触发回调前快照的 ruleText 不含新规则（首跑实测踩坑）。
      const collectRuleText = () =>
        Array.from(document.querySelectorAll("style[data-emotion]"))
          .flatMap((style) => [
            style.textContent,
            ...Array.from(style.sheet?.cssRules || []).map((rule) => rule.cssText),
          ])
          .join("\n")
          .replace(/\s+/g, "");
      const classRules = (element) =>
        Array.from(element.classList)
          .flatMap((cls) =>
            Array.from(
              collectRuleText().matchAll(
                new RegExp("\\." + cls + "[^{}]*\\{[^}]*\\}", "g")
              )
            ).map((match) => match[0])
          )
          .join("\n");

      // 模拟测量：操作区实测 64px 宽、40px 高（CopyBtn+BrowserTtsBtn 量级）。
      jest.spyOn(actions, "getBoundingClientRect").mockReturnValue({
        width: 64,
        height: 40,
      });
      await act(async () => {
        resizeCallback([{ target: actions }]);
      });

      // 文本与按钮不重叠的机器化口径：paddingInlineEnd = 实测宽度 + 8px 余量。
      expect(classRules(typography)).toContain("padding-inline-end:72px");
      // 垂直预留契约：操作区绝对定位脱离容器高度计算，容器以实测操作区
      // 高度兜底 minHeight——单行内容矮于操作区时操作区不溢出容器、
      // 不遮挡后续内容。
      expect(classRules(panel)).toContain("min-height:40px");
      // 已测得态契约：操作区切绝对定位贴逻辑行末，让出独立网格行。
      const measuredActionsRules = classRules(actions);
      expect(measuredActionsRules).toContain("position:absolute");
      // emotion 实测序列化为无单位 `inset-inline-end:0`。
      expect(measuredActionsRules).toContain("inset-inline-end:0");
      expect(measuredActionsRules).toContain("top:0");

      // 宽度变化（如 loading 圈出现/消失）跟随更新：缩回 40px 后收窄为 48px。
      jest.spyOn(actions, "getBoundingClientRect").mockReturnValue({
        width: 40,
        height: 40,
      });
      await act(async () => {
        resizeCallback([{ target: actions }]);
      });
      expect(classRules(typography)).toContain("padding-inline-end:48px");
    } finally {
      window.ResizeObserver = originalResizeObserver;
      if (root) {
        act(() => {
          root.unmount();
        });
      }
      if (container) {
        container.remove();
      }
    }
  });
});
