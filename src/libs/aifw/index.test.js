jest.mock("../storage", () => ({ getSettingWithDefault: jest.fn() }));

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

jest.mock("./client", () => ({
  isRemoteHostSupported: jest.fn(),
  remoteMask: jest.fn(),
  remoteReset: jest.fn(),
  remoteRestore: jest.fn(),
  remoteRetry: jest.fn(),
}));

jest.mock("./engine", () => ({
  ensureEngine: jest.fn(),
  getEngineStatus: jest.fn(),
  maskOnEngine: jest.fn(),
  resetEngine: jest.fn(),
  restoreOnEngine: jest.fn(),
}));

jest.mock("./status", () => ({
  readModelStatus: jest.fn(),
  subscribeModelStatus: jest.fn(),
}));

jest.mock("../client", () => ({ isWeb: true }));

import {
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_OPENAI,
} from "../../config/apiConstants";
import { AIFW_SETTING_CACHE_TTL_MS } from "./constants";
import {
  AIFW_ERROR_HOST_UNAVAILABLE,
  AIFW_ERROR_MASK_FAILED,
  AIFW_ERROR_NOT_READY,
  createAifwError,
} from "./protocol";

const NOT_READY_MESSAGE = "隐私脱敏模型尚未就绪，已暂停本次翻译，请稍候重试。";
const UNAVAILABLE_MESSAGE =
  "隐私脱敏服务不可用，已阻止本次翻译；如不需要脱敏，可在设置中关闭「本地隐私脱敏」。";
// 抛出错误的 message 会被翻译 UI 当作译文渲染，必须保持短文案。
const NOT_READY_ERROR_MESSAGE = "隐私脱敏模型尚未就绪，已暂停翻译";
const UNAVAILABLE_ERROR_MESSAGE = "隐私脱敏不可用，已阻止翻译";

const createMaskMeta = () => new Uint8Array([1, 2, 3]);

/** 每个用例重新加载一份干净的 index.js 单例状态与各 mock 实例。 */
const loadModules = ({ privacyMask = true } = {}) => {
  jest.resetModules();
  const storage = require("../storage");
  const logModule = require("../log");
  const client = require("./client");
  const engine = require("./engine");
  const status = require("./status");
  const env = require("../client");

  env.isWeb = true;
  storage.getSettingWithDefault.mockResolvedValue({ privacyMask });
  client.isRemoteHostSupported.mockReturnValue(false);
  client.remoteMask.mockResolvedValue({
    maskedText: "masked text",
    maskMeta: createMaskMeta(),
  });
  client.remoteReset.mockResolvedValue({ cleared: 0 });
  client.remoteRetry.mockResolvedValue({ ok: true });
  client.remoteRestore.mockImplementation(async (text) => text);
  engine.getEngineStatus.mockReturnValue({ state: "idle" });
  engine.ensureEngine.mockResolvedValue(true);
  engine.maskOnEngine.mockResolvedValue({
    maskedText: "masked text",
    maskMeta: createMaskMeta(),
  });
  engine.restoreOnEngine.mockImplementation(async (text) => text);
  engine.resetEngine.mockResolvedValue({ cleared: 0 });

  const index = require("./index");
  return {
    index,
    storage,
    log: logModule.logger,
    client,
    engine,
    status,
    env,
  };
};

afterEach(() => {
  jest.useRealTimers();
});

/** 统计某个固定提示文案的 log.warn 调用次数。 */
const countWarns = (log, event) =>
  log.warn.mock.calls.filter(([name]) => name === event).length;

describe("createRedaction gates", () => {
  test("returns null without touching storage for empty text", async () => {
    const { index, storage, client, engine } = loadModules();

    await expect(index.createRedaction({ text: "   " })).resolves.toBeNull();
    await expect(index.createRedaction({})).resolves.toBeNull();
    expect(storage.getSettingWithDefault).not.toHaveBeenCalled();
    expect(client.remoteMask).not.toHaveBeenCalled();
    expect(engine.ensureEngine).not.toHaveBeenCalled();
  });

  test.each([OPT_TRANS_LOCALAI, OPT_TRANS_BUILTINAI])(
    "returns null for the local %s api without reading settings",
    async (apiType) => {
      const { index, storage, client } = loadModules();

      await expect(
        index.createRedaction({
          text: "mail user@example.com",
          apiSetting: { apiType },
        })
      ).resolves.toBeNull();
      expect(storage.getSettingWithDefault).not.toHaveBeenCalled();
      expect(client.remoteMask).not.toHaveBeenCalled();
    }
  );

  test("returns null when the caller signal is already aborted", async () => {
    const { index, storage } = loadModules();
    const controller = new AbortController();
    controller.abort();

    await expect(
      index.createRedaction({
        text: "mail user@example.com",
        signal: controller.signal,
      })
    ).resolves.toBeNull();
    expect(storage.getSettingWithDefault).not.toHaveBeenCalled();
  });

  test("returns null when privacyMask is disabled", async () => {
    const { index, client, engine, storage } = loadModules({
      privacyMask: false,
    });

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).resolves.toBeNull();
    expect(storage.getSettingWithDefault).toHaveBeenCalledTimes(1);
    expect(client.remoteMask).not.toHaveBeenCalled();
    expect(engine.ensureEngine).not.toHaveBeenCalled();
  });

  test("treats a missing privacyMask field as disabled", async () => {
    const { index, engine } = loadModules();
    const storage = require("../storage");
    storage.getSettingWithDefault.mockResolvedValue({});

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).resolves.toBeNull();
    expect(engine.ensureEngine).not.toHaveBeenCalled();
  });

  test("returns null when the setting cannot be read and logs at debug", async () => {
    const { index, log } = loadModules();
    const storage = require("../storage");
    storage.getSettingWithDefault.mockRejectedValue(new Error("storage down"));

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).resolves.toBeNull();
    expect(log.debug).toHaveBeenCalledWith(
      "failed to read privacyMask setting:",
      "storage down"
    );
  });

  test("caches the privacyMask setting across consecutive requests", async () => {
    jest.useFakeTimers();
    const { index, storage } = loadModules();

    await index.createRedaction({ text: "first user@example.com" });
    await index.createRedaction({ text: "second user@example.com" });
    expect(storage.getSettingWithDefault).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(AIFW_SETTING_CACHE_TTL_MS);
    await index.createRedaction({ text: "third user@example.com" });
    expect(storage.getSettingWithDefault).toHaveBeenCalledTimes(2);
  });

  test("shares one setting read between concurrent requests", async () => {
    const { index, storage } = loadModules();

    await Promise.all([
      index.createRedaction({ text: "first user@example.com" }),
      index.createRedaction({ text: "second user@example.com" }),
    ]);
    expect(storage.getSettingWithDefault).toHaveBeenCalledTimes(1);
  });
});

describe("web page engine", () => {
  test("masks the source text and restores the translated text", async () => {
    const { index, engine } = loadModules();
    const maskMeta = createMaskMeta();
    engine.maskOnEngine.mockResolvedValue({
      maskedText: "联系我 [EMAIL]",
      maskMeta,
    });
    engine.restoreOnEngine.mockResolvedValue("联系我 user@example.com");
    const signal = new AbortController().signal;

    const redaction = await index.createRedaction({
      text: "联系我 user@example.com",
      fromLang: "zh-CN",
      toLang: "en",
      apiSetting: { apiType: OPT_TRANS_OPENAI },
      signal,
    });

    expect(engine.ensureEngine).toHaveBeenCalledWith({ signal });
    expect(engine.maskOnEngine).toHaveBeenCalledWith(
      "联系我 user@example.com",
      "auto"
    );
    expect(redaction.maskedText).toBe("联系我 [EMAIL]");
    await expect(redaction.restore("translated [EMAIL]")).resolves.toBe(
      "联系我 user@example.com"
    );
    expect(engine.restoreOnEngine).toHaveBeenCalledWith(
      "translated [EMAIL]",
      maskMeta
    );
  });

  test("returns null when masking replaced nothing", async () => {
    const { index, engine } = loadModules();
    engine.maskOnEngine.mockResolvedValue({
      maskedText: "same text",
      maskMeta: createMaskMeta(),
    });

    await expect(
      index.createRedaction({ text: "same text" })
    ).resolves.toBeNull();
    expect(engine.restoreOnEngine).not.toHaveBeenCalled();
  });

  test("blocks translation when the page engine cannot become ready", async () => {
    const { index, engine, log } = loadModules();
    engine.ensureEngine.mockResolvedValue(false);
    const notifier = jest.fn();
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
      message: UNAVAILABLE_ERROR_MESSAGE,
    });
    // Banner 仍展示完整说明。
    expect(notifier).toHaveBeenCalledWith(UNAVAILABLE_MESSAGE);
    expect(log.warn).toHaveBeenCalledWith(
      "aifw page engine not ready; blocking translation"
    );
  });

  test("blocks translation when the page engine returns no mask", async () => {
    const { index, engine } = loadModules();
    engine.maskOnEngine.mockResolvedValue(null);
    const notifier = jest.fn();
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).rejects.toMatchObject({
      code: AIFW_ERROR_MASK_FAILED,
      message: UNAVAILABLE_ERROR_MESSAGE,
    });
    expect(notifier).toHaveBeenCalledWith(UNAVAILABLE_MESSAGE);
  });

  test("returns null when the request is aborted while waiting for the engine", async () => {
    const { index, engine } = loadModules();
    const controller = new AbortController();
    engine.ensureEngine.mockImplementation(async () => {
      controller.abort();
      return false;
    });

    await expect(
      index.createRedaction({
        text: "mail user@example.com",
        signal: controller.signal,
      })
    ).resolves.toBeNull();
  });

  test("maps page engine status including errors", () => {
    const { index, engine } = loadModules();

    engine.getEngineStatus.mockReturnValue({ state: "idle" });
    expect(index.getRedactionStatus()).toEqual({
      enabled: false,
      state: "idle",
    });

    engine.getEngineStatus.mockReturnValue({
      state: "error",
      error: "model download failed",
    });
    expect(index.getRedactionStatus()).toEqual({
      enabled: false,
      state: "error",
      error: "model download failed",
    });

    engine.getEngineStatus.mockReturnValue({ state: "unavailable" });
    expect(index.getRedactionStatus()).toEqual({
      enabled: false,
      state: "unavailable",
    });
  });
});

describe("remote host first (security first)", () => {
  test("uses the remote host and does not start the page engine", async () => {
    const { index, client, engine } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockResolvedValue({
      maskedText: "Please contact [EMAIL]",
      maskMeta: createMaskMeta(),
    });
    client.remoteRestore.mockResolvedValue("Please contact user@example.com");

    const redaction = await index.createRedaction({
      text: "请联系 user@example.com",
    });

    expect(client.remoteMask).toHaveBeenCalledWith("请联系 user@example.com");
    expect(engine.ensureEngine).not.toHaveBeenCalled();
    expect(redaction.maskedText).toBe("Please contact [EMAIL]");
    await expect(redaction.restore("Please contact [EMAIL]")).resolves.toBe(
      "Please contact user@example.com"
    );
    expect(index.getRedactionStatus()).toEqual({
      enabled: true,
      state: "idle",
    });
  });

  test("falls back to the translated text when remote restore fails", async () => {
    const { index, client, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockResolvedValue({
      maskedText: "masked text",
      maskMeta: createMaskMeta(),
    });
    client.remoteRestore.mockRejectedValue(new Error("restore rpc failed"));

    const redaction = await index.createRedaction({
      text: "mail user@example.com",
    });
    await expect(redaction.restore("译文 [EMAIL]")).resolves.toBe(
      "译文 [EMAIL]"
    );
    expect(log.warn).toHaveBeenCalledWith(
      "remote restoreText failed; falling back to translated text:",
      "restore rpc failed"
    );
  });

  test("returns null when the remote host replaced nothing", async () => {
    const { index, client, engine } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockResolvedValue({
      maskedText: "same text",
      maskMeta: createMaskMeta(),
    });

    await expect(
      index.createRedaction({ text: "same text" })
    ).resolves.toBeNull();
    expect(engine.ensureEngine).not.toHaveBeenCalled();
  });

  test("blocks translation with AIFW_NOT_READY but does not cool down", async () => {
    const { index, client, engine, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockRejectedValue(
      createAifwError(AIFW_ERROR_NOT_READY, "engine not ready")
    );
    const notifier = jest.fn();
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "first user@example.com" })
    ).rejects.toMatchObject({
      code: AIFW_ERROR_NOT_READY,
      message: NOT_READY_ERROR_MESSAGE,
    });
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith(NOT_READY_MESSAGE);
    expect(log.warn).toHaveBeenCalledWith(
      "aifw engine not ready; pausing translation:",
      "engine not ready"
    );
    expect(engine.ensureEngine).not.toHaveBeenCalled();

    // 未就绪不设冷却：模型就绪后下一次请求立即恢复。
    client.remoteMask.mockResolvedValue({
      maskedText: "masked text",
      maskMeta: createMaskMeta(),
    });
    await expect(
      index.createRedaction({ text: "second user@example.com" })
    ).resolves.toMatchObject({ maskedText: "masked text" });
    expect(client.remoteMask).toHaveBeenCalledTimes(2);
    // 提示文案仍然只出现一次（60s 节流）。
    expect(notifier).toHaveBeenCalledTimes(1);
  });

  test("notifies AIFW_NOT_READY at most once per 60s", async () => {
    const { index, client } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockRejectedValue(
      createAifwError(AIFW_ERROR_NOT_READY, "engine not ready")
    );
    const notifier = jest.fn();
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "first user@example.com" })
    ).rejects.toMatchObject({ code: AIFW_ERROR_NOT_READY });
    await expect(
      index.createRedaction({ text: "second user@example.com" })
    ).rejects.toMatchObject({ code: AIFW_ERROR_NOT_READY });

    expect(client.remoteMask).toHaveBeenCalledTimes(2);
    expect(notifier).toHaveBeenCalledTimes(1);
  });

  test("blocks translation with AIFW_HOST_UNAVAILABLE and cools down", async () => {
    const { index, client, engine, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockRejectedValue(new Error("no offscreen host"));
    const notifier = jest.fn();
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "first user@example.com" })
    ).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
      message: UNAVAILABLE_ERROR_MESSAGE,
    });
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith(UNAVAILABLE_MESSAGE);
    expect(log.warn).toHaveBeenCalledWith(
      "aifw host unavailable; blocking translation:",
      "no offscreen host"
    );
    expect(engine.ensureEngine).not.toHaveBeenCalled();

    // 冷却期内直接阻断：不再请求宿主、不再提示/日志。
    await expect(
      index.createRedaction({ text: "second user@example.com" })
    ).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
      message: UNAVAILABLE_ERROR_MESSAGE,
    });
    expect(client.remoteMask).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(
      countWarns(log, "aifw host unavailable; blocking translation:")
    ).toBe(1);
  });

  test("retries the remote host after the cooldown expires", async () => {
    jest.useFakeTimers();
    const { index, client } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockRejectedValueOnce(new Error("no offscreen host"));
    client.remoteMask.mockResolvedValue({
      maskedText: "remote masked",
      maskMeta: createMaskMeta(),
    });
    const notifier = jest.fn();
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "first user@example.com" })
    ).rejects.toMatchObject({ code: AIFW_ERROR_HOST_UNAVAILABLE });
    // 冷却期内不请求宿主。
    await expect(
      index.createRedaction({ text: "second user@example.com" })
    ).rejects.toMatchObject({ code: AIFW_ERROR_HOST_UNAVAILABLE });
    expect(client.remoteMask).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60001);
    const redaction = await index.createRedaction({
      text: "third user@example.com",
    });
    expect(client.remoteMask).toHaveBeenCalledTimes(2);
    expect(redaction.maskedText).toBe("remote masked");
  });

  test("does not throw when no notifier is registered", async () => {
    const { index, client } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockRejectedValue(new Error("no offscreen host"));

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).rejects.toMatchObject({ code: AIFW_ERROR_HOST_UNAVAILABLE });
  });

  test("swallows notifier exceptions", async () => {
    const { index, client, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteMask.mockRejectedValue(new Error("no offscreen host"));
    const notifier = jest.fn(() => {
      throw new Error("banner failed");
    });
    index.setRedactionNotifier(notifier);

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).rejects.toMatchObject({ code: AIFW_ERROR_HOST_UNAVAILABLE });
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(log.debug).toHaveBeenCalledWith(
      "aifw notifier failed:",
      "banner failed"
    );
  });
});

describe("non-extension environments", () => {
  test("does not use the page engine outside web builds", async () => {
    const { index, client, engine, env } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(false);
    env.isWeb = false;

    await expect(
      index.createRedaction({ text: "mail user@example.com" })
    ).resolves.toBeNull();
    expect(engine.ensureEngine).not.toHaveBeenCalled();
    expect(engine.maskOnEngine).not.toHaveBeenCalled();
  });
});

describe("requestModelReset", () => {
  test("resets through the remote host and reports delivery", async () => {
    const { index, client, storage } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteReset.mockResolvedValue({ cleared: 2 });

    await expect(index.requestModelReset()).resolves.toEqual({
      tabs: 1,
      delivered: 1,
    });
    expect(client.remoteReset).toHaveBeenCalledWith({ redownload: true });
    expect(storage.getSettingWithDefault).toHaveBeenCalledTimes(1);
  });

  test("does not redownload when privacyMask is disabled", async () => {
    const { index, client } = loadModules({ privacyMask: false });
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteReset.mockResolvedValue({ cleared: 1 });

    await index.requestModelReset();
    expect(client.remoteReset).toHaveBeenCalledWith({ redownload: false });
  });

  test("reports host unavailability when the reset RPC fails", async () => {
    const { index, client, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteReset.mockRejectedValue(new Error("host gone"));

    await expect(index.requestModelReset()).resolves.toEqual({
      tabs: 0,
      delivered: 0,
    });
    expect(log.debug).toHaveBeenCalledWith(
      "remote aifw reset failed:",
      "host gone"
    );
  });

  test("returns zeros without remote host support", async () => {
    const { index, client } = loadModules();

    await expect(index.requestModelReset()).resolves.toEqual({
      tabs: 0,
      delivered: 0,
    });
    expect(client.remoteReset).not.toHaveBeenCalled();
  });
});

describe("requestModelRetry", () => {
  test("retries through the remote host and reports delivery", async () => {
    const { index, client, storage } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteRetry.mockResolvedValue({ ok: true });

    await expect(index.requestModelRetry()).resolves.toEqual({
      tabs: 1,
      delivered: 1,
    });
    expect(client.remoteRetry).toHaveBeenCalledWith({ redownload: true });
    expect(storage.getSettingWithDefault).toHaveBeenCalledTimes(1);
  });

  test("does not request a redownload when privacyMask is disabled", async () => {
    const { index, client } = loadModules({ privacyMask: false });
    client.isRemoteHostSupported.mockReturnValue(true);

    await index.requestModelRetry();
    expect(client.remoteRetry).toHaveBeenCalledWith({ redownload: false });
  });

  test("reports host unavailability when the retry RPC fails", async () => {
    const { index, client, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteRetry.mockRejectedValue(new Error("host gone"));

    await expect(index.requestModelRetry()).resolves.toEqual({
      tabs: 0,
      delivered: 0,
    });
    expect(log.debug).toHaveBeenCalledWith(
      "remote aifw retry failed:",
      "host gone"
    );
  });

  test("returns zeros without remote host support", async () => {
    const { index, client } = loadModules();

    await expect(index.requestModelRetry()).resolves.toEqual({
      tabs: 0,
      delivered: 0,
    });
    expect(client.remoteRetry).not.toHaveBeenCalled();
  });
});

describe("resetAifwModel", () => {
  test("prefers the remote host", async () => {
    const { index, client, engine } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteReset.mockResolvedValue({ cleared: 3 });

    await expect(index.resetAifwModel()).resolves.toEqual({ cleared: 3 });
    expect(client.remoteReset).toHaveBeenCalledWith({ redownload: true });
    expect(engine.resetEngine).not.toHaveBeenCalled();
  });

  test("returns cleared 0 without local fallback when the remote reset fails", async () => {
    const { index, client, engine, log } = loadModules();
    client.isRemoteHostSupported.mockReturnValue(true);
    client.remoteReset.mockRejectedValue(new Error("host gone"));

    await expect(index.resetAifwModel({ redownload: false })).resolves.toEqual({
      cleared: 0,
    });
    expect(engine.resetEngine).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      "remote aifw reset failed:",
      "host gone"
    );
  });

  test("uses the page engine in web builds", async () => {
    const { index, engine } = loadModules();

    await index.resetAifwModel();
    expect(engine.resetEngine).toHaveBeenCalledWith({ redownload: true });
  });

  test("returns cleared 0 outside web builds without a remote host", async () => {
    const { index, engine, env } = loadModules();
    env.isWeb = false;

    await expect(index.resetAifwModel()).resolves.toEqual({ cleared: 0 });
    expect(engine.resetEngine).not.toHaveBeenCalled();
  });
});

describe("exports", () => {
  test("keeps the public API and drops the page-side reset watcher", () => {
    const { index } = loadModules();

    expect(typeof index.createRedaction).toBe("function");
    expect(typeof index.getRedactionStatus).toBe("function");
    expect(typeof index.requestModelReset).toBe("function");
    expect(typeof index.requestModelRetry).toBe("function");
    expect(typeof index.resetAifwModel).toBe("function");
    expect(typeof index.setRedactionNotifier).toBe("function");
    expect(typeof index.readModelStatus).toBe("function");
    expect(typeof index.subscribeModelStatus).toBe("function");
    expect(index.watchAifwModelReset).toBeUndefined();
  });
});
