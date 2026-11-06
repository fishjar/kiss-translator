jest.mock("../browser", () => ({
  browser: { runtime: { sendMessage: jest.fn() } },
}));

jest.mock("../client", () => ({ isExt: true }));

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
  AIFW_ENSURE_TIMEOUT_MS,
  AIFW_ERROR_HOST_UNAVAILABLE,
  AIFW_ERROR_MASK_FAILED,
  AIFW_ERROR_NOT_READY,
  AIFW_RPC_TIMEOUT_MS,
  decodeMaskMeta,
  encodeMaskMeta,
} from "./protocol";

const maskMetaBytes = new Uint8Array([1, 2, 3]);

const flushMicrotasks = async (ticks = 10) => {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
};

const loadClient = () => {
  jest.resetModules();
  const browserModule = require("../browser");
  const env = require("../client");
  const client = require("./client");
  env.isExt = true;
  browserModule.browser.runtime.sendMessage.mockReset();
  return { client, env, browser: browserModule.browser };
};

afterEach(() => {
  jest.useRealTimers();
});

describe("isRemoteHostSupported", () => {
  test("requires an extension environment with runtime messaging", () => {
    const { client, env, browser } = loadClient();
    expect(client.isRemoteHostSupported()).toBe(true);

    env.isExt = false;
    expect(client.isRemoteHostSupported()).toBe(false);

    env.isExt = true;
    browser.runtime.sendMessage = undefined;
    expect(client.isRemoteHostSupported()).toBe(false);
  });
});

describe("ensureRemoteHost", () => {
  test("sends the handshake once and caches the success", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage.mockResolvedValue({ ok: true });

    await expect(client.ensureRemoteHost()).resolves.toBe(true);
    await expect(client.ensureRemoteHost()).resolves.toBe(true);

    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "AIFW_RPC",
      method: "ensure",
    });
  });

  test("clears the cached handshake after a failure so it can retry", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage.mockRejectedValueOnce(
      new Error("no receiving end")
    );

    await expect(client.ensureRemoteHost()).rejects.toThrow("no receiving end");

    browser.runtime.sendMessage.mockResolvedValue({ ok: true });
    await expect(client.ensureRemoteHost()).resolves.toBe(true);
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("rejects when the host is not supported", async () => {
    const { client, env } = loadClient();
    env.isExt = false;
    await expect(client.ensureRemoteHost()).rejects.toThrow(
      "aifw remote host is not supported"
    );
  });
});

describe("remoteMask", () => {
  const mockHandshakeAnd = (browser, response) => {
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(response);
  };

  test("serializes the request and decodes the base64 maskMeta", async () => {
    const { client, browser } = loadClient();
    mockHandshakeAnd(browser, {
      ok: true,
      maskedText: "masked text",
      maskMeta: encodeMaskMeta(maskMetaBytes),
    });

    const result = await client.remoteMask("联系我 user@example.com");

    expect(result.maskedText).toBe("masked text");
    expect(Array.from(result.maskMeta)).toEqual([1, 2, 3]);
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: "AIFW_RPC",
      method: "mask",
      text: "联系我 user@example.com",
      lang: "auto",
    });
  });

  test("throws AIFW_NOT_READY when the host engine is not ready", async () => {
    const { client, browser } = loadClient();
    mockHandshakeAnd(browser, {
      ok: false,
      code: "AIFW_NOT_READY",
      error: "engine not ready",
    });

    await expect(client.remoteMask("text")).rejects.toMatchObject({
      code: AIFW_ERROR_NOT_READY,
      message: "engine not ready",
    });
  });

  test("throws AIFW_MASK_FAILED when the host mask fails", async () => {
    const { client, browser } = loadClient();
    mockHandshakeAnd(browser, {
      ok: false,
      code: "AIFW_MASK_FAILED",
      error: "mask failed",
    });

    await expect(client.remoteMask("text")).rejects.toMatchObject({
      code: AIFW_ERROR_MASK_FAILED,
      message: "mask failed",
    });
  });

  test("throws AIFW_MASK_FAILED for an invalid mask result", async () => {
    const { client, browser } = loadClient();
    mockHandshakeAnd(browser, { ok: true, maskedText: null });

    await expect(client.remoteMask("text")).rejects.toMatchObject({
      code: AIFW_ERROR_MASK_FAILED,
    });
  });

  test("maps uncoded host failures to AIFW_HOST_UNAVAILABLE", async () => {
    const { client, browser } = loadClient();
    mockHandshakeAnd(browser, { ok: false, error: "boom" });

    await expect(client.remoteMask("text")).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
      message: "boom",
    });
  });

  test("maps connection errors to AIFW_HOST_UNAVAILABLE", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("Receiving end does not exist"));

    await expect(client.remoteMask("text")).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
    });
  });

  test("times out after AIFW_RPC_TIMEOUT_MS with AIFW_HOST_UNAVAILABLE", async () => {
    jest.useFakeTimers();
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockReturnValueOnce(new Promise(() => {}));

    const pending = client.remoteMask("text");
    const expectation = expect(pending).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
    });
    await flushMicrotasks();
    jest.advanceTimersByTime(AIFW_RPC_TIMEOUT_MS);
    await expectation;
  });
});

describe("remoteRestore", () => {
  test("encodes maskMeta as base64 and returns the restored text", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, text: "restored text" });

    await expect(
      client.remoteRestore("译文 [EMAIL]", maskMetaBytes)
    ).resolves.toBe("restored text");

    const payload = browser.runtime.sendMessage.mock.calls.at(-1)[0];
    expect(payload).toEqual({
      type: "AIFW_RPC",
      method: "restore",
      text: "译文 [EMAIL]",
      maskMeta: encodeMaskMeta(maskMetaBytes),
    });
    expect(typeof payload.maskMeta).toBe("string");
    expect(Array.from(decodeMaskMeta(payload.maskMeta))).toEqual([1, 2, 3]);
  });

  test("rejects invalid restore responses", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, text: 123 });

    await expect(client.remoteRestore("译文", maskMetaBytes)).rejects.toThrow(
      "invalid text"
    );
  });
});

describe("remoteRetry", () => {
  test("sends the retry request with the redownload flag", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await expect(client.remoteRetry({ redownload: false })).resolves.toEqual({
      ok: true,
    });
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: "AIFW_RPC",
      method: "retry",
      redownload: false,
    });
  });

  test("maps retry failures to AIFW_HOST_UNAVAILABLE", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("host gone"));

    await expect(client.remoteRetry()).rejects.toMatchObject({
      code: AIFW_ERROR_HOST_UNAVAILABLE,
    });
  });
});

describe("remoteReset / remoteStatus", () => {
  test("sends the reset request with the redownload flag", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, cleared: 2 });

    await expect(client.remoteReset({ redownload: false })).resolves.toEqual({
      cleared: 2,
    });
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: "AIFW_RPC",
      method: "reset",
      redownload: false,
    });
  });

  test("returns the host engine status", async () => {
    const { client, browser } = loadClient();
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, status: { state: "ready" } });

    await expect(client.remoteStatus()).resolves.toEqual({ state: "ready" });
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: "AIFW_RPC",
      method: "status",
    });
  });

  test("ensure handshake timeout uses AIFW_ENSURE_TIMEOUT_MS", async () => {
    jest.useFakeTimers();
    const { client, browser } = loadClient();
    browser.runtime.sendMessage.mockReturnValue(new Promise(() => {}));

    const pending = client.ensureRemoteHost();
    const expectation = expect(pending).rejects.toThrow("timed out");
    await flushMicrotasks();
    jest.advanceTimersByTime(AIFW_ENSURE_TIMEOUT_MS);
    await expectation;
  });
});
