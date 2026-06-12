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
    utils.genEventName.mockReturnValue("pong-adapt");
    mockFetchGM.mockReset();
  });

  afterEach(() => {
    delete globalThis.GM;
    delete window.KISS_GM;
    delete window.GM_info;
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
});
