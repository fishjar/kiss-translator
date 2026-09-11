import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
} from "../config";
import {
  API_SORT_MODES,
  compareApisByDisplayName,
  getApiDisplayName,
  getApiSortMode,
  sortApisAlphabetically,
  useApiList,
} from "./Api";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockSetting;
const mockUpdateSetting = jest.fn();

jest.mock("./Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: mockUpdateSetting,
  }),
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

function renderApiList() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const hookResult = {};

  function TestComponent() {
    Object.assign(hookResult, useApiList());
    return null;
  }

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    hookResult,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useApiList", () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeEach(() => {
    mockUpdateSetting.mockReset();
    mockSetting = { transApis: [] };
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: jest.fn() },
    });
  });

  afterEach(() => {
    if (originalCrypto) {
      Object.defineProperty(globalThis, "crypto", originalCrypto);
    } else {
      delete globalThis.crypto;
    }
  });

  test("does not append missing default APIs on mount", () => {
    const microsoft = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_MICROSOFT
    );
    mockSetting = { transApis: [microsoft] };

    const host = renderApiList();

    expect(host.hookResult.transApis).toEqual([microsoft]);
    expect(mockUpdateSetting).not.toHaveBeenCalled();
    host.unmount();
  });

  test("normalizes a missing model list URL without writing settings", () => {
    const openAi = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_OPENAI
    );
    const { modelListUrl, ...legacyOpenAi } = openAi;
    mockSetting = { transApis: [legacyOpenAi] };

    const host = renderApiList();

    expect(host.hookResult.transApis[0]).toEqual({
      ...legacyOpenAi,
      modelListUrl,
    });
    expect(mockUpdateSetting).not.toHaveBeenCalled();
    host.unmount();
  });

  test("adds an API from the default template only after user action", () => {
    globalThis.crypto.randomUUID
      .mockReturnValueOnce("12345678-1234-1234-1234-123456789abc")
      .mockReturnValueOnce("abcdefab-cdef-cdef-cdef-abcdefabcdef");
    const host = renderApiList();

    act(() => host.hookResult.addApi(OPT_TRANS_OPENAI));

    expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
    const update = mockUpdateSetting.mock.calls[0][0];
    const previous = { keep: true, transApis: [] };
    const next = update(previous);
    const template = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_OPENAI
    );
    expect(next).toEqual({
      ...previous,
      transApis: [
        {
          ...template,
          apiSlug: `${OPT_TRANS_OPENAI}_abcdefab-cdef-cdef-cdef-abcdefabcdef`,
          apiName: `${OPT_TRANS_OPENAI}_12345678`,
          apiType: OPT_TRANS_OPENAI,
        },
      ],
    });
    host.unmount();
  });

  test("deletes a default API without creating deletion markers", () => {
    const microsoft = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_MICROSOFT
    );
    const openAi = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_OPENAI
    );
    mockSetting = { transApis: [microsoft, openAi] };
    const host = renderApiList();

    act(() => host.hookResult.deleteApis([OPT_TRANS_MICROSOFT]));

    expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
    const update = mockUpdateSetting.mock.calls[0][0];
    const previous = { keep: true, transApis: [microsoft, openAi] };
    const next = update(previous);
    expect(next).toEqual({ keep: true, transApis: [openAi] });
    expect(next).not.toHaveProperty("deletedTransApiSlugs");
    host.unmount();
  });
});
