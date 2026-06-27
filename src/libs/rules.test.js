import { checkRules, matchRule } from "./rules";
import { getDisabledSubRules, getRulesWithDefault } from "./storage";
import { loadOrFetchSubRules } from "./subRules";

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
});

describe("builtin rules for special pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDisabledSubRules.mockResolvedValue([]);
  });

  test("matches Google Docs URL via subscription rules", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "*",
        selector: "p",
        transOpen: "false",
      },
    ]);
    loadOrFetchSubRules.mockResolvedValue([
      {
        pattern: "docs.google.com/document",
        selector: ".kix-page, .kix-lineview, .kix-paragraphrenderer, .kix-wordhtmlgenerator-word-node",
        rootsSelector: ".kix-appview-editor",
        autoScan: "false",
        hasRichText: "true",
      },
    ]);

    const rule = await matchRule(
      "https://docs.google.com/document/d/189AbzVGpxhQczTcdfJd13o_EL36t-M5jOEt1hgBIh7w/edit",
      {
        injectRules: true,
        subrulesList: [
          { url: "https://rules.example/main.json", selected: true },
        ],
      }
    );

    expect(rule.selector).toContain(".kix-page");
    expect(rule.selector).toContain(".kix-lineview");
    expect(rule.rootsSelector).toBe(".kix-appview-editor");
    expect(rule.autoScan).toBe("false");
  });

  test("matches Google Docs URL with tab parameter", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "*",
        selector: "p",
        transOpen: "false",
      },
    ]);
    loadOrFetchSubRules.mockResolvedValue([
      {
        pattern: "docs.google.com/document",
        selector: ".kix-page, .kix-lineview",
        rootsSelector: ".kix-appview-editor",
        autoScan: "false",
      },
    ]);

    const rule = await matchRule(
      "https://docs.google.com/document/d/189AbzVGpxhQczTcdfJd13o_EL36t-M5jOEt1hgBIh7w/edit?pli=1&tab=t.0",
      {
        injectRules: true,
        subrulesList: [
          { url: "https://rules.example/main.json", selected: true },
        ],
      }
    );

    expect(rule.selector).toContain(".kix-page");
    expect(rule.rootsSelector).toBe(".kix-appview-editor");
  });

  test("personal rule overrides builtin Google Docs rule", async () => {
    getRulesWithDefault.mockResolvedValue([
      {
        pattern: "docs.google.com/document",
        selector: ".my-custom-selector",
        rootsSelector: ".my-root",
      },
      {
        pattern: "*",
        selector: "p",
        transOpen: "false",
      },
    ]);
    loadOrFetchSubRules.mockResolvedValue([
      {
        pattern: "docs.google.com/document",
        selector: ".kix-page",
        rootsSelector: ".kix-appview-editor",
      },
    ]);

    const rule = await matchRule(
      "https://docs.google.com/document/d/abc123/edit",
      {
        injectRules: true,
        subrulesList: [
          { url: "https://rules.example/main.json", selected: true },
        ],
      }
    );

    expect(rule.selector).toBe(".my-custom-selector");
    expect(rule.rootsSelector).toBe(".my-root");
  });
});
