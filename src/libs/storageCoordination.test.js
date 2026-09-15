const LOCK_NAME = "kiss-storage-transaction";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushPromises = async () => {
  for (let step = 0; step < 12; step += 1) {
    await Promise.resolve();
  }
};

const createEvent = () => {
  const listeners = new Set();
  return {
    addListener: jest.fn((listener) => listeners.add(listener)),
    removeListener: jest.fn((listener) => listeners.delete(listener)),
    emit: (...args) => [...listeners].forEach((listener) => listener(...args)),
  };
};

const createRuntime = () => {
  const values = {};
  const runtime = {
    onConnect: createEvent(),
    ports: [],
    storage: {
      local: {
        get: jest.fn(async (keys) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((key) => key in values)
              .map((key) => [key, values[key]])
          )
        ),
        set: jest.fn(async (entries) => Object.assign(values, entries)),
        remove: jest.fn(async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete values[key];
        }),
      },
    },
    values,
  };
  runtime.connect = jest.fn(({ name }) => {
    let disconnected = false;
    const front = {
      name,
      onMessage: createEvent(),
      onDisconnect: createEvent(),
    };
    const back = {
      name,
      onMessage: createEvent(),
      onDisconnect: createEvent(),
    };
    const disconnect = jest.fn(() => {
      if (disconnected) return;
      disconnected = true;
      front.onDisconnect.emit(front);
      back.onDisconnect.emit(back);
    });
    front.disconnect = disconnect;
    back.disconnect = disconnect;
    front.postMessage = jest.fn((message) => {
      if (disconnected) throw new Error("Port disconnected");
      Promise.resolve().then(() => {
        if (!disconnected) back.onMessage.emit(message, back);
      });
    });
    back.postMessage = jest.fn((message) => {
      if (disconnected) throw new Error("Port disconnected");
      Promise.resolve().then(() => {
        if (!disconnected) front.onMessage.emit(message, front);
      });
    });
    runtime.ports.push({ front, back });
    Promise.resolve().then(() => runtime.onConnect.emit(back));
    return front;
  });
  return runtime;
};

const loadCoordinator = ({
  runtime,
  background = false,
  extension = true,
  gm = false,
} = {}) => {
  let coordinator;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({ isExt: extension, isGm: gm }));
    jest.doMock("./browser", () => ({
      browser: runtime ? { runtime, storage: runtime.storage } : undefined,
      isBg: () => background,
    }));
    coordinator = require("./storageCoordination");
  });
  return coordinator;
};

describe("storage transaction coordination", () => {
  let originalLocks;

  beforeEach(() => {
    originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    if (originalLocks) {
      Object.defineProperty(navigator, "locks", originalLocks);
    } else {
      delete navigator.locks;
    }
    jest.dontMock("./client");
    jest.dontMock("./browser");
  });

  test("prevents lost updates between independently loaded extension pages", async () => {
    const runtime = createRuntime();
    const background = loadCoordinator({ runtime, background: true });
    background.installStorageCoordinator();
    const firstPage = loadCoordinator({ runtime });
    const secondPage = loadCoordinator({ runtime });
    const firstWrite = deferred();
    let stored = {};
    const first = firstPage.withStorageLock(async () => {
      const snapshot = { ...stored };
      await firstWrite.promise;
      stored = { ...snapshot, settings: 10 };
      return "first";
    });
    const secondOperation = jest.fn(async () => {
      stored = { ...stored, words: 20 };
      return "second";
    });
    const second = secondPage.withStorageLock(secondOperation);

    await flushPromises();
    expect(secondOperation).not.toHaveBeenCalled();
    firstWrite.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(stored).toEqual({ settings: 10, words: 20 });
  });

  test("serializes background writes with requests from extension pages", async () => {
    const runtime = createRuntime();
    const background = loadCoordinator({ runtime, background: true });
    background.installStorageCoordinator();
    const page = loadCoordinator({ runtime });
    const releaseBackground = deferred();
    const backgroundWrite = background.withStorageLock(
      () => releaseBackground.promise
    );
    const pageOperation = jest.fn(() => "page complete");
    const pageWrite = page.withStorageLock(pageOperation);

    await flushPromises();
    expect(pageOperation).not.toHaveBeenCalled();
    releaseBackground.resolve("background complete");
    await expect(backgroundWrite).resolves.toBe("background complete");
    await expect(pageWrite).resolves.toBe("page complete");
  });

  test("releases the lock when an extension operation rejects", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const page = loadCoordinator({ runtime });
    const failure = new Error("Storage write failed");
    const failingWrite = page.withStorageLock(async () => {
      throw failure;
    });
    const nextWrite = page.withStorageLock(() => "recovered");

    await expect(failingWrite).rejects.toBe(failure);
    await expect(nextWrite).resolves.toBe("recovered");
  });

  test("waits for a foreground writer before starting a background write", async () => {
    const runtime = createRuntime();
    const background = loadCoordinator({ runtime, background: true });
    background.installStorageCoordinator();
    const page = loadCoordinator({ runtime });
    const releasePage = deferred();
    const pageWrite = page.withStorageLock(() => releasePage.promise);
    await flushPromises();
    const backgroundOperation = jest.fn(() => "background complete");
    const backgroundWrite = background.withStorageLock(backgroundOperation);

    await flushPromises();
    expect(backgroundOperation).not.toHaveBeenCalled();
    releasePage.resolve();
    await pageWrite;
    await expect(backgroundWrite).resolves.toBe("background complete");
  });

  test("does not write without a coordinator and can reconnect after a failure", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    runtime.connect.mockImplementationOnce(() => {
      throw new Error("Background unavailable");
    });
    const page = loadCoordinator({ runtime });
    const unsafeOperation = jest.fn();

    await expect(page.withStorageLock(unsafeOperation)).rejects.toThrow(
      "Background unavailable"
    );
    expect(unsafeOperation).not.toHaveBeenCalled();
    await expect(page.withStorageLock(() => "reconnected")).resolves.toBe(
      "reconnected"
    );
  });

  test("releases a disconnected owner so another page can make progress", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const disconnectedPage = loadCoordinator({ runtime });
    const activePage = loadCoordinator({ runtime });
    const firstCompletion = deferred();
    const firstWrite = disconnectedPage.withStorageLock(
      () => firstCompletion.promise
    );
    const firstResult = firstWrite.catch(() => undefined);
    await flushPromises();

    const secondWrite = activePage.withStorageLock(() => "continued");
    runtime.ports[0].front.disconnect();

    await expect(secondWrite).resolves.toBe("continued");
    firstCompletion.resolve();
    await firstResult;
  });

  test("does not run a queued operation after its page disconnects", async () => {
    const runtime = createRuntime();
    const background = loadCoordinator({ runtime, background: true });
    background.installStorageCoordinator();
    const releaseBackground = deferred();
    const backgroundWrite = background.withStorageLock(
      () => releaseBackground.promise
    );
    const page = loadCoordinator({ runtime });
    const abandonedOperation = jest.fn();
    const abandonedWrite = page.withStorageLock(abandonedOperation);
    const abandonedResult = abandonedWrite.catch(() => undefined);
    await flushPromises();
    runtime.ports[0].front.disconnect();
    const nextWrite = page.withStorageLock(() => "next page");
    releaseBackground.resolve();

    await backgroundWrite;
    await expect(nextWrite).resolves.toBe("next page");
    await abandonedResult;
    expect(abandonedOperation).not.toHaveBeenCalled();
  });

  test("waits for an active local write to settle after coordinator disconnection", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const page = loadCoordinator({ runtime });
    const firstCompletion = deferred();
    const firstWrite = page.withStorageLock(() => firstCompletion.promise);
    const firstResult = firstWrite.catch(() => undefined);
    await flushPromises();
    runtime.ports[0].front.disconnect();
    const secondOperation = jest.fn(() => "next write");
    const secondWrite = page.withStorageLock(secondOperation);

    await flushPromises();
    try {
      expect(secondOperation).not.toHaveBeenCalled();
    } finally {
      firstCompletion.resolve();
      await firstResult;
      await secondWrite;
    }
    expect(secondOperation).toHaveBeenCalledTimes(1);
  });

  test("installs one background listener and ignores unrelated extension ports", async () => {
    const runtime = createRuntime();
    const background = loadCoordinator({ runtime, background: true });
    background.installStorageCoordinator();
    background.installStorageCoordinator();
    runtime.connect({ name: "translation-stream" });
    await flushPromises();

    expect(runtime.onConnect.addListener).toHaveBeenCalledTimes(1);
    expect(runtime.ports[0].back.onMessage.addListener).not.toHaveBeenCalled();
    await expect(background.withStorageLock(() => "ready")).resolves.toBe(
      "ready"
    );
  });

  test("commits foreground storage entries through the background coordinator", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const page = loadCoordinator({ runtime });

    await page.withStorageLock(({ commit }) =>
      commit([
        { key: "settings", value: '{"theme":"light"}', previous: null },
        { key: "sync", value: '{"settings":42}', previous: null },
      ])
    );

    expect(runtime.values).toEqual({
      settings: '{"theme":"light"}',
      sync: '{"settings":42}',
    });
    expect(runtime.storage.local.set).toHaveBeenCalled();
  });

  test("rejects a foreground commit after its coordinator disconnects", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const page = loadCoordinator({ runtime });
    const commitReady = deferred();
    const write = page.withStorageLock(async ({ commit }) => {
      await commitReady.promise;
      await commit([{ key: "settings", value: "new", previous: "old" }]);
    });
    const rejectedWrite = expect(write).rejects.toThrow(/disconnect/i);
    await flushPromises();
    runtime.ports[0].front.disconnect();
    commitReady.resolve();

    await rejectedWrite;
    expect(runtime.storage.local.set).not.toHaveBeenCalled();
    expect(runtime.values).toEqual({});
  });

  test("restores a removed value when a later write in the same commit fails", async () => {
    const runtime = createRuntime();
    runtime.values.obsolete = "old value";
    runtime.values.settings = "dark";
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const page = loadCoordinator({ runtime });
    runtime.storage.local.set.mockRejectedValueOnce(new Error("Write failed"));

    await expect(
      page.withStorageLock(({ commit }) =>
        commit([
          { key: "obsolete", value: null, previous: "old value" },
          { key: "settings", value: "light", previous: "dark" },
        ])
      )
    ).rejects.toThrow("Write failed");

    expect(runtime.values).toEqual({ obsolete: "old value", settings: "dark" });
    await expect(page.withStorageLock(() => "recovered")).resolves.toBe(
      "recovered"
    );
  });

  test("finishes an accepted background commit before granting another writer", async () => {
    const runtime = createRuntime();
    loadCoordinator({ runtime, background: true }).installStorageCoordinator();
    const firstPage = loadCoordinator({ runtime });
    const secondPage = loadCoordinator({ runtime });
    const writeStarted = deferred();
    const writeComplete = deferred();
    runtime.storage.local.set.mockImplementationOnce(async (entries) => {
      writeStarted.resolve();
      await writeComplete.promise;
      Object.assign(runtime.values, entries);
    });
    const firstWrite = firstPage.withStorageLock(({ commit }) =>
      commit([{ key: "settings", value: "new", previous: "old" }])
    );
    const firstResult = firstWrite.catch(() => undefined);
    await writeStarted.promise;
    runtime.ports[0].front.disconnect();
    const secondOperation = jest.fn(() => "next writer");
    const secondWrite = secondPage.withStorageLock(secondOperation);
    await flushPromises();

    try {
      expect(secondOperation).not.toHaveBeenCalled();
    } finally {
      writeComplete.resolve();
      await firstResult;
      await secondWrite;
    }
    expect(runtime.values.settings).toBe("new");
    expect(secondOperation).toHaveBeenCalledTimes(1);
  });

  test("uses the browser lock manager to coordinate web pages", async () => {
    const permitted = deferred();
    const request = jest.fn(async (_name, operation) => {
      await permitted.promise;
      return operation();
    });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });
    const webPage = loadCoordinator({ extension: false });
    const operation = jest.fn(() => "web complete");
    const result = webPage.withStorageLock(operation);
    await flushPromises();

    expect(request).toHaveBeenCalledWith(LOCK_NAME, expect.any(Function));
    expect(operation).not.toHaveBeenCalled();
    permitted.resolve();
    await expect(result).resolves.toBe("web complete");
  });

  test("does not use origin-scoped web locks for userscript storage", async () => {
    const request = jest.fn();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });
    const userscript = loadCoordinator({ extension: false, gm: true });
    const firstCompletion = deferred();
    const first = userscript.withStorageLock(() => firstCompletion.promise);
    const secondOperation = jest.fn(() => "second complete");
    const second = userscript.withStorageLock(secondOperation);
    await flushPromises();

    expect(request).not.toHaveBeenCalled();
    expect(secondOperation).not.toHaveBeenCalled();
    firstCompletion.resolve();
    await first;
    await expect(second).resolves.toBe("second complete");
  });

  test("keeps its fallback queue usable after an operation fails", async () => {
    const webPage = loadCoordinator({ extension: false });
    const first = webPage.withStorageLock(() => {
      throw new Error("Read failed");
    });
    const next = webPage.withStorageLock(() => "retried");

    await expect(first).rejects.toThrow("Read failed");
    await expect(next).resolves.toBe("retried");
  });
});
