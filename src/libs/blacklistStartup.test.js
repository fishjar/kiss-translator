import { STOKEY_SETTING } from "../config";
import { createBlacklistStartupRecovery } from "./blacklistStartup";

jest.mock("../config", () => ({ STOKEY_SETTING: "setting" }));
jest.mock("./browser", () => ({ browser: undefined }));

const flushPromises = async () => {
  for (let step = 0; step < 8; step += 1) {
    await Promise.resolve();
  }
};

function createBrowser(initialBlacklist = "example.com") {
  const listeners = new Set();
  let storedValue = JSON.stringify({ blacklist: initialBlacklist });
  const onChanged = {
    addListener: jest.fn((listener) => listeners.add(listener)),
    removeListener: jest.fn((listener) => listeners.delete(listener)),
  };
  return {
    storage: {
      onChanged,
      local: {
        get: jest.fn(async () => ({ [STOKEY_SETTING]: storedValue })),
      },
    },
    setStoredValue(value) {
      storedValue = value;
    },
    emit(changes, area = "local") {
      [...listeners].forEach((listener) => listener(changes, area));
    },
    listenerCount: () => listeners.size,
  };
}

describe("blacklisted extension startup recovery", () => {
  let extensionBrowser;
  let onUnblocked;
  let recovery;
  let href;

  beforeEach(() => {
    extensionBrowser = createBrowser();
    onUnblocked = jest.fn();
    href = "https://example.com/article";
    recovery = createBlacklistStartupRecovery({
      extensionBrowser,
      getHref: () => href,
      onUnblocked,
    });
  });

  afterEach(async () => {
    recovery.cancel();
    await flushPromises();
  });

  test("shares one listener across repeated blocked startup attempts", async () => {
    recovery.watch();
    recovery.watch();
    await flushPromises();

    expect(extensionBrowser.listenerCount()).toBe(1);
    expect(
      extensionBrowser.storage.onChanged.addListener
    ).toHaveBeenCalledTimes(1);
    expect(extensionBrowser.storage.local.get).toHaveBeenCalledWith([
      STOKEY_SETTING,
    ]);
    expect(onUnblocked).not.toHaveBeenCalled();
  });

  test("resumes once and removes the listener before startup", async () => {
    onUnblocked.mockImplementation(() => {
      expect(extensionBrowser.listenerCount()).toBe(0);
    });
    recovery.watch();
    await flushPromises();
    const listener =
      extensionBrowser.storage.onChanged.addListener.mock.calls[0][0];
    const change = { [STOKEY_SETTING]: { newValue: '{"blacklist":""}' } };

    extensionBrowser.emit(change);
    extensionBrowser.emit(change);
    listener(change, "local");
    await flushPromises();

    expect(onUnblocked).toHaveBeenCalledTimes(1);
    expect(
      extensionBrowser.storage.onChanged.removeListener
    ).toHaveBeenCalledWith(listener);
  });

  test("ignores unrelated areas, keys, malformed values, and matching blacklists", async () => {
    recovery.watch();
    await flushPromises();
    extensionBrowser.emit({ [STOKEY_SETTING]: { newValue: "{}" } }, "sync");
    extensionBrowser.emit({ other: { newValue: "{}" } });
    for (const newValue of [
      undefined,
      "{",
      "null",
      "[]",
      '{"blacklist":false}',
      '{"blacklist":"example.com"}',
    ]) {
      extensionBrowser.emit({ [STOKEY_SETTING]: { newValue } });
    }
    await flushPromises();

    expect(extensionBrowser.listenerCount()).toBe(1);
    expect(onUnblocked).not.toHaveBeenCalled();
  });

  test("checks the current document URL when settings change", async () => {
    recovery.watch();
    await flushPromises();
    href = "https://another.example/article";
    extensionBrowser.emit({
      [STOKEY_SETTING]: { newValue: '{"blacklist":"example.com"}' },
    });
    await flushPromises();

    expect(onUnblocked).toHaveBeenCalledTimes(1);
  });

  test("rechecks storage to recover an edit made before listener registration", async () => {
    extensionBrowser.setStoredValue('{"blacklist":""}');
    recovery.watch();
    await flushPromises();

    expect(onUnblocked).toHaveBeenCalledTimes(1);
    expect(extensionBrowser.listenerCount()).toBe(0);
  });

  test("does not use an outdated storage read after a later blacklist change", async () => {
    let resolveRead;
    extensionBrowser.storage.local.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    recovery.watch();
    await Promise.resolve();
    extensionBrowser.emit({
      [STOKEY_SETTING]: { newValue: '{"blacklist":"example.com"}' },
    });
    resolveRead({ [STOKEY_SETTING]: '{"blacklist":""}' });
    await flushPromises();

    expect(onUnblocked).not.toHaveBeenCalled();
    expect(extensionBrowser.listenerCount()).toBe(1);
  });

  test("keeps listening after a storage read fails", async () => {
    extensionBrowser.storage.local.get.mockRejectedValue(
      new Error("Unavailable")
    );
    recovery.watch();
    await flushPromises();
    extensionBrowser.emit({ [STOKEY_SETTING]: { newValue: "{}" } });
    await flushPromises();

    expect(onUnblocked).toHaveBeenCalledTimes(1);
  });

  test("can watch again when the resumed startup finds the document blocked", async () => {
    onUnblocked.mockImplementation(() => recovery.watch());
    recovery.watch();
    await flushPromises();
    extensionBrowser.emit({
      [STOKEY_SETTING]: { newValue: '{"blacklist":""}' },
    });
    await flushPromises();

    expect(onUnblocked).toHaveBeenCalledTimes(1);
    expect(extensionBrowser.listenerCount()).toBe(1);
    expect(
      extensionBrowser.storage.onChanged.addListener
    ).toHaveBeenCalledTimes(2);
  });

  test("cancels a pending storage read without starting the document", async () => {
    extensionBrowser.setStoredValue('{"blacklist":""}');
    recovery.watch();
    recovery.cancel();
    await flushPromises();

    expect(onUnblocked).not.toHaveBeenCalled();
    expect(extensionBrowser.listenerCount()).toBe(0);
  });

  test("cancels a queued recovery when another startup already proceeds", async () => {
    recovery.watch();
    await flushPromises();
    extensionBrowser.emit({
      [STOKEY_SETTING]: { newValue: '{"blacklist":""}' },
    });
    recovery.cancel();
    await flushPromises();

    expect(onUnblocked).not.toHaveBeenCalled();
    expect(extensionBrowser.listenerCount()).toBe(0);
  });

  test("does nothing outside an extension storage environment", async () => {
    recovery = createBlacklistStartupRecovery({
      getHref: () => href,
      onUnblocked,
    });
    recovery.watch();
    await flushPromises();

    expect(onUnblocked).not.toHaveBeenCalled();
  });
});
