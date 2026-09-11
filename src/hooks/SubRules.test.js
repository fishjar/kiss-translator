/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSubRules } from "./SubRules";
import { loadOrFetchSubRules } from "../libs/subRules";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockSetting;
const mockUpdateSetting = jest.fn();

jest.mock("../config", () => ({
  DEFAULT_SUBRULES_LIST: [],
}));

jest.mock("./Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: mockUpdateSetting,
  }),
}));

jest.mock("../libs/subRules", () => ({
  loadOrFetchSubRules: jest.fn(),
}));

jest.mock("../libs/log", () => ({ kissLog: jest.fn() }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSubRules", () => {
  let container;
  let root;
  let latest;

  function Probe() {
    latest = useSubRules();
    return (
      <output data-loading={latest.loading} data-url={latest.selectedUrl}>
        {latest.selectedRules.map((rule) => rule.pattern).join(",")}
      </output>
    );
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSetting = {
      subrulesList: [
        { url: "source-a", selected: true },
        { url: "source-b", selected: false },
      ],
    };
    mockUpdateSetting.mockReset();
    loadOrFetchSubRules.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("keeps rules bound to the newest selected source", async () => {
    const sourceA = deferred();
    const sourceB = deferred();
    loadOrFetchSubRules.mockImplementation((url) =>
      url === "source-a" ? sourceA.promise : sourceB.promise
    );

    act(() => root.render(<Probe />));
    expect(latest.selectedUrl).toBe("source-a");
    expect(latest.loading).toBe(true);

    mockSetting = {
      subrulesList: [
        { url: "source-a", selected: false },
        { url: "source-b", selected: true },
      ],
    };
    act(() => root.render(<Probe />));
    expect(latest.selectedUrl).toBe("source-b");
    expect(latest.selectedRules).toEqual([]);
    expect(latest.loading).toBe(true);

    await act(async () => {
      sourceB.resolve([{ pattern: "b.example" }]);
      await sourceB.promise;
    });
    expect(latest.selectedRules).toEqual([{ pattern: "b.example" }]);
    expect(latest.loading).toBe(false);

    await act(async () => {
      sourceA.resolve([{ pattern: "stale-a.example" }]);
      await sourceA.promise;
    });
    expect(latest.selectedUrl).toBe("source-b");
    expect(latest.selectedRules).toEqual([{ pattern: "b.example" }]);
    expect(latest.loading).toBe(false);

    expect(
      latest.setSelectedRulesForUrl("source-a", [
        { pattern: "manual-stale.example" },
      ])
    ).toBe(false);
    expect(latest.selectedRules).toEqual([{ pattern: "b.example" }]);
  });

  test("settles the current source as empty when loading fails", async () => {
    const source = deferred();
    loadOrFetchSubRules.mockReturnValue(source.promise);

    act(() => root.render(<Probe />));
    expect(latest.loading).toBe(true);

    await act(async () => {
      source.reject(new Error("offline"));
      try {
        await source.promise;
      } catch (error) {
        // The hook converts the current request failure into an empty result.
      }
    });

    expect(latest.selectedUrl).toBe("source-a");
    expect(latest.selectedRules).toEqual([]);
    expect(latest.loading).toBe(false);
  });

  test.each(["succeeds", "fails"])(
    "keeps a manual refresh when an older initial load %s",
    async (result) => {
      const source = deferred();
      loadOrFetchSubRules.mockReturnValue(source.promise);
      act(() => root.render(<Probe />));
      expect(latest.loading).toBe(true);

      act(() => {
        expect(
          latest.setSelectedRulesForUrl("source-a", [
            { pattern: "fresh.example" },
          ])
        ).toBe(true);
      });
      expect(latest.selectedRules).toEqual([{ pattern: "fresh.example" }]);
      expect(latest.loading).toBe(false);

      await act(async () => {
        if (result === "succeeds") {
          source.resolve([{ pattern: "stale.example" }]);
        } else {
          source.reject(new Error("offline"));
        }
        await source.promise.catch(() => {});
      });
      expect(latest.selectedRules).toEqual([{ pattern: "fresh.example" }]);
      expect(latest.loading).toBe(false);
    }
  );

  test("keeps the current load pending after refreshing a different source", async () => {
    const source = deferred();
    loadOrFetchSubRules.mockReturnValue(source.promise);
    act(() => root.render(<Probe />));

    act(() => {
      expect(
        latest.setSelectedRulesForUrl("source-b", [
          { pattern: "other.example" },
        ])
      ).toBe(false);
    });
    expect(latest.selectedRules).toEqual([]);
    expect(latest.loading).toBe(true);

    await act(async () => {
      source.resolve([{ pattern: "current.example" }]);
      await source.promise;
    });
    expect(latest.selectedRules).toEqual([{ pattern: "current.example" }]);
    expect(latest.loading).toBe(false);
  });
});
