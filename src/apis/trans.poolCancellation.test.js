jest.mock("query-string", () => ({
  stringify: (value) => new URLSearchParams(value).toString(),
}));
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);
jest.mock("webextension-polyfill", () => ({}));

const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

import { handleTranslate } from "./trans";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";
import { clearFetchPool } from "../libs/pool";

const flushMicrotasks = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

describe("pooled translation cancellation", () => {
  const previousFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: "translated" } }] }),
    }));
  });

  afterEach(() => {
    clearFetchPool();
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = previousFetch;
  });

  test("clearing a queued stream without a signal rejects promptly without fallback", async () => {
    const stream = handleTranslate(["hello"], {
      from: "en",
      to: "zh-CN",
      fromLang: "English",
      toLang: "Chinese",
      apiSetting: {
        ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
        apiSlug: "pool_cancellation",
        key: "test-key",
        model: "test-model",
        url: "https://example.test/chat/completions",
        fetchInterval: 0,
        fetchLimit: 1,
        httpTimeout: 1000,
        useStream: true,
        useBatchFetch: false,
        useContext: false,
        nobatchPrompt: "Translate {{text}}.",
        nobatchUserPrompt: "",
      },
      usePool: true,
      docInfo: {},
    });
    let outcome;
    stream.next().then(
      (value) => {
        outcome = { value };
      },
      (error) => {
        outcome = { error };
      }
    );
    await flushMicrotasks();
    expect(jest.getTimerCount()).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();

    clearFetchPool();
    await flushMicrotasks();
    const outcomeBeforeTimers = outcome;
    jest.runOnlyPendingTimers();
    await flushMicrotasks();

    expect(outcomeBeforeTimers).toEqual({
      error: expect.objectContaining({ name: "AbortError" }),
    });
    expect(global.fetch).not.toHaveBeenCalled();
    await expect(stream.next()).resolves.toEqual({ done: true });
  });
});
