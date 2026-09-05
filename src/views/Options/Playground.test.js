import { act } from "react";
import { createRoot } from "react-dom/client";
import Playground, { normalizePlaygroundLineBreaks } from "./Playground";
import { defaultSystemPrompt } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockTranForm = jest.fn();
const mockTerminology = jest.fn();

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      // OpenAI 兼容 AI 接口条目（含 batchPromptSlug 引用），父组件应 resolve 为聚合提示词后下传。
      transApis: [
        {
          apiSlug: "openai",
          apiName: "OpenAI 兼容",
          apiType: "OpenAI",
          isDisabled: false,
          useBatchFetch: true,
          batchPromptSlug: "batch-translation-json",
        },
      ],
      prompts: [],
      subtitleSetting: {},
      tranboxSetting: {},
    },
  }),
}));

// 子组件使用轻量替身，当前测试只关注 Playground 的页签归属和切换行为。
jest.mock("../Selection/TranForm", () => {
  const React = require("react");
  return (props) => {
    mockTranForm(props);
    return React.createElement("div", { "data-testid": "translation-tab" });
  };
});

jest.mock("./SubtitleSegmentationPlayground", () => {
  const React = require("react");
  return () =>
    React.createElement("div", { "data-testid": "segmentation-tab" });
});

jest.mock("./TerminologyPlayground", () => {
  const React = require("react");
  return (props) => {
    mockTerminology(props);
    return React.createElement("div", { "data-testid": "terminology-tab" });
  };
});

test("moves the existing translator into the text tab and exposes segmentation testing", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  expect(
    container.querySelector('[data-testid="translation-tab"]')
  ).not.toBeNull();
  const segmentationTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "字幕断句"
  );
  await act(async () => {
    segmentationTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(container.querySelector('[data-testid="translation-tab"]')).toBeNull();
  expect(
    container.querySelector('[data-testid="segmentation-tab"]')
  ).not.toBeNull();
  act(() => root.unmount());
});

test("passes the apiSlugs storage key to the translation test form", async () => {
  mockTranForm.mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  // TranForm 收到 Playground 专属的接口选择持久化键（刷新后多选接口回填）。
  const props = mockTranForm.mock.calls.at(-1)[0];
  expect(props.apiSlugsStorageKey).toBe("kt-playground-api-slugs");

  act(() => root.unmount());
});

test.each([
  ["First\nSecond", "First Second"],
  ["First\r\nSecond", "First Second"],
  ["First\rSecond", "First Second"],
  ["First  \n\tSecond", "First Second"],
  ["First\n\nSecond", "First\n\nSecond"],
  ["First\n \t\nSecond", "First\n\nSecond"],
  ["First\n\n\nSecond", "First\n\nSecond"],
])("normalizes Playground line breaks in %j", (source, expected) => {
  expect(normalizePlaygroundLineBreaks(source)).toBe(expected);
});

test("keeps the original input while toggling request-only normalization", async () => {
  mockTranForm.mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  const source = "First line\nSecond line\n\nNext paragraph";
  act(() => {
    mockTranForm.mock.calls.at(-1)[0].setText(source);
  });

  let props = mockTranForm.mock.calls.at(-1)[0];
  expect(props.text).toBe(source);
  expect(props.translationText).toBe(source);

  await act(async () => {
    container
      .querySelector('input[type="checkbox"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  props = mockTranForm.mock.calls.at(-1)[0];
  expect(props.text).toBe(source);
  expect(props.translationText).toBe(
    "First line Second line\n\nNext paragraph"
  );
  act(() => root.unmount());
});

test("mounts the terminology tab and forwards shared text state to it", async () => {
  mockTranForm.mockClear();
  mockTerminology.mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  const translationTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "文本翻译"
  );
  const terminologyTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "专业术语"
  );
  expect(terminologyTab).not.toBeUndefined();

  // 点击新页签后确实挂载 TerminologyPlayground（替身以 data-testid 标识）。
  await act(async () => {
    terminologyTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(
    container.querySelector('[data-testid="terminology-tab"]')
  ).not.toBeNull();
  expect(container.querySelector('[data-testid="translation-tab"]')).toBeNull();

  // 共享回调正确传入新组件（text 由 state 提升共享，不通过 prop 传递）。
  let props = mockTerminology.mock.calls.at(-1)[0];
  expect(props.text).toBeUndefined();
  expect(typeof props.setText).toBe("function");
  expect(typeof props.setActiveTab).toBe("function");
  // 父组件把 resolve 后的 resolvedTransApis 传给 TerminologyPlayground（与 TranForm 一致）。
  expect(Array.isArray(props.transApis)).toBe(true);
  // resolvedTransApis 中 batchPromptSlug 被展开为聚合翻译提示词。
  const forwarded = props.transApis[0];
  expect(forwarded.apiSlug).toBe("openai");
  expect(forwarded.useBatchFetch).toBe(true);
  expect(forwarded.systemPrompt).toContain("Act as a translation API");

  // 先回翻译页签写入文本，再切回术语页签，确认共享 text 通过 setText 提升正确更新。
  await act(async () => {
    translationTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  act(() => {
    mockTranForm.mock.calls.at(-1)[0].setText("Hello world");
  });
  await act(async () => {
    terminologyTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // TerminologyPlayground 不接收 text prop（text 由 state 提升，经 setText 共享）。
  props = mockTerminology.mock.calls.at(-1)[0];
  expect(props.text).toBeUndefined();

  // 新组件通过 setText 修改共享文本后，切换页签再回来文本仍然保留在 TraceForm 中。
  act(() => {
    mockTerminology.mock.calls.at(-1)[0].setText("Hello replaced");
  });
  await act(async () => {
    translationTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(mockTranForm.mock.calls.at(-1)[0].text).toBe("Hello replaced");

  // setActiveTab 回调实际生效：从术语页签调用后渲染出翻译页签。
  act(() => {
    mockTerminology.mock.calls.at(-1)[0].setActiveTab("translation");
  });
  expect(container.querySelector('[data-testid="terminology-tab"]')).toBeNull();
  expect(
    container.querySelector('[data-testid="translation-tab"]')
  ).not.toBeNull();
  expect(mockTranForm.mock.calls.at(-1)[0].text).toBe("Hello replaced");

  act(() => root.unmount());
});

test("keeps the terminology draft across tab round-trips (编辑术语 → 切走 → 返回)", async () => {
  mockTerminology.mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  const termsTab = () =>
    [...container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "专业术语"
    );
  const translationTab = () =>
    [...container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "文本翻译"
    );

  // 进入术语页签。
  await act(async () => {
    termsTab().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // 用户编辑术语草稿（父级状态提升，不因子组件卸载而销毁）。
  act(() => {
    mockTerminology.mock.calls.at(-1)[0].setTermsDraft("API,接口;APIKey");
    mockTerminology.mock.calls.at(-1)[0].setTermDraftTouched(true);
    mockTerminology.mock.calls.at(-1)[0].setTermSeed("3");
  });

  // 切到翻译页签（术语页签子组件卸载）。
  await act(async () => {
    translationTab().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.querySelector('[data-testid="terminology-tab"]')).toBeNull();

  // 返回术语页签：草稿完整保留（术语、touched 标记、seed）。
  await act(async () => {
    termsTab().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const props = mockTerminology.mock.calls.at(-1)[0];
  expect(props.termsDraft).toBe("API,接口;APIKey");
  expect(props.termDraftTouched).toBe(true);
  expect(props.termSeed).toBe("3");

  act(() => root.unmount());
});

test("preserves the terminology draft across the send-to-translation flow", async () => {
  mockTerminology.mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  const termsTab = () =>
    [...container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "专业术语"
    );
  await act(async () => {
    termsTab().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // 编辑草稿并发送原文到翻译页签。
  act(() => {
    mockTerminology.mock.calls.at(-1)[0].setTermsDraft("GPT;GPTs,智能体集合");
    mockTerminology.mock.calls.at(-1)[0].setTermDraftTouched(true);
    mockTerminology.mock.calls
      .at(-1)[0]
      .setText("Please check the GPT and GPTs configuration in this document.");
    mockTerminology.mock.calls.at(-1)[0].setActiveTab("translation");
  });
  // 翻译页签显示发送的原文。
  expect(mockTranForm.mock.calls.at(-1)[0].text).toContain("GPT");

  // 返回术语页签后，未保存的术语草稿仍然保留。
  await act(async () => {
    termsTab().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const props = mockTerminology.mock.calls.at(-1)[0];
  expect(props.termsDraft).toBe("GPT;GPTs,智能体集合");
  expect(props.termDraftTouched).toBe(true);

  act(() => root.unmount());
});

test("never leaks the terminology resize handle into other playground tabs", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));

  // 遍历全部页签：无论切换到哪里，术语库的自定义缩放手柄都不得出现在
  // 翻译、字幕断句等页面（其他 multiline 输入框保持原样，不共享该控件）。
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  expect(tabs.length).toBeGreaterThanOrEqual(3);
  for (const tab of tabs) {
    await act(async () => {
      tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-resize-handle"]')
    ).toBeNull();
  }

  act(() => root.unmount());
});

test("persists terminology drafts to localStorage across unmount/remount", async () => {
  mockTerminology.mockClear();
  // 清空 localStorage，确保从干净状态开始。
  window.localStorage.removeItem("kt-playground-terms-draft");
  window.localStorage.removeItem("kt-playground-aiterms-draft");

  const render = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Playground />));
    return { container, root };
  };

  // 第一次挂载：编辑两个草稿。
  let { container, root } = render();
  const termsTab = () =>
    [...container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "专业术语"
    );
  await act(async () => {
    termsTab().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  act(() => {
    mockTerminology.mock.calls.at(-1)[0].setTermsDraft("API,接口");
    mockTerminology.mock.calls
      .at(-1)[0]
      .setAiTermsDraft("API,Application Interface");
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  // 卸载组件（模拟切走路由）。
  act(() => root.unmount());
  document.body.removeChild(container);

  // localStorage 已写入。
  expect(window.localStorage.getItem("kt-playground-terms-draft")).toBe(
    "API,接口"
  );
  expect(window.localStorage.getItem("kt-playground-aiterms-draft")).toBe(
    "API,Application Interface"
  );

  // 第二次挂载：两个草稿被回填，且 termDraftTouched 为 true（不被规则覆盖）。
  ({ container, root } = render());
  const termsTab2 = () =>
    [...container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "专业术语"
    );
  await act(async () => {
    termsTab2().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  let props = mockTerminology.mock.calls.at(-1)[0];
  expect(props.termsDraft).toBe("API,接口");
  expect(props.aiTermsDraft).toBe("API,Application Interface");
  expect(props.termDraftTouched).toBe(true);

  act(() => root.unmount());
  window.localStorage.removeItem("kt-playground-terms-draft");
  window.localStorage.removeItem("kt-playground-aiterms-draft");
});

test("does not mark an empty or whitespace-only restored draft as touched", async () => {
  mockTerminology.mockClear();
  window.localStorage.setItem("kt-playground-terms-draft", "");
  window.localStorage.removeItem("kt-playground-aiterms-draft");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Playground />));
  const termsTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "专业术语"
  );
  await act(async () => {
    termsTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // 空串草稿不标记已编辑：术语页挂载时仍可执行默认填入示例 + 例句自动生成。
  expect(mockTerminology.mock.calls.at(-1)[0].termDraftTouched).toBe(false);
  act(() => root.unmount());
  window.localStorage.removeItem("kt-playground-terms-draft");
  window.localStorage.removeItem("kt-playground-aiterms-draft");
});

describe("draft persistence debounce", () => {
  // 断言用键字面量（与生产实现同值）。
  const TERMS_KEY = "kt-playground-terms-draft";
  const AI_TERMS_KEY = "kt-playground-aiterms-draft";

  // act 回调内以具名中转函数挂载：testing-library/no-unnecessary-act 按
  // 标识符名子串匹配 TL 工具（含 "render" 子串的名称一律命中），act 直接
  // 包裹 render 名称调用会被误报，故经由不含该子串的中转函数。
  const mountIntoRoot = (root) => {
    root.render(<Playground />);
  };
  const mountView = () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      mountIntoRoot(root);
    });
    return { host, root };
  };
  const openTermsTab = async (host) => {
    const termsTab = [...host.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "专业术语"
    );
    act(() => {
      termsTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
    window.localStorage.removeItem(TERMS_KEY);
    window.localStorage.removeItem(AI_TERMS_KEY);
    document.body.innerHTML = "";
  });

  test("C2 Red：settle 前零落盘，settle 后 trailing 恰好一次写入最终值", async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    const termsCalls = () =>
      setItemSpy.mock.calls.filter(([key]) => key === TERMS_KEY);

    const { host, root } = mountView();
    await openTermsTab(host);

    // 连击三次草稿输入（每次触发一次 effect 调度）。
    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("A");
    });
    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("B");
    });
    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("C");
    });
    // 防抖窗口内不得有任何同步落盘（旧实现 mount + 每击键各写一次 → Red）。
    expect(termsCalls()).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    // trailing 语义：settle 后恰好一次，且只写最终值 "C"。
    const settled = termsCalls();
    expect(settled).toHaveLength(1);
    expect(settled[0][1]).toBe("C");

    act(() => root.unmount());
  });

  test("C2 回归锁定：unmount 同步 flush 最终值且 cancel 未决防抖（无幽灵写盘）", async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    const termsCalls = () =>
      setItemSpy.mock.calls.filter(([key]) => key === TERMS_KEY);

    const { host, root } = mountView();
    await openTermsTab(host);

    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("final");
    });

    // 不推进 timer 直接卸载：卸载 flush 必须同步落盘（既有持久化语义）。
    act(() => root.unmount());
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("final");

    // 推进一个防抖周期：cancel 生效，不得再有幽灵写盘。
    const callsAfterUnmount = termsCalls().length;
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(termsCalls()).toHaveLength(callsAfterUnmount);
  });
});
