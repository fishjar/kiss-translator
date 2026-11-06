jest.mock("./loader", () => ({
  resolveAifwModuleUrl: jest.fn(),
  loadAifwModule: jest.fn(),
}));

jest.mock("./status", () => ({
  clearModelCaches: jest.fn(),
  measureModelCacheSize: jest.fn(),
  readModelStatus: jest.fn(),
  subscribeModelStatus: jest.fn(),
  writeModelStatus: jest.fn(),
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

import {
  AIFW_DOWNLOAD_IDLE_TIMEOUT_MS,
  AIFW_INIT_RETRY_INTERVAL_MS,
  AIFW_INIT_TIMEOUT_MS,
} from "./constants";

const MODULE_URL = "chrome-extension://test/aifw-js/aifw-js.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async (ticks = 25) => {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
};

const createFakeModule = (overrides = {}) => ({
  init: jest.fn().mockResolvedValue(undefined),
  deinit: jest.fn().mockResolvedValue(undefined),
  maskText: jest
    .fn()
    .mockResolvedValue(["masked text", new Uint8Array([1, 2])]),
  restoreText: jest.fn().mockResolvedValue("restored text"),
  ...overrides,
});

const loadEngine = ({ url = MODULE_URL } = {}) => {
  jest.resetModules();
  const loader = require("./loader");
  const status = require("./status");
  const logModule = require("../log");
  loader.resolveAifwModuleUrl.mockReturnValue(url);
  status.writeModelStatus.mockResolvedValue(undefined);
  status.measureModelCacheSize.mockResolvedValue(0);
  status.clearModelCaches.mockResolvedValue(0);
  const engine = require("./engine");
  return { engine, loader, status, log: logModule.logger };
};

const statusPatches = (status) =>
  status.writeModelStatus.mock.calls.map(([patch]) => patch);

afterEach(() => {
  jest.useRealTimers();
  delete globalThis.caches;
});

describe("configureEngine", () => {
  test("switches between page and host contexts", () => {
    const { engine } = loadEngine();
    expect(engine.configureEngine({ context: "host" })).toBe("host");
    expect(engine.configureEngine({ context: "page" })).toBe("page");
    // 非法值保持现状。
    expect(engine.configureEngine({ context: "bogus" })).toBe("page");
  });

  test("page context records the site origin in model status", async () => {
    const { engine, loader, status } = loadEngine();
    engine.configureEngine({ context: "page" });
    loader.loadAifwModule.mockResolvedValue(createFakeModule());

    await engine.ensureEngine();

    const loading = statusPatches(status).find(
      (patch) => patch.state === "loading"
    );
    const ready = statusPatches(status).find(
      (patch) => patch.state === "ready"
    );
    expect(loading.origin).toBe(globalThis.location.origin);
    expect(ready.origin).toBe(globalThis.location.origin);
  });

  test("host context omits the origin in model status", async () => {
    const { engine, loader, status } = loadEngine();
    engine.configureEngine({ context: "host" });
    loader.loadAifwModule.mockResolvedValue(createFakeModule());

    await engine.ensureEngine();

    const loading = statusPatches(status).find(
      (patch) => patch.state === "loading"
    );
    const ready = statusPatches(status).find(
      (patch) => patch.state === "ready"
    );
    expect(loading.origin).toBeUndefined();
    expect(ready.origin).toBeUndefined();
    expect(loading).toHaveProperty("origin");
    expect(ready).toHaveProperty("origin");
  });
});

describe("ensureEngine", () => {
  test("initializes once and becomes ready", async () => {
    const { engine, loader, status } = loadEngine();
    const aifw = createFakeModule();
    loader.loadAifwModule.mockResolvedValue(aifw);
    status.measureModelCacheSize.mockResolvedValue(4096);

    await expect(engine.ensureEngine()).resolves.toBe(true);

    expect(loader.loadAifwModule).toHaveBeenCalledTimes(1);
    expect(aifw.init).toHaveBeenCalledWith({});
    expect(engine.getEngineStatus()).toEqual({ state: "ready" });
    const ready = statusPatches(status).find(
      (patch) => patch.state === "ready"
    );
    expect(ready).toMatchObject({ sizeBytes: 4096 });
    expect(ready.downloadedBytes).toBe(ready.totalBytes);
  });

  test("shares a single module load across concurrent callers", async () => {
    const { engine, loader } = loadEngine();
    const moduleDeferred = deferred();
    loader.loadAifwModule.mockReturnValue(moduleDeferred.promise);
    const aifw = createFakeModule();

    const first = engine.ensureEngine();
    const second = engine.ensureEngine();
    await flushMicrotasks();
    expect(loader.loadAifwModule).toHaveBeenCalledTimes(1);

    moduleDeferred.resolve(aifw);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(aifw.init).toHaveBeenCalledTimes(1);
  });

  test("returns false and records the error when init fails", async () => {
    const { engine, loader, status } = loadEngine();
    loader.loadAifwModule.mockResolvedValue(
      createFakeModule({
        init: jest.fn().mockRejectedValue(new Error("model download failed")),
      })
    );

    await expect(engine.ensureEngine()).resolves.toBe(false);

    expect(engine.getEngineStatus()).toEqual({
      state: "error",
      error: "model download failed",
    });
    expect(status.writeModelStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "error",
        error: "model download failed",
      })
    );
  });

  test("rate-limits init retries after a failure", async () => {
    jest.useFakeTimers();
    const { engine, loader } = loadEngine();
    loader.loadAifwModule.mockResolvedValue(
      createFakeModule({
        init: jest.fn().mockRejectedValue(new Error("network down")),
      })
    );

    await expect(engine.ensureEngine()).resolves.toBe(false);
    expect(loader.loadAifwModule).toHaveBeenCalledTimes(1);

    // 冷却期内直接跳过。
    await expect(engine.ensureEngine()).resolves.toBe(false);
    expect(loader.loadAifwModule).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(AIFW_INIT_RETRY_INTERVAL_MS + 1);
    await expect(engine.ensureEngine()).resolves.toBe(false);
    expect(loader.loadAifwModule).toHaveBeenCalledTimes(2);
  });

  test("bounds the wait but keeps initializing in the background", async () => {
    jest.useFakeTimers();
    const { engine, loader } = loadEngine();
    const initDeferred = deferred();
    loader.loadAifwModule.mockResolvedValue(
      createFakeModule({ init: jest.fn(() => initDeferred.promise) })
    );

    const pending = engine.ensureEngine();
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "loading" });

    jest.advanceTimersByTime(AIFW_INIT_TIMEOUT_MS);
    await expect(pending).resolves.toBe(false);

    initDeferred.resolve();
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "ready" });
  });

  test("returns false when aifw-js is unavailable", async () => {
    const { engine, loader } = loadEngine({ url: null });

    await expect(engine.ensureEngine()).resolves.toBe(false);
    expect(loader.loadAifwModule).not.toHaveBeenCalled();
    expect(engine.getEngineStatus()).toEqual({ state: "unavailable" });
  });
});

describe("warmupEngine", () => {
  test("starts initialization without waiting", async () => {
    const { engine, loader } = loadEngine();
    const moduleDeferred = deferred();
    loader.loadAifwModule.mockReturnValue(moduleDeferred.promise);

    expect(engine.warmupEngine()).toBe(true);
    await flushMicrotasks();
    expect(loader.loadAifwModule).toHaveBeenCalledTimes(1);
    expect(engine.getEngineStatus()).toEqual({ state: "loading" });

    moduleDeferred.resolve(createFakeModule());
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "ready" });
  });

  test("returns false when unavailable", () => {
    const { engine } = loadEngine({ url: null });
    expect(engine.warmupEngine()).toBe(false);
  });
});

describe("maskOnEngine / restoreOnEngine", () => {
  test("returns null before the engine is ready", async () => {
    const { engine } = loadEngine();
    await expect(engine.maskOnEngine("text")).resolves.toBeNull();
    await expect(
      engine.restoreOnEngine("text", new Uint8Array([1]))
    ).resolves.toBe("text");
  });

  test("masks and restores through the loaded module", async () => {
    const { engine, loader } = loadEngine();
    const aifw = createFakeModule();
    loader.loadAifwModule.mockResolvedValue(aifw);
    await engine.ensureEngine();

    const result = await engine.maskOnEngine("联系我 user@example.com", "zh");
    expect(aifw.maskText).toHaveBeenCalledWith("联系我 user@example.com", "zh");
    expect(result).toEqual({
      maskedText: "masked text",
      maskMeta: new Uint8Array([1, 2]),
    });

    await expect(
      engine.restoreOnEngine("译文", new Uint8Array([1]))
    ).resolves.toBe("restored text");
    expect(aifw.restoreText).toHaveBeenCalledWith("译文", new Uint8Array([1]));
  });

  test("mask failures yield null and restore failures keep the译文", async () => {
    const { engine, loader, log } = loadEngine();
    const aifw = createFakeModule({
      maskText: jest
        .fn()
        .mockRejectedValue(new Error("NER pipeline not ready")),
      restoreText: jest.fn().mockRejectedValue(new Error("bad meta")),
    });
    loader.loadAifwModule.mockResolvedValue(aifw);
    await engine.ensureEngine();

    await expect(engine.maskOnEngine("text")).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      "maskText failed:",
      "NER pipeline not ready"
    );

    await expect(
      engine.restoreOnEngine("译文", new Uint8Array([1]))
    ).resolves.toBe("译文");
    expect(log.warn).toHaveBeenCalledWith(
      "restoreText failed; falling back to translated text:",
      "bad meta"
    );
  });

  test("restores without maskMeta by returning the input text", async () => {
    const { engine, loader } = loadEngine();
    const aifw = createFakeModule();
    loader.loadAifwModule.mockResolvedValue(aifw);
    await engine.ensureEngine();

    await expect(engine.restoreOnEngine("译文", null)).resolves.toBe("译文");
    expect(aifw.restoreText).not.toHaveBeenCalled();
  });
});

describe("resetEngine", () => {
  test("deinits, clears caches, writes idle and never redownloads when disabled", async () => {
    const { engine, loader, status } = loadEngine();
    const aifw = createFakeModule();
    loader.loadAifwModule.mockResolvedValue(aifw);
    status.clearModelCaches.mockResolvedValue(2);
    await engine.ensureEngine();
    status.writeModelStatus.mockClear();
    loader.loadAifwModule.mockClear();

    await expect(engine.resetEngine({ redownload: false })).resolves.toEqual({
      cleared: 2,
    });

    expect(aifw.deinit).toHaveBeenCalledTimes(1);
    expect(status.clearModelCaches).toHaveBeenCalledTimes(1);
    expect(status.writeModelStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "idle",
        sizeBytes: 0,
        downloadedBytes: 0,
        totalBytes: 0,
      })
    );
    expect(loader.loadAifwModule).not.toHaveBeenCalled();
    expect(engine.getEngineStatus()).toEqual({ state: "idle" });
  });

  test("starts a fresh download when redownload is enabled", async () => {
    const { engine, loader } = loadEngine();
    const aifw = createFakeModule();
    loader.loadAifwModule.mockResolvedValue(aifw);

    await engine.resetEngine({ redownload: true });
    await flushMicrotasks();

    expect(loader.loadAifwModule).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "ready" });
  });

  test("discards an in-flight initialization", async () => {
    const { engine, loader } = loadEngine();
    const initDeferred = deferred();
    const aifw = createFakeModule({
      init: jest.fn(() => initDeferred.promise),
    });
    loader.loadAifwModule.mockResolvedValue(aifw);

    const pending = engine.ensureEngine();
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "loading" });

    await engine.resetEngine({ redownload: false });
    expect(engine.getEngineStatus()).toEqual({ state: "idle" });

    initDeferred.resolve();
    await expect(pending).resolves.toBe(false);
    await flushMicrotasks();
    // 被放弃的初始化完成时不能把状态改回 ready，并清理实例。
    expect(engine.getEngineStatus()).toEqual({ state: "idle" });
    expect(aifw.deinit).toHaveBeenCalledTimes(1);
  });
});

describe("download progress", () => {
  const createAssetResponse = (bytes) => {
    const makeBody = () => {
      let sent = false;
      return {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: new Uint8Array(bytes) };
          },
        }),
      };
    };
    const headers = {
      get: (name) => (name === "content-length" ? String(bytes) : null),
    };
    return {
      headers,
      body: makeBody(),
      clone: () => ({ headers, body: makeBody() }),
    };
  };

  test("counts model asset downloads and restores fetch afterwards", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const fetchMock = jest.fn((input) =>
      Promise.resolve(
        String(input).endsWith(".onnx")
          ? createAssetResponse(1024)
          : { headers: { get: () => "9999" } }
      )
    );
    globalThis.fetch = fetchMock;
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            await globalThis.fetch("https://huggingface.co/x/model.onnx");
            await globalThis.fetch("https://example.com/not-an-asset.json");
          }),
        })
      );

      await engine.ensureEngine();

      const patches = statusPatches(status);
      expect(
        patches.some(
          (patch) => patch.state === undefined && patch.totalBytes === 1024
        )
      ).toBe(true);
      const ready = patches.find((patch) => patch.state === "ready");
      // 非模型 host / 非 .onnx/.wasm 的响应不计入。
      expect(ready.totalBytes).toBe(1024);
      expect(ready.downloadedBytes).toBe(1024);
      expect(globalThis.fetch).toBe(fetchMock);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe("retryEngine", () => {
  test("aborts an in-flight init without clearing caches or writing an error", async () => {
    const { engine, loader, status } = loadEngine();
    const initDeferred = deferred();
    const aifw = createFakeModule({
      init: jest.fn(() => initDeferred.promise),
    });
    loader.loadAifwModule.mockResolvedValue(aifw);

    const pending = engine.ensureEngine();
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "loading" });

    status.writeModelStatus.mockClear();
    await expect(engine.retryEngine({ redownload: false })).resolves.toEqual({
      retried: true,
    });

    // 旧 init 立即被中止：状态回到 idle，且缓存未清理（可续传）。
    expect(engine.getEngineStatus()).toEqual({ state: "idle" });
    expect(status.clearModelCaches).not.toHaveBeenCalled();
    expect(status.writeModelStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: "idle" })
    );
    // 被 retry 中止的旧实例不做 deinit（新 init 可能复用同一模块实例）。
    expect(aifw.deinit).not.toHaveBeenCalled();

    initDeferred.resolve();
    await expect(pending).resolves.toBe(false);
    await flushMicrotasks();
    // 旧 init 完成也不能覆盖新状态或写 error。
    expect(engine.getEngineStatus()).toEqual({ state: "idle" });
    expect(status.writeModelStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: "error" })
    );
  });

  test("restarts initialization and resumes from cache when redownload is enabled", async () => {
    const { engine, loader, status } = loadEngine();
    const firstInit = deferred();
    const aifw = createFakeModule({
      init: jest
        .fn()
        .mockImplementationOnce(() => firstInit.promise)
        .mockResolvedValue(undefined),
    });
    loader.loadAifwModule.mockResolvedValue(aifw);

    const pending = engine.ensureEngine();
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "loading" });

    await expect(engine.retryEngine({ redownload: true })).resolves.toEqual({
      retried: true,
    });
    expect(status.clearModelCaches).not.toHaveBeenCalled();
    // 立即重新进入 loading，随后 ready。
    expect(engine.getEngineStatus()).toEqual({ state: "loading" });
    await flushMicrotasks();
    expect(engine.getEngineStatus()).toEqual({ state: "ready" });
    expect(aifw.init).toHaveBeenCalledTimes(2);

    // 旧 ensureEngine 的等待会等到新一代 init 完成（ready）。
    firstInit.resolve();
    await expect(pending).resolves.toBe(true);
  });

  test("only resets to idle when nothing is in flight", async () => {
    const { engine, status } = loadEngine();

    await expect(engine.retryEngine({ redownload: false })).resolves.toEqual({
      retried: false,
    });
    expect(engine.getEngineStatus()).toEqual({ state: "idle" });
    expect(status.clearModelCaches).not.toHaveBeenCalled();
  });
});

describe("download watchdog", () => {
  test("aborts a stalled model download and reports a retryable timeout", async () => {
    jest.useFakeTimers();
    const { engine, loader, status, log } = loadEngine();
    const previousFetch = globalThis.fetch;
    const abortError = () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      return error;
    };
    const fetchMock = jest.fn((input, init) => {
      const signal = init?.signal;
      const makeReader = () => ({
        read: () =>
          new Promise((resolve, reject) => {
            if (signal?.aborted) {
              reject(abortError());
              return;
            }
            signal?.addEventListener("abort", () => reject(abortError()), {
              once: true,
            });
          }),
      });
      const headers = { get: () => "1024" };
      return Promise.resolve({
        headers,
        body: { getReader: makeReader },
        clone: () => ({ headers, body: { getReader: makeReader } }),
      });
    });
    globalThis.fetch = fetchMock;
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            const response = await globalThis.fetch(
              "https://huggingface.co/x/model.onnx"
            );
            const reader = response.body.getReader();
            // 模拟下载卡住：一直读不到数据，直到请求被看门狗 abort。
            await reader.read();
          }),
        })
      );

      const pending = engine.ensureEngine();
      await flushMicrotasks();
      expect(engine.getEngineStatus()).toEqual({ state: "loading" });

      jest.advanceTimersByTime(AIFW_DOWNLOAD_IDLE_TIMEOUT_MS);
      await expect(pending).resolves.toBe(false);
      await flushMicrotasks();

      expect(log.warn).toHaveBeenCalledWith(
        "aifw model download stalled; aborting request"
      );
      expect(engine.getEngineStatus()).toEqual({
        state: "error",
        error: "模型下载超时，请重试",
      });
      expect(status.writeModelStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          state: "error",
          error: "模型下载超时，请重试",
        })
      );
      // init 结束后恢复原始 fetch。
      expect(globalThis.fetch).toBe(fetchMock);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe("model files and speed in status", () => {
  const createChunkResponse = (bytes) => {
    const makeBody = () => {
      let sent = false;
      return {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: new Uint8Array(bytes) };
          },
        }),
      };
    };
    const headers = {
      get: (name) => (name === "content-length" ? String(bytes) : null),
    };
    return {
      headers,
      body: makeBody(),
      clone: () => ({ headers, body: makeBody() }),
    };
  };

  test("builds ordered files with names, urls, bytes and done flags", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const urls = [
      "https://huggingface.co/repo/resolve/main/models/funstory-ai/neurobert-mini/onnx/model_quantized.onnx",
      "https://www.modelscope.cn/models/x/OneAIFW-Assets/resolve/master/wasm/ort-wasm-simd.wasm",
      "https://raw.githubusercontent.com/x/OneAIFW-Assets/main/hello.json",
    ];
    globalThis.fetch = jest.fn((input) =>
      Promise.resolve(
        String(input).endsWith("hello.json")
          ? { headers: { get: () => null } }
          : createChunkResponse(1024)
      )
    );
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            for (const url of urls) await globalThis.fetch(url);
          }),
        })
      );

      await engine.ensureEngine();
      await flushMicrotasks();

      const patches = statusPatches(status);
      const ready = patches.find((patch) => patch.state === "ready");
      expect(ready.speedBps).toBe(0);
      const latestFilesPatch = [...patches]
        .reverse()
        .find((patch) => Array.isArray(patch.files) && patch.files.length > 0);
      expect(latestFilesPatch.files.map((file) => file.name)).toEqual([
        "models/funstory-ai/neurobert-mini/onnx/model_quantized.onnx",
        "wasm/ort-wasm-simd.wasm",
      ]);
      expect(latestFilesPatch.files[0]).toMatchObject({
        url: urls[0],
        totalBytes: 1024,
        downloadedBytes: 1024,
        done: true,
      });
      expect(latestFilesPatch.files[1]).toMatchObject({
        url: urls[1],
        done: true,
      });
      // hello.json 只做版本探测，不进入文件列表。
      expect(
        latestFilesPatch.files.some((file) => file.url.endsWith("hello.json"))
      ).toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("caps the tracked file list to keep status small", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const urls = Array.from(
      { length: 20 },
      (_, index) =>
        `https://huggingface.co/repo/resolve/main/models/m${index}/tokenizer.json`
    );
    globalThis.fetch = jest.fn(() => Promise.resolve(createChunkResponse(16)));
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            for (const url of urls) await globalThis.fetch(url);
          }),
        })
      );

      await engine.ensureEngine();
      await flushMicrotasks();

      const latestFilesPatch = [...statusPatches(status)]
        .reverse()
        .find((patch) => Array.isArray(patch.files) && patch.files.length > 0);
      expect(latestFilesPatch.files.length).toBe(15);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("estimates speed and settles to zero after inactivity", async () => {
    jest.useFakeTimers();
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const makeStalledResponse = () => {
      const makeBody = () => {
        let reads = 0;
        return {
          getReader: () => ({
            read: () => {
              reads += 1;
              if (reads === 1) {
                return Promise.resolve({
                  done: false,
                  value: new Uint8Array(1024),
                });
              }
              if (reads === 2) {
                // 300ms 后再来一块数据，用于验证滑动窗口速度估算。
                return new Promise((resolve) => {
                  setTimeout(
                    () => resolve({ done: false, value: new Uint8Array(1024) }),
                    300
                  );
                });
              }
              // 模拟下载停滞（看门狗会在 45s 后中止）。
              return new Promise(() => {});
            },
          }),
        };
      };
      const headers = { get: () => "4096" };
      return {
        headers,
        body: makeBody(),
        clone: () => ({ headers, body: makeBody() }),
      };
    };
    globalThis.fetch = jest.fn(() => Promise.resolve(makeStalledResponse()));
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            await globalThis.fetch("https://huggingface.co/x/model.onnx");
            await new Promise(() => {});
          }),
        })
      );

      const pending = engine.ensureEngine();
      await flushMicrotasks();

      // 第一块数据到达后等待 300ms（避开 250ms 节流）让第二块数据触发一次进度写。
      jest.advanceTimersByTime(300);
      await flushMicrotasks();

      const progress = statusPatches(status).find(
        (patch) =>
          patch.state === undefined &&
          Array.isArray(patch.files) &&
          patch.files[0]?.downloadedBytes > 0
      );
      expect(progress).toBeDefined();
      expect(progress.speedBps).toBeGreaterThan(0);
      expect(progress.files[0]).toMatchObject({
        downloadedBytes: 2048,
        totalBytes: 4096,
        done: false,
      });

      // 2s 没有新数据后速度归零并写回状态。
      jest.advanceTimersByTime(2001);
      await flushMicrotasks();
      expect(
        statusPatches(status).some(
          (patch) =>
            patch.speedBps === 0 &&
            Array.isArray(patch.files) &&
            patch.files.length > 0
        )
      ).toBe(true);

      await engine.retryEngine({ redownload: false });
      await expect(pending).resolves.toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("clears files and speed on retry and reset", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(() => Promise.resolve(createChunkResponse(32)));
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            await globalThis.fetch(
              "https://huggingface.co/repo/resolve/main/models/m/onnx/model_quantized.onnx"
            );
          }),
        })
      );
      await engine.ensureEngine();
      await flushMicrotasks();
      expect(
        statusPatches(status).some(
          (patch) => Array.isArray(patch.files) && patch.files.length > 0
        )
      ).toBe(true);

      status.writeModelStatus.mockClear();
      await engine.retryEngine({ redownload: false });
      const retryIdle = statusPatches(status).find(
        (patch) => patch.state === "idle"
      );
      expect(retryIdle).toMatchObject({ files: [], speedBps: 0 });

      status.writeModelStatus.mockClear();
      await engine.resetEngine({ redownload: false });
      const resetIdle = statusPatches(status).find(
        (patch) => patch.state === "idle"
      );
      expect(resetIdle).toMatchObject({ files: [], speedBps: 0 });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe("model file counting", () => {
  /** 构造按给定 chunk 依次返回 body 的响应。 */
  const createResponse = (contentLength, chunks) => {
    const makeBody = () => {
      let index = 0;
      return {
        getReader: () => ({
          read: async () => {
            if (index >= chunks.length) return { done: true, value: undefined };
            const value = new Uint8Array(chunks[index]);
            index += 1;
            return { done: false, value };
          },
        }),
      };
    };
    const headers = {
      get: (name) => (name === "content-length" ? String(contentLength) : null),
    };
    return {
      headers,
      body: makeBody(),
      clone: () => ({ headers, body: makeBody() }),
    };
  };

  const latestFilesPatch = (status) =>
    [...statusPatches(status)]
      .reverse()
      .find((patch) => Array.isArray(patch.files) && patch.files.length > 0);

  test("counts the same URL only once and freezes bytes after done", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const url =
      "https://huggingface.co/repo/resolve/main/models/m/onnx/model_quantized.onnx";
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(createResponse(1024, [512, 512]))
    );
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            // 同一 URL 被预取 + 再次拉取多次，只应统计第一次。
            await globalThis.fetch(url);
            await globalThis.fetch(url);
            await globalThis.fetch(url);
          }),
        })
      );

      await engine.ensureEngine();
      await flushMicrotasks();

      const patch = latestFilesPatch(status);
      expect(patch.files).toHaveLength(1);
      expect(patch.files[0]).toMatchObject({
        url,
        totalBytes: 1024,
        downloadedBytes: 1024,
        done: true,
      });
      // 聚合值不因重复 fetch 翻倍。
      expect(patch.totalBytes).toBe(1024);
      expect(patch.downloadedBytes).toBe(1024);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("clamps per-file bytes to content-length and freezes after done", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const url =
      "https://huggingface.co/repo/resolve/main/models/m/onnx/model_quantized.onnx";
    // 服务端给出的 chunk 总量（1200）大于 content-length（1000）。
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(createResponse(1000, [600, 600]))
    );
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            await globalThis.fetch(url);
          }),
        })
      );

      await engine.ensureEngine();
      await flushMicrotasks();

      const patch = latestFilesPatch(status);
      expect(patch.files[0]).toMatchObject({
        totalBytes: 1000,
        downloadedBytes: 1000,
        done: true,
      });
      expect(patch.downloadedBytes).toBeLessThanOrEqual(patch.totalBytes);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("ignores extension-hosted wasm resources", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const extensionUrl =
      "chrome-extension://test-id/aifw-js/wasm/liboneaifw_core.wasm";
    const networkUrl =
      "https://huggingface.co/repo/resolve/main/wasm/ort-wasm-simd.wasm";
    globalThis.fetch = jest.fn((input) =>
      Promise.resolve(
        String(input) === extensionUrl
          ? createResponse(4096, [4096])
          : createResponse(2048, [2048])
      )
    );
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            await globalThis.fetch(extensionUrl);
            await globalThis.fetch(networkUrl);
          }),
        })
      );

      await engine.ensureEngine();
      await flushMicrotasks();

      const patch = latestFilesPatch(status);
      expect(patch.files).toHaveLength(1);
      expect(patch.files[0].url).toBe(networkUrl);
      expect(patch.totalBytes).toBe(2048);
      expect(patch.downloadedBytes).toBe(2048);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("global totals equal the sum of file entries", async () => {
    const { engine, loader, status } = loadEngine();
    const previousFetch = globalThis.fetch;
    const entries = [
      {
        url: "https://huggingface.co/repo/resolve/main/models/en/onnx/model_quantized.onnx",
        contentLength: 1000,
        chunks: [400, 600],
      },
      {
        url: "https://www.modelscope.cn/models/x/OneAIFW-Assets/resolve/master/models/zh/onnx/model_quantized.onnx",
        contentLength: 2048,
        chunks: [1024, 1024],
      },
      {
        url: "https://raw.githubusercontent.com/x/OneAIFW-Assets/main/wasm/ort-wasm-simd.wasm",
        contentLength: 512,
        chunks: [200],
      },
    ];
    const byUrl = new Map(
      entries.map((entry) => [
        entry.url,
        createResponse(entry.contentLength, entry.chunks),
      ])
    );
    globalThis.fetch = jest.fn((input) =>
      Promise.resolve(byUrl.get(String(input)))
    );
    try {
      loader.loadAifwModule.mockResolvedValue(
        createFakeModule({
          init: jest.fn(async () => {
            for (const entry of entries) await globalThis.fetch(entry.url);
          }),
        })
      );

      await engine.ensureEngine();
      await flushMicrotasks();

      const patch = latestFilesPatch(status);
      const sum = (key) =>
        patch.files.reduce((total, file) => total + file[key], 0);
      expect(patch.totalBytes).toBe(sum("totalBytes"));
      expect(patch.downloadedBytes).toBe(sum("downloadedBytes"));
      expect(patch.downloadedBytes).toBeLessThanOrEqual(patch.totalBytes);
      expect(patch.totalBytes).toBe(1000 + 2048 + 512);
      expect(patch.downloadedBytes).toBe(1000 + 2048 + 200);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
