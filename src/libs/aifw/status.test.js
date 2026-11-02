jest.mock("../browser", () => ({
  browser: {
    storage: {
      local: { get: jest.fn(), set: jest.fn() },
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    },
    runtime: { sendMessage: jest.fn() },
    tabs: { query: jest.fn(), sendMessage: jest.fn() },
  },
}));

jest.mock("../log", () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  logger.child = jest.fn(() => logger);
  return { logger, kissLog: jest.fn() };
});

const loadStatus = () => {
  jest.resetModules();
  const browserModule = require("../browser");
  const status = require("./status");
  return { status, browser: browserModule.browser };
};

/** 构造带 content-length 与可读 body 的假 Cache 响应。 */
const makeCacheResponse = ({ contentLength, bodyBytes } = {}) => {
  const headers = {
    get: (name) =>
      name === "content-length" && contentLength != null
        ? String(contentLength)
        : null,
  };
  const makeBody = (bytes) => {
    let sent = false;
    return {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new Uint8Array(bytes || 0) };
        },
      }),
    };
  };
  return {
    headers,
    body: makeBody(bodyBytes),
    clone: () => ({
      headers,
      body: makeBody(bodyBytes),
      arrayBuffer: async () => new ArrayBuffer(bodyBytes || 0),
    }),
    arrayBuffer: async () => new ArrayBuffer(bodyBytes || 0),
  };
};

afterEach(() => {
  delete globalThis.caches;
});

describe("constants", () => {
  test("exposes the shared status key and reset message", () => {
    const { status } = loadStatus();
    expect(status.AIFW_MODEL_STATUS_KEY).toBe(
      "kiss-translator_aifw_model_status"
    );
    expect(status.AIFW_RESET_MESSAGE).toBe("AIFW_RESET_MODELS");
    expect(status.AIFW_CACHE_NAME_PREFIX).toBe("oneaifw-assets-v");
  });
});

describe("readModelStatus", () => {
  test("returns the persisted status object", async () => {
    const { status, browser } = loadStatus();
    const stored = { state: "ready", sizeBytes: 10 };
    browser.storage.local.get.mockResolvedValue({
      [status.AIFW_MODEL_STATUS_KEY]: stored,
    });

    await expect(status.readModelStatus()).resolves.toEqual(stored);
  });

  test("returns null when nothing has been written yet", async () => {
    const { status, browser } = loadStatus();
    browser.storage.local.get.mockResolvedValue({});

    await expect(status.readModelStatus()).resolves.toBeNull();
  });

  test("returns null when storage fails or is unavailable", async () => {
    const { status } = loadStatus();
    const browser = require("../browser").browser;
    browser.storage.local.get.mockRejectedValue(new Error("storage down"));
    await expect(status.readModelStatus()).resolves.toBeNull();

    browser.storage = undefined;
    await expect(status.readModelStatus()).resolves.toBeNull();
  });
});

describe("writeModelStatus", () => {
  test("merges a patch into the persisted status", async () => {
    const { status, browser } = loadStatus();
    browser.storage.local.get.mockResolvedValue({
      [status.AIFW_MODEL_STATUS_KEY]: { state: "ready", sizeBytes: 10 },
    });
    browser.storage.local.set.mockResolvedValue(undefined);

    const merged = await status.writeModelStatus({ state: "loading" });

    expect(browser.storage.local.set).toHaveBeenCalledWith({
      [status.AIFW_MODEL_STATUS_KEY]: expect.objectContaining({
        state: "loading",
        sizeBytes: 10,
        updatedAt: expect.any(Number),
      }),
    });
    expect(merged).toMatchObject({ state: "loading", sizeBytes: 10 });
  });

  test("keeps earlier fields across consecutive patches", async () => {
    const { status, browser } = loadStatus();
    browser.storage.local.get.mockResolvedValue({});
    browser.storage.local.set.mockResolvedValue(undefined);

    await status.writeModelStatus({ state: "loading", totalBytes: 100 });
    await status.writeModelStatus({ downloadedBytes: 40 });

    const lastWrite =
      browser.storage.local.set.mock.calls.at(-1)[0][
        status.AIFW_MODEL_STATUS_KEY
      ];
    expect(lastWrite).toMatchObject({
      state: "loading",
      totalBytes: 100,
      downloadedBytes: 40,
    });
  });

  test("deletes fields explicitly set to undefined", async () => {
    const { status, browser } = loadStatus();
    browser.storage.local.get.mockResolvedValue({
      [status.AIFW_MODEL_STATUS_KEY]: {
        state: "ready",
        origin: "https://example.com",
      },
    });
    browser.storage.local.set.mockResolvedValue(undefined);

    const merged = await status.writeModelStatus({ origin: undefined });

    const lastWrite =
      browser.storage.local.set.mock.calls.at(-1)[0][
        status.AIFW_MODEL_STATUS_KEY
      ];
    expect(lastWrite).not.toHaveProperty("origin");
    expect(merged).not.toHaveProperty("origin");
  });

  test("does not throw without extension storage", async () => {
    const { status, browser } = loadStatus();
    browser.storage = undefined;

    await expect(
      status.writeModelStatus({ state: "idle" })
    ).resolves.toMatchObject({ state: "idle" });
  });

  test("swallows persistence failures", async () => {
    const { status, browser } = loadStatus();
    browser.storage.local.get.mockResolvedValue({});
    browser.storage.local.set.mockRejectedValue(new Error("quota exceeded"));

    await expect(
      status.writeModelStatus({ state: "error" })
    ).resolves.toMatchObject({ state: "error" });
  });
});

describe("subscribeModelStatus", () => {
  test("forwards the new value and unsubscribes cleanly", () => {
    const { status, browser } = loadStatus();
    const listener = jest.fn();
    const unsubscribe = status.subscribeModelStatus(listener);

    expect(browser.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    const handler = browser.storage.onChanged.addListener.mock.calls[0][0];

    handler({
      [status.AIFW_MODEL_STATUS_KEY]: { newValue: { state: "ready" } },
    });
    expect(listener).toHaveBeenCalledWith({ state: "ready" });

    handler({
      [status.AIFW_MODEL_STATUS_KEY]: { newValue: undefined },
    });
    expect(listener).toHaveBeenLastCalledWith(null);

    handler({ otherKey: { newValue: 1 } });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    expect(browser.storage.onChanged.removeListener).toHaveBeenCalledWith(
      handler
    );
  });

  test("swallows listener errors and degrades without storage API", () => {
    const { status, browser } = loadStatus();
    browser.storage.onChanged.addListener.mockImplementation((handler) => {
      handler({
        [status.AIFW_MODEL_STATUS_KEY]: { newValue: { state: "error" } },
      });
    });
    const listener = jest.fn(() => {
      throw new Error("boom");
    });

    expect(() => status.subscribeModelStatus(listener)).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    const bare = loadStatus();
    bare.browser.storage = undefined;
    const unsubscribe = bare.status.subscribeModelStatus(jest.fn());
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("clearModelCaches", () => {
  test("deletes only aifw asset caches and returns the count", async () => {
    const { status } = loadStatus();
    globalThis.caches = {
      keys: jest
        .fn()
        .mockResolvedValue([
          "oneaifw-assets-v0.3.1",
          "translation-cache",
          "oneaifw-assets-v0.4.0",
        ]),
      delete: jest.fn().mockResolvedValue(true),
    };

    await expect(status.clearModelCaches()).resolves.toBe(2);
    expect(globalThis.caches.delete).toHaveBeenCalledTimes(2);
    expect(globalThis.caches.delete).toHaveBeenNthCalledWith(
      1,
      "oneaifw-assets-v0.3.1"
    );
    expect(globalThis.caches.delete).toHaveBeenNthCalledWith(
      2,
      "oneaifw-assets-v0.4.0"
    );
  });

  test("counts only successful deletions", async () => {
    const { status } = loadStatus();
    globalThis.caches = {
      keys: jest
        .fn()
        .mockResolvedValue(["oneaifw-assets-v0.3.1", "oneaifw-assets-v0.4.0"]),
      delete: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error("locked")),
    };

    await expect(status.clearModelCaches()).resolves.toBe(1);
  });

  test("returns 0 without CacheStorage", async () => {
    const { status } = loadStatus();
    await expect(status.clearModelCaches()).resolves.toBe(0);
  });
});

describe("measureModelCacheSize", () => {
  test("sums content-length and falls back to body bytes", async () => {
    const { status } = loadStatus();
    const cache = {
      keys: jest.fn().mockResolvedValue([{ url: "a" }, { url: "b" }]),
      match: jest
        .fn()
        .mockResolvedValueOnce(makeCacheResponse({ contentLength: 100 }))
        .mockResolvedValueOnce(makeCacheResponse({ bodyBytes: 50 })),
    };
    globalThis.caches = {
      keys: jest
        .fn()
        .mockResolvedValue(["oneaifw-assets-v0.3.1", "translation-cache"]),
      open: jest.fn().mockResolvedValue(cache),
    };

    await expect(status.measureModelCacheSize()).resolves.toBe(150);
    expect(globalThis.caches.open).toHaveBeenCalledTimes(1);
    expect(globalThis.caches.open).toHaveBeenCalledWith(
      "oneaifw-assets-v0.3.1"
    );
  });

  test("returns 0 without CacheStorage or on cache failures", async () => {
    const { status } = loadStatus();
    await expect(status.measureModelCacheSize()).resolves.toBe(0);

    globalThis.caches = {
      keys: jest.fn().mockResolvedValue(["oneaifw-assets-v0.3.1"]),
      open: jest.fn().mockRejectedValue(new Error("cache broken")),
    };
    await expect(status.measureModelCacheSize()).resolves.toBe(0);
  });
});

describe("chrome.storage fallback", () => {
  test("writes and subscribes through chrome.storage.local without the polyfill", async () => {
    const { status, browser } = loadStatus();
    const originalStorage = browser.storage;
    const set = jest.fn().mockResolvedValue(undefined);
    const get = jest.fn().mockResolvedValue({});
    const onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    const previousChrome = globalThis.chrome;
    globalThis.chrome = { storage: { local: { get, set }, onChanged } };
    browser.storage = undefined;

    try {
      const listener = jest.fn();
      const unsubscribe = status.subscribeModelStatus(listener);
      expect(onChanged.addListener).toHaveBeenCalledTimes(1);

      await status.writeModelStatus({ state: "loading" });
      expect(get).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith({
        "kiss-translator_aifw_model_status": expect.objectContaining({
          state: "loading",
        }),
      });

      unsubscribe();
      expect(onChanged.removeListener).toHaveBeenCalledWith(
        onChanged.addListener.mock.calls[0][0]
      );
    } finally {
      browser.storage = originalStorage;
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    }
  });
});

describe("background status relay", () => {
  test("sends status updates to background when storage is unavailable", async () => {
    const { status, browser } = loadStatus();
    const originalStorage = browser.storage;
    browser.storage = undefined;
    browser.runtime.sendMessage.mockResolvedValue({ ok: true });

    try {
      await status.writeModelStatus({ state: "loading", downloadedBytes: 1 });
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        type: "AIFW_MODEL_STATUS_UPDATE",
        status: expect.objectContaining({
          state: "loading",
          downloadedBytes: 1,
        }),
      });
    } finally {
      browser.storage = originalStorage;
    }
  });
});

describe("requestModelReset", () => {
  test("broadcasts the reset message to every tab and counts deliveries", async () => {
    const { status, browser } = loadStatus();
    browser.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }, {}]);
    browser.tabs.sendMessage.mockImplementation(async (tabId) => {
      if (tabId === 2) throw new Error("no receiver");
      return { ok: true };
    });

    await expect(status.requestModelReset()).resolves.toEqual({
      tabs: 2,
      delivered: 1,
    });
    expect(browser.tabs.sendMessage).toHaveBeenNthCalledWith(1, 1, {
      type: "AIFW_RESET_MODELS",
    });
    expect(browser.tabs.sendMessage).toHaveBeenNthCalledWith(2, 2, {
      type: "AIFW_RESET_MODELS",
    });
  });

  test("returns zeros without tabs API or on query failure", async () => {
    const { status, browser } = loadStatus();
    browser.tabs = undefined;
    await expect(status.requestModelReset()).resolves.toEqual({
      tabs: 0,
      delivered: 0,
    });

    const next = loadStatus();
    next.browser.tabs.query.mockRejectedValue(new Error("query failed"));
    await expect(next.status.requestModelReset()).resolves.toEqual({
      tabs: 0,
      delivered: 0,
    });
  });
});
