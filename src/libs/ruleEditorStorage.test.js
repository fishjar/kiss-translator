import { writeSiteRule } from "./ruleEditorStorage";
import {
  checkRules,
  matchRule,
  mergeSelectors,
  hostnamePattern,
  matchesRulePattern,
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
  debounceSyncMeta: jest.fn(),
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
  expect(rules[0].pattern).toBe("hostname:news.example.com");
});

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
