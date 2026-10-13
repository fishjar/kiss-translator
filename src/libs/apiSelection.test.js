import {
  getEnabledApis,
  normalizeRuleApi,
  resolveApiSelection,
} from "./apiSelection";

describe("translation service selection", () => {
  const apis = [
    { apiSlug: "disabled", isDisabled: true, sortOrder: -1 },
    { apiSlug: "later", sortOrder: 2 },
    { apiSlug: "first", sortOrder: 0 },
    { apiSlug: "tied", sortOrder: 0 },
  ];

  test("uses the popup display order and keeps ties stable without mutation", () => {
    expect(getEnabledApis(apis).map((api) => api.apiSlug)).toEqual([
      "first",
      "tied",
      "later",
    ]);
    expect(apis.map((api) => api.apiSlug)).toEqual([
      "disabled",
      "later",
      "first",
      "tied",
    ]);
  });

  test("keeps an enabled selection even when it is not first", () => {
    expect(resolveApiSelection(apis, "later")).toBe(apis[1]);
  });

  test.each(["disabled", "removed", undefined])(
    "falls back to the first enabled service for %s",
    (apiSlug) => {
      expect(resolveApiSelection(apis, apiSlug)).toBe(apis[2]);
    }
  );

  test("uses zero for omitted sort order and honors a pinned service", () => {
    expect(
      getEnabledApis([
        { apiSlug: "unweighted" },
        { apiSlug: "pinned", sortOrder: -1 },
        { apiSlug: "zero", sortOrder: 0 },
      ]).map((api) => api.apiSlug)
    ).toEqual(["pinned", "unweighted", "zero"]);
  });

  test.each([[[]], [[{ apiSlug: "disabled", isDisabled: true }]]])(
    "has no implicit default when all services are unavailable",
    (transApis) => {
      expect(resolveApiSelection(transApis, "disabled")).toBeUndefined();
    }
  );

  test("normalizes an effective rule without changing the saved preference", () => {
    const rule = { apiSlug: "disabled", toLang: "zh-CN" };
    expect(normalizeRuleApi(rule, apis)).toEqual({
      apiSlug: "first",
      toLang: "zh-CN",
    });
    expect(rule.apiSlug).toBe("disabled");
    expect(normalizeRuleApi(rule, [])).toBe(rule);
  });
});
