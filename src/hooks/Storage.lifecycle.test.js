import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useStorage } from "./Storage";
import { cloneStorageValue, isSameStorageValue } from "../libs/storageEquality";
import { storage } from "../libs/storage";
import { refreshStorageKeys } from "../libs/storageRefresh";
import { syncData } from "../libs/sync";
import { kissLog } from "../libs/log";
import { publishStorageWrite } from "../libs/storageEvents";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/storage", () => ({
  storage: {
    getObj: jest.fn(),
    setObj: jest.fn(),
    saveEdit: jest.fn(),
    withTransaction: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("../libs/gm", () => ({ getGmMethod: jest.fn() }));

jest.mock("../libs/sync", () => ({ syncData: jest.fn() }));
jest.mock("../libs/browser", () => ({ isOptions: () => false }));
jest.mock("../libs/log", () => ({
  ...jest.requireActual("../libs/log"),
  kissLog: jest.fn(),
}));

const DEFAULT_VALUE = { count: 0 };
const hosts = new Set();
let keySequence = 0;
let storageKey;
let persisted;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHost({ strict = false } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = {};
  let mounted = true;

  function TestComponent() {
    Object.assign(result, useStorage(storageKey, DEFAULT_VALUE));
    return null;
  }

  const host = {
    result,
    render() {
      act(() => {
        root.render(
          strict ? (
            <StrictMode>
              <TestComponent />
            </StrictMode>
          ) : (
            <TestComponent />
          )
        );
      });
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      act(() => root.unmount());
      container.remove();
      hosts.delete(host);
    },
  };
  hosts.add(host);
  return host;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mountHost(options) {
  const host = createHost(options);
  host.render();
  await flushEffects();
  expect(host.result.isLoading).toBe(false);
  return host;
}

describe("useStorage shared state lifecycle", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    storageKey = `storage-lifecycle-${++keySequence}`;
    persisted = new Map([[storageKey, { count: 4, retained: true }]]);
    storage.getObj.mockImplementation(async (key) => persisted.get(key));
    storage.withTransaction.mockImplementation((operation) =>
      operation(storage)
    );
    storage.setObj.mockImplementation(async (key, value) => {
      persisted.set(key, value);
    });
    storage.saveEdit.mockImplementation(
      (key, valueOrFn, _syncKey, options = {}) =>
        storage.withTransaction(async (transaction) => {
          const previous = cloneStorageValue(
            (await transaction.getObj(key)) ?? options.defaultValue
          );
          const value = cloneStorageValue(
            typeof valueOrFn === "function" ? valueOrFn(previous) : valueOrFn
          );
          const changed = !isSameStorageValue(previous, value);
          if (changed) await transaction.setObj(key, value);
          return { value, changed, updateAt: changed ? options.timestamp : 0 };
        })
    );
    storage.del.mockImplementation(async (key) => {
      persisted.delete(key);
    });
    syncData.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const host of hosts) host.unmount();
  });

  test.each([false, true])(
    "submits each queued edit once against current storage in order (StrictMode: %s)",
    async (strict) => {
      const initialRead = deferred();
      storage.getObj.mockReturnValueOnce(initialRead.promise);
      const host = createHost({ strict });
      host.render();
      await flushEffects();
      const first = jest.fn((previous) => ({
        ...previous,
        count: previous.count + 1,
      }));
      const second = jest.fn((previous) => ({ count: previous.count * 2 }));
      const third = jest.fn((previous) => ({
        ...previous,
        count: previous.count + 3,
      }));
      let saves;

      act(() => {
        saves = [
          host.result.save(first),
          host.result.update(second),
          host.result.save(third),
        ];
      });
      expect(host.result.isLoading).toBe(true);
      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
      expect(third).not.toHaveBeenCalled();
      expect(storage.setObj).not.toHaveBeenCalled();

      await act(async () => {
        initialRead.resolve({ count: 4, retained: true });
        await Promise.all(saves);
      });

      expect(first).toHaveBeenCalledWith({ count: 4, retained: true });
      expect(second).toHaveBeenCalledWith({ count: 5, retained: true });
      expect(third).toHaveBeenCalledWith({ count: 10, retained: true });
      expect(storage.saveEdit).toHaveBeenCalledTimes(3);
      expect(storage.setObj.mock.calls).toEqual([
        [storageKey, { count: 5, retained: true }],
        [storageKey, { count: 10, retained: true }],
        [storageKey, { count: 13, retained: true }],
      ]);
      expect(host.result.data).toEqual({ count: 13, retained: true });
      expect(host.result.isLoading).toBe(false);
      expect(persisted.get(storageKey)).toEqual({ count: 13, retained: true });
      expect(syncData).not.toHaveBeenCalled();
    }
  );

  test("hydrates and persists a queued StrictMode edit after its owner unmounts", async () => {
    const initialRead = deferred();
    storage.getObj.mockReturnValueOnce(initialRead.promise);
    const host = createHost({ strict: true });
    host.render();
    await flushEffects();
    const updater = jest.fn((previous) => ({
      ...previous,
      count: previous.count + 1,
    }));
    let save;

    act(() => {
      save = host.result.save(updater);
    });
    host.unmount();
    expect(updater).not.toHaveBeenCalled();
    expect(storage.setObj).not.toHaveBeenCalled();

    await act(async () => {
      persisted.set(storageKey, { count: 8, retained: true });
      initialRead.resolve({ count: 8, retained: true });
      await save;
    });

    expect(updater).toHaveBeenCalledWith({ count: 8, retained: true });
    expect(storage.saveEdit).toHaveBeenCalledTimes(1);
    expect(storage.setObj).toHaveBeenCalledTimes(1);
    expect(persisted.get(storageKey)).toEqual({ count: 9, retained: true });
    expect(syncData).not.toHaveBeenCalled();
  });

  test("shares optimistic values and serializes slow writes after one owner unmounts", async () => {
    persisted.set(storageKey, { trace: [], retained: true });
    const first = await mountHost();
    const second = await mountHost();
    expect(storage.getObj).toHaveBeenCalledTimes(1);
    const gates = {
      A1: deferred(),
      A2: deferred(),
      B1: deferred(),
    };
    const completed = [];
    storage.setObj.mockImplementation(async (key, value) => {
      const label = value.trace[value.trace.length - 1];
      if (gates[label]) await gates[label].promise;
      persisted.set(key, value);
      completed.push(label);
    });
    const append = (label) => (previous) => ({
      ...previous,
      trace: [...previous.trace, label],
    });
    const secondUpdater = jest.fn(append("B1"));
    let firstSave;
    let secondSave;
    let thirdSave;

    act(() => {
      firstSave = first.result.save(append("A1"));
      secondSave = first.result.save(append("A2"));
      thirdSave = second.result.save(secondUpdater);
    });
    await flushEffects();
    const thirdValue = { trace: ["A1", "A2", "B1"], retained: true };
    expect(secondUpdater).toHaveBeenCalledWith({
      trace: ["A1", "A2"],
      retained: true,
    });
    expect(first.result.data).toEqual(thirdValue);
    expect(second.result.data).toEqual(thirdValue);
    expect(storage.setObj).toHaveBeenCalledTimes(1);
    first.unmount();

    await act(async () => {
      gates.A1.resolve();
      await firstSave;
    });
    expect(completed).toEqual(["A1"]);
    expect(storage.setObj).toHaveBeenCalledTimes(2);
    expect(second.result.data).toEqual(thirdValue);

    await act(async () => {
      gates.A2.resolve();
      await secondSave;
    });
    expect(completed).toEqual(["A1", "A2"]);
    expect(storage.setObj).toHaveBeenCalledTimes(3);
    expect(second.result.data).toEqual(thirdValue);

    const fourthUpdater = jest.fn(append("B2"));
    let fourthSave;
    act(() => {
      fourthSave = second.result.save(fourthUpdater);
    });
    expect(fourthUpdater).toHaveBeenCalledWith(thirdValue);
    expect(storage.setObj).toHaveBeenCalledTimes(3);

    await act(async () => {
      gates.B1.resolve();
      await Promise.all([thirdSave, fourthSave]);
    });

    const finalValue = { trace: ["A1", "A2", "B1", "B2"], retained: true };
    expect(completed).toEqual(["A1", "A2", "B1", "B2"]);
    expect(storage.setObj.mock.calls.map(([, value]) => value.trace)).toEqual([
      ["A1"],
      ["A1", "A2"],
      ["A1", "A2", "B1"],
      ["A1", "A2", "B1", "B2"],
    ]);
    expect(second.result.data).toEqual(finalValue);
    expect(persisted.get(storageKey)).toEqual(finalValue);
  });

  test("reads external changes after the last idle subscriber unmounts", async () => {
    const first = await mountHost();
    const second = await mountHost();
    await act(async () => {
      await first.result.save({ count: 5, retained: true });
    });
    first.unmount();
    second.unmount();
    persisted.set(storageKey, { external: true });

    const remounted = await mountHost();

    expect(storage.getObj).toHaveBeenCalledTimes(3);
    expect(remounted.result.data).toEqual({ external: true });
    expect(storage.setObj).toHaveBeenCalledTimes(1);
  });

  test("cancels dependent queued edits and reloads after an earlier write fails", async () => {
    const host = await mountHost();
    const failedWrite = deferred();
    const error = new Error("First write failed");
    storage.setObj.mockImplementationOnce(() => failedWrite.promise);
    let firstSave;
    let secondSave;

    act(() => {
      firstSave = host.result.save({ count: 5, retained: true });
      secondSave = host.result.save({ count: 6, retained: true });
    });
    await flushEffects();
    expect(storage.setObj).toHaveBeenCalledTimes(1);
    expect(host.result.data).toEqual({ count: 6, retained: true });

    await act(async () => {
      failedWrite.reject(error);
      const results = await Promise.allSettled([firstSave, secondSave]);
      expect(results[0]).toEqual({ status: "rejected", reason: error });
      expect(results[1].status).toBe("rejected");
      expect(results[1].reason.cause).toBe(error);
    });

    expect(storage.saveEdit).toHaveBeenCalledTimes(1);
    expect(storage.setObj).toHaveBeenCalledTimes(1);
    expect(persisted.get(storageKey)).toEqual({ count: 4, retained: true });
    expect(host.result.data).toEqual({ count: 4, retained: true });
    expect(kissLog).toHaveBeenCalledWith(
      "Storage save failed",
      storageKey,
      error
    );
  });

  test("allows an explicit save after failure reconciliation without replaying the failed edit", async () => {
    const host = await mountHost();
    const error = new Error("Write failed");
    storage.setObj.mockRejectedValueOnce(error);

    await act(async () => {
      await expect(host.result.save({ count: 5, retained: true })).rejects.toBe(
        error
      );
    });
    expect(host.result.data).toEqual({ count: 4, retained: true });
    expect(persisted.get(storageKey)).toEqual({ count: 4, retained: true });

    await act(async () => {
      await host.result.save({ count: 5, retained: true });
    });
    expect(storage.setObj).toHaveBeenCalledTimes(2);
    expect(persisted.get(storageKey)).toEqual({ count: 5, retained: true });

    await act(async () => {
      await host.result.save({ count: 5, retained: true });
    });
    expect(storage.setObj).toHaveBeenCalledTimes(2);
  });

  test("reconciles a committed write with a lost reply without replaying its toggle", async () => {
    persisted.set(storageKey, { enabled: false, retained: true });
    const host = await mountHost();
    const reply = deferred();
    const error = new Error("Commit reply lost");
    error.storageOutcome = "unknown";
    storage.setObj.mockImplementationOnce(async (key, value) => {
      persisted.set(key, value);
      await reply.promise;
    });
    let toggleSave;
    let dependentSave;

    act(() => {
      toggleSave = host.result.save((previous) => ({
        ...previous,
        enabled: !previous.enabled,
      }));
      dependentSave = host.result.update({ dependent: true });
    });
    await flushEffects();
    expect(persisted.get(storageKey)).toEqual({
      enabled: true,
      retained: true,
    });
    expect(host.result.data).toEqual({
      enabled: true,
      retained: true,
      dependent: true,
    });

    await act(async () => {
      reply.reject(error);
      const results = await Promise.allSettled([toggleSave, dependentSave]);
      expect(results[0]).toEqual({ status: "rejected", reason: error });
      expect(results[1].status).toBe("rejected");
    });

    expect(storage.saveEdit).toHaveBeenCalledTimes(1);
    expect(storage.setObj).toHaveBeenCalledTimes(1);
    expect(persisted.get(storageKey)).toEqual({
      enabled: true,
      retained: true,
    });
    expect(host.result.data).toEqual({ enabled: true, retained: true });
    expect(host.result.isRecovering).toBe(false);
    expect(host.result.error).toBe(error);
  });

  test("ignores a refresh read rejection after the last subscriber unmounts", async () => {
    const host = await mountHost();
    const staleRead = deferred();
    storage.getObj.mockReturnValueOnce(staleRead.promise);
    const refresh = refreshStorageKeys([storageKey]);
    await flushEffects();
    expect(storage.getObj).toHaveBeenCalledTimes(2);
    host.unmount();

    await act(async () => {
      staleRead.reject(new Error("Unmounted read failed"));
      await expect(refresh).resolves.toBeUndefined();
    });

    expect(kissLog).not.toHaveBeenCalled();
  });

  test("ignores an older refresh rejection after a newer read succeeds", async () => {
    const host = await mountHost();
    const staleRead = deferred();
    storage.getObj.mockReturnValueOnce(staleRead.promise);
    const staleRefresh = refreshStorageKeys([storageKey]);
    await flushEffects();
    persisted.set(storageKey, { latest: true });

    await act(async () => {
      const latestRefresh = refreshStorageKeys([storageKey]);
      staleRead.reject(new Error("Superseded read failed"));
      const results = await Promise.allSettled([staleRefresh, latestRefresh]);
      expect(results).toEqual([
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
      ]);
    });

    expect(host.result.data).toEqual({ latest: true });
    expect(storage.getObj).toHaveBeenCalledTimes(3);
    expect(kissLog).not.toHaveBeenCalled();
  });

  test("ignores a refresh rejection after a newer user edit", async () => {
    const host = await mountHost();
    const staleRead = deferred();
    storage.getObj.mockReturnValueOnce(staleRead.promise);
    const staleRefresh = refreshStorageKeys([storageKey]);
    await flushEffects();

    await act(async () => {
      const save = host.result.save({ edited: true });
      staleRead.reject(new Error("Outdated read failed"));
      const results = await Promise.allSettled([staleRefresh, save]);
      expect(results[0]).toEqual({ status: "fulfilled", value: undefined });
      expect(results[1].status).toBe("fulfilled");
    });

    expect(host.result.data).toEqual({ edited: true });
    expect(persisted.get(storageKey)).toEqual({ edited: true });
    expect(kissLog).not.toHaveBeenCalled();
  });

  test("rejects a current refresh read failure and preserves displayed data", async () => {
    const host = await mountHost();
    const error = new Error("Current read failed");
    storage.getObj.mockRejectedValueOnce(error);

    await act(async () => {
      await expect(refreshStorageKeys([storageKey])).rejects.toBe(error);
    });

    expect(host.result.data).toEqual({ count: 4, retained: true });
    expect(host.result.isLoading).toBe(false);
    expect(storage.setObj).not.toHaveBeenCalled();
  });

  test("an equal-value external write still invalidates an older captured read", async () => {
    const oldRead = deferred();
    storage.getObj.mockReturnValueOnce(oldRead.promise);
    const host = createHost();
    host.render();
    await flushEffects();
    await act(async () => {
      persisted.set(storageKey, DEFAULT_VALUE);
      publishStorageWrite(storageKey, DEFAULT_VALUE);
      oldRead.resolve({ count: 4, retained: true });
    });
    expect(host.result.data).toEqual(DEFAULT_VALUE);
    expect(host.result.isLoading).toBe(false);
    expect(storage.setObj).not.toHaveBeenCalled();
  });
});
