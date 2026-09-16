jest.mock("./log", () => ({ kissLog: jest.fn() }));

const gmGlobals = [
  "GM",
  "KISS_GM",
  "GM_addValueChangeListener",
  "GM_removeValueChangeListener",
];

const flushPromises = async () => {
  for (let step = 0; step < 6; step += 1) {
    await Promise.resolve();
  }
};

const createChangeEvent = () => {
  const listeners = new Set();
  return {
    addListener: jest.fn((listener) => listeners.add(listener)),
    removeListener: jest.fn((listener) => listeners.delete(listener)),
    emit: (...args) => [...listeners].forEach((listener) => listener(...args)),
  };
};

const loadEvents = ({ extension = false, gm = false, browser } = {}) => {
  let events;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({
      isExt: extension,
      isGm: gm,
      isWeb: !extension && !gm,
    }));
    jest.doMock("./browser", () => ({ browser }));
    events = require("./storageEvents");
  });
  return events;
};

describe("external storage invalidation", () => {
  let originalGlobals;
  let cleanups;

  const subscribe = (events, key, listener) => {
    const unsubscribe = events.subscribeStorageInvalidation(key, listener);
    const cleanup = () => {
      cleanups.delete(cleanup);
      unsubscribe();
    };
    cleanups.add(cleanup);
    return cleanup;
  };

  beforeEach(() => {
    cleanups = new Set();
    originalGlobals = new Map(
      gmGlobals.map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ])
    );
    gmGlobals.forEach((key) => delete globalThis[key]);
  });

  afterEach(async () => {
    [...cleanups].forEach((cleanup) => cleanup());
    await flushPromises();
    originalGlobals.forEach((descriptor, key) => {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    });
    jest.dontMock("./client");
    jest.dontMock("./browser");
    jest.restoreAllMocks();
  });

  test("shares an extension listener and invalidates only changed local keys", () => {
    const onChanged = createChangeEvent();
    const events = loadEvents({
      extension: true,
      browser: { storage: { onChanged } },
    });
    const first = jest.fn();
    const second = jest.fn();
    const rules = jest.fn();
    const stopFirst = subscribe(events, "settings", first);
    const stopSecond = subscribe(events, "settings", second);
    const stopRules = subscribe(events, "rules", rules);

    expect(onChanged.addListener).toHaveBeenCalledTimes(1);
    onChanged.emit({ settings: { newValue: "dark" } }, "sync");
    onChanged.emit({ unknown: { newValue: "ignored" } }, "local");
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(rules).not.toHaveBeenCalled();

    onChanged.emit({ settings: { newValue: "dark" } }, "local");
    expect(first.mock.calls).toEqual([[]]);
    expect(second.mock.calls).toEqual([[]]);
    expect(rules).not.toHaveBeenCalled();

    stopFirst();
    onChanged.emit({ settings: { newValue: "light" } }, "local");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(onChanged.removeListener).not.toHaveBeenCalled();
    stopRules();
    expect(onChanged.removeListener).toHaveBeenCalledTimes(1);
    expect(onChanged.removeListener).toHaveBeenCalledWith(
      onChanged.addListener.mock.calls[0][0]
    );
  });

  test("filters web storage areas and invalidates every subscribed key on clear", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    const removeEventListener = jest.spyOn(window, "removeEventListener");
    const events = loadEvents();
    const settings = jest.fn();
    const rules = jest.fn();
    const stopSettings = subscribe(events, "settings", settings);
    const stopRules = subscribe(events, "rules", rules);
    const emit = (key, storageArea) =>
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea }));

    emit("settings", window.sessionStorage);
    emit("unknown", window.localStorage);
    expect(settings).not.toHaveBeenCalled();
    expect(rules).not.toHaveBeenCalled();

    emit("settings", window.localStorage);
    expect(settings.mock.calls).toEqual([[]]);
    expect(rules).not.toHaveBeenCalled();
    emit(null, window.localStorage);
    expect(settings).toHaveBeenCalledTimes(2);
    expect(rules.mock.calls).toEqual([[]]);

    stopSettings();
    stopRules();
    for (const type of ["storage", "focus", "pageshow"]) {
      const registrations = addEventListener.mock.calls.filter(
        ([eventType]) => eventType === type
      );
      expect(registrations).toHaveLength(1);
      expect(removeEventListener).toHaveBeenCalledWith(
        type,
        registrations[0][1]
      );
    }
    emit(null, window.localStorage);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    expect(settings).toHaveBeenCalledTimes(2);
    expect(rules).toHaveBeenCalledTimes(1);
  });

  test.each(["native", "bridge", "legacy"])(
    "shares %s GM listeners by key and ignores same-page writes",
    async (provider) => {
      const callbacks = new Map();
      const api = {
        addValueChangeListener: jest.fn((key, callback) => {
          callbacks.set(key, callback);
          return `${key}-listener`;
        }),
        removeValueChangeListener: jest.fn(),
      };
      if (provider === "native") {
        globalThis.GM = api;
      } else if (provider === "bridge") {
        window.KISS_GM = api;
      } else {
        globalThis.GM_addValueChangeListener = api.addValueChangeListener;
        globalThis.GM_removeValueChangeListener = api.removeValueChangeListener;
      }
      const events = loadEvents({ gm: true });
      const first = jest.fn();
      const second = jest.fn();
      const rules = jest.fn();
      const stopFirst = subscribe(events, "settings", first);
      const stopSecond = subscribe(events, "settings", second);
      const stopRules = subscribe(events, "rules", rules);
      await flushPromises();

      expect(api.addValueChangeListener).toHaveBeenCalledTimes(2);
      const changeSettings = callbacks.get("settings");
      changeSettings("settings", "old", "new", false);
      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
      changeSettings("settings", "old", "new", true);
      changeSettings("settings", "old", "new");
      expect(first.mock.calls).toEqual([[], []]);
      expect(second.mock.calls).toEqual([[], []]);
      expect(rules).not.toHaveBeenCalled();

      stopFirst();
      await flushPromises();
      expect(api.removeValueChangeListener).not.toHaveBeenCalled();
      stopSecond();
      await flushPromises();
      expect(api.removeValueChangeListener.mock.calls).toEqual([
        ["settings-listener"],
      ]);
      changeSettings("settings", "new", "later", true);
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledTimes(2);
      stopRules();
      await flushPromises();
      expect(api.removeValueChangeListener.mock.calls).toEqual([
        ["settings-listener"],
        ["rules-listener"],
      ]);
    }
  );

  test("removes a late GM registration without notifying a replacement subscription", async () => {
    let resolveRegistration;
    const pendingRegistration = new Promise((resolve) => {
      resolveRegistration = resolve;
    });
    const callbacks = [];
    const removeValueChangeListener = jest.fn();
    globalThis.GM = {
      addValueChangeListener: jest.fn((_key, callback) => {
        callbacks.push(callback);
        return callbacks.length === 1
          ? pendingRegistration
          : "current-listener";
      }),
      removeValueChangeListener,
    };
    const events = loadEvents({ gm: true });
    const obsolete = jest.fn();
    const current = jest.fn();
    const stopObsolete = subscribe(events, "settings", obsolete);
    await flushPromises();
    stopObsolete();
    const stopCurrent = subscribe(events, "settings", current);
    await flushPromises();
    stopObsolete();

    callbacks[0]("settings", "old", "stale", true);
    callbacks[1]("settings", "old", "current", true);
    expect(obsolete).not.toHaveBeenCalled();
    expect(current.mock.calls).toEqual([[]]);

    resolveRegistration("obsolete-listener");
    await flushPromises();
    expect(removeValueChangeListener.mock.calls).toEqual([
      ["obsolete-listener"],
    ]);
    stopCurrent();
    await flushPromises();
    expect(removeValueChangeListener.mock.calls).toEqual([
      ["obsolete-listener"],
      ["current-listener"],
    ]);
    callbacks[0]("settings", "old", "stale", true);
    callbacks[1]("settings", "old", "stale", true);
    expect(obsolete).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });

  test.each(["unavailable", "rejected"])(
    "refreshes subscribed GM keys on focus and pageshow when registration is %s",
    async (registration) => {
      if (registration === "rejected") {
        globalThis.GM = {
          addValueChangeListener: jest.fn(async () => {
            throw new Error("Registration failed");
          }),
          removeValueChangeListener: jest.fn(),
        };
      }
      const events = loadEvents({ gm: true });
      const settings = jest.fn();
      const rules = jest.fn();
      const stopSettings = subscribe(events, "settings", settings);
      const stopRules = subscribe(events, "rules", rules);
      await flushPromises();
      settings.mockClear();
      rules.mockClear();

      window.dispatchEvent(new Event("focus"));
      expect(settings.mock.calls).toEqual([[]]);
      expect(rules.mock.calls).toEqual([[]]);
      window.dispatchEvent(new Event("pageshow"));
      expect(settings).toHaveBeenCalledTimes(2);
      expect(rules).toHaveBeenCalledTimes(2);

      stopSettings();
      window.dispatchEvent(new Event("focus"));
      expect(settings).toHaveBeenCalledTimes(2);
      expect(rules).toHaveBeenCalledTimes(3);
      stopRules();
      window.dispatchEvent(new Event("pageshow"));
      expect(rules).toHaveBeenCalledTimes(3);
    }
  );
});
