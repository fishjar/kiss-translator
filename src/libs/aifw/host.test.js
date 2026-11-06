jest.mock("../browser", () => ({
  browser: {
    runtime: {
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    },
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

jest.mock("./engine", () => ({
  configureEngine: jest.fn(),
  ensureEngine: jest.fn(),
  getEngineStatus: jest.fn(),
  maskOnEngine: jest.fn(),
  resetEngine: jest.fn(),
  restoreOnEngine: jest.fn(),
  retryEngine: jest.fn(),
  warmupEngine: jest.fn(),
}));

import {
  AIFW_ERROR_MASK_FAILED,
  AIFW_ERROR_NOT_READY,
  AIFW_HOST_RPC,
  decodeMaskMeta,
  encodeMaskMeta,
} from "./protocol";

const loadHost = () => {
  jest.resetModules();
  const browserModule = require("../browser");
  const logModule = require("../log");
  const engine = require("./engine");
  const host = require("./host");

  engine.configureEngine.mockReset();
  engine.warmupEngine.mockReset();
  engine.ensureEngine.mockReset().mockResolvedValue(true);
  engine.getEngineStatus.mockReset().mockReturnValue({ state: "ready" });
  engine.maskOnEngine.mockReset().mockResolvedValue({
    maskedText: "masked text",
    maskMeta: new Uint8Array([1, 2, 3]),
  });
  engine.resetEngine.mockReset().mockResolvedValue({ cleared: 2 });
  engine.retryEngine.mockReset().mockResolvedValue({ retried: true });
  engine.restoreOnEngine
    .mockReset()
    .mockImplementation(async (text) => `restored:${text}`);

  return {
    host,
    engine,
    browser: browserModule.browser,
    log: logModule.logger,
  };
};

describe("handleHostRequest", () => {
  test("handles ensure by configuring the host and warming up", async () => {
    const { host, engine } = loadHost();

    await expect(
      host.handleHostRequest({ type: AIFW_HOST_RPC, method: "ensure" })
    ).resolves.toEqual({ ok: true, status: { state: "ready" } });

    expect(engine.configureEngine).toHaveBeenCalledWith({ context: "host" });
    expect(engine.warmupEngine).toHaveBeenCalledTimes(1);
  });

  test("handles status", async () => {
    const { host, engine } = loadHost();
    engine.getEngineStatus.mockReturnValue({ state: "error", error: "boom" });

    await expect(
      host.handleHostRequest({ type: AIFW_HOST_RPC, method: "status" })
    ).resolves.toEqual({ ok: true, status: { state: "error", error: "boom" } });
  });

  test("masks and serializes maskMeta as base64", async () => {
    const { host, engine } = loadHost();

    const response = await host.handleHostRequest({
      type: AIFW_HOST_RPC,
      method: "mask",
      text: "mail user@example.com",
    });

    expect(engine.ensureEngine).toHaveBeenCalledTimes(1);
    expect(engine.maskOnEngine).toHaveBeenCalledWith(
      "mail user@example.com",
      "auto"
    );
    expect(response).toEqual({
      ok: true,
      maskedText: "masked text",
      maskMeta: encodeMaskMeta(new Uint8Array([1, 2, 3])),
    });
    expect(typeof response.maskMeta).toBe("string");
    expect(Array.from(decodeMaskMeta(response.maskMeta))).toEqual([1, 2, 3]);
  });

  test("returns AIFW_NOT_READY when the engine is not ready", async () => {
    const { host, engine } = loadHost();
    engine.ensureEngine.mockResolvedValue(false);

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "mask",
        text: "mail user@example.com",
      })
    ).resolves.toEqual({
      ok: false,
      code: AIFW_ERROR_NOT_READY,
      error: "engine not ready",
    });
    expect(engine.maskOnEngine).not.toHaveBeenCalled();
  });

  test("returns AIFW_MASK_FAILED when masking fails", async () => {
    const { host, engine } = loadHost();
    engine.ensureEngine.mockResolvedValue(true);
    engine.maskOnEngine.mockResolvedValue(null);

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "mask",
        text: "text",
      })
    ).resolves.toEqual({
      ok: false,
      code: AIFW_ERROR_MASK_FAILED,
      error: "mask failed",
    });
  });

  test("treats empty text as a successful no-op", async () => {
    const { host, engine } = loadHost();

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "mask",
        text: "   ",
      })
    ).resolves.toEqual({ ok: true, maskedText: "   ", maskMeta: null });
    expect(engine.ensureEngine).not.toHaveBeenCalled();
  });

  test("handles retry by aborting and restarting the engine", async () => {
    const { host, engine } = loadHost();

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "retry",
        redownload: true,
      })
    ).resolves.toEqual({ ok: true });
    expect(engine.retryEngine).toHaveBeenCalledWith({ redownload: true });

    await expect(
      host.handleHostRequest({ type: AIFW_HOST_RPC, method: "retry" })
    ).resolves.toEqual({ ok: true });
    expect(engine.retryEngine).toHaveBeenLastCalledWith({ redownload: false });
  });

  test("decodes maskMeta and restores text", async () => {
    const { host, engine } = loadHost();
    const maskMeta = encodeMaskMeta(new Uint8Array([7, 8]));

    const response = await host.handleHostRequest({
      type: AIFW_HOST_RPC,
      method: "restore",
      text: "译文",
      maskMeta,
    });

    expect(response).toEqual({ ok: true, text: "restored:译文" });
    const [, decoded] = engine.restoreOnEngine.mock.calls[0];
    expect(Array.from(decoded)).toEqual([7, 8]);
  });

  test("rejects invalid maskMeta on restore", async () => {
    const { host } = loadHost();

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "restore",
        text: "译文",
        maskMeta: null,
      })
    ).resolves.toEqual({ ok: false, error: "invalid aifw maskMeta" });
  });

  test("resets the engine with the requested redownload flag", async () => {
    const { host, engine } = loadHost();

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "reset",
        redownload: false,
      })
    ).resolves.toEqual({ ok: true, cleared: 2 });
    expect(engine.resetEngine).toHaveBeenCalledWith({ redownload: false });

    await host.handleHostRequest({ type: AIFW_HOST_RPC, method: "reset" });
    expect(engine.resetEngine).toHaveBeenLastCalledWith({ redownload: true });
  });

  test("reports unknown methods and invalid messages", async () => {
    const { host } = loadHost();

    const unknown = await host.handleHostRequest({
      type: AIFW_HOST_RPC,
      method: "bogus",
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("unknown aifw method");

    await expect(host.handleHostRequest(null)).resolves.toEqual({
      ok: false,
      error: "invalid aifw request",
    });
  });

  test("converts thrown errors into ok:false responses and warns for mask", async () => {
    const { host, engine, log } = loadHost();
    engine.ensureEngine.mockRejectedValue(new Error("engine crashed"));

    await expect(
      host.handleHostRequest({
        type: AIFW_HOST_RPC,
        method: "mask",
        text: "text",
      })
    ).resolves.toEqual({
      ok: false,
      code: AIFW_ERROR_MASK_FAILED,
      error: "engine crashed",
    });
    // 真实失败原因必须能在控制台看到（method + code + error）。
    expect(log.warn).toHaveBeenCalledWith(
      "aifw host mask failed:",
      { method: "mask", code: AIFW_ERROR_MASK_FAILED },
      "engine crashed"
    );
  });

  test("keeps non-mask failures at debug level", async () => {
    const { host, engine, log } = loadHost();
    engine.getEngineStatus.mockImplementation(() => {
      throw new Error("status boom");
    });

    await expect(
      host.handleHostRequest({ type: AIFW_HOST_RPC, method: "status" })
    ).resolves.toEqual({ ok: false, error: "status boom" });
    expect(log.debug).toHaveBeenCalledWith(
      "aifw host request failed:",
      "status boom"
    );
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("installAifwHostListener", () => {
  test("registers once and only handles AIFW_HOST_RPC", async () => {
    const { host, engine, browser } = loadHost();

    expect(host.installAifwHostListener()).toBe(true);
    expect(host.installAifwHostListener()).toBe(true);
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);

    const handler = browser.runtime.onMessage.addListener.mock.calls[0][0];
    expect(handler({ type: "OTHER_MESSAGE", method: "mask" })).toBeUndefined();
    expect(engine.ensureEngine).not.toHaveBeenCalled();

    await expect(
      handler({ type: AIFW_HOST_RPC, method: "status" })
    ).resolves.toEqual({ ok: true, status: { state: "ready" } });
  });

  test("returns false without runtime messaging", () => {
    const { host, browser } = loadHost();
    browser.runtime = {};
    expect(host.installAifwHostListener()).toBe(false);
  });
});
