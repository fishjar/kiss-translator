import fs from "fs";
import path from "path";
import vm from "vm";

// Exercise the production options lifecycle without starting unrelated
// background services or registering browser event handlers.
const source = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
const optionsCode = source.slice(
  source.indexOf("let openingOptionsPage = null;"),
  source.indexOf("\n/**", source.indexOf("function openOptionsPage("))
);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushPromises = async () => {
  for (let step = 0; step < 6; step += 1) {
    await Promise.resolve();
  }
};

function createHarness() {
  const browser = {
    runtime: {
      openOptionsPage: jest.fn(async () => undefined),
      getURL: jest.fn((file) => `moz-extension://test/${file}`),
    },
    tabs: {
      create: jest.fn(async () => ({ id: 1 })),
    },
  };
  const kissLog = jest.fn();
  const context = vm.createContext({ browser, kissLog });
  vm.runInContext(optionsCode, context);
  return { browser, kissLog, open: () => context.openOptionsPage() };
}

describe("opening the options page", () => {
  test("reports native success without opening a fallback tab", async () => {
    const harness = createHarness();

    await expect(harness.open()).resolves.toBe(true);

    expect(harness.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(harness.browser.tabs.create).not.toHaveBeenCalled();
    expect(harness.kissLog).not.toHaveBeenCalled();
  });

  test("opens a fallback tab when the native API is unavailable", async () => {
    const harness = createHarness();
    delete harness.browser.runtime.openOptionsPage;

    await expect(harness.open()).resolves.toBe(true);

    expect(harness.browser.runtime.getURL).toHaveBeenCalledWith("options.html");
    expect(harness.browser.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://test/options.html",
    });
  });

  test("reports fallback success after the native API rejects", async () => {
    const harness = createHarness();
    const error = new Error("Native options API failed");
    harness.browser.runtime.openOptionsPage.mockRejectedValueOnce(error);

    await expect(harness.open()).resolves.toBe(true);

    expect(harness.browser.tabs.create).toHaveBeenCalledTimes(1);
    expect(harness.kissLog).toHaveBeenCalledWith(
      "open options page with runtime API",
      error
    );
  });

  test("shares failure with concurrent callers and permits a later retry", async () => {
    const harness = createHarness();
    const nativeError = new Error("Native options API failed");
    const fallbackError = new Error("Tab creation failed");
    harness.browser.runtime.openOptionsPage.mockRejectedValueOnce(nativeError);
    harness.browser.tabs.create.mockRejectedValueOnce(fallbackError);

    const first = harness.open();
    const second = harness.open();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);

    expect(harness.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(harness.browser.tabs.create).toHaveBeenCalledTimes(1);
    expect(harness.kissLog).toHaveBeenCalledWith(
      "open options page in new tab",
      fallbackError
    );
    await expect(harness.open()).resolves.toBe(true);
    expect(harness.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
    expect(harness.browser.tabs.create).toHaveBeenCalledTimes(1);
  });

  test("keeps concurrent callers pending until the native operation finishes", async () => {
    const harness = createHarness();
    const native = deferred();
    const settled = jest.fn();
    harness.browser.runtime.openOptionsPage.mockReturnValueOnce(native.promise);

    const first = harness.open();
    const second = harness.open();
    first.then(settled);
    second.then(settled);
    await flushPromises();

    expect(harness.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(harness.browser.tabs.create).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();

    native.resolve();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(settled).toHaveBeenCalledTimes(2);
  });

  test("keeps concurrent callers pending while the fallback tab is opening", async () => {
    const harness = createHarness();
    const fallback = deferred();
    const settled = jest.fn();
    harness.browser.runtime.openOptionsPage.mockRejectedValueOnce(
      new Error("Native options API failed")
    );
    harness.browser.tabs.create.mockReturnValueOnce(fallback.promise);

    const first = harness.open();
    first.then(settled);
    await flushPromises();
    const second = harness.open();
    second.then(settled);
    await flushPromises();

    expect(harness.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(harness.browser.tabs.create).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();

    fallback.resolve({ id: 1 });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(settled).toHaveBeenCalledTimes(2);
  });

  test("falls back when the native API throws synchronously", async () => {
    const harness = createHarness();
    harness.browser.runtime.openOptionsPage.mockImplementationOnce(() => {
      throw new Error("Native API threw synchronously");
    });

    await expect(harness.open()).resolves.toBe(true);

    expect(harness.browser.tabs.create).toHaveBeenCalledTimes(1);
    await expect(harness.open()).resolves.toBe(true);
    expect(harness.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
  });

  test.each(["getURL", "create"])(
    "permits retry after the fallback %s throws synchronously",
    async (method) => {
      const harness = createHarness();
      delete harness.browser.runtime.openOptionsPage;
      const api =
        method === "getURL"
          ? harness.browser.runtime.getURL
          : harness.browser.tabs.create;
      api.mockImplementationOnce(() => {
        throw new Error("Fallback API threw synchronously");
      });

      await expect(harness.open()).resolves.toBe(false);
      await expect(harness.open()).resolves.toBe(true);

      expect(api).toHaveBeenCalledTimes(2);
    }
  );
});
