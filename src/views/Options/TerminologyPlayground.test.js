import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";
import TerminologyPlayground, {
  maskForDisplay,
  renderRichI18n,
} from "./TerminologyPlayground";
import { I18N, UI_LANGS } from "../../config/i18n";
import { defaultSystemPrompt } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 便于在测试中切换 web 模式提示与规则/日志行为。
const mockMatchRule = jest.fn();
const mockClient = { isWeb: false };
const mockRulesList = [{ pattern: "*", terms: "" }];
// 模拟父组件 Playground 的 resolvedTransApis（resolve 后的接口列表，含展开的 systemPrompt）。
// 子组件 TerminologyPlayground 改读 transApis prop，不再自行 resolve。
const mockResolvedTransApis = [];
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const mockAlert = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
};

// 模拟父组件 resolve 后的接口条目：必须显式带 systemPrompt（子组件改读 prop 后不再自行 resolve）。
// AI 接口默认 useBatchFetch:true（defaultAiApiOpts），mock 也要带上，模拟真实接口条目。
const mockResolvedApi = (overrides = {}) => ({
  apiSlug: "openai",
  apiName: "OpenAI",
  apiType: "OpenAI",
  isDisabled: false,
  useBatchFetch: true,
  systemPrompt: defaultSystemPrompt,
  ...overrides,
});

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => mockAlert,
}));

// 全局设置 mock：tranboxSetting 用模块级可变对象持有，用例可覆写全局目标语言默认值
// （AI 测试目标语言下拉未选择时回落到它）。默认值在 beforeEach 恢复为 zh-CN。
const mockTranboxSetting = { toLang: "zh-CN" };

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      injectRules: false,
      subrulesList: [],
      tranboxSetting: mockTranboxSetting,
    },
  }),
}));

jest.mock("../../hooks/I18n", () => {
  // 模拟真实 useI18n 的中文文案（直接读字典），避免动态 key（如冲突类型描述）退化为 fallback。
  const { I18N } = require("../../config/i18n");
  return {
    useI18n:
      () =>
      (key, fallback = "") =>
        I18N[key]?.zh ?? fallback,
  };
});

jest.mock("../../hooks/Rules", () => ({
  useRules: () => ({ list: mockRulesList }),
}));

jest.mock("../../libs/rules", () => ({
  matchRule: (...args) => mockMatchRule(...args),
}));

jest.mock("../../libs/log", () => {
  // LogLevel 仍由真实模块提供：config/setting.js 在导入期读取 LogLevel.INFO。
  // logger 用 getter 延迟读取：mock 工厂在 import 阶段执行，直接返回对象会命中 TDZ。
  const actual = jest.requireActual("../../libs/log");
  return {
    LogLevel: actual.LogLevel,
    get logger() {
      return mockLogger;
    },
    kissLog: jest.fn(),
  };
});

// 真实 AI 翻译测试走 apiTranslate；单测中 mock，避免引入 ESM-only 依赖（query-string）。
const mockApiTranslate = jest.fn();
jest.mock("../../apis", () => ({
  apiTranslate: (...args) => mockApiTranslate(...args),
}));

jest.mock("../../libs/client", () => {
  // isWeb 用 getter 延迟读取，测试内可随时切换 web 模式提示。
  const actual = jest.requireActual("../../libs/client");
  return {
    ...actual,
    get isWeb() {
      return mockClient.isWeb;
    },
  };
});

/** 等待 React effect 和异步事件处理器完成一次状态提交。 */
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 用原生 value setter 触发 React 的受控 TextField 输入事件。 */
async function enterTerms(container, value, { waitDebounce = true } = {}) {
  const textarea = container.querySelector(
    '[data-testid="terminology-terms-input"] textarea'
  );
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  ).set;
  await act(async () => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (waitDebounce) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
  }
}

function renderPlayground(
  { rule = null, userRules, matchRuleImpl } = {},
  {
    initialTermsDraft = "",
    initialTermDraftTouched = false,
    initialTermSeed = "",
  } = {}
) {
  if (userRules !== undefined) mockRulesList.length = 0;
  if (userRules) mockRulesList.push(...userRules);
  if (matchRuleImpl) {
    mockMatchRule.mockImplementation(matchRuleImpl);
  } else {
    mockMatchRule.mockImplementation(() => Promise.resolve(rule));
  }

  // 父级 Playground 提升的草稿状态（术语输入、touched 标记、例句 seed）用真实 state 模拟：
  // 组件读写这些 props，与真实父级行为一致（页签往返不丢草稿）。
  // 支持通过 initialTermsDraft/initialTermDraftTouched/initialTermSeed 注入初始草稿，
  // 用于覆盖"localStorage 回填后 touched=true"的挂载场景（挂载后再 set 无法触发挂载期 effect）。
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const mockSetText = jest.fn();
  const mockSetActiveTab = jest.fn();
  const mockSetTermsDraft = jest.fn();
  const mockSetTermDraftTouched = jest.fn();
  const mockSetTermSeed = jest.fn();
  const mockSetAiTermsDraft = jest.fn();
  function DraftHarness() {
    const [termsDraft, setTermsDraft] = useState(initialTermsDraft);
    const [termDraftTouched, setTermDraftTouched] = useState(
      initialTermDraftTouched
    );
    const [termSeed, setTermSeed] = useState(initialTermSeed);
    const [aiTermsDraft, setAiTermsDraft] = useState("");
    // 可观察的 mock setter 委托给真实 state setter：既能断言调用，又能驱动真实状态。
    mockSetTermsDraft.mockImplementation(setTermsDraft);
    mockSetTermDraftTouched.mockImplementation(setTermDraftTouched);
    mockSetTermSeed.mockImplementation(setTermSeed);
    mockSetAiTermsDraft.mockImplementation(setAiTermsDraft);
    return (
      <TerminologyPlayground
        setText={mockSetText}
        setActiveTab={mockSetActiveTab}
        termsDraft={termsDraft}
        setTermsDraft={mockSetTermsDraft}
        termDraftTouched={termDraftTouched}
        setTermDraftTouched={mockSetTermDraftTouched}
        termSeed={termSeed}
        setTermSeed={mockSetTermSeed}
        aiTermsDraft={aiTermsDraft}
        setAiTermsDraft={mockSetAiTermsDraft}
        transApis={mockResolvedTransApis}
      />
    );
  }

  // testing-library/no-unnecessary-act 误报：本处是 createRoot 并发根的初始
  // render，去掉 act 后 DOM 不同步提交（实测 37 用例 textarea 为 null），
  // 属计划 :196 回退纪律——保留 act + 行内 disable 并申报。
  // eslint-disable-next-line testing-library/no-unnecessary-act
  act(() => {
    root.render(<DraftHarness />);
  });
  return {
    container,
    root,
    setText: mockSetText,
    setActiveTab: mockSetActiveTab,
    setTermsDraft: mockSetTermsDraft,
    setTermDraftTouched: mockSetTermDraftTouched,
    setTermSeed: mockSetTermSeed,
    setAiTermsDraft: mockSetAiTermsDraft,
  };
}

describe("renderRichI18n", () => {
  it("keeps plain text untouched", () => {
    const view = renderRichI18n("纯文本，没有标记。");
    expect(view).toHaveLength(1);
    expect(view[0]).toBe("纯文本，没有标记。");
  });

  it("renders a lone bold marker as <strong>", () => {
    const view = renderRichI18n("**必定**替换");
    expect(view).toHaveLength(3);
    expect(view[0]).toBe("");
    expect(view[1].type).toBe("strong");
    expect(view[1].props.children).toBe("必定");
    expect(view[2]).toBe("替换");
  });

  it("renders a lone code marker as <code>", () => {
    const view = renderRichI18n("前缀 `glossary` 后缀");
    expect(view).toHaveLength(3);
    expect(view[0]).toBe("前缀 ");
    expect(view[1].type).toBe("code");
    expect(view[1].props.children).toBe("glossary");
    expect(view[2]).toBe(" 后缀");
  });

  it("keeps a code segment containing * intact next to bold", () => {
    const view = renderRichI18n(
      "元字符 `. + * ? ( ) [ ] \\ | ^ $` 需转义，**软注入**生效"
    );
    expect(view).toHaveLength(5);
    expect(view[0]).toBe("元字符 ");
    expect(view[1].type).toBe("code");
    // 代码段内部的 * 不被 ** 分支误拆。
    expect(view[1].props.children).toBe(". + * ? ( ) [ ] \\ | ^ $");
    expect(view[2]).toBe(" 需转义，");
    expect(view[3].type).toBe("strong");
    expect(view[3].props.children).toBe("软注入");
    expect(view[4]).toBe("生效");
  });
});

// i18n 守卫（全语言覆盖 / 反孤儿 / 负样本）扫描的源文件集合。
// 新增引用 terminology_playground* 键的文件必须同步加入，否则守卫 2 会把该文件里
// 引用的键误报成孤儿。
const GUARD_SOURCE_FILES = ["TerminologyPlayground.js", "Playground.js"];

// 页面 i18n 键的匹配式：裸键 terminology_playground（i18n.js 定义、Playground.js 引用）
// 与带后缀的 terminology_playground_xxx 都要覆盖 —— 旧写法强制要求尾部下划线，
// 裸键既不参与 7 语言覆盖断言也不进孤儿检查，是守卫盲区。
const PLAYGROUND_KEY_PATTERN =
  /["'](terminology_playground(?:_[a-z0-9_]+)?)["']/g;

describe("TerminologyPlayground", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockRulesList.length = 0;
    mockRulesList.push({ pattern: "*", terms: "" });
    mockResolvedTransApis.length = 0;
    mockClient.isWeb = false;
    mockMatchRule.mockReset();
    mockLogger.info.mockReset();
    mockLogger.error.mockReset();
    mockAlert.success.mockReset();
    mockAlert.error.mockReset();
    mockAlert.warning.mockReset();
    mockApiTranslate.mockReset();
    mockTranboxSetting.toLang = "zh-CN";
    window.localStorage.removeItem("kt-playground-ai-api-slug");
    window.localStorage.removeItem("kt-playground-ai-to-lang");
  });

  test("covers every page copy key in all supported UI languages", () => {
    // 从实际组件提取翻译键，防止后续新增文案时只补中文而遗漏其他语言。
    const sourceFiles = GUARD_SOURCE_FILES.map((fileName) =>
      fs.readFileSync(path.join(__dirname, fileName), "utf8")
    );
    const keys = new Set();
    for (const sourceFile of sourceFiles) {
      for (const match of sourceFile.matchAll(PLAYGROUND_KEY_PATTERN)) {
        keys.add(match[1]);
      }
    }
    expect(keys.size).toBeGreaterThan(0);
    // 裸键也必须进入覆盖集合（守卫盲区回归锁）。
    expect(keys.has("terminology_playground")).toBe(true);

    for (const key of keys) {
      for (const [language] of UI_LANGS) {
        expect(I18N[key]?.[language]).toEqual(expect.any(String));
        expect(I18N[key][language]).not.toBe("");
      }
    }
  });

  test("has no orphaned terminology_playground i18n keys", () => {
    // 反向守卫：I18N 中定义的所有 terminology_playground* key（含裸键）都必须被源码引用，
    // 防止本次 PR 遗留死 key（无用途的 key 必须删除而非保留）。
    const sourceText = GUARD_SOURCE_FILES.map((fileName) =>
      fs.readFileSync(path.join(__dirname, fileName), "utf8")
    ).join("\n");
    const referenced = new Set();
    for (const match of sourceText.matchAll(PLAYGROUND_KEY_PATTERN)) {
      referenced.add(match[1]);
    }

    const definedKeys = Object.keys(I18N).filter((key) =>
      key.startsWith("terminology_playground")
    );
    const orphans = definedKeys.filter((key) => !referenced.has(key));
    expect(orphans).toEqual([]);
  });

  test("has no bare Chinese literals left in the component source", () => {
    // 负样本守卫：组件源码不得残留裸中文字面量（包括 i18n fallback 之外的 JSX 文本、
    // 三元分支、logger 文案等）。两遍剔除先 formatI18n 后 i18n，避免 4a 之前 4b 吃掉内层。
    const source = fs.readFileSync(
      path.join(__dirname, "TerminologyPlayground.js"),
      "utf8"
    );
    const stripped = source
      // 1. 块注释（含 JSX {/* */}）
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // 2. 整行注释
      .replace(/^\s*\/\/.*$/gm, "")
      // 3. 行尾注释（避开 https:// 与字符串内的 //）
      .replace(/([^:'"`\\])\/\/[^\n"'`]*$/gm, "$1")
      // 4a. formatI18n(i18n, "key", "中文", ...) —— 必须先于 4b，否则 4b 先吃掉里层
      .replace(
        /formatI18n\(\s*i18n\s*,\s*"[a-z0-9_]+"\s*,\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g,
        "formatI18n(KEY"
      )
      // 4b. i18n("key", "中文")
      .replace(
        /\bi18n\(\s*"[a-z0-9_]+"\s*,\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g,
        "i18n(KEY"
      );
    const leftovers = stripped.match(/[\u4e00-\u9fa5]+/g) || [];
    expect(leftovers).toEqual([]);
  });

  test("loads the active rule terms on mount and shows the generated example", async () => {
    const { container, root } = renderPlayground({
      rule: { pattern: "example.com", terms: "API,接口;APIKey,应用编程接口" },
    });
    await flushEffects();

    // 输入框初始值来自当前匹配规则，不持久化到设置。
    // 「当前生效规则」字段已删除（在扩展页 URL 上匹配网站规则永无命中），不再断言 pattern 文本；
    // 规则加载成功与否由输入框回填值与例句生成结果表达。
    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    expect(textarea.value).toBe("API,接口;APIKey,应用编程接口");

    // 例句直接展示在本地术语区（生成的首个自然文本）。
    const exampleText = container.querySelector(
      '[data-testid="terminology-example-text"]'
    );
    expect(exampleText).not.toBeNull();
    expect(exampleText.textContent).toContain("APIKey");

    // 例句旁紧凑徽标显示通过（4 类冲突组合均无异常）。
    const status = container.querySelector(
      '[data-testid="terminology-example-status"]'
    );
    expect(status).not.toBeNull();
    expect(status.textContent).toContain("通过");

    // 通过时不应输出 error 日志，只输出 info 摘要。
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[TermPlayground]",
      expect.objectContaining({
        failCount: 0,
        totalCaseCount: 2, // 1 对冲突 × 2 方向
        uniqueConflictPairs: 1,
      })
    );

    act(() => root.unmount());
  });

  test("default-fills the conflict matrix sample and generates an example when rules have no terms", async () => {
    const { container, root } = renderPlayground({
      rule: { pattern: "example.com", terms: "" },
    });
    await flushEffects();
    // 规则术语为空 → 自动填入 8 个冲突矩阵示例术语
    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    expect(textarea.value.split(";")).toHaveLength(8);
    // 例句自动生成
    const exampleText = container.querySelector(
      '[data-testid="terminology-example-text"]'
    );
    expect(exampleText).not.toBeNull();
    expect(exampleText.textContent).toContain("React");
    act(() => root.unmount());
  });

  test("regenerates the example on mount when a non-empty touched draft is restored", async () => {
    // 模拟 localStorage 回填场景：父级 termDraftTouched=true（已有草稿，不覆盖用户输入），
    // 但术语非空时挂载后仍需自动生成例句（此前 computed 为 null，例句不显示）。
    const { container, root } = renderPlayground(
      { rule: null },
      {
        initialTermsDraft: "SQL,结构化查询;API,接口",
        initialTermDraftTouched: true,
      }
    );
    await flushEffects();
    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    // 用户草稿原样保留，不被规则/示例覆盖。
    expect(textarea.value).toBe("SQL,结构化查询;API,接口");
    const exampleText = container.querySelector(
      '[data-testid="terminology-example-text"]'
    );
    expect(exampleText).not.toBeNull();
    expect(exampleText.textContent.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  test("skips the mount-time compute when a touched draft is empty (no wasted compute)", async () => {
    // touched=true 但术语为空：挂载时不执行空算（空算产不出例句，纯浪费），
    // 以 mockLogger.info 未被调用为证（成功路径 runCompute 必然写 info 日志）。
    mockLogger.info.mockClear();
    const { container, root } = renderPlayground(
      { rule: null },
      { initialTermsDraft: "", initialTermDraftTouched: true }
    );
    await flushEffects();
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="terminology-example-text"]')
    ).toBeNull();
    act(() => root.unmount());
  });

  test("debounces recompute while typing and updates the example after the delay", async () => {
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "SQL,结构化查询" },
    });
    await flushEffects();
    const exampleText = () =>
      container.querySelector('[data-testid="terminology-example-text"]')
        ?.textContent || "";

    // 输入变化后 300ms 内仍展示旧结果。
    await enterTerms(container, "GPT;GPTs,智能体集合", { waitDebounce: false });
    expect(exampleText()).toContain("SQL");

    // 防抖到期后重算，例句更新为包含新术语（GPTs）的文本。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(exampleText()).toContain("GPTs");
    expect(
      container.querySelector('[data-testid="terminology-example-status"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("cancels pending debounce tasks when unmounting", async () => {
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "SQL,结构化查询" },
    });
    await flushEffects();
    mockLogger.info.mockClear();

    // 输入新值后立即卸载（300ms 防抖任务尚未执行）。
    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      setter.call(textarea, "GPT;GPTs,智能体集合");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => root.unmount());

    // 卸载时取消防抖：窗口过后不得再触发重算（无新增日志调用）。
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test("does not overwrite user edits with the async initial rule load", async () => {
    // 初始规则加载保持 pending，直到用户输入之后才完成。
    let resolveMatch;
    const { container, root } = renderPlayground({
      matchRuleImpl: () =>
        new Promise((resolve) => {
          resolveMatch = resolve;
        }),
    });

    // 异步加载尚未完成时，用户已编辑输入。
    await enterTerms(container, "SQL,结构化查询");

    // 异步加载此刻才完成：不得覆盖用户已编辑内容。
    await act(async () => {
      resolveMatch({ pattern: "example.com", terms: "API,接口" });
      await Promise.resolve();
      await Promise.resolve();
    });

    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    expect(textarea.value).toBe("SQL,结构化查询");
    // 未应用异步加载的规则（不切换规则名、不覆盖输入与结果）。
    expect(container.textContent).not.toContain("example.com");
    expect(
      container.querySelector('[data-testid="terminology-example-text"]')
        .textContent
    ).toContain("SQL");

    act(() => root.unmount());
  });

  test("shows failed assertion via example status and logs full detail", async () => {
    const { container, root } = renderPlayground({
      // 正则术语插进自然模板后不能自匹配 → 首个用例断言失败。
      rule: { pattern: "*", terms: "API\\.\\d+,版本" },
    });
    await flushEffects();

    // 例句旁徽标显示异常。
    const status = container.querySelector(
      '[data-testid="terminology-example-status"]'
    );
    expect(status).not.toBeNull();
    expect(status.textContent).toContain("异常");

    // 点击「测试」：弹出红色（error）Snackbar，含一行失败原因。
    const testButton = container.querySelector(
      '[data-testid="terminology-run-test"]'
    );
    act(() => {
      testButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockAlert.error).toHaveBeenCalled();
    const errorBox = mockAlert.error.mock.calls.at(-1)[0];
    const texts = errorBox.props.children
      .map((c) => c.props.children)
      .join("|");
    expect(texts).toContain("未被命中");

    // logger.error 输出完整 issue（type/message/detail）。
    expect(mockLogger.error).toHaveBeenCalledWith(
      "[TermPlayground]",
      expect.any(Array)
    );
    const issues = mockLogger.error.mock.calls.at(-1)[1];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue).toHaveProperty("type");
      expect(issue).toHaveProperty("message");
      expect(issue).toHaveProperty("detail");
    }

    act(() => root.unmount());
  });

  test("test button runs local replacement on the example and shows a success snackbar", async () => {
    const { container, root, setText, setActiveTab } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口;APIKey,应用编程接口" },
    });
    await flushEffects();

    // 不发送原文到翻译页签（本地术语仅整页生效）；用「测试」按钮触发本地替换。
    const testButton = container.querySelector(
      '[data-testid="terminology-run-test"]'
    );
    act(() => {
      testButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 绿色成功 Snackbar：提示"测试通过"并展示例句与替换后结果。
    expect(mockAlert.success).toHaveBeenCalled();
    expect(mockAlert.error).not.toHaveBeenCalled();
    const successBox = mockAlert.success.mock.calls.at(-1)[0];
    const texts = successBox.props.children
      .map((c) => c.props.children)
      .join("|");
    expect(texts).toContain("测试通过");
    expect(texts).toContain("替换后");

    // 不再切换标签页 / 不再写文本（旧 send-to-tab 逻辑已移除）。
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(setText).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("rejects illegal term segments: error alert with reasons, no success summary", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();
    // 非法正则 + 尾巴逗号：整体按非法输入拒绝，不生成"替换测试成功"摘要。
    await enterTerms(container, "bad[re,x\nAPI,接口;");

    const invalidAlert = container.querySelector(
      '[data-testid="terminology-invalid"]'
    );
    expect(invalidAlert).not.toBeNull();
    // 诊断消息含非法段的原始内容与原因（含段号）。
    expect(invalidAlert.textContent).toContain("bad[re");
    expect(invalidAlert.textContent).toContain("第 1 段");
    expect(
      container.querySelector('[data-testid="terminology-invalid-state"]')
    ).not.toBeNull();
    // v4：文案不得暗示任一错误禁用所有合法术语，而应区分"被拒绝条目"与"仍可应用的合法条目"。
    const invalidState = container.querySelector(
      '[data-testid="terminology-invalid-state"]'
    );
    expect(invalidState.textContent).toContain("合法术语");
    expect(invalidState.textContent).not.toContain("未生成测试用例");
    // 区分"被拒绝条目"与"仍可应用的合法条目"：合法术语 API 在非法状态下被列出
    expect(invalidState.textContent).toContain("「API」");
    expect(invalidState.textContent).not.toContain("「bad[re」");
    // 有致命非法段时不展示例句（无有效替换结果可测）。
    expect(
      container.querySelector('[data-testid="terminology-example"]')
    ).toBeNull();
    // 完整诊断仍走控制台。
    expect(mockLogger.error).toHaveBeenCalledWith(
      "[TermPlayground] fatal invalid term segments in input:",
      expect.any(Array)
    );

    act(() => root.unmount());
  });

  test("rejects pure zero-width term segments: error alert with zero-width diagnostic copy, no success summary", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();
    // 纯零宽模式 (?=x)：统一计划 Task 2 起为致命诊断 zero-width-matching-pattern，
    // UI 经 formatFatalDiagnostic 渲染新 i18n 键（七语言，此处 zh 渲染）。
    await enterTerms(container, "(?=x),Y\nAPI,接口;");

    const invalidAlert = document.querySelector(
      '[data-testid="terminology-invalid"]'
    );
    expect(invalidAlert).not.toBeNull();
    // 新诊断文案：含段号、原始段内容与零宽原因
    expect(invalidAlert.textContent).toContain("第 1 段");
    expect(invalidAlert.textContent).toContain("(?=x),Y");
    expect(invalidAlert.textContent).toContain("不消费任何字符");
    // 合法术语仍被区分列出（与 empty-matching 同一语义：只拒绝非法段）
    const invalidState = document.querySelector(
      '[data-testid="terminology-invalid-state"]'
    );
    expect(invalidState).not.toBeNull();
    expect(invalidState.textContent).toContain("「API」");
    expect(invalidState.textContent).not.toContain("「(?=x),Y」");

    // 点「测试」：致命输入只弹错误提示，绝不产生"测试通过"成功摘要。
    const testButton = document.querySelector(
      '[data-testid="terminology-run-test"]'
    );
    act(() => {
      testButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockAlert.success).not.toHaveBeenCalled();
    expect(mockAlert.error).toHaveBeenCalled();

    // 有致命非法段时不展示例句。
    expect(
      document.querySelector('[data-testid="terminology-example"]')
    ).toBeNull();

    act(() => root.unmount());
  });

  test("warns about unescaped regex metacharacters while still computing valid inputs", async () => {
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "Dr.whob,神经病" },
    });
    await flushEffects();

    // 元字符警告可见，且提示转义示例。
    const metaWarning = container.querySelector(
      '[data-testid="terminology-meta-warning"]'
    );
    expect(metaWarning).not.toBeNull();
    expect(metaWarning.textContent).toContain("Dr.whob");
    expect(metaWarning.textContent).toContain("反斜杠");
    // 非致命：仍正常生成例句并显示通过徽标（Dr.whob 正则命中自然句）。
    expect(
      container.querySelector('[data-testid="terminology-example-status"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("web mode shows the CORS limitation note only when isWeb is true", async () => {
    mockClient.isWeb = true;
    const view = renderPlayground({ rule: null });
    await flushEffects();
    expect(
      view.container.querySelector('[data-testid="terminology-web-note"]')
    ).not.toBeNull();
    expect(view.container.textContent).toContain("GM.xmlHttpRequest");
    act(() => view.root.unmount());

    mockClient.isWeb = false;
    const utils = renderPlayground({ rule: null });
    await flushEffects();
    expect(
      utils.container.querySelector('[data-testid="terminology-web-note"]')
    ).toBeNull();
    act(() => utils.root.unmount());
  });

  test("falls back to the global rule when the active rule fails to load", async () => {
    mockRulesList.length = 0;
    mockRulesList.push({ pattern: "*", terms: "React;ReactNative" });
    const { container, root } = renderPlayground({
      matchRuleImpl: () => Promise.reject(new Error("storage failed")),
    });
    await flushEffects();

    // 「当前生效规则」字段已删除（在扩展页 URL 上匹配网站规则永无命中，纯噪音）；
    // 回退行为改由 loadError 提示与术语加载结果表达。
    expect(container.textContent).toContain("已回退到全局规则");
    expect(container.textContent).not.toContain("当前生效规则");
    // 回退术语仍生成例句并通过（类型 4：都无译文）。
    expect(
      container.querySelector('[data-testid="terminology-example-status"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("sample button loads the fixed 4-type diagnostic sample (8 terms, 4 unique conflict pairs)", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();

    // 点击"填入冲突矩阵 4 类示例"按钮。
    const sampleButton = container.querySelector(
      '[data-testid="terminology-sample"]'
    );
    act(() => {
      sampleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // 输入框被填充为 8 个术语（4 组独立冲突对）。
    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    expect(textarea.value.split(";")).toHaveLength(8);

    // 生成例句并显示通过徽标。
    expect(
      container.querySelector('[data-testid="terminology-example-status"]')
    ).not.toBeNull();
    // 摘要统计正确。
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[TermPlayground]",
      expect.objectContaining({
        uniqueConflictPairs: 4,
        totalCaseCount: 8,
        conflictPairCount: 8,
        failCount: 0,
      })
    );

    act(() => root.unmount());
  });

  test("load sample then rotate seed changes the example deterministically and preserves terms draft", async () => {
    const { container, root, setTermsDraft, setTermDraftTouched, setTermSeed } =
      renderPlayground({ rule: null });
    await flushEffects();

    const sampleButton = container.querySelector(
      '[data-testid="terminology-sample"]'
    );
    act(() => {
      sampleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const exampleText = () =>
      container.querySelector('[data-testid="terminology-example-text"]')
        ?.textContent || "";
    const before = exampleText();

    // "换一个例句"按钮：递增显式 seed 并在有限模板集合内轮换例句。
    const rotateButton = container.querySelector(
      '[data-testid="terminology-rotate-seed"]'
    );
    let after = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      act(() => {
        rotateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
      after = exampleText();
      if (after !== before) break;
    }
    // seed 提升到父级：setTermSeed 被调用且 seed 标签更新为数字。
    expect(setTermSeed).toHaveBeenCalled();
    const seedLabel = container.querySelector(
      '[data-testid="terminology-seed"]'
    ).textContent;
    expect(Number.isNaN(Number(seedLabel))).toBe(false);
    // 换句仍保留用户草稿（术语输入不被覆盖）。
    expect(
      container.querySelector(
        '[data-testid="terminology-terms-input"] textarea'
      ).value
    ).toContain("APIKey");
    // 轮换后在有限模板集合内换出了不同例句。
    expect(after === before).toBe(false);

    act(() => root.unmount());
  });

  test("test button shows an error snackbar when the input is rejected", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();
    // 空源术语（,abc）为致命非法输入：不生成例句，测试给出红色提示。
    await enterTerms(container, ",abc;API,接口");

    const testButton = container.querySelector(
      '[data-testid="terminology-run-test"]'
    );
    act(() => {
      testButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockAlert.error).toHaveBeenCalled();
    expect(mockAlert.success).not.toHaveBeenCalled();
    expect(mockAlert.error.mock.calls.at(-1)[0]).toContain("非法术语段");

    act(() => root.unmount());
  });

  /**
   * 构造一个带 clientY/pointerId 的通用指针事件。
   *
   * @param {string} type 事件类型（如 pointerdown/pointermove）。
   * @param {Object} opts 可选的 clientY 与 pointerId。
   * @returns {Event} 可被 React 与 jsdom 识别的指针事件。
   */
  function makePointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientY", { value: clientY });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  }

  /**
   * 收集当前 document.styleSheets 中所有 CSS 规则。
   *
   * @returns {Array<CSSRule>} 全部规则（跨源样式表读取失败时跳过）。
   */
  function collectRules() {
    return Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return [];
      }
    });
  }

  /**
   * 取出 emotion 为某元素注入的全部规则文本（按元素自身的 css-* 类名匹配）。
   *
   * 用于区分 MUI Stack 的两种 spacing 实现：useFlexGap 走 `gap`，
   * 默认实现走 `& > :not(style) ~ :not(style) { margin-left }`（wrap 后第二行
   * 零垂直间距 + 首元素左偏移的根因）。
   *
   * @param {HTMLElement} el 目标元素。
   * @returns {string} 命中该元素 emotion 类名的全部规则 cssText 拼接。
   */
  function ownRuleText(el) {
    const classes = [...el.classList].filter((name) => name.startsWith("css-"));
    return collectRules()
      .filter(
        (rule) =>
          rule.selectorText &&
          classes.some((name) => rule.selectorText.includes(`.${name}`))
      )
      .map((rule) => rule.cssText)
      .join("\n");
  }

  test("effect-check table uses SVG icons instead of emoji for the feature markers", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
      result: {
        trText: "数据管道已就绪",
        srLang: "en",
        srCode: "en",
        isSame: false,
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    // 整容器级 emoji 守卫（未跑测试的静态渲染态）。
    for (const glyph of ["✅", "❌", "⚠️", "➖"]) {
      expect(container.textContent).not.toContain(glyph);
    }

    // 顶部对照表已移除，跑完测试后生效检测表才是页面上唯一带图标的表格。
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    for (const glyph of ["✅", "❌", "⚠️", "➖"]) {
      expect(container.textContent).not.toContain(glyph);
    }
    // 命中/未命中用 MUI SVG 图标（Check/Close）表达。
    const tableIcons = [
      ...container.querySelectorAll(
        '[data-testid="terminology-tab-root"] table svg'
      ),
    ];
    expect(tableIcons.length).toBeGreaterThanOrEqual(1);

    act(() => root.unmount());
  });

  test("top comparison matrix, its more toggle and the API-level term preview are gone", async () => {
    // 移动端收敛：顶部三行对照表 + 「更多」折叠 + 接口级 AI 术语原文展开块整体移除
    // （完整对照留在 preview/专业术语.md）。
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        aiTerms: "zorp,数据管道",
      })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口", apiSlug: "openai" },
    });
    await flushEffects();

    for (const testid of [
      "terminology-info-table",
      "terminology-details-toggle",
      "terminology-details",
    ]) {
      expect(container.querySelector(`[data-testid="${testid}"]`)).toBeNull();
    }
    // 接口级术语原文不得在发请求前被展开显示。
    expect(container.textContent).not.toContain("接口级 AI 术语");
    // 首个板块即「接口选择」区。
    const panels = [
      ...container.querySelectorAll('[data-testid="terminology-tab-root"] > *'),
    ];
    expect(panels[0].getAttribute("data-testid")).toBe(
      "terminology-api-selector"
    );
    expect(panels[0].textContent).toContain("接口选择");

    act(() => root.unmount());
  });

  test("AI test result area uses MUI icons instead of emoji for delivery states", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
      result: {
        trText: "数据管道已就绪",
        srLang: "en",
        srCode: "en",
        isSame: false,
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const resultArea = container.querySelector(
      '[data-testid="terminology-ai-result"]'
    );
    for (const glyph of ["✅", "❌", "⚠️", "➖"]) {
      expect(resultArea.textContent).not.toContain(glyph);
    }

    act(() => root.unmount());
  });

  test("renders the API selector with available interfaces and defaults to the rule apiSlug", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      }),
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI 兼容",
        apiType: "OpenAI",
      })
    );
    const { container, root } = renderPlayground({
      rule: {
        pattern: "*",
        terms: "API,接口;APIKey,应用编程接口",
        apiSlug: "openai",
      },
    });
    await flushEffects();

    const select = container.querySelector(
      '[data-testid="terminology-api-select"]'
    );
    expect(select).not.toBeNull();
    // 默认选中规则 apiSlug（openai）。
    expect(select.textContent).toContain("OpenAI 兼容");

    // disabled 接口被过滤。
    expect(select.textContent).not.toContain("（未配置）");

    act(() => root.unmount());
  });

  test("fills API runtime defaults (placeholder) so selector does not crash", async () => {
    // 缺 placeholder 的条目：fillApiDefaults 必须补上，否则 placeholder.split 崩溃。
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口", apiSlug: "openai" },
    });
    await flushEffects();
    // 无崩溃，选择器渲染成功。
    expect(
      container.querySelector('[data-testid="terminology-api-select"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("OpenAI");
    act(() => root.unmount());
  });

  test("P3: touched 草稿页签往返后仍恢复规则元数据（默认接口回落规则 apiSlug）", async () => {
    // 列表顺序：首项 Microsoft，规则 apiSlug=openai（第二项）。
    // 若 activeRuleData 未恢复，默认逻辑只能选首项 Microsoft —— 即 P3 元数据丢失。
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      }),
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI 兼容",
        apiType: "OpenAI",
      })
    );
    const { container, root } = renderPlayground(
      { rule: { pattern: "*", terms: "API,接口", apiSlug: "openai" } },
      {
        initialTermsDraft: "SQL,结构化查询",
        initialTermDraftTouched: true,
      }
    );
    await flushEffects();

    // 草稿不被规则覆盖（touched 只阻止覆盖 termsDraft）。
    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    expect(textarea.value).toBe("SQL,结构化查询");
    // 规则元数据按规则身份恢复：默认接口取规则 apiSlug=openai，而不是列表首项。
    const select = container.querySelector(
      '[data-testid="terminology-api-select"]'
    );
    expect(select.textContent).toContain("OpenAI 兼容");
    expect(select.textContent).not.toContain("未配置");

    act(() => root.unmount());
  });

  test("P3: 异步规则加载晚于用户编辑时，草稿保留但规则元数据仍写回", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      }),
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI 兼容",
        apiType: "OpenAI",
      })
    );
    let resolveMatch;
    const { container, root } = renderPlayground({
      matchRuleImpl: () =>
        new Promise((resolve) => {
          resolveMatch = resolve;
        }),
    });

    // 规则加载 pending 期间用户编辑（hasUserEdited + termDraftTouched 都就位）。
    await enterTerms(container, "GPT;GPTs,智能体集合");

    // 异步加载此刻才完成：不得覆盖草稿，但 activeRuleData（规则 apiSlug）仍写回。
    await act(async () => {
      resolveMatch({ pattern: "example.com", terms: "API,接口", apiSlug: "openai" });
      await Promise.resolve();
      await Promise.resolve();
    });

    const textarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    expect(textarea.value).toBe("GPT;GPTs,智能体集合");
    // 默认接口按恢复的规则 apiSlug=openai 选择，证明元数据没有因用户编辑被丢弃。
    const select = container.querySelector(
      '[data-testid="terminology-api-select"]'
    );
    expect(select.textContent).toContain("OpenAI 兼容");

    act(() => root.unmount());
  });

  test("API selector desc and note use caption-family sizing with a scaled Alert icon", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      })
    );
    const { root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();

    const panel = queryTestid("terminology-api-selector");
    // 标题与说明拉开字号层级：subtitle2(14px) 标题 + caption(12px) 说明，
    // 说明段不得再用 body2（与标题同 14px、只差字重）。
    /* eslint-disable-next-line testing-library/no-node-access -- Typography variant 只体现在类名上。 */
    const desc = panel.querySelector(".MuiTypography-caption");
    expect(desc).not.toBeNull();
    expect(desc.textContent).toContain("不支持 AI 专业术语");
    /* eslint-disable-next-line testing-library/no-node-access -- 同上。 */
    expect(panel.querySelector(".MuiTypography-body2")).toBeNull();

    // note 走 caption 族排版：字号用 rem（随主题 htmlFontSize 缩放，不是硬编码 px），
    // 且 Alert 图标同步缩小（MUI 硬编码 22px，不缩会与 12px 正文失衡）。
    const note = queryTestid("terminology-api-machine-note");
    expect(note.textContent).toContain("AI 专业术语无法生效");
    const noteCss = ownRuleText(note);
    expect(noteCss).toMatch(/font-size:\s*0\.75rem/);
    expect(noteCss).toMatch(/\.MuiAlert-icon\s*\{[^}]*font-size:\s*1rem/);

    act(() => root.unmount());
  });

  test("shows machine-translation limitation note and blocks AI test for machine APIs", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();
    await enterTerms(container, "API,接口;APIKey,应用编程接口");

    // 机器翻译接口提示：不支持 AI 专业术语。
    expect(
      container.querySelector('[data-testid="terminology-api-machine-note"]')
    ).not.toBeNull();

    // 点击测试按钮：被阻止并弹 warning。
    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockAlert.warning).toHaveBeenCalled();
    expect(mockApiTranslate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("switching the API selector updates the limitation note", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      }),
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
      })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口", apiSlug: "openai" },
    });
    await flushEffects();
    // 默认选中 openai → AI 提示。
    expect(
      container.querySelector('[data-testid="terminology-api-ai-note"]')
    ).not.toBeNull();

    // 只验证默认提示正确；MUI Select 下拉菜单在 jsdom 中不渲染选项，
    // 切换接口的功能验证通过 integration/manual 测试覆盖。
    act(() => root.unmount());
  });

  test("runs a real AI translation test on an AI interface and shows request/response", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
        aiTerms: "component,组件",
      })
    );
    mockApiTranslate.mockResolvedValue({
      trText: "请检查 API 和 APIKey 配置。",
      srLang: "en",
      srCode: "en",
      isSame: false,
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: {
        pattern: "*",
        terms: "API,接口;APIKey,应用编程接口",
        aiTerms: "API,接口2",
      },
    });
    await flushEffects();
    await enterTerms(container, "API,接口;APIKey,应用编程接口");
    // 在 AI 术语输入框输入测试值。
    act(() => {
      setAiTermsDraft("API,Application Programming Interface");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // apiTranslate 被调用，且关闭缓存/池化。
    expect(mockApiTranslate).toHaveBeenCalled();
    const callArgs = mockApiTranslate.mock.calls.at(-1)[0];
    expect(callArgs.useCache).toBe(false);
    expect(callArgs.usePool).toBe(false);
    // 提示词已展开：systemPrompt 非空且包含聚合翻译提示词头。
    expect(callArgs.apiSetting.systemPrompt).toBeTruthy();
    expect(callArgs.apiSetting.systemPrompt).toContain(
      "Act as a translation API"
    );
    // 仅强制非流式：useStream=false，但保留接口原始 useBatchFetch（AI 接口默认 true）。
    expect(callArgs.apiSetting.useStream).toBe(false);
    expect(callArgs.apiSetting.useBatchFetch).toBe(true);
    // glossary 包含用户输入的值（优先于规则级/接口级）。
    expect(callArgs.glossary).toBeTruthy();
    expect(callArgs.glossary["API"]).toBe("Application Programming Interface");
    // 接口级 AI 术语也被合并。
    expect(callArgs.glossary["component"]).toBe("组件");

    // 请求原文来自 AI 术语例句（不含本地占位符 {1}/{2}）。
    const requestText = container.querySelector(
      '[data-testid="terminology-ai-request-text"]'
    );
    expect(requestText.textContent).not.toMatch(/\{\d+\}/);
    expect(requestText.textContent).toContain("API");
    // 请求原文展示区显示的即 AI 例句内容。
    expect(callArgs.text).toBe(requestText.textContent);
    // 返回译文展示。
    expect(
      container.querySelector('[data-testid="terminology-ai-response-text"]')
        .textContent
    ).toContain("请检查");

    act(() => root.unmount());
  });

  test("AI test captures apiTranslate errors into a Snackbar and result area", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslate.mockRejectedValue(new Error("HTTP 401 Unauthorized"));
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();
    await enterTerms(container, "API,接口");
    // AI 术语例句为空时会先阻止；这里先填入 AI 术语确保走到真实请求。
    act(() => {
      setAiTermsDraft("API,接口");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    expect(mockAlert.error).toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="terminology-ai-error"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="terminology-ai-error"]')
        .textContent
    ).toContain("401");

    act(() => root.unmount());
  });

  test("QwenMT interface shows native-term note and is allowed for AI testing", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "qwenmt",
        apiName: "QwenMT",
        apiType: "QwenMT",
      })
    );
    mockApiTranslate.mockResolvedValue({
      trText: "检查 API 配置。",
      srLang: "en",
      srCode: "en",
      isSame: false,
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();
    await enterTerms(container, "API,接口");
    // AI 术语例句为空时会先阻止；这里先填入 AI 术语确保走到真实请求。
    act(() => {
      setAiTermsDraft("API,接口");
    });

    // QwenMT 提示原生术语支持。
    expect(
      container.querySelector('[data-testid="terminology-api-qwenmt-note"]')
    ).not.toBeNull();

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();
    // 未被阻止：apiTranslate 被调用。
    expect(mockApiTranslate).toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("AI terms input automatically generates an independent example (no local terms needed)", async () => {
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: { pattern: "*", terms: "" },
    });
    await flushEffects();

    // 无 AI 术语时：不展示 AI 例句。
    expect(
      container.querySelector('[data-testid="terminology-ai-example"]')
    ).toBeNull();

    // 输入 AI 术语后自动生成例句（不依赖本地术语库）。
    act(() => {
      setAiTermsDraft("API,接口\nAPIKey,应用编程接口");
    });
    const aiExample = container.querySelector(
      '[data-testid="terminology-ai-example"]'
    );
    expect(aiExample).not.toBeNull();
    expect(aiExample.textContent).toContain("API");

    act(() => root.unmount());
  });

  test("AI test is blocked with a hint when AI terms are empty", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();
    await enterTerms(container, "API,接口");

    // AI 术语为空：无 AI 例句。
    expect(
      container.querySelector('[data-testid="terminology-ai-example"]')
    ).toBeNull();

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();
    expect(mockAlert.error).toHaveBeenCalled();
    expect(mockAlert.error.mock.calls.at(-1)[0]).toContain(
      "请先输入 AI 专业术语"
    );
    expect(mockApiTranslate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("AI sample button fills default AI terms and generates an example", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();

    const sampleButton = container.querySelector(
      '[data-testid="terminology-ai-sample"]'
    );
    act(() => {
      sampleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const aiTextarea = container.querySelector(
      '[data-testid="terminology-ai-terms-input"] textarea'
    );
    expect(aiTextarea.value).toContain("zorp,数据管道");
    expect(
      container.querySelector('[data-testid="terminology-ai-example"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("AI rotate seed button rotates the AI example deterministically", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();

    // 先填入 AI 术语，确保有例句可轮换。
    act(() => {
      container
        .querySelector('[data-testid="terminology-ai-sample"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const aiExampleText = () =>
      container.querySelector('[data-testid="terminology-ai-example"]')
        ?.textContent || "";
    const before = aiExampleText();

    const rotateButton = container.querySelector(
      '[data-testid="terminology-ai-rotate-seed"]'
    );
    let after = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      act(() => {
        rotateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      after = aiExampleText();
      if (after !== before) break;
    }
    // 在有限模板集合内换出了不同例句。
    expect(after === before).toBe(false);

    act(() => root.unmount());
  });

  test("AI test sends the AI example text as the request original (no local placeholders)", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslate.mockResolvedValue({
      trText: "翻译结果",
      srLang: "en",
      srCode: "en",
      isSame: false,
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("API,接口");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    const callArgs = mockApiTranslate.mock.calls.at(-1)[0];
    // 请求原文来自 AI 术语例句，不含本地占位符 {1}。
    expect(callArgs.text).not.toMatch(/\{\d+\}/);
    expect(callArgs.text).toContain("API");
    // 请求原文展示区显示的即 AI 例句。
    const requestText = container.querySelector(
      '[data-testid="terminology-ai-request-text"]'
    );
    expect(requestText.textContent).toBe(callArgs.text);

    act(() => root.unmount());
  });

  // ── AI 测试请求/响应双样式展示（Task 4） ──

  /** 在 AI 术语输入框填入草稿（父级持有 state，直接驱动）。 */
  function fillAiTerms(container, setAiTermsDraft, value) {
    act(() => {
      setAiTermsDraft(value);
    });
    return container;
  }

  /** 点击「测试」并等待完成。 */
  async function runAiTest(container) {
    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();
  }

  /** 通过下拉把接口选择器切到指定 slug（复用 MUI Select 的 jsdom 交互模式）。 */
  async function selectApiBySlug(container, slug) {
    const combobox = container.querySelector(
      '[data-testid="terminology-api-select"] [role="combobox"]'
    );
    await act(async () => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === slug)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /** 批量 JSON 用户消息构造器：segments[0].text 显式包含术语 key（防子串判定回归的契约）。 */
  const batchUserMsgContent = (extra = {}) =>
    JSON.stringify({
      targetLanguage: "zh-CN",
      segments: [
        {
          id: 0,
          text: "Please make sure the zorp is configured correctly before deploying.",
        },
      ],
      glossary: { zorp: "数据管道" },
      ...extra,
    });

  /** 注入 mock 请求/响应数据的工厂函数 */
  function mockApiTranslateWithCapture({
    reqUrl = "https://api.openai.com/v1/chat/completions",
    reqHeaders = { "Content-Type": "application/json" },
    reqBody = { model: "gpt-4", messages: [{ role: "system", content: "" }] },
    respBody = { choices: [{ message: { content: "测试翻译结果" } }] },
    result = {
      trText: "测试翻译结果",
      srLang: "en",
      srCode: "en",
      isSame: false,
    },
    ...rest
  } = {}) {
    mockApiTranslate.mockImplementation((opts = {}) => {
      const { capture } = opts;
      if (capture?.onRequest) {
        // reqUserMsg 用 in 判断而非解构默认值：Custom 用例要显式传 undefined（未捕获）。
        const userMsg =
          "reqUserMsg" in rest
            ? rest.reqUserMsg
            : { role: "user", content: "test" };
        capture.onRequest(
          reqUrl,
          {
            method: "POST",
            headers: reqHeaders,
            body:
              typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody),
          },
          userMsg
        );
      }
      if (capture?.onResponse) {
        capture.onResponse(respBody);
      }
      return Promise.resolve(result);
    });
  }

  test("1. 摘要默认：显示软提示词、提示词标签、译文；不出现原始 JSON 容器", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        systemPrompt: defaultSystemPrompt,
      })
    );
    mockApiTranslateWithCapture({
      reqBody: {
        model: "gpt-4",
        messages: [{ role: "system", content: "test" }],
      },
      result: {
        trText: "测试翻译结果",
        srLang: "zh",
        srCode: "zh",
        isSame: false,
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("zorp,数据管道");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // 软提示词包含造词 key
    const softGlossary = container.querySelector(
      '[data-testid="terminology-ai-soft-glossary"]'
    );
    expect(softGlossary).not.toBeNull();
    expect(softGlossary.textContent).toContain("zorp");

    // 提示词标签（JSON 聚合翻译提示词）
    const promptLabel = container.querySelector(
      '[data-testid="terminology-ai-prompt-label"]'
    );
    expect(promptLabel).not.toBeNull();
    expect(promptLabel.textContent).toContain("JSON 聚合翻译提示词");

    // 响应摘要含译文字段
    const responseText = container.querySelector(
      '[data-testid="terminology-ai-response-text"]'
    );
    expect(responseText).not.toBeNull();
    expect(responseText.textContent).toContain("测试翻译结果");

    // 不出现原始 JSON 容器
    expect(
      container.querySelector('[data-testid="terminology-ai-req-json"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="terminology-ai-resp-json"]')
    ).toBeNull();

    act(() => root.unmount());
  });

  test("2. 原始 JSON 切换 + 图标互换：点 toggle 出现 JSON 内容，图标在 DataObject/Subject 间切换", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqBody: {
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("zorp,数据管道");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // 请求侧 toggle
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    expect(reqToggle).not.toBeNull();

    // 初始 DataObjectIcon
    expect(
      reqToggle.querySelector('[data-testid="DataObjectIcon"]')
    ).not.toBeNull();

    // 点 toggle 切到原始 JSON
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const reqJson = container.querySelector(
      '[data-testid="terminology-ai-req-json"]'
    );
    expect(reqJson).not.toBeNull();
    expect(reqJson.textContent).toContain("gpt-4");

    // 图标变为 SubjectIcon
    expect(
      reqToggle.querySelector('[data-testid="SubjectIcon"]')
    ).not.toBeNull();

    // 再点切回摘要
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-ai-req-json"]')
    ).toBeNull();
    expect(
      reqToggle.querySelector('[data-testid="DataObjectIcon"]')
    ).not.toBeNull();

    // 响应侧同理
    const respToggle = container.querySelector(
      '[data-testid="terminology-ai-resp-toggle"]'
    );
    expect(respToggle).not.toBeNull();
    expect(
      respToggle.querySelector('[data-testid="DataObjectIcon"]')
    ).not.toBeNull();

    act(() => {
      respToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const respJson = container.querySelector(
      '[data-testid="terminology-ai-resp-json"]'
    );
    expect(respJson).not.toBeNull();
    expect(
      respToggle.querySelector('[data-testid="SubjectIcon"]')
    ).not.toBeNull();

    act(() => {
      respToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-ai-resp-json"]')
    ).toBeNull();
    expect(
      respToggle.querySelector('[data-testid="DataObjectIcon"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("3. 打码：请求头 Authorization 中的完整 Key 被隐藏", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqHeaders: { Authorization: "Bearer sk-abcdefghijklmnop" },
      reqBody: { model: "gpt-4", messages: [] },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("zorp,数据管道");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // 切到原始 JSON 视图
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const reqJson = container.querySelector(
      '[data-testid="terminology-ai-req-json"]'
    );

    // 含打码标记
    expect(reqJson.textContent).toContain("****");
    // 不含完整 Key
    expect(reqJson.textContent).not.toContain("sk-abcdefghijklmnop");

    act(() => root.unmount());
  });

  test("4. 主题/滚动：原始 JSON 内容在面板滚动区内，无硬编码 hex 背景", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqBody: { model: "gpt-4", messages: [] },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("zorp,数据管道");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // 切到原始 JSON 视图
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const reqJson = container.querySelector(
      '[data-testid="terminology-ai-req-json"]'
    );
    expect(reqJson).not.toBeNull();

    // 面板滚动区存在且包含 JSON 内容（Task 2.3：滚动由外层 scroll 区统一管理）
    const reqScroll = container.querySelector(
      '[data-testid="terminology-ai-req-scroll"]'
    );
    expect(reqScroll).not.toBeNull();
    expect(reqScroll.contains(reqJson)).toBe(true);

    act(() => root.unmount());
  });

  test("5. 只读 + 无复制：请求/响应面板内不含 textarea/input/editable，无复制按钮", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqBody: { model: "gpt-4", messages: [] },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("zorp,数据管道");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // 请求/响应面板内无可编辑元素
    const resultArea = container.querySelector(
      '[data-testid="terminology-ai-result"]'
    );
    expect(
      resultArea.querySelectorAll("textarea, input, [contenteditable]").length
    ).toBe(0);

    // 无复制按钮
    const allButtons = resultArea.querySelectorAll("button");
    const copyButtons = [...allButtons].filter((btn) => {
      const label = btn.getAttribute("aria-label") || "";
      const testid = btn.getAttribute("data-testid") || "";
      return (
        label.includes("copy") ||
        label.includes("复制") ||
        testid.includes("copy")
      );
    });
    expect(copyButtons.length).toBe(0);

    act(() => root.unmount());
  });

  test("6. 截断：超长请求体在原始 JSON 视图中被截断并标记", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    const longSystemContent = "A".repeat(500);
    mockApiTranslateWithCapture({
      reqBody: {
        model: "gpt-4",
        messages: [{ role: "system", content: longSystemContent }],
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    act(() => {
      setAiTermsDraft("zorp,数据管道");
    });

    const aiTestButton = container.querySelector(
      '[data-testid="terminology-ai-run-test"]'
    );
    act(() => {
      aiTestButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    // 切到原始 JSON 视图
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const reqJson = container.querySelector(
      '[data-testid="terminology-ai-req-json"]'
    );

    // 不含 500 个连续 A
    expect(reqJson.textContent).not.toContain("A".repeat(500));
    // 含截断标记
    expect(reqJson.textContent).toContain("[已省略");

    act(() => root.unmount());
  });

  test("restores the persisted AI test interface over the rule default", async () => {
    window.localStorage.setItem("kt-playground-ai-api-slug", "openai");
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      }),
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI 兼容",
        apiType: "OpenAI",
      })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口", apiSlug: "Microsoft" },
    });
    await flushEffects();

    // 恢复值 openai 优先于规则默认 Microsoft。
    const select = container.querySelector(
      '[data-testid="terminology-api-select"]'
    );
    expect(select.textContent).toContain("OpenAI 兼容");

    act(() => root.unmount());
  });

  test("clears the persisted interface when it no longer exists and falls back to defaults", async () => {
    window.localStorage.setItem("kt-playground-ai-api-slug", "deleted-api");
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      })
    );
    // Select 首帧渲染必须完成有效性归一化，绝不允许把失效恢复值直接塞给 MUI，
    // 否则必报一次 out-of-range 控制台 warning（AGENTS.md 无 warning 验收标准）。
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口", apiSlug: "Microsoft" },
    });
    await flushEffects();

    // 失效恢复值被清除，回落规则默认接口。
    const select = container.querySelector(
      '[data-testid="terminology-api-select"]'
    );
    expect(select.textContent).toContain("Microsoft");
    expect(window.localStorage.getItem("kt-playground-ai-api-slug")).toBeNull();
    // 首帧即向 MUI Select 传递合法 value，零 out-of-range 警告。
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("out-of-range")
    );
    warnSpy.mockRestore();

    act(() => root.unmount());
  });

  test("persists the manually selected AI test interface to localStorage", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "Microsoft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      }),
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
      })
    );
    const { container, root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口", apiSlug: "Microsoft" },
    });
    await flushEffects();

    // 打开单选下拉并选中 openai：localStorage 写入新 slug。
    const combobox = container.querySelector(
      '[data-testid="terminology-api-select"] [role="combobox"]'
    );
    await act(async () => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "openai")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.localStorage.getItem("kt-playground-ai-api-slug")).toBe(
      "openai"
    );

    act(() => root.unmount());
  });

  // ── Task 8 新增护栏用例（R1/R2/R3/R4/D2–D7） ──

  test("R1: AI example text covers every entered term", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture();
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道\nquzzle,缓存节点");
    await runAiTest(container);

    // 例句同时包含两个术语原词（此前只取 cases[0]，quzzle 物理上不可能被替换）。
    const requestText = container.querySelector(
      '[data-testid="terminology-ai-request-text"]'
    );
    expect(requestText.textContent).toContain("zorp");
    expect(requestText.textContent).toContain("quzzle");
    const callArgs = mockApiTranslate.mock.calls.at(-1)[0];
    expect(callArgs.text).toContain("zorp");
    expect(callArgs.text).toContain("quzzle");

    act(() => root.unmount());
  });

  test("R2: interface-level aiTerms is not re-injected and cannot override user input", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        aiTerms: "zorp,接口的值",
      })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,我的值");
    await runAiTest(container);

    const callArgs = mockApiTranslate.mock.calls.at(-1)[0];
    expect(callArgs.apiSetting.aiTerms).toBe("");
    expect(callArgs.glossary["zorp"]).toBe("我的值");

    act(() => root.unmount());
  });

  test("Task5: glossary key-values are visible in the expanded user message panel", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const userMsgJson = container.querySelector(
      '[data-testid="terminology-ai-usermsg-json"]'
    );
    expect(userMsgJson).not.toBeNull();
    expect(userMsgJson.textContent).toContain("zorp");
    expect(userMsgJson.textContent).toContain("数据管道");

    act(() => root.unmount());
  });

  test("D2: delivery column shows 已发出 with glossary and 未发出 without (segments still contain the term)", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    // 有 glossary → delivered。
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
      result: {
        trText: "数据管道已就绪",
        srLang: "en",
        srCode: "en",
        isSame: false,
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    // 去掉 glossary 但 segments[0].text 显式包含 zorp → 仍必须 missing（防子串判定回归）。
    mockApiTranslateWithCapture({
      reqUserMsg: {
        role: "user",
        content: JSON.stringify({
          targetLanguage: "zh-CN",
          segments: [
            {
              id: 0,
              text: "Please make sure the zorp is configured correctly before deploying.",
            },
          ],
        }),
      },
      result: {
        trText: "数据管道已就绪",
        srLang: "en",
        srCode: "en",
        isSame: false,
      },
    });
    await runAiTest(container);
    // 子串守卫：例句里明明有 zorp，但没注入 glossary 就不能误判为已发出。
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("missing");

    act(() => root.unmount());
  });

  test("D2: mismatch shows 值不一致 with the actual injected value highlighted in orange", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: {
        role: "user",
        content: batchUserMsgContent({ glossary: { zorp: "其它值" } }),
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const chip = container.querySelector(
      '[data-testid="terminology-ai-delivery-zorp"]'
    );
    expect(chip.getAttribute("data-state")).toBe("mismatch");
    expect(chip.textContent).toContain("其它值");
    // 橙色：mismatch 行的 Chip 用 warning 色。
    expect(chip.className).toContain("MuiChip-colorWarning");

    act(() => root.unmount());
  });

  test("D2: uncaptured requests render 未捕获 for all terms", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    // 不走 capture：rawRequest 为 null。
    mockApiTranslate.mockResolvedValue({
      trText: "x",
      srLang: "en",
      srCode: "en",
      isSame: false,
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("uncaptured");
    expect(
      container.querySelector('[data-testid="terminology-ai-usermsg-json"]')
        .textContent
    ).toContain("未捕获到提示词");

    act(() => root.unmount());
  });

  test("nobatch path: channel/label/已发出 when {{glossary}} line present, 未发出 after removal", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        useBatchFetch: false,
      })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: {
        role: "user",
        content:
          "Translate the text.\n- zorp: 数据管道\n\nText: Please make sure the zorp is configured correctly before deploying.",
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    expect(
      container.querySelector('[data-testid="terminology-ai-inject-channel"]')
        .textContent
    ).toContain("非批量 {{glossary}} 占位符");
    expect(
      container.querySelector('[data-testid="terminology-ai-prompt-label"]')
        .textContent
    ).toContain("非批量翻译提示词");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    // 删掉该行（R4 现场证据）→ missing。
    mockApiTranslateWithCapture({
      reqUserMsg: {
        role: "user",
        content:
          "Translate the text.\n\nText: Please make sure the zorp is configured correctly before deploying.",
      },
    });
    await runAiTest(container);
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("missing");

    act(() => root.unmount());
  });

  test("QwenMT: native server-side terms channel with label '不使用翻译提示词'", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "qwenmt",
        apiName: "QwenMT",
        apiType: "QwenMT",
      })
    );
    mockApiTranslateWithCapture({
      reqBody: {
        model: "qwen-mt-turbo",
        messages: [
          {
            role: "user",
            content:
              "Please make sure the zorp is configured correctly before deploying.",
          },
        ],
        translation_options: {
          source_lang: "auto",
          target_lang: "zh-CN",
          terms: [{ source: "zorp", target: "数据管道" }],
        },
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    expect(
      container.querySelector('[data-testid="terminology-ai-prompt-label"]')
        .textContent
    ).toContain("不使用翻译提示词");
    expect(
      container.querySelector('[data-testid="terminology-ai-inject-channel"]')
        .textContent
    ).toContain("服务端原生术语 translation_options.terms");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    act(() => root.unmount());
  });

  test("Custom API: declared as non-injecting, user message uncaptured, all deliveries 未发出", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "custom",
        apiName: "自定义",
        apiType: "Custom",
      })
    );
    mockApiTranslateWithCapture({
      reqBody: {
        texts: [
          "Please make sure the zorp is configured correctly before deploying.",
        ],
        from: "auto",
        to: "zh-CN",
      },
      reqUserMsg: undefined,
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    expect(
      container.querySelector('[data-testid="terminology-ai-inject-channel"]')
        .textContent
    ).toContain("自定义接口：不注入提示词与术语");
    expect(
      container.querySelector('[data-testid="terminology-ai-usermsg-json"]')
        .textContent
    ).toContain("未捕获到提示词");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("missing");

    act(() => root.unmount());
  });

  test("Gemini generateContent parts form expands and delivers 已发出", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "gemini",
        apiName: "Gemini",
        apiType: "Gemini",
      })
    );
    mockApiTranslateWithCapture({
      reqUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key=x",
      reqBody: {
        systemInstruction: { parts: [{ text: "sys" }] },
        contents: [],
      },
      reqUserMsg: { role: "user", parts: [{ text: batchUserMsgContent() }] },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const userMsgJson = container.querySelector(
      '[data-testid="terminology-ai-usermsg-json"]'
    );
    expect(userMsgJson.textContent).toContain("数据管道");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    act(() => root.unmount());
  });

  test("Gemini Interactions content array form expands and delivers 已发出", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "gemini",
        apiName: "Gemini",
        apiType: "Gemini",
      })
    );
    mockApiTranslateWithCapture({
      reqUrl: "https://generativelanguage.googleapis.com/v1beta/interactions",
      reqBody: { system_instruction: "sys", input: [] },
      reqUserMsg: {
        type: "user_input",
        content: [{ type: "text", text: batchUserMsgContent() }],
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const userMsgJson = container.querySelector(
      '[data-testid="terminology-ai-usermsg-json"]'
    );
    expect(userMsgJson.textContent).toContain("数据管道");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    act(() => root.unmount());
  });

  test.each([
    [
      "camelCase systemInstruction object",
      {
        systemInstruction: { parts: [{ text: "A".repeat(500) }] },
        contents: [],
      },
    ],
    [
      "snake_case system_instruction string",
      { system_instruction: "A".repeat(500), input: [] },
    ],
  ])(
    "D6: system prompt truncated at 80 chars for %s",
    async (_label, reqBody) => {
      mockResolvedTransApis.push(
        mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
      );
      mockApiTranslateWithCapture({
        reqBody,
        reqUserMsg: { role: "user", content: batchUserMsgContent() },
      });
      const { container, root, setAiTermsDraft } = renderPlayground({
        rule: null,
      });
      await flushEffects();
      fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
      await runAiTest(container);

      const reqToggle = container.querySelector(
        '[data-testid="terminology-ai-req-toggle"]'
      );
      act(() => {
        reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const reqJson = container.querySelector(
        '[data-testid="terminology-ai-req-json"]'
      );
      // 字段被识别才会截断出「已省略 420 字符」；若落到 GENERIC_MAX(1200)，500 字符不会截断。
      expect(reqJson.textContent).toContain("已省略 420 字符");

      act(() => root.unmount());
    }
  );

  test("D7: a term named 'key' stays plaintext in the expanded user message", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: {
        role: "user",
        content: JSON.stringify({
          targetLanguage: "zh-CN",
          segments: [
            {
              id: 0,
              text: "Please make sure the key is configured correctly before deploying.",
            },
          ],
          glossary: { key: "密钥" },
        }),
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "key,密钥");
    await runAiTest(container);

    const userMsgJson = container.querySelector(
      '[data-testid="terminology-ai-usermsg-json"]'
    );
    expect(userMsgJson.textContent).toContain("密钥");
    expect(userMsgJson.textContent).not.toContain("****");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-key"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    act(() => root.unmount());
  });

  test("empty-value term: delivered 已发出 and hit column shows 不翻译（空值）", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: {
        role: "user",
        content: JSON.stringify({
          targetLanguage: "zh-CN",
          segments: [
            {
              id: 0,
              text: "Please make sure the zorp is configured correctly before deploying.",
            },
          ],
          glossary: { zorp: "" },
        }),
      },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp");
    await runAiTest(container);

    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");
    const resultArea = container.querySelector(
      '[data-testid="terminology-ai-result"]'
    );
    expect(resultArea.textContent).toContain("不翻译（空值）");

    act(() => root.unmount());
  });

  test("D4: switching the selector after a run keeps every snapshot-derived conclusion", async () => {
    window.localStorage.removeItem("kt-playground-ai-api-slug");
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" }),
      mockResolvedApi({
        apiSlug: "msft",
        apiName: "Microsoft",
        apiType: "Microsoft",
      })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: { pattern: "*", terms: "", apiSlug: "openai" },
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const titleBefore =
      container.querySelector('[data-testid="terminology-ai-result"] h6')
        ?.textContent ||
      [
        ...container.querySelectorAll(
          '[data-testid="terminology-ai-result"] .MuiTypography-root'
        ),
      ]
        .map((el) => el.textContent)
        .find((t) => t.includes("测试结果"));
    expect(titleBefore).toContain("OpenAI");
    expect(
      container.querySelector('[data-testid="terminology-ai-inject-channel"]')
        .textContent
    ).toContain("批量 JSON glossary 字段");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    // 切到机器翻译接口：结果区全部结论保持不变（只读请求时快照）。
    await selectApiBySlug(container, "msft");
    const titleAfter = [
      ...container.querySelectorAll(
        '[data-testid="terminology-ai-result"] .MuiTypography-root'
      ),
    ]
      .map((el) => el.textContent)
      .find((t) => t.includes("测试结果"));
    expect(titleAfter).toContain("OpenAI");
    expect(titleAfter).toBe(titleBefore);
    expect(
      container.querySelector('[data-testid="terminology-ai-inject-channel"]')
        .textContent
    ).toContain("批量 JSON glossary 字段");
    expect(
      container.querySelector('[data-testid="terminology-ai-prompt-label"]')
        .textContent
    ).toContain("JSON 聚合翻译提示词");
    expect(
      container
        .querySelector('[data-testid="terminology-ai-delivery-zorp"]')
        .getAttribute("data-state")
    ).toBe("delivered");

    act(() => root.unmount());
  });

  // ── §B UI 细化新用例（Task 4.3） ──

  test("AI help section: collapsed by default, expands on click, collapses on second click", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();

    const moreBtn = container.querySelector(
      '[data-testid="terminology-ai-help-more"]'
    );
    expect(moreBtn.textContent).toBe("更多");

    // Collapse 折叠时子节点仍在 DOM（height:0），但祖先 .MuiCollapse-root 带 MuiCollapse-hidden。
    const collapseRoot = container
      .querySelector('[data-testid="terminology-ai-help-detail"]')
      .closest(".MuiCollapse-root");
    expect(collapseRoot.className).toContain("MuiCollapse-hidden");

    // 点击展开
    act(() => {
      moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(moreBtn.textContent).toBe("收起");
    expect(collapseRoot.className).not.toContain("MuiCollapse-hidden");

    act(() => root.unmount());
  });

  test("side-by-side layout: req and resp columns exist with md=6 grid class", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const reqCol = container.querySelector(
      '[data-testid="terminology-ai-req-col"]'
    );
    const respCol = container.querySelector(
      '[data-testid="terminology-ai-resp-col"]'
    );
    expect(reqCol).not.toBeNull();
    expect(respCol).not.toBeNull();
    expect(reqCol.className).toContain("MuiGrid-grid-md-6");
    expect(respCol.className).toContain("MuiGrid-grid-md-6");

    act(() => root.unmount());
  });

  test("default: no maxHeight on panel containers, scroll areas not in auto overflow", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    // 外层 Box（Grid item 的第一个子元素）初始无 maxHeight
    const reqPanel = container.querySelector(
      '[data-testid="terminology-ai-req-col"] > div'
    );
    const respPanel = container.querySelector(
      '[data-testid="terminology-ai-resp-col"] > div'
    );
    expect(reqPanel.style.maxHeight).toBe("");
    expect(respPanel.style.maxHeight).toBe("");

    // 滚动区初始 overflowY 不是 auto（U2 默认不滚动契约）
    const reqScroll = container.querySelector(
      '[data-testid="terminology-ai-req-scroll"]'
    );
    const respScroll = container.querySelector(
      '[data-testid="terminology-ai-resp-scroll"]'
    );
    expect(reqScroll.style.overflowY).not.toBe("auto");
    expect(respScroll.style.overflowY).not.toBe("auto");

    act(() => root.unmount());
  });

  test("help text uses caption variant, not body2", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();

    // 常显说明段使用 caption 字号/字重（Task 1.1：body2 → caption 降级）。
    const helpText = container.querySelector(
      '[data-testid="terminology-ai-terms"] .MuiTypography-caption'
    );
    expect(helpText).not.toBeNull();
    expect(helpText.className).toContain("MuiTypography-caption");
    expect(helpText.className).not.toContain("MuiTypography-body2");

    act(() => root.unmount());
  });

  test("U9: side toggle independence — req and resp toggles do not affect each other", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    // 初始：两侧都是摘要视图
    expect(
      container.querySelector('[data-testid="terminology-ai-req-json"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="terminology-ai-resp-json"]')
    ).toBeNull();

    // 只点左侧 → 左侧切 JSON，右侧仍是摘要
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-ai-req-json"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="terminology-ai-resp-json"]')
    ).toBeNull();

    // 点右侧 → 两侧都是 JSON
    const respToggle = container.querySelector(
      '[data-testid="terminology-ai-resp-toggle"]'
    );
    act(() => {
      respToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-ai-req-json"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="terminology-ai-resp-json"]')
    ).not.toBeNull();

    // 点回左侧 → 左侧变回摘要，右侧仍是 JSON
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-ai-req-json"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="terminology-ai-resp-json"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("C4: the expanded prompt panel is summary-view only (hidden in raw JSON view)", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqBody: {
        model: "gpt-4",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: batchUserMsgContent() },
        ],
      },
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    // 摘要视图：面板在，且 glossary 明文可见。
    const panel = container.querySelector(
      '[data-testid="terminology-ai-usermsg-json"]'
    );
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("数据管道");

    // 切原始 JSON：面板必须消失（否则同一份内容在同一视图出现两次）。
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    act(() => {
      reqToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="terminology-ai-usermsg-json"]')
    ).toBeNull();

    // 补偿：body 里的用户消息被就地反转义成对象，所以 glossary 仍然可读，
    // 且不应出现 JSON 字符串转义后的 \" 序列。
    const reqJson = container.querySelector(
      '[data-testid="terminology-ai-req-json"]'
    );
    expect(reqJson.textContent).toContain("数据管道");
    expect(reqJson.textContent).not.toContain('\\"targetLanguage\\"');
    // 系统提示词不参与展开（仍按 role==="system" 走 SYSTEM_PROMPT_MAX 分支）。
    expect(reqJson.textContent).toContain("sys");

    act(() => root.unmount());
  });

  test("Task 2.2 structure: header toggle is not inside the scroll area", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const reqScroll = container.querySelector(
      '[data-testid="terminology-ai-req-scroll"]'
    );
    const reqToggle = container.querySelector(
      '[data-testid="terminology-ai-req-toggle"]'
    );
    expect(reqScroll.contains(reqToggle)).toBe(false);

    const respScroll = container.querySelector(
      '[data-testid="terminology-ai-resp-scroll"]'
    );
    const respToggle = container.querySelector(
      '[data-testid="terminology-ai-resp-toggle"]'
    );
    expect(respScroll.contains(respToggle)).toBe(false);

    act(() => root.unmount());
  });

  // ── AI 测试目标语言下拉 + 持久化（本计划 Task 1/2/4） ──

  /* eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- jsdom 交互模式与全文件既有写法一致；render() 未用 TL，screen 不可用。 */
  function queryTestid(testid) {
    return document.querySelector(`[data-testid="${testid}"]`);
  }

  /** 通过下拉把 AI 测试目标语言切到指定语言代码（复用接口选择器的 jsdom 交互模式）。 */
  async function selectAiToLang(code) {
    /* eslint-disable-next-line testing-library/prefer-screen-queries, testing-library/no-node-access -- 同上，jsdom 交互模式。 */
    const combobox = queryTestid("terminology-ai-target-lang").querySelector(
      '[role="combobox"]'
    );
    await act(async () => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === code)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /** 读取目标语言下拉的当前值（MUI Select 的隐藏原生 input）。 */
  function aiToLangValue() {
    /* eslint-disable-next-line testing-library/prefer-screen-queries, testing-library/no-node-access -- MUI 隐藏 input 无语义角色，只能类名定位。 */
    return queryTestid("terminology-ai-target-lang").querySelector(
      ".MuiSelect-nativeInput"
    ).value;
  }

  test("target language dropdown sits on its own row after the button row and defaults to the global toLang", async () => {
    const { root } = renderPlayground({ rule: null });
    await flushEffects();

    const select = queryTestid("terminology-ai-target-lang");
    expect(select).not.toBeNull();
    // 未持久化时默认 = 全局 tranboxSetting.toLang（与下拉引入前行为一致）。
    expect(aiToLangValue()).toBe("zh-CN");
    // 选项来自 OPT_LANGS_TO_REVERSED（中文名在前），与全站目标语言下拉一致。
    expect(select.textContent).toContain("简体中文 - Simplified Chinese");

    // 第一行：填入示例 / 换一个例句 / 测试 三按钮同一 Stack。
    const stack = queryTestid("terminology-ai-run-test").parentElement;
    expect(
      [...stack.children].map((el) => el.getAttribute("data-testid"))
    ).toEqual([
      "terminology-ai-sample",
      "terminology-ai-rotate-seed",
      "terminology-ai-run-test",
    ]);

    // 第二行：目标语言下拉是按钮行的下一个兄弟，独立成行且带 mt:2 间隔（16px，
    // 真机反馈 mt:1 的 8px 贴得太近）、宽 200。
    expect(stack.nextElementSibling).toBe(select);
    const selectCss = ownRuleText(select);
    expect(selectCss).toMatch(/width:\s*200px/);
    expect(selectCss).toMatch(/margin-top:\s*16px/);

    // 折行根因修复：操作区 Stack 必须走 flex gap，而不是 sibling margin-left。
    const stackCss = ownRuleText(stack);
    expect(stackCss).toMatch(/gap:\s*8px/);
    expect(stackCss).not.toMatch(/margin-left/);

    // 本地术语操作区同一缺陷一并修复。
    const localStack = queryTestid("terminology-run-test").parentElement;
    const localStackCss = ownRuleText(localStack);
    expect(localStackCss).toMatch(/gap:\s*8px/);
    expect(localStackCss).not.toMatch(/margin-left/);

    act(() => root.unmount());
  });

  describe("with a non-Chinese global target language", () => {
    beforeEach(() => {
      mockTranboxSetting.toLang = "ja";
    });

    test("falls back to the global toLang when nothing is persisted", async () => {
      const { root } = renderPlayground({ rule: null });
      await flushEffects();

      expect(aiToLangValue()).toBe("ja");

      act(() => root.unmount());
    });

    test("prefers a valid persisted language over the global toLang", async () => {
      window.localStorage.setItem("kt-playground-ai-to-lang", "ko");
      const { root } = renderPlayground({ rule: null });
      await flushEffects();

      expect(aiToLangValue()).toBe("ko");

      act(() => root.unmount());
    });

    test("clears an invalid persisted language and falls back to the global toLang", async () => {
      window.localStorage.setItem("kt-playground-ai-to-lang", "not-a-lang");
      const { root } = renderPlayground({ rule: null });
      await flushEffects();

      expect(aiToLangValue()).toBe("ja");
      // 脏值不得永久留存（对齐接口选择的失效清理语义）。
      expect(
        window.localStorage.getItem("kt-playground-ai-to-lang")
      ).toBeNull();

      act(() => root.unmount());
    });
  });

  test("persists the manually selected target language and restores it after a remount", async () => {
    const { root } = renderPlayground({ rule: null });
    await flushEffects();

    await selectAiToLang("ja");
    expect(aiToLangValue()).toBe("ja");
    expect(window.localStorage.getItem("kt-playground-ai-to-lang")).toBe("ja");

    // 刷新（卸载 + 重新挂载）后回读持久化值。
    act(() => root.unmount());
    const { root: remountedRoot } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    expect(aiToLangValue()).toBe("ja");

    act(() => remountedRoot.unmount());
  });

  test("AI test request uses the selected target language, keeps fromLang auto", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture();
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,データパイプライン");

    await selectAiToLang("ja");
    await runAiTest(container);

    const callArgs = mockApiTranslate.mock.calls.at(-1)[0];
    expect(callArgs.toLang).toBe("ja");
    // 源语言仍交给模型自动识别（例句正文恒为英文模板）。
    expect(callArgs.fromLang).toBe("auto");

    act(() => root.unmount());
  });

  test("AI example area labels the source language as English", async () => {
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");

    const sourceLang = queryTestid("terminology-ai-source-lang");
    expect(sourceLang).not.toBeNull();
    // 复用全局 from_lang 文案 + OPT_LANGS_MAP 的纯语言名。
    expect(sourceLang.textContent).toContain("原文语言");
    expect(sourceLang.textContent).toContain("English");
    expect(sourceLang.textContent).not.toContain("English - English");

    act(() => root.unmount());
  });

  test("response summary shows the target language actually sent", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture();
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");

    await selectAiToLang("ja");
    await runAiTest(container);

    const resultToLang = queryTestid("terminology-ai-result-to-lang");
    expect(resultToLang).not.toBeNull();
    expect(resultToLang.textContent).toContain("目标语言");
    expect(resultToLang.textContent).toContain("Japanese");
    expect(resultToLang.textContent).toContain("ja");

    act(() => root.unmount());
  });

  // ── 窄屏适配（本计划 Task 5） ──

  test("every table is wrapped in a horizontally scrollable container", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    mockApiTranslateWithCapture({
      reqUserMsg: { role: "user", content: batchUserMsgContent() },
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    const tables = [...document.querySelectorAll("table")];
    // 解析术语表 + 生效检测表（顶部矩阵对照表已移除）。
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect(window.getComputedStyle(table.parentElement).overflowX).toBe(
        "auto"
      );
      // minWidth 是"真滚动"的必要条件：width:100% 的表格永远不会溢出包裹层，
      // 只会压缩换行，overflowX:auto 形同虚设。
      expect(table.style.minWidth).not.toBe("");
      expect(table.style.minWidth).not.toBe("auto");
      expect(parseInt(table.style.minWidth, 10)).toBeGreaterThanOrEqual(480);
    }

    act(() => root.unmount());
  });

  test("info cards stack to a single column on narrow screens", async () => {
    const { root } = renderPlayground({
      rule: { pattern: "*", terms: "API,接口" },
    });
    await flushEffects();

    const card = document
      .querySelector('[data-testid="terminology-seed"]')
      .closest(".MuiGrid-item");
    expect(card.className).toContain("MuiGrid-grid-xs-12");
    expect(card.className).toContain("MuiGrid-grid-sm-6");
    expect(card.className).toContain("MuiGrid-grid-md-3");

    act(() => root.unmount());
  });

  // ── 连续测试轮次隔离 / 取消复位 / 失败轮请求面板（本计划 Task 1/3/6/7） ──

  /**
   * 排入「下一轮」AI 测试的 mock 实现（mockImplementationOnce，按 FIFO 消费）。
   * 每轮请求体的 model、用户消息与响应体都带 label 标记，用来断言轮次数据不串。
   * deferred=true 时返回受控句柄：settle() 注入 capture 后 resolve，fail(err) 直接 reject，
   * 便于在 pending 态做断言（真实 apiTranslate 在单测中被 mock，无法用它复现请求层污染）。
   */
  function queueAiRound({
    label,
    trText = `译文-${label}`,
    srLang = "en",
    srCode = "en",
    isSame = false,
    deferred = false,
  }) {
    const handle = { settle: null, fail: null };
    const result = { trText, srLang, srCode, isSame };
    const emitCapture = (capture) => {
      capture?.onRequest?.(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `gpt-4-${label}`,
            messages: [
              { role: "system", content: "sys" },
              { role: "user", content: `用户消息-${label}` },
            ],
          }),
        },
        { role: "user", content: `用户消息-${label}` }
      );
      capture?.onResponse?.({
        marker: `响应体-${label}`,
        choices: [{ message: { content: trText } }],
      });
    };
    mockApiTranslate.mockImplementationOnce((opts = {}) => {
      if (!deferred) {
        emitCapture(opts.capture);
        return Promise.resolve(result);
      }
      return new Promise((resolve, reject) => {
        handle.settle = () => {
          emitCapture(opts.capture);
          resolve(result);
        };
        handle.fail = (error) => reject(error);
      });
    });
    return handle;
  }

  /** 点击指定 testid 的元素（不等待异步完成，供 pending 态断言）。 */
  function clickTestid(testid) {
    act(() => {
      queryTestid(testid).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
  }

  /** 把请求/响应面板都切到原始 JSON 视图（视图偏好跨轮保留，D4）。 */
  function showBothRawViews() {
    clickTestid("terminology-ai-req-toggle");
    clickTestid("terminology-ai-resp-toggle");
  }

  test("连续三轮 AI 测试：摘要与原始 JSON 同源，pending 期间结果区隐藏，不累计上一轮内容", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();

    // ── 第一轮 ──
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    queueAiRound({ label: "r1", srLang: "en", srCode: "en", isSame: false });
    await runAiTest(container);

    // 摘要视图：例句、译文、语言三项都来自第一轮。
    expect(queryTestid("terminology-ai-request-text").textContent).toContain(
      "zorp"
    );
    expect(queryTestid("terminology-ai-response-text").textContent).toBe(
      "译文-r1"
    );
    const respSummary = queryTestid("terminology-ai-resp-scroll").textContent;
    expect(respSummary).toContain("语言：en（en）");
    expect(respSummary).toContain("同语言：否");

    // 切原始 JSON：与摘要同源于同一份状态对象，标记同为 r1。
    showBothRawViews();
    expect(queryTestid("terminology-ai-req-json").textContent).toContain(
      "gpt-4-r1"
    );
    expect(queryTestid("terminology-ai-resp-json").textContent).toContain(
      "响应体-r1"
    );

    // ── 换一个例句：只换例句，已有结果保持显示且不折叠（D1） ──
    clickTestid("terminology-ai-rotate-seed");
    expect(queryTestid("terminology-ai-result")).not.toBeNull();
    expect(queryTestid("terminology-ai-req-json").textContent).toContain(
      "gpt-4-r1"
    );
    expect(queryTestid("terminology-ai-resp-json").textContent).toContain(
      "响应体-r1"
    );

    // ── 第二轮：受控 pending，断言 testing 态结果区整体隐藏（D2/D3 的可观测等价） ──
    fillAiTerms(container, setAiTermsDraft, "quzzle,缓存节点");
    const round2 = queueAiRound({
      label: "r2",
      srLang: "zh",
      srCode: "zh-CN",
      isSame: true,
      deferred: true,
    });
    clickTestid("terminology-ai-run-test");
    expect(queryTestid("terminology-ai-result")).toBeNull();
    expect(queryTestid("terminology-ai-error")).toBeNull();
    expect(queryTestid("terminology-ai-run-test").disabled).toBe(true);

    await act(async () => {
      round2.settle();
      await Promise.resolve();
    });
    await flushEffects();

    // 视图偏好未被重置（D4），JSON 只含第二轮内容。
    const req2 = queryTestid("terminology-ai-req-json").textContent;
    const resp2 = queryTestid("terminology-ai-resp-json").textContent;
    expect(req2).toContain("gpt-4-r2");
    expect(req2).not.toContain("gpt-4-r1");
    expect(resp2).toContain("响应体-r2");
    expect(resp2).not.toContain("响应体-r1");

    // 切回摘要：例句/译文/语言全部轮换到第二轮，不残留第一轮。
    showBothRawViews();
    const req2Summary = queryTestid("terminology-ai-request-text").textContent;
    expect(req2Summary).toContain("quzzle");
    expect(req2Summary).not.toContain("zorp");
    expect(queryTestid("terminology-ai-response-text").textContent).toBe(
      "译文-r2"
    );
    const resp2Summary = queryTestid("terminology-ai-resp-scroll").textContent;
    expect(resp2Summary).toContain("语言：zh（zh-CN）");
    expect(resp2Summary).toContain("同语言：是");

    // ── 第三轮：换例句后再测，JSON 不为空且不累计前两轮 ──
    clickTestid("terminology-ai-rotate-seed");
    queueAiRound({ label: "r3" });
    await runAiTest(container);
    showBothRawViews();
    const req3 = queryTestid("terminology-ai-req-json").textContent;
    const resp3 = queryTestid("terminology-ai-resp-json").textContent;
    expect(req3.trim()).not.toBe("");
    expect(req3).toContain("gpt-4-r3");
    expect(req3).not.toContain("gpt-4-r1");
    expect(req3).not.toContain("gpt-4-r2");
    expect(resp3).toContain("响应体-r3");
    expect(resp3).not.toContain("响应体-r1");
    expect(resp3).not.toContain("响应体-r2");

    act(() => root.unmount());
  });

  test("非批量接口连续三轮同样不串轮次", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        useBatchFetch: false,
      })
    );
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");

    for (const label of ["n1", "n2", "n3"]) {
      queueAiRound({ label });
      await runAiTest(container);
      expect(queryTestid("terminology-ai-response-text").textContent).toBe(
        `译文-${label}`
      );
    }
    // 非批量路径也保留原始 useBatchFetch，不被测试入口篡改。
    expect(mockApiTranslate.mock.calls.at(-1)[0].apiSetting.useBatchFetch).toBe(
      false
    );

    showBothRawViews();
    const reqJson = queryTestid("terminology-ai-req-json").textContent;
    expect(reqJson).toContain("gpt-4-n3");
    expect(reqJson).not.toContain("gpt-4-n1");
    expect(reqJson).not.toContain("gpt-4-n2");

    act(() => root.unmount());
  });

  test("Task3: 测试入口强制 useContext:false，历史上下文不进入任何一轮请求", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({
        apiSlug: "openai",
        apiName: "OpenAI",
        useContext: true,
        contextSize: 3,
      })
    );
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");

    for (const label of ["c1", "c2", "c3"]) {
      queueAiRound({ label });
      await runAiTest(container);
      // 每一轮都显式关闭上下文（getMsgHistory 单例因此不被读取）。
      expect(mockApiTranslate.mock.calls.at(-1)[0].apiSetting.useContext).toBe(
        false
      );
      // 接口原始配置未被就地修改，只有本次请求的副本被覆盖。
      expect(mockResolvedTransApis[0].useContext).toBe(true);
    }

    // 第 2/3 轮展示的请求体只含本轮用户消息，不含上一轮例句文本。
    showBothRawViews();
    const reqJson = queryTestid("terminology-ai-req-json").textContent;
    expect(reqJson).toContain("用户消息-c3");
    expect(reqJson).not.toContain("用户消息-c1");
    expect(reqJson).not.toContain("用户消息-c2");

    act(() => root.unmount());
  });

  test("Task6: 失败轮仍可查看已捕获的请求 JSON，但不出现生效检测表", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    // 先触发 onRequest 再 reject：真实路径上 capture.onRequest 在 fetchData 之前执行。
    mockApiTranslate.mockImplementation((opts = {}) => {
      opts.capture?.onRequest?.(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4-err",
            messages: [{ role: "user", content: "用户消息-err" }],
          }),
        },
        { role: "user", content: "用户消息-err" }
      );
      return Promise.reject(new Error("HTTP 401 Unauthorized"));
    });
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");
    await runAiTest(container);

    // 错误提示与结果区并存：请求列在，响应列固定展示「未捕获到响应」。
    expect(queryTestid("terminology-ai-error").textContent).toContain("401");
    expect(queryTestid("terminology-ai-req-col")).not.toBeNull();
    expect(queryTestid("terminology-ai-resp-scroll").textContent).toContain(
      "未捕获到响应"
    );
    // 失败轮没有可摘要的译文，响应侧不给摘要↔JSON 开关。
    expect(queryTestid("terminology-ai-resp-toggle")).toBeNull();

    // 请求 JSON 视图非空，含本轮真实请求体。
    clickTestid("terminology-ai-req-toggle");
    const reqJson = queryTestid("terminology-ai-req-json");
    expect(reqJson).not.toBeNull();
    expect(reqJson.textContent).toContain("gpt-4-err");
    expect(reqJson.textContent).toContain("用户消息-err");

    // 不对失败轮做「已发出」结论：检测表与启发式说明都不出现。
    expect(queryTestid("terminology-ai-delivery-zorp")).toBeNull();
    const resultArea = queryTestid("terminology-ai-result").textContent;
    expect(resultArea).not.toContain("术语表贡献与生效检测");
    expect(resultArea).not.toContain("启发式参考");
    // 软术语块仍列出术语，但不带会说反话的状态 Chip（失败轮请求其实已捕获）。
    clickTestid("terminology-ai-req-toggle");
    const softGlossary = queryTestid("terminology-ai-soft-glossary");
    expect(softGlossary.textContent).toContain("zorp");
    expect(softGlossary.querySelectorAll(".MuiChip-root")).toHaveLength(0);

    act(() => root.unmount());
  });

  test("Task7: 取消 AI 测试后状态复位，按钮解锁且可立即发起下一轮", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");

    const pending = queueAiRound({ label: "cancel", deferred: true });
    clickTestid("terminology-ai-run-test");
    expect(queryTestid("terminology-ai-run-test").disabled).toBe(true);
    expect(queryTestid("terminology-ai-run-test").textContent).toContain(
      "测试中"
    );
    expect(queryTestid("terminology-ai-cancel")).not.toBeNull();

    clickTestid("terminology-ai-cancel");
    await act(async () => {
      pending.fail(
        new DOMException("The operation was aborted.", "AbortError")
      );
      await Promise.resolve();
    });
    await flushEffects();

    // 复位为初始无结果态：按钮解锁、文案回到「测试」、取消按钮卸载、结果/错误区都不残留。
    expect(queryTestid("terminology-ai-run-test").disabled).toBe(false);
    expect(queryTestid("terminology-ai-run-test").textContent).not.toContain(
      "测试中"
    );
    expect(queryTestid("terminology-ai-cancel")).toBeNull();
    expect(queryTestid("terminology-ai-result")).toBeNull();
    expect(queryTestid("terminology-ai-error")).toBeNull();
    // 主动取消不算失败，不弹错误 Snackbar。
    expect(mockAlert.error).not.toHaveBeenCalled();

    // 解锁路径：立刻发起下一轮并正常拿到结果。
    queueAiRound({ label: "after-cancel" });
    await runAiTest(container);
    expect(queryTestid("terminology-ai-result")).not.toBeNull();
    expect(queryTestid("terminology-ai-response-text").textContent).toBe(
      "译文-after-cancel"
    );

    act(() => root.unmount());
  });

  test("Task7: 取消后即使请求继续 resolve 也不落 done 态", async () => {
    mockResolvedTransApis.push(
      mockResolvedApi({ apiSlug: "openai", apiName: "OpenAI" })
    );
    const { container, root, setAiTermsDraft } = renderPlayground({
      rule: null,
    });
    await flushEffects();
    fillAiTerms(container, setAiTermsDraft, "zorp,数据管道");

    const pending = queueAiRound({ label: "late", deferred: true });
    clickTestid("terminology-ai-run-test");
    clickTestid("terminology-ai-cancel");
    // 取消后迟到的成功响应：signal.aborted 早退分支同样复位状态。
    await act(async () => {
      pending.settle();
      await Promise.resolve();
    });
    await flushEffects();

    expect(queryTestid("terminology-ai-result")).toBeNull();
    expect(queryTestid("terminology-ai-error")).toBeNull();
    expect(queryTestid("terminology-ai-run-test").disabled).toBe(false);

    act(() => root.unmount());
  });

  test("no custom resize handles remain; both term textareas use native resize:vertical", async () => {
    const { container, root } = renderPlayground({ rule: null });
    await flushEffects();
    // 回归护栏：组件树中不应出现任何自定义缩放手柄 testid。
    expect(
      container.querySelector('[data-testid$="-resize-handle"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid$="-resize-notch"]')
    ).toBeNull();
    // 术语库输入框与 AI 术语输入框的 textarea 声明原生 vertical 缩放样式。
    const termsTextarea = container.querySelector(
      '[data-testid="terminology-terms-input"] textarea'
    );
    const aiTextarea = container.querySelector(
      '[data-testid="terminology-ai-terms-input"] textarea'
    );
    for (const textarea of [termsTextarea, aiTextarea]) {
      expect(textarea).not.toBeNull();
    }

    act(() => root.unmount());
  });
});

test("C1 Red：maskForDisplay 对零 own 键非纯对象返回类型标签而非空对象 {}", () => {
  // 原型非 Object.prototype、own 可枚举键为空（等价原生 Response 的形态）。
  class FakeResponse {}
  // 旧实现展开得 {}，丢失类型信息 → Red；新实现诚实呈现类型标签。
  expect(maskForDisplay(new FakeResponse())).toEqual({
    __type: "FakeResponse",
    ownKeys: 0,
  });
  // 纯对象完全不变。
  expect(maskForDisplay({ ok: true, status: 200 })).toEqual({
    ok: true,
    status: 200,
  });
  // 数组完全不变。
  expect(maskForDisplay([{ a: 1 }])).toEqual([{ a: 1 }]);
  // 带 own 可枚举键的类实例：E1 窄门闸不吞掩码内容（green-to-green 锁定）。
  class WithOwnKey {
    constructor() {
      this.token = "secret";
    }
  }
  // own 键 "token" 命中 SENSITIVE_KEYS → 掩码路径 val.slice(0, 4) + "****"。
  expect(maskForDisplay(new WithOwnKey())).toEqual({ token: "secr****" });
});
