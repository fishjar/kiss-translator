jest.mock("./storage", () => ({
  getSettingWithDefault: jest.fn(() => Promise.resolve({ httpTimeout: 1000 })),
}));

jest.mock("../config", () => ({
  CLIENT_EXTS: [],
  CLIENT_FIREFOX: "firefox",
  CLIENT_USERSCRIPT: "userscript",
  CLIENT_WEB: "web",
  DEFAULT_HTTP_TIMEOUT: 30,
  MSG_FETCH: "kiss_fetch",
}));

jest.mock("./log", () => ({
  kissLog: jest.fn(),
}));

import { fetchGM, fetchPatcher, normalizeHttpTimeout } from "./request";

const loadRequestWithClient = (clientMock) => {
  jest.resetModules();
  jest.doMock("./client", () => clientMock);
  jest.doMock("./storage", () => ({
    getSettingWithDefault: jest.fn(() =>
      Promise.resolve({ httpTimeout: 1000 })
    ),
  }));
  jest.doMock("../config", () => ({
    CLIENT_EXTS: [],
    CLIENT_FIREFOX: "firefox",
    CLIENT_USERSCRIPT: "userscript",
    CLIENT_WEB: "web",
    DEFAULT_HTTP_TIMEOUT: 30,
    MSG_FETCH: "kiss_fetch",
  }));
  jest.doMock("./log", () => ({
    kissLog: jest.fn(),
  }));
  return require("./request");
};

const waitFor = async (condition) => {
  for (let i = 0; i < 5 && !condition(); i += 1) {
    await Promise.resolve();
  }
  expect(condition()).toBe(true);
};

describe("normalizeHttpTimeout", () => {
  test("converts second-based timeout values to milliseconds", () => {
    expect(normalizeHttpTimeout(30)).toBe(30000);
    expect(normalizeHttpTimeout(600)).toBe(600000);
  });

  test("keeps legacy millisecond timeout values unchanged", () => {
    expect(normalizeHttpTimeout(1000)).toBe(1000);
  });

  test("falls back to the default timeout in seconds", () => {
    expect(normalizeHttpTimeout()).toBe(30000);
    expect(normalizeHttpTimeout(0)).toBe(30000);
  });
});

describe("fetchPatcher", () => {
  afterEach(() => {
    delete window.KISS_GM;
    jest.restoreAllMocks();
  });

  test("passes external abort signal to native fetch", async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );

    await fetchPatcher(
      "https://example.test",
      {},
      { signal: controller.signal }
    );

    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("merged signal aborts when external signal aborts", async () => {
    const controller = new AbortController();
    let capturedSignal;
    global.fetch = jest.fn((_, init) => {
      capturedSignal = init.signal;
      return new Promise(() => {});
    });

    fetchPatcher("https://example.test", {}, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    expect(capturedSignal.aborted).toBe(true);
  });

  test("uses KISS_GM xmlHttpRequest bridge without passing signal", async () => {
    const { fetchPatcher: gmFetchPatcher } = loadRequestWithClient({
      isExt: false,
      isGm: true,
    });
    const abort = jest.fn();
    let requestDetails;
    window.KISS_GM = {
      fetch: jest.fn(),
      xmlHttpRequest: jest.fn((details) => {
        requestDetails = details;
        return { abort };
      }),
    };
    const controller = new AbortController();

    const request = gmFetchPatcher(
      "https://example.test/data",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      },
      { signal: controller.signal }
    );
    await waitFor(() => window.KISS_GM.xmlHttpRequest.mock.calls.length === 1);

    expect(window.KISS_GM.fetch).not.toHaveBeenCalled();
    expect(window.KISS_GM.xmlHttpRequest).toHaveBeenCalledTimes(1);
    expect(requestDetails).toMatchObject({
      method: "POST",
      url: "https://example.test/data",
      headers: { "content-type": "application/json" },
      data: '{"ok":true}',
      anonymous: true,
      timeout: 1000,
    });
    expect(requestDetails.signal).toBeUndefined();

    requestDetails.onload({
      response: '{"done":true}',
      responseHeaders: "x-test: yes",
      status: 201,
      statusText: "Created",
    });

    const response = await request;
    await expect(response.text()).resolves.toBe('{"done":true}');
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("x-test")).toBe("yes");
  });

  test("aborts KISS_GM xmlHttpRequest when external signal aborts", async () => {
    const { fetchPatcher: gmFetchPatcher } = loadRequestWithClient({
      isExt: false,
      isGm: true,
    });
    const abort = jest.fn();
    window.KISS_GM = {
      fetch: jest.fn(),
      xmlHttpRequest: jest.fn(() => ({ abort })),
    };
    const controller = new AbortController();

    const request = gmFetchPatcher(
      "https://example.test/data",
      {},
      { signal: controller.signal }
    );
    await waitFor(() => window.KISS_GM.xmlHttpRequest.mock.calls.length === 1);
    controller.abort();

    await expect(request).rejects.toThrow("The operation was aborted.");
    expect(abort).toHaveBeenCalledTimes(1);
    expect(window.KISS_GM.fetch).not.toHaveBeenCalled();
  });
});

describe("fetchGM", () => {
  afterEach(() => {
    delete global.GM;
    jest.restoreAllMocks();
  });

  test("accepts GM response from callback this context", async () => {
    let requestDetails;
    global.GM = {
      xmlHttpRequest: jest.fn((details) => {
        requestDetails = details;
        return { abort: jest.fn() };
      }),
    };

    const request = fetchGM("https://example.test");
    requestDetails.onload.call({
      response: '{"ok":true}',
      responseHeaders: "content-type: application/json",
      status: 200,
      statusText: "OK",
    });

    await expect(request).resolves.toEqual({
      body: '{"ok":true}',
      headers: { "content-type": "application/json" },
      status: 200,
      statusText: "OK",
    });
  });
});
