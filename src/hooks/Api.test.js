import {
  API_SORT_MODES,
  compareApisByDisplayName,
  getApiDisplayName,
  getApiSortMode,
  sortApisAlphabetically,
} from "./Api";

jest.mock("./Setting", () => ({
  useSetting: jest.fn(),
}));

function createApi(apiSlug, apiName, sortOrder, overrides = {}) {
  return {
    apiSlug,
    apiName,
    apiType: "OpenAI",
    sortOrder,
    ...overrides,
  };
}

describe("API alphabetical ordering", () => {
  test("uses the same visible fallback name for display and comparison", () => {
    const typeFallback = createApi("type-fallback", "   ", 0, {
      apiType: "Beta",
    });
    const slugFallback = createApi("alpha-slug", "", 1, { apiType: "" });

    expect(getApiDisplayName(typeFallback)).toBe("Beta");
    expect(getApiDisplayName(slugFallback)).toBe("alpha-slug");
    expect(
      compareApisByDisplayName(slugFallback, typeFallback, API_SORT_MODES.ASC)
    ).toBeLessThan(0);
  });

  test("defaults the first alphabetical operation to A-Z", () => {
    const apis = [createApi("zulu", "Zulu", 0), createApi("alpha", "Alpha", 1)];

    const sortedApis = sortApisAlphabetically(apis);

    expect(sortedApis.map((api) => api.apiSlug)).toEqual(["alpha", "zulu"]);
    expect(getApiSortMode(sortedApis)).toBe(API_SORT_MODES.ASC);
  });

  test("sorts only the normal group while preserving pinned and disabled groups", () => {
    const apis = [
      createApi("disabled", "Aaron", 999, { isDisabled: true }),
      createApi("zulu", "Zulu", 1),
      createApi("pinned", "Zed", -1),
      createApi("alpha", "Alpha", 0),
    ];

    const ascendingApis = sortApisAlphabetically(apis, API_SORT_MODES.ASC);
    const descendingApis = sortApisAlphabetically(apis, API_SORT_MODES.DESC);

    expect(ascendingApis.map((api) => api.apiSlug)).toEqual([
      "pinned",
      "alpha",
      "zulu",
      "disabled",
    ]);
    expect(descendingApis.map((api) => api.apiSlug)).toEqual([
      "pinned",
      "zulu",
      "alpha",
      "disabled",
    ]);
  });

  test("uses the slug as a stable tie-breaker for equivalent display names", () => {
    const apis = [
      createApi("beta", "Same name", 0),
      createApi("alpha", "same name", 1),
    ];

    const ascendingApis = sortApisAlphabetically(apis, API_SORT_MODES.ASC);
    const descendingApis = sortApisAlphabetically(apis, API_SORT_MODES.DESC);

    expect(ascendingApis.map((api) => api.apiSlug)).toEqual(["alpha", "beta"]);
    expect(descendingApis.map((api) => api.apiSlug)).toEqual(["beta", "alpha"]);
    expect(getApiSortMode(ascendingApis)).toBe(API_SORT_MODES.ASC);
    expect(getApiSortMode(descendingApis)).toBe(API_SORT_MODES.DESC);
  });
});

describe("getApiSortMode", () => {
  test.each([
    [
      API_SORT_MODES.ASC,
      [createApi("alpha", "Alpha", 0), createApi("beta", "Beta", 1)],
    ],
    [
      API_SORT_MODES.DESC,
      [createApi("beta", "Beta", 0), createApi("alpha", "Alpha", 1)],
    ],
    [
      API_SORT_MODES.CUSTOM,
      [
        createApi("alpha", "Alpha", 0),
        createApi("charlie", "Charlie", 1),
        createApi("beta", "Beta", 2),
      ],
    ],
  ])("derives %s from persisted sortOrder values", (expectedMode, apis) => {
    expect(getApiSortMode(apis)).toBe(expectedMode);
  });

  test("becomes custom after an alphabetically sorted normal list is reordered", () => {
    const alphabeticallySortedApis = sortApisAlphabetically([
      createApi("charlie", "Charlie", 0),
      createApi("alpha", "Alpha", 1),
      createApi("beta", "Beta", 2),
    ]);
    const reorderedApis = [
      { ...alphabeticallySortedApis[1], sortOrder: 0 },
      { ...alphabeticallySortedApis[0], sortOrder: 1 },
      { ...alphabeticallySortedApis[2], sortOrder: 2 },
    ];

    expect(getApiSortMode(alphabeticallySortedApis)).toBe(API_SORT_MODES.ASC);
    expect(getApiSortMode(reorderedApis)).toBe(API_SORT_MODES.CUSTOM);
  });

  test("ignores pinned and disabled groups when deriving the visible mode", () => {
    const apis = [
      createApi("pinned", "Zulu", -1),
      createApi("alpha", "Alpha", 0),
      createApi("beta", "Beta", 1),
      createApi("disabled", "Aaron", 999, { isDisabled: true }),
    ];

    expect(getApiSortMode(apis)).toBe(API_SORT_MODES.ASC);
  });
});
