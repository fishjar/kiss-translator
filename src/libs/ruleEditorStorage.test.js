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
  setRules,
} from "./storage";

jest.mock("./storage", () => ({
  getRulesWithDefault: jest.fn(),
  getSettingWithDefault: jest.fn(),
  setRules: jest.fn(),
  putSyncMeta: jest.fn(),
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
  setRules.mockImplementation(async (next) => {
    rules = structuredCopy(next);
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
  setRules.mockRejectedValueOnce(new Error("disk full"));
  await expect(writeSiteRule(request)).rejects.toThrow("disk full");
  await expect(writeSiteRule(request)).resolves.toBeTruthy();
});

test("persists the edit timestamp before starting cloud synchronization", async () => {
  const { putSyncMeta } = require("./storage");
  const { trySyncRules } = require("./sync");
  await writeSiteRule({
    href,
    patch: { selector: ".new" },
    seed: rules[0],
  });
  expect(putSyncMeta).toHaveBeenCalledWith("kiss-rules_v2.json");
  expect(trySyncRules).toHaveBeenCalled();
  expect(putSyncMeta.mock.invocationCallOrder[0]).toBeLessThan(
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
