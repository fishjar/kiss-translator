jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
  fnPolyfill: jest.fn(),
}));

jest.mock("../libs/browser", () => ({
  isBuiltinAIAvailable: false,
  isBg: () => false,
}));

jest.mock("../libs/storage", () => ({ getSetting: jest.fn() }));
jest.mock("../libs/cache", () => ({
  getHttpCachePolyfill: jest.fn(),
  putHttpCachePolyfill: jest.fn(),
}));
jest.mock("../libs/docInfo", () => ({ getDocInfo: () => ({}) }));
jest.mock("../libs/stream", () => ({
  parseStreamingSegments: jest.fn(),
  createStreamingJsonParser: jest.fn(),
  createStreamingSubtitleParser: jest.fn(),
  createRealtimeStreamParser: jest.fn(),
  detectStreamFormat: jest.fn(),
  getStreamDelta: jest.fn(),
}));

import { apiTranslate } from "./index";
import { fetchData } from "../libs/fetch";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import { clearAllBatchQueue } from "../libs/batchQueue";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_MICROSOFT,
} from "../config";

const firstText = "This garden has beautiful flowers.";
const latestText = "The museum opens on Sunday.";

const flushMicrotasks = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

describe.each([OPT_TRANS_GOOGLE_2, OPT_TRANS_MICROSOFT])(
  "%s batch cancellation integration",
  (apiType) => {
    let apiSetting;
    let cache;

    const makeResponse = (texts) =>
      apiType === OPT_TRANS_GOOGLE_2
        ? [texts.map((text) => `Translated: ${text}`), texts.map(() => "en")]
        : texts.map((text) => ({
            translations: [{ text: `Translated: ${text}` }],
            detectedLanguage: { language: "en" },
          }));

    beforeEach(() => {
      jest.useFakeTimers();
      cache = new Map();
      getHttpCachePolyfill.mockImplementation(async (key) => cache.get(key));
      putHttpCachePolyfill.mockImplementation(async (key, init, value) => {
        cache.set(key, value);
      });
      apiSetting = {
        ...DEFAULT_API_LIST.find((api) => api.apiType === apiType),
        apiSlug: `batch_cancellation_${apiType}`,
        key: "test-key",
        batchInterval: 400,
        batchSize: 20,
        batchConcurrency: 1,
        useBatchFetch: true,
        useStream: false,
      };
      fetchData.mockImplementation(async (url, init) => {
        const body = JSON.parse(init.body);
        const texts = apiType === OPT_TRANS_GOOGLE_2 ? body[0][0] : body;
        return makeResponse(texts);
      });
    });

    afterEach(() => {
      clearAllBatchQueue();
      jest.useRealTimers();
    });

    const submit = (text, controller = new AbortController()) =>
      apiTranslate({
        text,
        fromLang: "en",
        toLang: "fr",
        apiSetting,
        textFormat: "text",
        usePool: false,
        signal: controller.signal,
      });

    const expectRequestTexts = (texts) => {
      const body = JSON.parse(fetchData.mock.calls[0][1].body);
      expect(body).toEqual(
        apiType === OPT_TRANS_GOOGLE_2 ? [[texts, "en", "fr"], "wt_lib"] : texts
      );
    };

    const expectOnlyLatestCached = () => {
      expect(
        [...cache.keys()].map((key) => new URL(key).searchParams.get("text"))
      ).toEqual([latestText]);
    };

    test("batches two live requests and caches both protocol results", async () => {
      const pending = Promise.all([submit(firstText), submit(latestText)]);
      await flushMicrotasks();
      jest.advanceTimersByTime(400);
      const results = await pending;

      expect(fetchData).toHaveBeenCalledTimes(1);
      expectRequestTexts([firstText, latestText]);
      expect(results.map((result) => result.trText)).toEqual([
        `Translated: ${firstText}`,
        `Translated: ${latestText}`,
      ]);
      expect(cache.size).toBe(2);
      await expect(submit(latestText)).resolves.toEqual(results[1]);
      expect(fetchData).toHaveBeenCalledTimes(1);
    });

    test("replaces a canceled queued request and sends only the latest text", async () => {
      const oldController = new AbortController();
      const oldRequest = submit(firstText, oldController);
      const oldRejection = expect(oldRequest).rejects.toMatchObject({
        name: "AbortError",
      });
      await flushMicrotasks();
      expect(fetchData).not.toHaveBeenCalled();

      oldController.abort();
      await oldRejection;
      const latestRequest = submit(latestText);
      await flushMicrotasks();
      jest.advanceTimersByTime(400);
      const latest = await latestRequest;

      expect(fetchData).toHaveBeenCalledTimes(1);
      expectRequestTexts([latestText]);
      expect(latest.trText).toBe(`Translated: ${latestText}`);
      expectOnlyLatestCached();
      await expect(submit(latestText)).resolves.toEqual(latest);
      expect(fetchData).toHaveBeenCalledTimes(1);
    });

    test("canceling one in-flight caller preserves the other caller's result index", async () => {
      let resolveResponse;
      fetchData.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveResponse = resolve;
          })
      );
      const oldController = new AbortController();
      const latestController = new AbortController();
      const oldRequest = submit(firstText, oldController);
      const oldRejection = expect(oldRequest).rejects.toMatchObject({
        name: "AbortError",
      });
      const latestRequest = submit(latestText, latestController);
      await flushMicrotasks();
      jest.advanceTimersByTime(400);
      await flushMicrotasks();

      expect(fetchData).toHaveBeenCalledTimes(1);
      expectRequestTexts([firstText, latestText]);
      const batchSignal = fetchData.mock.calls[0][2].signal;
      expect(batchSignal).not.toBe(oldController.signal);
      expect(batchSignal).not.toBe(latestController.signal);

      oldController.abort();
      await oldRejection;
      expect(batchSignal.aborted).toBe(false);
      resolveResponse(makeResponse([firstText, latestText]));
      const latest = await latestRequest;

      expect(latest.trText).toBe(`Translated: ${latestText}`);
      expectOnlyLatestCached();
      await expect(submit(latestText)).resolves.toEqual(latest);
      expect(fetchData).toHaveBeenCalledTimes(1);
    });
  }
);
