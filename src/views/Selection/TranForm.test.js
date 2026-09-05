import { act } from "react";
import { createRoot } from "react-dom/client";
import TranForm from "./TranForm";
import { apiDict } from "../../apis";
import { tryDetectLang } from "../../libs/detect";

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

  return ({
    apiSlug,
    text,
    toLang,
    translateVariants,
    detectedLang,
    sourceDetectionPending,
  }) =>
    React.createElement("div", {
      "data-testid": "tran-cont",
      "data-api-slug": apiSlug,
      "data-text": text,
      "data-to-lang": toLang,
      "data-translate-variants": String(translateVariants),
      "data-detected-lang": detectedLang,
      "data-source-detection-pending": String(sourceDetectionPending),
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  test("uses translationText for every translation service", async () => {
    const { container, root } = renderTranForm({
      text: "First line\nSecond line",
      translationText: "First line Second line",
      apiSlugs: ["google", "openai"],
      transApis: [
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
        { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
      ],
      simpleStyle: false,
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (element) => element.dataset.text
      )
    ).toEqual(["First line Second line", "First line Second line"]);

    act(() => root.unmount());
  });

  test("switches to the secondary target when Chinese variants are disabled", async () => {
    tryDetectLang.mockResolvedValue("zh-TW");
    const { container, root } = renderTranForm({
      text: "繁體中文",
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "en",
      translateVariants: false,
    });
    await flushEffects();

    const translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.toLang).toBe("en");
    expect(translation.dataset.translateVariants).toBe("false");

    act(() => root.unmount());
  });

  test("keeps the primary target when Chinese variants are enabled", async () => {
    tryDetectLang.mockResolvedValue("zh-TW");
    const { container, root } = renderTranForm({
      text: "繁體中文",
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "en",
      translateVariants: true,
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="tran-cont"]').dataset.toLang
    ).toBe("zh-CN");

    act(() => root.unmount());
  });

  test("passes only the current complete-input detection result to translations", async () => {
    const firstDetection = createDeferred();
    const secondDetection = createDeferred();
    tryDetectLang.mockImplementation((value) =>
      value === "first" ? firstDetection.promise : secondDetection.promise
    );
    const transApis = [
      { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
    ];
    const baseProps = {
      setText: jest.fn(),
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "-",
      transApis,
      simpleStyle: false,
      langDetector: "Baidu",
      enDict: "-",
      enSug: "-",
      aiDictApiSlug: "-",
    };
    const { container, root } = renderTranForm({
      ...baseProps,
      text: "first",
    });
    await flushEffects();

    act(() => {
      root.render(<TranForm {...baseProps} text="second" />);
    });
    await flushEffects();
    let translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.detectedLang).toBe("");
    expect(translation.dataset.sourceDetectionPending).toBe("true");

    await act(async () => {
      firstDetection.resolve("fr");
      await firstDetection.promise;
    });
    translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.detectedLang).toBe("");
    expect(translation.dataset.sourceDetectionPending).toBe("true");

    await act(async () => {
      secondDetection.resolve("de");
      await secondDetection.promise;
    });
    translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.detectedLang).toBe("de");
    expect(translation.dataset.sourceDetectionPending).toBe("false");

    act(() => root.unmount());
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

describe("TranForm input focus and external text synchronization", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  test("focuses the original text input when auto focus is enabled", async () => {
    const { container, root } = renderTranForm({
      text: "",
      simpleStyle: false,
      autoFocusInput: true,
    });
    await flushEffects();

    expect(document.activeElement).toBe(container.querySelector("textarea"));
    act(() => root.unmount());
  });

  test("does not focus the original text input when auto focus is disabled", async () => {
    const { container, root } = renderTranForm({
      text: "bug",
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();

    expect(document.activeElement).not.toBe(
      container.querySelector("textarea")
    );
    act(() => root.unmount());
  });

  test("focuses after asynchronous initialization allows auto focus", async () => {
    const props = {
      text: "",
      simpleStyle: false,
      autoFocusInput: false,
    };
    const { container, root } = renderTranForm(props);
    await flushEffects();
    const input = container.querySelector("textarea");
    expect(document.activeElement).not.toBe(input);

    act(() => {
      root.render(
        <TranForm
          text=""
          setText={jest.fn()}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[]}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
          autoFocusInput
        />
      );
    });
    await flushEffects();

    expect(document.activeElement).toBe(input);
    act(() => root.unmount());
  });

  test("keeps clipboard text visible and submits it after blur while editing", async () => {
    const setText = jest.fn();
    const transApis = [];
    const { container, root } = renderTranForm({
      text: "",
      setText,
      transApis,
      simpleStyle: false,
      autoFocusInput: true,
      syncExternalTextWhileEditing: true,
    });
    await flushEffects();

    act(() => {
      root.render(
        <TranForm
          text="bug"
          setText={setText}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={transApis}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
          autoFocusInput={false}
          syncExternalTextWhileEditing
        />
      );
    });
    await flushEffects();

    const input = container.querySelector("textarea");
    expect(input.value).toBe("bug");

    await act(async () => {
      input.blur();
      await Promise.resolve();
    });
    expect(setText).toHaveBeenLastCalledWith("bug");
    act(() => root.unmount());
  });
});

describe("TranForm API selection persistence (apiSlugsStorageKey)", () => {
  const TEST_STORAGE_KEY = "kt-test-tranform-api-slugs";
  const mockApis = [
    { apiSlug: "google", apiName: "Google", apiType: "Google" },
    { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
    { apiSlug: "deepl", apiName: "DeepL", apiType: "DeepL", isDisabled: true },
  ];

  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
    window.localStorage.removeItem(TEST_STORAGE_KEY);
  });

  test("P4 Red: 用户多选接口后写入 storageKey，并在重新挂载后恢复选择", async () => {
    // 第一次挂载：无持久化值，从 prop initApiSlugs=[] 启动
    const view = renderTranForm({
      simpleStyle: false,
      apiSlugs: [],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 初始没有 TranCont
    expect(view.container.querySelectorAll('[data-testid="tran-cont"]')).toHaveLength(0);

    // 用户在下拉菜单勾选 openai
    const apiSlugsInput = view.container.querySelector('input[name="apiSlugs"]');
    const apiSlugsButton = apiSlugsInput
      .closest(".MuiInputBase-root")
      .querySelector('[role="combobox"], [role="button"], [aria-haspopup="listbox"]');
    await act(async () => {
      apiSlugsButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "openai")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    // 第一次已出现 openai
    expect(
      [...view.container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["openai"]);

    // 卸载组件（模拟页签切换 / 路由跳转）
    act(() => view.root.unmount());
    document.body.innerHTML = "";

    // localStorage 中已写入
    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).toBe(
      JSON.stringify(["openai"])
    );

    // 第二次挂载（即使 prop apiSlugs 仍传空数组，也从 storageKey 恢复）
    const utils = renderTranForm({
      simpleStyle: false,
      apiSlugs: [],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 重新挂载后恢复了用户选择的 openai
    expect(
      [...utils.container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["openai"]);

    act(() => utils.root.unmount());
  });

  test("P4: 存储中存在非法 JSON、非数组或脏值时异常降级，回落既有默认行为", async () => {
    // 损坏值
    window.localStorage.setItem(TEST_STORAGE_KEY, "invalid-json{{");
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: ["google"],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 无崩溃，保持 prop 默认的 google
    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    act(() => root.unmount());
  });

  test("P4: 存储中的已删除或已禁用接口被自动过滤", async () => {
    // 存储中含：已禁用的 deepl 与已删除的 ghost
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify(["openai", "deepl", "ghost"])
    );
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: [],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 只恢复有效的 openai，已禁用的 deepl 与不存在的 ghost 被过滤
    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["openai"]);

    act(() => root.unmount());
  });

  test("P4: 有效存储空数组 [] 表示用户显式未选择，不被 prop 默认值覆盖", async () => {
    window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify([]));
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: ["google"], // prop 默认传 google
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 用户显式选空 → 不展示任何翻译引擎
    expect(container.querySelectorAll('[data-testid="tran-cont"]')).toHaveLength(0);

    act(() => root.unmount());
  });

  test("P4: 未传 apiSlugsStorageKey 时不读写 localStorage，保持既有行为", async () => {
    // 即使 localStorage 中有该键，未传 prop 也绝不读取
    window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(["openai"]));
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: ["google"],
      transApis: mockApis,
      // 无 apiSlugsStorageKey
    });
    await flushEffects();

    // 仍使用 prop 的 google，不使用存储的 openai
    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    act(() => root.unmount());
  });

  test("Fix3 Red：恢复 pending 恰好读取一次 storage 且不回退用户窗口期内选择", async () => {
    // 前置（防假绿 Red）：必须预置有效可恢复选择——旧实现的确定性重读依赖
    // 恢复分支实际执行 setApiSlugs 触发重渲染；无预置时置 null 无 setState，
    // 计数恒 1，断言在坏代码上也绿。
    window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(["alpha"]));
    const getItemSpy = jest.spyOn(Storage.prototype, "getItem");
    const keyReads = () =>
      getItemSpy.mock.calls.filter(([key]) => key === TEST_STORAGE_KEY).length;

    const firstGenApis = [
      { apiSlug: "alpha", apiName: "Alpha", apiType: "OpenAI" },
      { apiSlug: "beta", apiName: "Beta", apiType: "OpenAI" },
    ];
    const baseProps = {
      text: "library",
      setText: jest.fn(),
      apiSlugs: [],
      fromLang: "en",
      toLang: "zh-CN",
      toLang2: "-",
      transApis: firstGenApis,
      simpleStyle: false,
      langDetector: "-",
      enDict: "Bing",
      enSug: "-",
      aiDictApiSlug: "-",
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    };
    // 不解构 container：DOM 查询走 document.body（eslint-plugin-testing-library
    // 对 renderTranForm——名称含 "render" 子串——返回的 container 变量查询
    // 会被 no-container 误报，body 级查询为既有豁免先例）。
    const { root } = renderTranForm(baseProps);
    await flushEffects();

    // 断言 1：挂载完成恢复恰好读取一次 storage（旧实现渲染期条件被终态
    // 重新武装 → 确定性重读 → 计数 2 → Red）。
    expect(keyReads()).toBe(1);
    expect(
      [...document.body.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["alpha"]);

    // 用户经真实 Select 改选为恰好 ["beta"]（恢复后 alpha 已选中：
    // 先加选 beta，再取消 alpha）。
    const apiSlugsInput = document.body.querySelector('input[name="apiSlugs"]');
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
    const clickOption = async (slug) => {
      await act(async () => {
        [...document.body.querySelectorAll('[role="option"]')]
          .find((option) => option.getAttribute("data-value") === slug)
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
    };
    await clickOption("beta");
    await clickOption("alpha");

    expect(
      [...document.body.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["beta"]);

    // 断言 2（双断言缺一不可）：二代 transApis（新数组引用，仍含 alpha 与
    // beta）重渲染后，恢复既不得重读 storage，也不得把用户选择回退为
    // 渲染期陈旧快照。
    const secondGenApis = [
      { apiSlug: "alpha", apiName: "Alpha", apiType: "OpenAI" },
      { apiSlug: "beta", apiName: "Beta", apiType: "OpenAI" },
    ];
    // act 回调内以具名中转函数重渲染（同 no-unnecessary-act 子串匹配规避）。
    const mountWithApis = (apis) => {
      root.render(<TranForm {...baseProps} transApis={apis} />);
    };
    act(() => {
      mountWithApis(secondGenApis);
    });
    await flushEffects();

    expect(keyReads()).toBe(1);
    expect(
      [...document.body.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["beta"]);

    act(() => root.unmount());
  });
});
