let mockIsGm = false;
const { TextDecoder: UtilTextDecoder } = require("util");
const originalTextDecoder = global.TextDecoder || UtilTextDecoder;

jest.mock("webextension-polyfill", () => ({
  runtime: {
    connect: jest.fn(),
  },
}));

jest.mock("./client", () => ({
  isExt: false,
  get isGm() {
    return mockIsGm;
  },
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

import { fetchStreamNative, requestStream } from "./requestStream";

describe("fetchStreamNative", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockIsGm = false;
    global.TextDecoder = originalTextDecoder;
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
          value: new Uint8Array([
            100, 97, 116, 97, 58, 32, 111, 110, 101, 10, 10,
          ]),
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

describe("requestStream in userscript", () => {
  let requestDetails;
  let abort;

  const waitForRequestDetails = async () => {
    for (let i = 0; i < 5 && !requestDetails; i += 1) {
      await Promise.resolve();
    }
    expect(requestDetails).toBeTruthy();
  };

  beforeEach(() => {
    mockIsGm = true;
    abort = jest.fn();
    requestDetails = null;
    global.GM = {
      xmlHttpRequest: jest.fn((details) => {
        requestDetails = details;
        return { abort };
      }),
    };
  });

  afterEach(() => {
    mockIsGm = false;
    delete global.GM;
    global.TextDecoder = originalTextDecoder;
    jest.restoreAllMocks();
  });

  test("uses readable stream response when getReader is available", async () => {
    global.TextDecoder = class {
      decode() {
        return "data: one\n\n";
      }
    };
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([100]),
        })
        .mockResolvedValueOnce({ done: true }),
    };

    const iterator = requestStream("https://example.test/stream", {});
    const first = iterator.next();
    await waitForRequestDetails();

    requestDetails.onloadstart({
      response: {
        getReader: () => reader,
      },
    });

    await expect(first).resolves.toEqual({ value: "one", done: false });
    await expect(iterator.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  test("uses onprogress responseText when readable stream is unavailable", async () => {
    const iterator = requestStream("https://example.test/stream", {});
    const first = iterator.next();
    await waitForRequestDetails();

    requestDetails.onloadstart({});
    requestDetails.onprogress({ responseText: "data: one\n\n" });

    await expect(first).resolves.toEqual({ value: "one", done: false });

    const second = iterator.next();
    requestDetails.onprogress({
      responseText: "data: one\n\ndata: two\n\n",
    });

    await expect(second).resolves.toEqual({ value: "two", done: false });

    const done = iterator.next();
    requestDetails.onload({
      responseText: "data: one\n\ndata: two\n\n",
    });

    await expect(done).resolves.toEqual({ value: undefined, done: true });
  });

  test("converts second-based timeout values before passing them to GM", async () => {
    const iterator = requestStream(
      "https://example.test/stream",
      {},
      { httpTimeout: 30 }
    );
    const first = iterator.next();
    await waitForRequestDetails();

    expect(requestDetails.timeout).toBe(30000);

    requestDetails.onprogress({ responseText: "data: one\n\n" });
    await expect(first).resolves.toEqual({ value: "one", done: false });
    await iterator.return();
  });

  test("does not duplicate cumulative responseText chunks", async () => {
    const iterator = requestStream("https://example.test/stream", {});
    const first = iterator.next();
    await waitForRequestDetails();

    requestDetails.onprogress({ responseText: "data: one\n\n" });
    await expect(first).resolves.toEqual({ value: "one", done: false });

    const second = iterator.next();
    requestDetails.onprogress({
      responseText: "data: one\n\ndata: two\n\n",
    });
    await expect(second).resolves.toEqual({ value: "two", done: false });

    const done = iterator.next();
    requestDetails.onload({
      responseText: "data: one\n\ndata: two\n\n",
    });
    await expect(done).resolves.toEqual({ value: undefined, done: true });
  });

  test("decodes UTF-8 byte-string responseText from GM progress", async () => {
    const iterator = requestStream("https://example.test/stream", {});
    const first = iterator.next();
    await waitForRequestDetails();

    const data = 'data: {"choices":[{"delta":{"content":"ä½ å¥½"}}]}\n\n';
    const partialDataEnd = 'data: {"choices":[{"delta":{"content":"ä½'.length;
    requestDetails.onprogress({
      responseText: data.slice(0, partialDataEnd),
    });
    requestDetails.onprogress({ responseText: data });

    await expect(first).resolves.toEqual({
      value: '{"choices":[{"delta":{"content":"你好"}}]}',
      done: false,
    });

    const done = iterator.next();
    requestDetails.onload({ responseText: data });
    await expect(done).resolves.toEqual({ value: undefined, done: true });
  });

  test("throws readable error when no stream or progress text is available", async () => {
    const iterator = requestStream("https://example.test/stream", {});
    const first = iterator.next();
    await waitForRequestDetails();

    requestDetails.onloadstart({});
    requestDetails.onload({});

    await expect(first).rejects.toThrow("GM stream response is not readable.");
  });
});
