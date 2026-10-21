const fs = require("fs");
const path = require("path");

const originalClient = process.env.REACT_APP_CLIENT;
process.env.REACT_APP_CLIENT = "web";
afterAll(() => {
  if (originalClient === undefined) delete process.env.REACT_APP_CLIENT;
  else process.env.REACT_APP_CLIENT = originalClient;
});

let originalIntersectionObserver;
let originalCSSStyleSheet;
let originalGetComputedStyle;

beforeAll(() => {
  originalIntersectionObserver = global.IntersectionObserver;
  global.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      this.callback([{ target, isIntersecting: true }]);
    }
    unobserve() {}
    disconnect() {}
  };

  originalCSSStyleSheet = global.CSSStyleSheet;
  global.CSSStyleSheet = class {
    replaceSync() {}
  };

  originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (el) {
    const style = originalGetComputedStyle.call(window, el);
    // 模拟真实浏览器中自定义标签默认 display: inline 的表现
    if (el.tagName && el.tagName.toLowerCase().includes("-")) {
      return new Proxy(style, {
        get(target, prop) {
          if (prop === "display") return "inline";
          return target[prop];
        },
      });
    }
    return style;
  };
});

afterAll(() => {
  global.IntersectionObserver = originalIntersectionObserver;
  global.CSSStyleSheet = originalCSSStyleSheet;
  window.getComputedStyle = originalGetComputedStyle;
});

jest.mock("../apis", () => ({
  apiMicrosoftDict: jest.fn(),
  apiTranslate: jest.fn(),
  apiYoudaoDict: jest.fn(),
}));

jest.mock("./msg", () => ({
  sendBgMsg: jest.fn(),
}));

jest.mock("./detect", () => ({
  tryDetectLang: jest.fn().mockResolvedValue("en"),
}));

const { apiTranslate } = require("../apis");
const { DEFAULT_API_SETTING } = require("../config");
const { GLOBLA_RULE } = require("../config/rules");
const { Translator } = require("./translator");

const flushAsync = async () => {
  jest.runOnlyPendingTimers();
  for (let frame = 0; frame < 2; frame++) {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    jest.advanceTimersByTime(16);
  }
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const createApiSetting = (apiSlug) => ({
  ...DEFAULT_API_SETTING,
  apiSlug,
  apiName: apiSlug,
  isDisabled: false,
});

const createdTranslators = [];

function createTranslator(rule = {}) {
  const translator = new Translator({
    rule: {
      ...GLOBLA_RULE,
      transOpen: "true",
      rootsSelector: "body",
      ...rule,
    },
    setting: {
      transInterval: 0,
      rootMargin: 0,
      mouseHoverSetting: {},
      customStyles: [],
      transApis: [createApiSetting(DEFAULT_API_SETTING.apiSlug)],
    },
    favWords: [],
  });
  createdTranslators.push(translator);
  return translator;
}

afterEach(() => {
  createdTranslators.forEach((t) => t.stop());
  createdTranslators.length = 0;
  jest.clearAllMocks();
  document.body.innerHTML = "";
});

describe("通用组件化自定义标签容器与还原防泄漏测试（全局默认 autoScan: true，无专属规则）", () => {
  const fullHtmlPath = path.resolve(__dirname, "../../tmp/bgg_full.html");
  let sampleHtml = "";
  if (fs.existsSync(fullHtmlPath)) {
    sampleHtml = fs.readFileSync(fullHtmlPath, "utf8");
  }

  test("1. 目标选取验证: 即使自定义组件默认 display 为 inline，包含块级子节点时不吞噬外层结构容器", () => {
    document.documentElement.innerHTML = sampleHtml;
    // 使用纯全局默认规则
    const translator = createTranslator({ transOpen: "false" });
    const targets = translator.previewRule().targets;

    // 找到所有包含主帖正文的 target
    const contentTargets = targets.filter((t) =>
      t.textContent.includes("Do you think there will be a pdf")
    );

    // 必须穿透定位至正文叶子组件，不把外层容器当叶子文本块
    expect(contentTargets.length).toBe(1);
    expect(contentTargets[0].tagName.toLowerCase()).toBe("gg-markup-content");
    expect(contentTargets[0].textContent).not.toContain("User actions menu");
    expect(contentTargets[0].textContent).not.toContain("peterc1985");
  });

  test("2. 还原防泄漏验证: 关闭翻译或还原时，正文中绝无残留 loading 图标", async () => {
    jest.useFakeTimers();
    document.documentElement.innerHTML = sampleHtml;

    // 模拟在途请求（保持 loading 状态）
    apiTranslate.mockImplementation(() => new Promise(() => {}));

    const translator = createTranslator({ transOnly: "true" });
    await flushAsync();

    const markupContent = document.querySelector("gg-markup-content");
    expect(markupContent).toBeDefined();

    // 触发还原
    translator.stop();
    await flushAsync();

    // 验证正文完全还原为纯净原文，没有任何残余 loading 或 kiss-warpper 容器
    const wrappers = markupContent.querySelectorAll(
      `.${Translator.KISS_CLASS.warpper}`
    );
    expect(wrappers.length).toBe(0);
    const residualSvgTags = markupContent.querySelectorAll("svg");
    expect(residualSvgTags.length).toBe(0);
    expect(markupContent.textContent).toContain("Hey all!");
  });

  test("3. 双语对照模式与仅译文模式验证: 全文不产生多余大块译文堆积", async () => {
    jest.useFakeTimers();
    document.documentElement.innerHTML = sampleHtml;

    apiTranslate.mockImplementation(({ text }) =>
      Promise.resolve({ targetText: "【译】" + text })
    );

    const translator = createTranslator({ transOnly: "false" });
    await flushAsync();

    // 检查发起的翻译请求
    const calls = apiTranslate.mock.calls.map((c) => c[0]?.text || "");
    // 断言发起的请求中绝对没有包含全贴所有楼层合并的大文本（全贴长达 2000+ 字符）
    const giantMergedCalls = calls.filter(
      (text) =>
        text.includes("peterc1985") &&
        text.includes("Hey all!") &&
        text.includes("User actions menu")
    );
    expect(giantMergedCalls.length).toBe(0);

    // 验证正文已被识别并翻译
    const contentCalls = calls.filter(
      (text) =>
        text.includes("Do you think there will be a pdf") ||
        text.includes("Hey all!")
    );
    expect(contentCalls.length).toBeGreaterThan(0);
  });
});
