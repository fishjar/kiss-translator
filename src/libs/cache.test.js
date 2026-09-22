import { tryClearCaches } from "./cache";
import { sendBgMsg } from "./msg";
import { CACHE_NAME, MSG_CLEAR_CACHES } from "../config";

let mockIsExt = false;
let mockIsBackground = false;
const originalCaches = globalThis.caches;

jest.mock("../config", () => ({
  CACHE_NAME: "translation-cache",
  DEFAULT_CACHE_TIMEOUT: 3600,
  MSG_CLEAR_CACHES: "clear-caches",
  MSG_GET_HTTPCACHE: "get-cache",
  MSG_PUT_HTTPCACHE: "put-cache",
}));
jest.mock("./client", () => ({
  get isExt() {
    return mockIsExt;
  },
}));
jest.mock("./browser", () => ({ isBg: () => mockIsBackground }));
jest.mock("./msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("./log", () => ({ kissLog: jest.fn() }));
jest.mock("./response", () => ({ parseResponse: jest.fn() }));

describe("translation cache clearing", () => {
  beforeEach(() => {
    mockIsExt = false;
    mockIsBackground = false;
    globalThis.caches = { delete: jest.fn().mockResolvedValue(true) };
    sendBgMsg.mockReset();
  });

  afterEach(() => {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  });

  test.each([true, false])(
    "completes successfully when cache deletion reports existed=%s",
    async (existed) => {
      caches.delete.mockResolvedValueOnce(existed);
      await expect(tryClearCaches()).resolves.toBe(true);
      expect(caches.delete).toHaveBeenCalledWith(CACHE_NAME);
      expect(sendBgMsg).not.toHaveBeenCalled();
    }
  );

  test("waits for local deletion to complete", async () => {
    let resolveDeletion;
    caches.delete.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDeletion = resolve;
        })
    );
    const onComplete = jest.fn();
    const clearing = tryClearCaches().then(onComplete);
    await Promise.resolve();
    expect(onComplete).not.toHaveBeenCalled();

    resolveDeletion(true);
    await clearing;
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  test("returns failure when local deletion rejects", async () => {
    caches.delete.mockRejectedValueOnce(new Error("Cache unavailable"));
    await expect(tryClearCaches()).resolves.toBe(false);
  });

  test("clears locally in the extension background", async () => {
    mockIsExt = true;
    mockIsBackground = true;
    await expect(tryClearCaches()).resolves.toBe(true);
    expect(caches.delete).toHaveBeenCalledWith(CACHE_NAME);
    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test.each([true, false, undefined])(
    "requires an explicit background success acknowledgement: %s",
    async (response) => {
      mockIsExt = true;
      sendBgMsg.mockResolvedValueOnce(response);
      await expect(tryClearCaches()).resolves.toBe(response === true);
      expect(sendBgMsg).toHaveBeenCalledWith(MSG_CLEAR_CACHES);
      expect(caches.delete).not.toHaveBeenCalled();
    }
  );

  test("returns failure when the background request rejects", async () => {
    mockIsExt = true;
    sendBgMsg.mockRejectedValueOnce(new Error("Background unavailable"));
    await expect(tryClearCaches()).resolves.toBe(false);
    expect(caches.delete).not.toHaveBeenCalled();
  });
});
