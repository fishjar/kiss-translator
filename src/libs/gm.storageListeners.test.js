let mockEventCount = 0;

jest.mock("./fetch", () => ({ fetchGM: jest.fn() }));
jest.mock("./utils", () => ({
  genEventName: () => `gm-listener-${++mockEventCount}`,
}));

const { adaptScript, handlePing } = require("./gm");
const flushPromises = async () => {
  for (let step = 0; step < 12; step += 1) await Promise.resolve();
};

describe("GM storage listener bridge", () => {
  let requests;
  let recordRequest;

  beforeEach(() => {
    mockEventCount = 0;
    requests = [];
    recordRequest = (event) => requests.push(event.detail);
    window.addEventListener("gm-values-ping", handlePing);
    window.addEventListener("gm-values-ping", recordRequest);
    adaptScript("gm-values-ping");
  });

  afterEach(() => {
    window.removeEventListener("gm-values-ping", handlePing);
    window.removeEventListener("gm-values-ping", recordRequest);
    delete globalThis.GM;
    delete globalThis.GM_addValueChangeListener;
    delete globalThis.GM_removeValueChangeListener;
    delete window.KISS_GM;
    jest.useRealTimers();
  });

  test.each(["native", "legacy"])(
    "forwards repeated %s value changes and removes the native subscription",
    async (mode) => {
      let notify;
      const add = jest.fn((_key, callback) => {
        notify = callback;
        return mode === "native" ? Promise.resolve(17) : 17;
      });
      const remove = jest.fn(async () => {});
      if (mode === "native") {
        globalThis.GM = {
          addValueChangeListener: add,
          removeValueChangeListener: remove,
        };
      } else {
        globalThis.GM = {};
        globalThis.GM_addValueChangeListener = add;
        globalThis.GM_removeValueChangeListener = remove;
      }
      const changed = jest.fn();
      const listenerId = await window.KISS_GM.addValueChangeListener(
        "words",
        changed
      );
      expect(add).toHaveBeenCalledWith("words", expect.any(Function));
      notify("words", "old", "first", true);
      notify("words", "first", "second", false);
      expect(changed.mock.calls).toEqual([
        ["words", "old", "first", true],
        ["words", "first", "second", false],
      ]);

      await window.KISS_GM.removeValueChangeListener(listenerId);
      await window.KISS_GM.removeValueChangeListener(listenerId);
      notify("words", "second", "late", true);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith(17);
      expect(changed).toHaveBeenCalledTimes(2);
    }
  );

  test("rejects unsupported subscriptions and removes the page callback", async () => {
    jest.useFakeTimers();
    globalThis.GM = {};
    const changed = jest.fn();
    await expect(
      window.KISS_GM.addValueChangeListener("words", changed)
    ).rejects.toThrow("GM API is not available");
    await flushPromises();
    const { listenerId } = requests.find(
      ({ action }) => action === "addValueChangeListener"
    ).args;
    window.dispatchEvent(
      new CustomEvent(listenerId, {
        detail: { change: ["words", "old", "late", true] },
      })
    );
    expect(changed).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("removes a native subscription that registers after its bridge times out", async () => {
    jest.useFakeTimers();
    let completeRegistration;
    let notify;
    const registration = new Promise((resolve) => {
      completeRegistration = resolve;
    });
    const remove = jest.fn(async () => {});
    globalThis.GM = {
      addValueChangeListener: jest.fn((_key, callback) => {
        notify = callback;
        return registration;
      }),
      removeValueChangeListener: remove,
    };
    const changed = jest.fn();
    const pending = window.KISS_GM.addValueChangeListener("words", changed);
    const rejected = expect(pending).rejects.toThrow("timeout");
    await flushPromises();
    jest.advanceTimersByTime(5000);
    await rejected;
    notify("words", "old", "late", true);
    expect(changed).not.toHaveBeenCalled();

    completeRegistration(23);
    await flushPromises();
    expect(remove).toHaveBeenCalledWith(23);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("retries a failed removal while keeping callbacks inactive", async () => {
    let notify;
    const remove = jest
      .fn()
      .mockRejectedValueOnce(new Error("Removal failed"))
      .mockResolvedValue(undefined);
    globalThis.GM = {
      addValueChangeListener: jest.fn((_key, callback) => {
        notify = callback;
        return 31;
      }),
      removeValueChangeListener: remove,
    };
    const changed = jest.fn();
    const listenerId = await window.KISS_GM.addValueChangeListener(
      "words",
      changed
    );
    await expect(
      window.KISS_GM.removeValueChangeListener(listenerId)
    ).rejects.toThrow("Removal failed");
    notify("words", "old", "late", true);
    expect(changed).not.toHaveBeenCalled();

    await Promise.all([
      window.KISS_GM.removeValueChangeListener(listenerId),
      window.KISS_GM.removeValueChangeListener(listenerId),
    ]);
    expect(remove.mock.calls).toEqual([[31], [31]]);
  });

  test.each([1, 2])(
    "cleans up an unreturned listener token after %i removal failures",
    async (failures) => {
      jest.useFakeTimers();
      let completeRegistration;
      let notifyActive;
      const registration = new Promise((resolve) => {
        completeRegistration = resolve;
      });
      const remove = jest.fn();
      for (let attempt = 0; attempt < failures; attempt += 1) {
        remove.mockRejectedValueOnce(new Error("Removal failed"));
      }
      remove.mockResolvedValue(undefined);
      globalThis.GM = {
        addValueChangeListener: jest
          .fn()
          .mockImplementationOnce(() => registration)
          .mockImplementation((_key, callback) => {
            notifyActive = callback;
            return 42;
          }),
        removeValueChangeListener: remove,
      };
      const pending = window.KISS_GM.addValueChangeListener("words", jest.fn());
      const rejected = expect(pending).rejects.toThrow("timeout");
      await flushPromises();
      jest.advanceTimersByTime(5000);
      await rejected;
      completeRegistration(41);
      await flushPromises();
      await flushPromises();
      expect(remove.mock.calls).toEqual([[41], [41]]);
      jest.advanceTimersByTime(30000);
      expect(remove).toHaveBeenCalledTimes(2);

      const changed = jest.fn();
      const activeId = await window.KISS_GM.addValueChangeListener(
        "settings",
        changed
      );
      window.dispatchEvent(new Event("pagehide"));
      await flushPromises();
      expect(remove).toHaveBeenCalledTimes(failures === 2 ? 3 : 2);
      notifyActive("settings", "old", "new", true);
      expect(changed).toHaveBeenCalledWith("settings", "old", "new", true);
      await window.KISS_GM.removeValueChangeListener(activeId);
      expect(remove).toHaveBeenLastCalledWith(42);
      expect(jest.getTimerCount()).toBe(0);
    }
  );
});
