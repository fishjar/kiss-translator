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
    return React.createElement(
      "div",
      { "data-testid": "translation-tab" },
      props.playgroundConfigHeader
    );
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
  expect(container.querySelector(".kt-playground")).not.toBeNull();
  expect(
    container.querySelector(".kt-playground-config__header")
  ).not.toBeNull();
  expect(container.textContent).toContain("翻译配置");
  expect(container.textContent).toContain("合并单个换行");
  const segmentationTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "字幕断句"
  );
  const translationTab = container.querySelector(
    "#kt-playground-translation-tab"
  );
  expect(
    container.querySelector('[role="tablist"]').getAttribute("aria-label")
  ).toBe("Playground");
  expect(translationTab.getAttribute("aria-controls")).toBe(
    "kt-playground-translation-panel"
  );
  expect(
    container
      .querySelector("#kt-playground-translation-panel")
      .getAttribute("aria-labelledby")
  ).toBe(translationTab.id);
  await act(async () => {
    segmentationTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(container.querySelector('[data-testid="translation-tab"]')).toBeNull();
  expect(
    container.querySelector('[data-testid="segmentation-tab"]')
  ).not.toBeNull();
  expect(
    container
      .querySelector("#kt-playground-segmentation-panel")
      .getAttribute("aria-labelledby")
  ).toBe(segmentationTab.id);
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
  expect(forwarded.systemPrompt).toContain(
    "Act as a professional machine translation engine"
  );

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

describe("draft multi-tab race and unload flush (M3/B1)", () => {
  const TERMS_KEY = "kt-playground-terms-draft";
  const AI_TERMS_KEY = "kt-playground-aiterms-draft";
  const SEED_KEY = "kt-playground-term-seed";
  const DRAFT_KEYS = [TERMS_KEY, AI_TERMS_KEY, SEED_KEY];

  const mountView = () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(<Playground />);
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
    document.body.innerHTML = "";
    DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
  });

  afterEach(() => {
    DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
    document.body.innerHTML = "";
  });

  test("M3：pagehide/beforeunload 时三键同步 flush（含此前不持久化的 seed）", async () => {
    const { host, root } = mountView();
    await openTermsTab(host);

    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("P1");
      mockTerminology.mock.calls.at(-1)[0].setAiTermsDraft("P2");
      mockTerminology.mock.calls.at(-1)[0].setTermSeed("3");
    });

    // 防抖窗口未到期直接派发 pagehide：三键必须同步落盘（修复前无监听 → 红）。
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("P1");
    expect(window.localStorage.getItem(AI_TERMS_KEY)).toBe("P2");
    expect(window.localStorage.getItem(SEED_KEY)).toBe("3");

    // beforeunload 同样兜底。
    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("P1b");
    });
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("P1b");

    act(() => root.unmount());
  });

  test("M3：seed 持久化跨卸载/重挂载恢复", async () => {
    const { host, root } = mountView();
    await openTermsTab(host);
    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermSeed("7");
    });
    act(() => root.unmount());

    const { host: host2, root: root2 } = mountView();
    await openTermsTab(host2);
    expect(mockTerminology.mock.calls.at(-1)[0].termSeed).toBe("7");
    act(() => root2.unmount());
  });

  test("B1①：storage 事件把另一 Tab 的草稿更新同步进本地状态", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    const { host, root } = mountView();
    await openTermsTab(host);
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("A");

    // 另一 Tab 直接改写 LS 并广播 storage 事件。
    window.localStorage.setItem(TERMS_KEY, "B");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: "B" })
      );
    });
    // 修复前无 storage 监听，本地仍为 A → 红。
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("B");

    act(() => root.unmount());
    // 卸载写回前比对：自身最后已知值 = B，与 LS 一致，写回不改变内容。
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("B");
  });

  test("B1②：另一 Tab 在感知之后又改写时，卸载写回不覆盖其新值", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    const { host, root } = mountView();
    await openTermsTab(host);

    window.localStorage.setItem(TERMS_KEY, "B");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: "B" })
      );
    });
    // 另一 Tab 在本 Tab 感知之后、卸载之前又改写为 C（无 storage 事件：
    // 例如该 Tab 关闭前的最后一次写盘）。
    window.localStorage.setItem(TERMS_KEY, "C");
    act(() => root.unmount());
    // 修复前：无条件写回自身旧值，覆盖 C → 红；修复后：保留 C。
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("C");
  });

  test("B1③：storage 事件即时同步 refs，pagehide 不回写过期 ref 旧值", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    const { host, root } = mountView();
    await openTermsTab(host);
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("A");

    // 本 Tab 编辑中的值尚未落盘（防抖窗口内）。
    act(() => {
      mockTerminology.mock.calls.at(-1)[0].setTermsDraft("A2");
    });
    // 另一 Tab 改写为 B 并广播；广播处理与 pagehide 在同一次 React 提交前
    // 连续触发（真实浏览器中 pagehide 可打断 effect 提交窗口）。
    window.localStorage.setItem(TERMS_KEY, "B");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: "B" })
      );
      window.dispatchEvent(new Event("pagehide"));
    });
    // 修复前：flush 使用过期 ref 旧值 A2 写回，覆盖远端 B → 红。
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("B");

    act(() => root.unmount());
  });

  test("B1④：非空远端术语草稿到达时置 termDraftTouched（空值不清 touched）", async () => {
    // 空草稿初始态挂载（termDraftTouched 初始为 false），随后远端非空草稿
    // 经 storage 广播到达。
    window.localStorage.removeItem(TERMS_KEY);
    const { host, root } = mountView();
    await openTermsTab(host);
    window.localStorage.setItem(TERMS_KEY, "remote-draft");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TERMS_KEY,
          newValue: "remote-draft",
        })
      );
    });
    // 修复前：termDraftTouched 仍为 false，子组件挂载期草稿覆盖防护失效 → 红。
    expect(mockTerminology.mock.calls.at(-1)[0].termDraftTouched).toBe(true);
    act(() => root.unmount());

    // 远端清空（newValue 为 null）不置 touched：空草稿不阻断默认示例填入。
    window.localStorage.removeItem(TERMS_KEY);
    const second = mountView();
    await openTermsTab(second.host);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: null })
      );
    });
    expect(mockTerminology.mock.calls.at(-1)[0].termDraftTouched).toBe(false);
    act(() => second.root.unmount());

    // 已 touched 后远端清空广播不清 touched：空草稿仅清空内容，不回退编辑标记。
    // touched 唯一置位路径是 onStorage 的非空广播分支（setTermsDraft setter 不触碰
    // touched），故先以一次非空 newValue 广播把 touched 置 true，再验证 null 广播不回退。
    const fourth = mountView();
    await openTermsTab(fourth.host);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: "edited" })
      );
    });
    expect(mockTerminology.mock.calls.at(-1)[0].termDraftTouched).toBe(true);
    window.localStorage.removeItem(TERMS_KEY);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: null })
      );
    });
    // 回归契约：touched 保持 true，不被清空广播回退。
    expect(mockTerminology.mock.calls.at(-1)[0].termDraftTouched).toBe(true);
    act(() => fourth.root.unmount());
  });

  test("B1⑤：远端删除草稿后 pagehide 兜底不重建空键", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    const { host, root } = mountView();
    await openTermsTab(host);

    // 另一 Tab 删除键并广播；本 Tab 在防抖窗口外、pagehide 时触发兜底 flush。
    window.localStorage.removeItem(TERMS_KEY);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TERMS_KEY, newValue: null })
      );
      window.dispatchEvent(new Event("pagehide"));
    });
    // 修复前：flush 以空串 setItem 重建已删除的键，覆盖远端删除意图 → 红。
    expect(window.localStorage.getItem(TERMS_KEY)).toBe(null);
    act(() => root.unmount());
  });

  test("B1⑥：localStorage.clear() 广播（event.key 为 null）同步清空三键草稿且不重建键", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    window.localStorage.setItem(AI_TERMS_KEY, "B");
    window.localStorage.setItem(SEED_KEY, "3");
    const { host, root } = mountView();
    await openTermsTab(host);

    // 另一 Tab 真实执行 clear()（本 Tab 同源 LS 一并清空）后广播 key 为 null 的事件。
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
      window.dispatchEvent(new Event("pagehide"));
    });
    // 修复前：三键草稿 state/ref 不感知 clear，兜底 flush 用旧值重建键 → 红。
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("");
    expect(window.localStorage.getItem(TERMS_KEY)).toBe(null);
    expect(window.localStorage.getItem(AI_TERMS_KEY)).toBe(null);
    expect(window.localStorage.getItem(SEED_KEY)).toBe(null);
    act(() => root.unmount());
  });

  test("B1⑦：另一 Tab 的 sessionStorage.clear() 广播（storageArea 指向 sessionStorage）不清空本地草稿", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    window.localStorage.setItem(AI_TERMS_KEY, "B");
    window.localStorage.setItem(SEED_KEY, "3");
    const { host, root } = mountView();
    await openTermsTab(host);
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("A");

    // 真实浏览器中另一 Tab 对同源 sessionStorage 执行 clear() 时，广播到本
    // Tab 的 storage 事件 key 为 null 且 storageArea 指向 sessionStorage 对象。
    window.sessionStorage.clear();
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          storageArea: window.sessionStorage,
        })
      );
    });
    // 修复前：clear 分支不校验 storageArea，本地草稿内存态被误清空 → 红。
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("A");
    expect(mockTerminology.mock.calls.at(-1)[0].aiTermsDraft).toBe("B");
    expect(mockTerminology.mock.calls.at(-1)[0].termSeed).toBe("3");

    act(() => root.unmount());
    // 异源广播不触碰 lastKnown：卸载 flush 写回不改变 LS 实值。
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("A");
    expect(window.localStorage.getItem(AI_TERMS_KEY)).toBe("B");
    expect(window.localStorage.getItem(SEED_KEY)).toBe("3");
  });

  test("B1⑧：另一 Tab 的 sessionStorage 写入广播（storageArea 指向 sessionStorage）不覆盖本地草稿", async () => {
    window.localStorage.setItem(TERMS_KEY, "local");
    const { host, root } = mountView();
    await openTermsTab(host);
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("local");

    // 另一 Tab 对同源 sessionStorage 写入同名键并广播：key 命中草稿键名，
    // 但 storageArea 指向 sessionStorage，与 localStorage 草稿无关。
    window.sessionStorage.setItem(TERMS_KEY, "session-value");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TERMS_KEY,
          newValue: "session-value",
          storageArea: window.sessionStorage,
        })
      );
    });
    // 修复前：per-key 分支不校验 storageArea，本地草稿被误同步为异源值 → 红。
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("local");

    act(() => root.unmount());
    expect(window.localStorage.getItem(TERMS_KEY)).toBe("local");
    window.sessionStorage.removeItem(TERMS_KEY);
  });

  test("B1⑨：localStorage 真实广播（storageArea 恰为 window.localStorage）仍正常同步（防误伤回归锁）", async () => {
    window.localStorage.setItem(TERMS_KEY, "A");
    const { host, root } = mountView();
    await openTermsTab(host);

    // 真实 localStorage 广播形态：storageArea 恰为 window.localStorage，
    // 必须照常走 per-key 同步（守卫不得误伤合法同源广播）。
    window.localStorage.setItem(TERMS_KEY, "B");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TERMS_KEY,
          newValue: "B",
          storageArea: window.localStorage,
        })
      );
    });
    expect(mockTerminology.mock.calls.at(-1)[0].termsDraft).toBe("B");

    act(() => root.unmount());
  });
});
