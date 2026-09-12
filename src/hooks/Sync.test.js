/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SYNC, STOKEY_SYNC } from "../config";
import { getSync, putSync, putSyncMeta, storage } from "../libs/storage";
import { trySyncAllSubRules } from "../libs/subRules";
import { apiFetch } from "../apis";
import { useSyncCaches } from "./Sync";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../apis", () => ({ apiFetch: jest.fn() }));
jest.mock("../libs/client", () => ({ isExt: false, isGm: false }));
jest.mock("../libs/browser", () => ({ isOptions: () => false }));
jest.mock("../libs/gm", () => ({ getGmMethod: jest.fn() }));
jest.mock("../libs/sync", () => ({ syncData: jest.fn() }));

describe("subscription cache persistence", () => {
  let root;
  let container;
  let cache;

  function Probe() {
    cache = useSyncCaches();
    return <output>{JSON.stringify(cache.dataCaches)}</output>;
  }

  beforeEach(async () => {
    localStorage.clear();
    apiFetch.mockReset();
    await storage.setObj(STOKEY_SYNC, {
      ...DEFAULT_SYNC,
      syncUser: "initial-user",
      dataCaches: { existing: 123 },
      syncMeta: { rules: { updateAt: 101, syncAt: 100 } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  test("preserves metadata and settings updated after the cache view mounts", async () => {
    await putSyncMeta("rules");
    await putSync({ syncUser: "updated-user", customField: "keep" });
    const expected = await getSync();

    await act(async () => cache.updateDataCache("new-source"));
    let saved = await getSync();
    expect(saved.syncMeta).toEqual(expected.syncMeta);
    expect(saved.syncUser).toBe("updated-user");
    expect(saved.customField).toBe("keep");
    expect(saved.dataCaches).toEqual({
      existing: 123,
      "new-source": expect.any(Number),
    });
    expect(JSON.parse(container.textContent)).toEqual(saved.dataCaches);

    await act(async () => cache.deleteDataCache("existing"));
    saved = await getSync();
    expect(saved.syncMeta).toEqual(expected.syncMeta);
    expect(saved.syncUser).toBe("updated-user");
    expect(saved.dataCaches.existing).toBeUndefined();
    expect(saved.dataCaches["new-source"]).toEqual(expect.any(Number));
  });

  test("initializes missing sync defaults before the first subscription update", async () => {
    act(() => root.render(null));
    await storage.del(STOKEY_SYNC);
    await act(async () => root.render(<Probe />));
    expect((await getSync()).subRulesSyncAt).toBe(0);

    await act(async () => cache.updateDataCache("first-source"));
    expect((await getSync()).subRulesSyncAt).toBe(0);
    apiFetch.mockResolvedValueOnce([{ pattern: "fresh.example" }]);
    await trySyncAllSubRules({ subrulesList: [{ url: "first-source" }] });
    expect(apiFetch).toHaveBeenCalledWith("first-source");
    expect((await getSync()).subRulesSyncAt).toBeGreaterThan(0);
  });

  test("keeps queued updates and deletion ordered across view remounts", async () => {
    let pending;
    act(() => {
      pending = Promise.all([
        cache.updateDataCache("removed"),
        cache.updateDataCache("retained"),
        cache.deleteDataCache("removed"),
      ]);
      root.render(null);
    });
    await act(async () => {
      root.render(<Probe />);
      await pending;
    });

    const expected = { existing: 123, retained: expect.any(Number) };
    expect((await getSync()).dataCaches).toEqual(expected);
    expect(JSON.parse(container.textContent)).toEqual(expected);
  });

  test("continues the cache queue after a storage write fails", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    setItem.mockImplementationOnce(() => {
      throw new Error("write failed");
    });
    try {
      await act(async () => {
        const failed = cache.updateDataCache("failed");
        const rejection = expect(failed).rejects.toThrow("write failed");
        const next = cache.updateDataCache("next");
        await Promise.all([rejection, next]);
      });
      expect((await getSync()).dataCaches).toEqual({
        existing: 123,
        next: expect.any(Number),
      });
    } finally {
      setItem.mockRestore();
    }
  });
});
