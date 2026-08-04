import { checkRules, matchRule, saveRule } from "./rules";
import { getDisabledSubRules, getRulesWithDefault, setRules } from "./storage";
import { loadOrFetchSubRules } from "./subRules";
import { GLOBLA_RULE } from "../config/rules";
import { OPT_TRANS_GOOGLE_2 } from "../config/api";

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

test("uses Google2 as the default webpage translator", () => {
  expect(GLOBLA_RULE.apiSlug).toBe(OPT_TRANS_GOOGLE_2);
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
