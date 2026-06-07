jest.mock("./client", () => ({
  isExt: false,
  isGm: false,
}));

jest.mock("./storage", () => ({
  getSettingWithDefault: jest.fn(() => Promise.resolve({ httpTimeout: 1000 })),
}));

jest.mock("../config", () => ({
  DEFAULT_HTTP_TIMEOUT: 1000,
  MSG_FETCH: "kiss_fetch",
}));

jest.mock("./log", () => ({
  kissLog: jest.fn(),
}));

import { fetchPatcher } from "./request";

describe("fetchPatcher", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("passes external abort signal to native fetch", async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );

    await fetchPatcher("https://example.test", {}, { signal: controller.signal });

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
});
