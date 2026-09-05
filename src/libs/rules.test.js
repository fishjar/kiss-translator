import { checkRules, matchRule, saveRule } from "./rules";
import { getDisabledSubRules, getRulesWithDefault, setRules } from "./storage";
import { loadOrFetchSubRules } from "./subRules";
import { GLOBLA_RULE } from "../config/rules";
import { OPT_TRANS_MICROSOFT, OPT_TRANS_TENCENT } from "../config/api";
import { DEFAULT_API_SETTING } from "../config";

jest.mock("./storage", () => ({
  getRulesWithDefault: jest.fn(),
  setRules: jest.fn(),
  getDisabledSubRules: jest.fn(),
}));

jest.mock("./subRules", () => ({
  loadOrFetchSubRules: jest.fn(),
}));

jest.mock("./sync", () => ({
  trySyncRules: jest.fn(),
}));

jest.mock("./log", () => ({
  kissLog: jest.fn(),
  LogLevel: {
    INFO: { value: 3 },
  },
}));

// Translator 链路集成测试所需的替身（与 translator.test.js 相同的模式）
jest.mock("../apis", () => ({
  apiMicrosoftDict: jest.fn(),
  apiTranslate: jest.fn(),
  apiYoudaoDict: jest.fn(),
}));

jest.mock("./msg", () => ({
  sendBgMsg: jest.fn(),
}));

jest.mock("./detect", () => ({
  tryDetectLang: jest.fn(),
}));

test("uses Microsoft as the default webpage translator", () => {
  expect(GLOBLA_RULE.apiSlug).toBe(OPT_TRANS_MICROSOFT);
});

test("keeps an explicitly stored Tencent global rule", async () => {
  getDisabledSubRules.mockResolvedValue([]);
  getRulesWithDefault.mockResolvedValue([
    { pattern: "*", apiSlug: OPT_TRANS_TENCENT },
  ]);

  const rule = await matchRule("https://example.com", {
    injectRules: false,
    subrulesList: [],
  });

  expect(rule.apiSlug).toBe(OPT_TRANS_TENCENT);
});

describe("rules enabled state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDisabledSubRules.mockResolvedValue([]);
    loadOrFetchSubRules.mockResolvedValue([]);
  });

  test("matches legacy personal rules without enabled field", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        selector: "article",
      },
      {
        pattern: "*",
        selector: "p",
        transOpen: "false",
      },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: false,
      subrulesList: [],
    });

    expect(rule.pattern).toBe("example.com");
    expect(rule.selector).toBe("article");
  });

  test("skips disabled personal rules and falls back to subscription rules", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        enabled: false,
        selector: "article",
      },
      {
        pattern: "*",
        selector: "p",
        transOpen: "false",
      },
    ]);
    loadOrFetchSubRules.mockResolvedValue([
      {
        pattern: "example.com",
        selector: ".sub-rule",
      },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: true,
      subrulesList: [
        { url: "https://rules.example/main.json", selected: true },
      ],
    });

    expect(rule.pattern).toBe("example.com");
    expect(rule.selector).toBe(".sub-rule");
  });

  test("skips disabled personal rules and falls back to global rules", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        enabled: false,
        selector: "article",
      },
      {
        pattern: "*",
        selector: "p",
        transOpen: "false",
      },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: false,
      subrulesList: [],
    });

    expect(rule.pattern).toBe("*");
    expect(rule.selector).toBe("p");
  });

  test.each([
    ["inherits the global setting", "true", "*", "true"],
    ["overrides the global setting on", "false", "true", "true"],
    ["overrides the global setting off", "true", "false", "false"],
  ])("%s", async (_, globalValue, siteValue, expectedValue) => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        selector: "article",
        isPlainText: siteValue,
      },
      {
        pattern: "*",
        selector: "p",
        isPlainText: globalValue,
      },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: false,
      subrulesList: [],
    });

    expect(rule.isPlainText).toBe(expectedValue);
  });

  test.each([
    [
      "inherits original wrapping and style",
      "true",
      "blockquote",
      "*",
      "*",
      "true",
      "blockquote",
    ],
    [
      "overrides original wrapping and style",
      "false",
      "style_none",
      "true",
      "highlight",
      "true",
      "highlight",
    ],
  ])(
    "%s",
    async (
      _,
      globalWrap,
      globalStyle,
      siteWrap,
      siteStyle,
      expectedWrap,
      expectedStyle
    ) => {
      getRulesWithDefault.mockResolvedValue([
        {
          pattern: "example.com",
          selector: "article",
          wrapOriginal: siteWrap,
          originalTextStyle: siteStyle,
        },
        {
          pattern: "*",
          selector: "p",
          wrapOriginal: globalWrap,
          originalTextStyle: globalStyle,
        },
      ]);

      const rule = await matchRule("https://example.com/post", {
        injectRules: false,
        subrulesList: [],
      });

      expect(rule.wrapOriginal).toBe(expectedWrap);
      expect(rule.originalTextStyle).toBe(expectedStyle);
    }
  );

  test.each([
    ["enabled", "false", true, "true"],
    ["disabled", "true", false, "false"],
  ])(
    "persists an explicit plain text setting from the popup when %s",
    async (_, globalValue, popupValue, expectedValue) => {
      getRulesWithDefault.mockResolvedValue([
        { pattern: "*", selector: "p", isPlainText: globalValue },
      ]);

      await saveRule({ pattern: "example.com", isPlainText: popupValue });

      expect(setRules).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            pattern: "example.com",
            isPlainText: expectedValue,
          }),
        ])
      );
    }
  );

  test("normalizes enabled field when checking imported rules", () => {
    const rules = checkRules([
      {
        pattern: "disabled.example",
        enabled: false,
      },
      {
        pattern: "invalid.example",
        enabled: "false",
      },
      {
        pattern: "legacy.example",
      },
    ]);

    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: "disabled.example",
          enabled: false,
        }),
        expect.objectContaining({
          pattern: "invalid.example",
          enabled: true,
        }),
        expect.objectContaining({
          pattern: "legacy.example",
          enabled: true,
        }),
      ])
    );
  });

  test("normalizes original wrapping fields in imported and legacy rules", () => {
    const rules = checkRules([
      {
        pattern: "valid.example",
        wrapOriginal: "true",
        originalTextStyle: "custom_original",
      },
      {
        pattern: "invalid.example",
        wrapOriginal: true,
        originalTextStyle: null,
      },
      {
        pattern: "legacy.example",
      },
      {
        pattern: "*",
      },
    ]);

    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: "valid.example",
          wrapOriginal: "true",
          originalTextStyle: "custom_original",
        }),
        expect.objectContaining({
          pattern: "invalid.example",
          wrapOriginal: "*",
          originalTextStyle: "*",
        }),
        expect.objectContaining({
          pattern: "legacy.example",
          wrapOriginal: "*",
          originalTextStyle: "*",
        }),
        expect.objectContaining({
          pattern: "*",
          wrapOriginal: "false",
          originalTextStyle: "style_none",
        }),
      ])
    );
  });
});

// ─── 术语规则链路集成测试 ─────────────────────────────────────────────────
// 覆盖完整链路：原始规则（含 terms/aiTerms）→ mergeRules（rules.js:121-139）
// → matchRule → Translator 构造消费 rule.terms（translator.js:872）
// → 占位符替换与还原。断言经规则合并后的 terms 在翻译器中产生正确替换。
describe("rules terms integration（规则链路：原始规则 → 合并 → Translator → 占位符还原）", () => {
  let originalIntersectionObserver;
  let originalCSSStyleSheet;
  let originalScrollBy;

  const { Translator } = require("./translator");
  const { apiTranslate } = require("../apis");
  const { tryDetectLang } = require("./detect");

  const flushAsync = async () => {
    // 译文 渲染链路较长（占位符还原 + 插入 wrapper），多轮推进 timer 与微任务
    for (let i = 0; i < 5; i++) {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    }
  };

  const createApiSetting = (apiSlug, isDisabled = false) => ({
    ...DEFAULT_API_SETTING,
    apiSlug,
    apiName: apiSlug,
    isDisabled,
  });

  const createTranslatorWithRule = (rule, text) => {
    document.body.innerHTML =
      '<main id="root"><span id="target"></span></main>';
    document.getElementById("target").textContent = text;
    return new Translator({
      rule: {
        transOpen: "true",
        rootsSelector: "#root",
        fromLang: "en",
        toLang: "zh-CN",
        autoScan: "false",
        selector: "#target",
        hasShadowroot: "false",
        scanAll: "false",
        transTitle: "false",
        ...rule,
      },
      setting: {
        transInterval: 0,
        rootMargin: 0,
        mouseHoverSetting: {},
        customStyles: [],
        // 合并后的规则保留 GLOBLA_RULE 的 apiSlug（Microsoft），
        // 因此 transApis 需配置与该 apiSlug 一致的 API 设置才会真正发起翻译
        transApis: [
          {
            ...createApiSetting(rule.apiSlug || OPT_TRANS_MICROSOFT),
            placeholder: "[[ ]]",
          },
        ],
      },
      favWords: [],
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    document.documentElement.innerHTML = "<head></head><body></body>";
    getDisabledSubRules.mockResolvedValue([]);
    loadOrFetchSubRules.mockResolvedValue([]);
    tryDetectLang.mockResolvedValue("en");
    apiTranslate.mockImplementation(({ text }) =>
      Promise.resolve({ trText: text, isSame: false })
    );

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

    originalScrollBy = window.scrollBy;
    window.scrollBy = jest.fn();
  });

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
    global.CSSStyleSheet = originalCSSStyleSheet;
    window.scrollBy = originalScrollBy;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test("合并后的 terms 在翻译器中正确替换：API,接口;APIKey 不出现 接口Key", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        selector: "article",
        transOpen: "true",
        terms: "API,接口;APIKey",
      },
      { pattern: GLOBLA_RULE.pattern, selector: "p" },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: false,
      subrulesList: [],
    });
    expect(rule.terms).toBe("API,接口;APIKey");

    createTranslatorWithRule(rule, "APIKey and API");
    await flushAsync();

    const requestedText = apiTranslate.mock.calls[0][0].text;
    // 长词整体占位符保护，短词单独命中 → 不出现 "接口Key"
    expect(requestedText).toBe("[[1]] and [[2]]");
    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    expect(inner.textContent).toBe("APIKey and 接口");
    expect(inner.textContent).not.toContain("接口Key");
  });

  test("个人规则 terms 覆盖全局规则，未覆盖的 aiTerms 保留", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        selector: "article",
        transOpen: "true",
        terms: "GPT;GPTs,智能体集合",
      },
      {
        pattern: GLOBLA_RULE.pattern,
        selector: "p",
        terms: "API,接口;APIKey",
        aiTerms: "React,React",
      },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: false,
      subrulesList: [],
    });
    // 高优先级非空则覆盖 terms（mergeRules 字符串字段合并规则）
    expect(rule.terms).toBe("GPT;GPTs,智能体集合");
    // 个人规则无 aiTerms → 继承全局的 aiTerms
    expect(rule.aiTerms).toBe("React,React");

    createTranslatorWithRule(rule, "GPTs and GPT");
    await flushAsync();

    const requestedText = apiTranslate.mock.calls[0][0].text;
    // 长词 GPTs 整体触发，短词 GPT 不抢占
    expect(requestedText).toBe("[[1]] and [[2]]");
    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    expect(inner.textContent).toBe("智能体集合 and GPT");
  });

  test("aiTerms 与本地 terms 是两条独立链路：aiTerms 不进入本地占位符替换", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "example.com",
        selector: "article",
        transOpen: "true",
        terms: "API,接口",
        aiTerms: "React,React",
      },
      { pattern: GLOBLA_RULE.pattern, selector: "p" },
    ]);

    const rule = await matchRule("https://example.com/post", {
      injectRules: false,
      subrulesList: [],
    });
    expect(rule.terms).toBe("API,接口");
    expect(rule.aiTerms).toBe("React,React");

    createTranslatorWithRule(rule, "API only");
    await flushAsync();

    const requestedText = apiTranslate.mock.calls[0][0].text;
    // aiTerms 只注入翻译 prompt（glossary 字段），不做本地替换 → 文本中仅 API 变占位符
    expect(requestedText).toBe("[[1]] only");
    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    expect(inner.textContent).toBe("接口 only");
  });
});
