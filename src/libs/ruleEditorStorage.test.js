import { writeSiteRule } from "./ruleEditorStorage";
import {
  checkRules,
  matchRule,
  mergeSelectors,
  hostnamePattern,
  matchesRulePattern,
  resolveRuleContext,
} from "./rules";
import {
  getRulesWithDefault,
  getSettingWithDefault,
  saveEdit,
  withTransaction,
} from "./storage";
import { STOKEY_SETTING } from "../config";
import { loadOrFetchSubRules } from "./subRules";

jest.mock("./storage", () => ({
  getRulesWithDefault: jest.fn(),
  getSettingWithDefault: jest.fn(),
  saveEdit: jest.fn(),
  withTransaction: jest.fn(),
  normalizeStoredSetting: (setting) => setting || {},
  getDisabledSubRules: jest.fn(),
}));
jest.mock("./subRules", () => ({ loadOrFetchSubRules: jest.fn() }));
jest.mock("./sync", () => ({ trySyncRules: jest.fn() }));
jest.mock("./msg", () => ({ sendBgMsg: jest.fn() }));

let rules;
const href = "https://news.example.com/story";
beforeEach(() => {
  jest.clearAllMocks();
  rules = [
    {
      pattern: "example.com",
      selector: ".old",
      apiSlug: "custom",
      fromLang: "en",
    },
  ];
  getRulesWithDefault.mockImplementation(async () => structuredCopy(rules));
  getSettingWithDefault.mockResolvedValue({ injectRules: false });
  saveEdit.mockImplementation(async (_key, update) => {
    rules = structuredCopy(update(structuredCopy(rules)));
    return {
      value: structuredCopy(rules),
      changed: true,
      updateAt: Date.now(),
    };
  });
  withTransaction.mockImplementation(async (operation) => {
    return operation({
      getObj: async (key) =>
        key === STOKEY_SETTING ? getSettingWithDefault() : null,
      saveEdit,
    });
  });
});
const structuredCopy = (value) => JSON.parse(JSON.stringify(value));

test("merges nested commas, quoted commas, escaped commas and legacy patches", () => {
  expect(mergeSelectors("p", "+:is(.a, .b), +:is(.a, .c)")).toBe(
    "p, :is(.a, .b), :is(.a, .c)"
  );
  expect(
    mergeSelectors("p, .old", '- .old, +[data-label="A,B"], +.a\\,b')
  ).toBe('p, [data-label="A,B"], .a\\,b');
  expect(mergeSelectors("p", "")).toBe("p");
  expect(mergeSelectors("p", ":not(*)")).toBe(":not(*)");
});

test("strict host patterns survive import and never match subdomains or query parameters", async () => {
  const pattern = hostnamePattern(href);
  for (const url of [
    "https://notnews.example.com/",
    "https://child.news.example.com/",
    "https://other.test/?next=news.example.com",
  ]) {
    expect(matchesRulePattern(url, pattern)).toBe(false);
  }
  expect(matchesRulePattern("http://news.example.com:8080/", pattern)).toBe(
    true
  );
  rules = checkRules([{ pattern, selector: ".strict" }]);
  expect((await matchRule(href, {})).selector).toBe(".strict");
  await expect(matchRule("file:///test.txt", {})).resolves.toBeTruthy();
});

test("creates a site override preserving the broader personal rule settings", async () => {
  const seed = structuredCopy(rules[0]);
  const result = await writeSiteRule({
    href,
    patch: { selector: ".new" },
    expected: null,
    seed,
  });
  expect(result.effective.selector).toBe(".new");
  expect(result.effective.apiSlug).toBe("custom");
  expect(rules[1]).toEqual(seed);
  expect(rules[0].pattern).toBe("news.example.com");
});

test.each(["news.example.com", "*.example.com", "hostname:news.example.com"])(
  "loads existing personal pattern %s and updates it without creating a duplicate",
  async (pattern) => {
    rules = checkRules([
      { pattern, selector: ".old", apiSlug: "custom", autoScan: "false" },
    ]);
    const loaded = await resolveRuleContext(href, {});
    expect(loaded.site.pattern).toBe(pattern);
    const saved = await writeSiteRule({
      href,
      expected: loaded.site,
      patch: { selector: ".new" },
    });
    expect(rules).toHaveLength(1);
    expect(saved.site).toMatchObject({
      pattern,
      selector: ".new",
      apiSlug: "custom",
      autoScan: "false",
    });
  }
);

test("preserves concurrent edits to unrelated fields and rejects same-field conflicts", async () => {
  const created = await writeSiteRule({
    href,
    patch: { selector: ".new" },
    seed: rules[0],
  });
  const expected = created.site;
  rules[0].apiSlug = "elsewhere";
  await writeSiteRule({ href, patch: { selector: ".next" }, expected });
  expect(rules[0].apiSlug).toBe("elsewhere");
  await expect(
    writeSiteRule({ href, patch: { selector: ".lost" }, expected })
  ).rejects.toThrow("rule-conflict");
  expect(rules[0].selector).toBe(".next");
});

test("serializes simultaneous tabs and rejects creation after a source change", async () => {
  const request = {
    href,
    patch: { selector: ".first" },
    seed: structuredCopy(rules[0]),
  };
  const results = await Promise.allSettled([
    writeSiteRule(request),
    writeSiteRule(request),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  rules = [{ ...request.seed, apiSlug: "changed" }];
  await expect(writeSiteRule(request)).rejects.toThrow("rule-conflict");
});

test("reports storage failures and allows a retry", async () => {
  const request = { href, patch: { selector: ".new" }, seed: rules[0] };
  saveEdit.mockRejectedValueOnce(new Error("disk full"));
  await expect(writeSiteRule(request)).rejects.toThrow("disk full");
  await expect(writeSiteRule(request)).resolves.toBeTruthy();
});

test("checks expected fields after acquiring the shared storage transaction", async () => {
  const expected = structuredCopy(rules[0]);
  const transaction = withTransaction.getMockImplementation();
  withTransaction.mockImplementationOnce(async (operation) => {
    rules[0] = { ...rules[0], selector: ".concurrent" };
    return transaction(operation);
  });
  await expect(
    writeSiteRule({
      href,
      expected,
      patch: { selector: ".stale" },
    })
  ).rejects.toThrow("rule-conflict");
  expect(rules[0].selector).toBe(".concurrent");
  expect(require("./sync").trySyncRules).not.toHaveBeenCalled();
});

test("prepares a changed subscription source outside the next transaction", async () => {
  const firstSource = "https://rules.example/first";
  const secondSource = "https://rules.example/second";
  getSettingWithDefault.mockResolvedValue({
    injectRules: true,
    subrulesList: [{ url: firstSource, selected: true }],
  });
  loadOrFetchSubRules.mockResolvedValue([]);
  const transaction = withTransaction.getMockImplementation();
  withTransaction.mockImplementationOnce(async (operation) => {
    getSettingWithDefault.mockResolvedValue({
      injectRules: true,
      subrulesList: [{ url: secondSource, selected: true }],
    });
    return transaction(operation);
  });
  await writeSiteRule({
    href,
    expected: structuredCopy(rules[0]),
    patch: { selector: ".new" },
  });
  expect(loadOrFetchSubRules.mock.calls).toEqual([
    [firstSource],
    [secondSource],
  ]);
  expect(withTransaction).toHaveBeenCalledTimes(2);
  expect(saveEdit).toHaveBeenCalledTimes(1);
  expect(loadOrFetchSubRules.mock.invocationCallOrder[1]).toBeGreaterThan(
    withTransaction.mock.invocationCallOrder[0]
  );
  expect(loadOrFetchSubRules.mock.invocationCallOrder[1]).toBeLessThan(
    withTransaction.mock.invocationCallOrder[1]
  );
});

test("persists the edit timestamp before starting cloud synchronization", async () => {
  const { trySyncRules } = require("./sync");
  await writeSiteRule({
    href,
    patch: { selector: ".new" },
    seed: rules[0],
  });
  expect(saveEdit).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Function),
    "kiss-rules_v2.json",
    { timestamp: expect.any(Number) }
  );
  expect(trySyncRules).toHaveBeenCalled();
  expect(saveEdit.mock.invocationCallOrder[0]).toBeLessThan(
    trySyncRules.mock.invocationCallOrder[0]
  );
});

test("renames a saved domain rule in place, retains other fields and continues editing", async () => {
  const seed = structuredCopy(rules[0]);
  const created = await writeSiteRule({
    href,
    seed,
    patch: { selector: ".new" },
  });
  // This URL pattern deliberately excludes the page currently open in the editor.
  const pattern = "https://news.example.com/other/*";
  const renamed = await writeSiteRule({
    href,
    expected: created.site,
    patch: { pattern },
  });
  expect(rules).toHaveLength(2);
  expect(rules[1]).toEqual(seed);
  expect(renamed.site).toMatchObject({
    pattern,
    selector: ".new",
    apiSlug: "custom",
  });
  expect(renamed.effective.selector).toBe(".new");
  expect(renamed.pageEffective.selector).toBe(".old");
  expect((await matchRule(href, {})).selector).toBe(".old");
  const reloaded = await resolveRuleContext(href, {}, pattern);
  expect(reloaded.site).toEqual(renamed.site);
  expect(reloaded.effective.selector).toBe(".new");
  const updated = await writeSiteRule({
    href,
    expected: renamed.site,
    patch: { selector: ".next" },
  });
  expect(updated.site).toMatchObject({ pattern, selector: ".next" });
  const undone = await writeSiteRule({
    href,
    expected: updated.site,
    patch: { pattern: created.site.pattern },
  });
  expect(undone.site.pattern).toBe("news.example.com");
  expect(undone.pageEffective).toBeNull();
  expect((await matchRule(href, {})).selector).toBe(".next");
});

test("creates the first override using the edited pattern and preserves the source", async () => {
  const seed = structuredCopy(rules[0]);
  const result = await writeSiteRule({
    href,
    seed,
    patch: { pattern: " https://news.example.com/* " },
  });
  expect(result.site.pattern).toBe("https://news.example.com/*");
  expect(result.effective.apiSlug).toBe("custom");
  expect(rules[1]).toEqual(seed);
});

test("rejects invalid and duplicate patterns without changing either existing rule", async () => {
  const created = await writeSiteRule({
    href,
    seed: rules[0],
    patch: { selector: ".new" },
  });
  const snapshot = structuredCopy(rules);
  for (const pattern of ["", " ", "*", "example.com"]) {
    await expect(
      writeSiteRule({ href, expected: created.site, patch: { pattern } })
    ).rejects.toThrow(
      pattern === "example.com" ? "duplicate-pattern" : "invalid-pattern"
    );
    expect(rules).toEqual(snapshot);
  }
});

test("rejects stale edits after another editor has renamed the rule", async () => {
  const created = await writeSiteRule({
    href,
    seed: rules[0],
    patch: { selector: ".new" },
  });
  await writeSiteRule({
    href,
    expected: created.site,
    patch: { pattern: "https://news.example.com/story*" },
  });
  await expect(
    writeSiteRule({
      href,
      expected: created.site,
      patch: { selector: ".lost" },
    })
  ).rejects.toThrow("rule-conflict");
  expect(rules[0].selector).toBe(".new");
});

test.each(["priority", "rename", "delete"])(
  "reloads the active personal rule after an external %s and permits saving",
  async (change) => {
    const created = await writeSiteRule({
      href,
      seed: rules[0],
      patch: { selector: ".new" },
    });
    if (change === "priority") rules = [rules[1], rules[0]];
    else if (change === "rename")
      rules[0].pattern = "https://news.example.com/*";
    else rules.shift();
    const snapshot = structuredCopy(rules);

    await expect(
      writeSiteRule({
        href,
        expected: created.site,
        patch: { selector: ".stale" },
      })
    ).rejects.toThrow("rule-conflict");
    expect(rules).toEqual(snapshot);

    const reloaded = await resolveRuleContext(href, {}, created.site.pattern);
    expect(reloaded.site).toEqual(snapshot[0]);
    expect(reloaded.effective.selector).toBe(snapshot[0].selector);
    expect(reloaded.pageEffective).toBeNull();
    expect(rules).toEqual(snapshot);

    const saved = await writeSiteRule({
      href,
      expected: reloaded.site,
      seed: reloaded.personal,
      inherited: reloaded.inherited,
      patch: { selector: ".after-reload" },
    });
    expect(saved.site.pattern).toBe(snapshot[0].pattern);
    expect(saved.effective.selector).toBe(".after-reload");
    expect(rules.slice(1)).toEqual(snapshot.slice(1));
  }
);
