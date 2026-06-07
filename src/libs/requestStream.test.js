jest.mock("webextension-polyfill", () => ({
  runtime: {
    connect: jest.fn(),
  },
}));

jest.mock("./client", () => ({
  isExt: false,
  isGm: false,
}));

jest.mock("./browser", () => ({
  isBg: () => false,
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("./storage", () => ({
  getSettingWithDefault: jest.fn(() => Promise.resolve({ httpTimeout: 1000 })),
}));

import { fetchStreamNative } from "./requestStream";

describe("fetchStreamNative", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("cancels the reader when stream consumption stops early", async () => {
    global.TextDecoder = class {
      decode() {
        return "data: one\n\n";
      }
    };
    const cancel = jest.fn(() => Promise.resolve());
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([100, 97, 116, 97, 58, 32, 111, 110, 101, 10, 10]),
        })
        .mockResolvedValue(new Promise(() => {})),
      cancel,
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        body: { getReader: () => reader },
      })
    );

    const iterator = fetchStreamNative("https://example.test", {}, 1000);
    await expect(iterator.next()).resolves.toEqual({
      value: "one",
      done: false,
    });
    await iterator.return();

    expect(cancel).toHaveBeenCalled();
  });
});
