const mockFetchGM = jest.fn();

jest.mock("./fetch", () => ({
  fetchGM: (...args) => mockFetchGM(...args),
}));

const utils = require("./utils");
jest.spyOn(utils, "genEventName").mockReturnValue("pong-adapt");
const { adaptScript, handlePing } = require("./gm");

describe("gm userscript bridge", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    delete window.KISS_GM;
    delete window.GM_info;
    delete globalThis.GM_setValue;
    delete globalThis.GM_getValue;
    delete globalThis.GM_deleteValue;
    utils.genEventName.mockReturnValue("pong-adapt");
    mockFetchGM.mockReset();
  });

  afterEach(() => {
    delete globalThis.GM;
    delete window.KISS_GM;
    delete window.GM_info;
    delete globalThis.GM_setValue;
    delete globalThis.GM_getValue;
    delete globalThis.GM_deleteValue;
  });

  test("adaptScript exposes xmlHttpRequest through CustomEvent bridge", () => {
    const bridgeEvents = [];
    const onload = jest.fn();
    window.addEventListener("kiss-ping", (event) => {
      bridgeEvents.push(event.detail);
    });

    adaptScript("kiss-ping");
    const handle = window.KISS_GM.xmlHttpRequest({
      method: "GET",
      url: "https://example.test/stream",
      onload,
    });

    expect(typeof window.KISS_GM.xmlHttpRequest).toBe("function");
    expect(typeof handle.abort).toBe("function");
    expect(bridgeEvents[0]).toMatchObject({
      action: "xmlHttpRequest",
      args: {
        details: {
          method: "GET",
          url: "https://example.test/stream",
        },
      },
      pong: "pong-adapt",
    });
    expect(bridgeEvents[0].args.details.onload).toBeUndefined();

    window.dispatchEvent(
      new CustomEvent("pong-adapt", {
        detail: { callback: "onload", data: { status: 200 } },
      })
    );

    expect(onload).toHaveBeenCalledWith({ status: 200 });

    const onabort = jest.fn();
    utils.genEventName.mockReturnValueOnce("pong-abort-adapt");
    const abortHandle = window.KISS_GM.xmlHttpRequest({
      method: "GET",
      url: "https://example.test/abort",
      onabort,
    });

    expect(bridgeEvents[1]).toMatchObject({
      action: "xmlHttpRequest",
      args: {
        details: {
          method: "GET",
          url: "https://example.test/abort",
        },
      },
      pong: "pong-abort-adapt",
    });

    abortHandle.abort();

    expect(bridgeEvents[2]).toMatchObject({
      action: "xmlHttpRequestAbort",
      args: { requestId: "pong-abort-adapt" },
    });

    window.dispatchEvent(
      new CustomEvent("pong-abort-adapt", {
        detail: { callback: "onabort", data: { type: "abort" } },
      })
    );

    expect(onabort).toHaveBeenCalledWith({ type: "abort" });
  });

  test("handlePing keeps fetch-shaped xmlHttpRequest requests on fetchGM", async () => {
    mockFetchGM.mockResolvedValue({
      body: "ok",
      headers: {},
      status: 200,
      statusText: "OK",
    });
    const pong = jest.fn();
    window.addEventListener("pong-fetch", pong);

    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "xmlHttpRequest",
          args: {
            input: "https://example.test/data",
            init: { method: "POST" },
          },
          pong: "pong-fetch",
        },
      })
    );

    expect(mockFetchGM).toHaveBeenCalledWith("https://example.test/data", {
      method: "POST",
    });
    expect(pong).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          data: {
            body: "ok",
            headers: {},
            status: 200,
            statusText: "OK",
          },
        },
      })
    );
  });

  test("handlePing ignores missing detail without throwing", async () => {
    await expect(handlePing(new CustomEvent("kiss-ping"))).resolves.toBe(
      undefined
    );
    await expect(handlePing({})).resolves.toBe(undefined);
  });

  test("handlePing forwards native GM xmlHttpRequest callbacks and aborts", async () => {
    const abort = jest.fn();
    let xhrDetails;
    globalThis.GM = {
      xmlHttpRequest: jest.fn((details) => {
        xhrDetails = details;
        return { abort };
      }),
    };
    const pong = jest.fn();
    window.addEventListener("pong-xhr", pong);

    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "xmlHttpRequest",
          args: {
            details: {
              method: "GET",
              url: "https://example.test/events",
              responseType: "stream",
            },
          },
          pong: "pong-xhr",
        },
      })
    );

    expect(globalThis.GM.xmlHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://example.test/events",
        responseType: "stream",
      })
    );

    xhrDetails.onloadstart({ response: "reader" });
    xhrDetails.onload({ status: 200 });

    expect(pong).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          callback: "onloadstart",
          data: { response: "reader" },
        },
      })
    );
    expect(pong).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          callback: "onload",
          data: { status: 200 },
        },
      })
    );

    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "xmlHttpRequest",
          args: {
            details: {
              method: "GET",
              url: "https://example.test/abort",
            },
          },
          pong: "pong-abort",
        },
      })
    );
    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "xmlHttpRequestAbort",
          args: { requestId: "pong-abort" },
        },
      })
    );

    expect(abort).toHaveBeenCalledTimes(1);
  });

  test("handlePing forwards native GM storage APIs before legacy fallback", async () => {
    const stored = new Map();
    globalThis.GM = {
      setValue: jest.fn(async (key, value) => stored.set(key, value)),
      getValue: jest.fn(async (key) => stored.get(key)),
      deleteValue: jest.fn(async (key) => stored.delete(key)),
    };
    globalThis.GM_setValue = jest.fn();
    globalThis.GM_getValue = jest.fn();
    globalThis.GM_deleteValue = jest.fn();
    const setPong = jest.fn();
    const getPong = jest.fn();
    const deletePong = jest.fn();
    window.addEventListener("pong-native-set", setPong);
    window.addEventListener("pong-native-get", getPong);
    window.addEventListener("pong-native-delete", deletePong);

    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "setValue",
          args: { key: "native-key", val: "native-value" },
          pong: "pong-native-set",
        },
      })
    );
    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "getValue",
          args: { key: "native-key" },
          pong: "pong-native-get",
        },
      })
    );
    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "deleteValue",
          args: { key: "native-key" },
          pong: "pong-native-delete",
        },
      })
    );

    expect(globalThis.GM.setValue).toHaveBeenCalledWith(
      "native-key",
      "native-value"
    );
    expect(globalThis.GM.getValue).toHaveBeenCalledWith("native-key");
    expect(globalThis.GM.deleteValue).toHaveBeenCalledWith("native-key");
    expect(globalThis.GM_setValue).not.toHaveBeenCalled();
    expect(globalThis.GM_getValue).not.toHaveBeenCalled();
    expect(globalThis.GM_deleteValue).not.toHaveBeenCalled();
    expect(setPong).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { data: "native-value" } })
    );
    expect(getPong).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { data: "native-value" } })
    );
    expect(deletePong).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { data: "ok" } })
    );
    expect(stored.has("native-key")).toBe(false);
  });

  test("handlePing falls back to legacy GM storage APIs", async () => {
    globalThis.GM = {};
    globalThis.GM_setValue = jest.fn(async () => {});
    globalThis.GM_getValue = jest.fn(async (key) => `stored:${key}`);
    globalThis.GM_deleteValue = jest.fn(async () => {});
    const setPong = jest.fn();
    const getPong = jest.fn();
    const deletePong = jest.fn();
    window.addEventListener("pong-set", setPong);
    window.addEventListener("pong-get", getPong);
    window.addEventListener("pong-delete", deletePong);

    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "setValue",
          args: { key: "ios-key", val: "ios-value" },
          pong: "pong-set",
        },
      })
    );
    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "getValue",
          args: { key: "ios-key" },
          pong: "pong-get",
        },
      })
    );
    await handlePing(
      new CustomEvent("kiss-ping", {
        detail: {
          action: "deleteValue",
          args: { key: "ios-key" },
          pong: "pong-delete",
        },
      })
    );

    expect(globalThis.GM_setValue).toHaveBeenCalledWith("ios-key", "ios-value");
    expect(globalThis.GM_getValue).toHaveBeenCalledWith("ios-key");
    expect(globalThis.GM_deleteValue).toHaveBeenCalledWith("ios-key");
    expect(setPong).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { data: "ios-value" } })
    );
    expect(getPong).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { data: "stored:ios-key" } })
    );
    expect(deletePong).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { data: "ok" } })
    );
  });
});
