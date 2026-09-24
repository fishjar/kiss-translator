import fs from "fs";
import path from "path";
import vm from "vm";

// Exercise the production window lifecycle without registering unrelated
// background APIs or starting network services in this test process.
const source = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
const windowCode = source.slice(
  source.indexOf("let separateWindowId = null;"),
  source.lastIndexOf("/**", source.indexOf("async function addContextMenus("))
);

function createHarness({
  saved,
  createBounds,
  updateBounds,
  boundsEvents = false,
} = {}) {
  const stored = saved ? { bounds: saved } : {};
  const windows = new Map();
  const listeners = {};
  let nextId = 1;
  const browser = {
    storage: {
      local: {
        get: jest.fn(async () => ({ ...stored })),
        set: jest.fn(async (value) => Object.assign(stored, value)),
      },
    },
    windows: {
      getLastFocused: jest.fn(async () => ({
        left: 0,
        top: 0,
        width: 1280,
        height: 900,
      })),
      create: jest.fn(async (args) => {
        const win = { ...args, ...createBounds, id: nextId++, state: "normal" };
        windows.set(win.id, win);
        return { ...win };
      }),
      get: jest.fn(async (id) => {
        if (!windows.has(id)) throw new Error("Window is closed");
        return { ...windows.get(id) };
      }),
      getAll: jest.fn(async () => [...windows.values()]),
      update: jest.fn(async (id, args) => {
        if (!windows.has(id)) throw new Error("Window is closed");
        const win = { ...windows.get(id), ...args, ...updateBounds };
        windows.set(id, win);
        return { ...win };
      }),
      onFocusChanged: {
        addListener: (callback) => {
          listeners.focus = callback;
        },
      },
      onRemoved: {
        addListener: (callback) => {
          listeners.removed = callback;
        },
      },
      // Deliberately omit onBoundsChanged, as on Firefox and Safari.
    },
  };
  if (boundsEvents) {
    browser.windows.onBoundsChanged = {
      addListener: (callback) => {
        listeners.bounds = callback;
      },
    };
  }
  const context = vm.createContext({
    browser,
    kissLog: jest.fn(),
    SEPARATE_WINDOW_CONTENT_WIDTH: 720,
    STOKEY_SEPARATE_WINDOW: "bounds",
  });
  vm.runInContext(windowCode, context);
  const getState = () =>
    vm.runInContext(
      "({ id: separateWindowId, bounds: lastKnownBounds, fitPending: separateWindowFitPending })",
      context
    );
  return {
    browser,
    stored,
    windows,
    getState,
    open: () => context.openSeparateWindowWithSavedBounds(),
    fit: (args = {}) =>
      context.fitSeparateWindow({
        width: 744,
        height: 450,
        availWidth: 1280,
        availHeight: 900,
        ...args,
      }),
    refresh: (id = getState().id) => context.updateCacheFromActual(id),
    boundsChanged: (win) => {
      windows.set(win.id, win);
      listeners.bounds(win);
    },
    close: async (id = getState().id) => {
      windows.delete(id);
      await listeners.removed(id);
    },
  };
}

describe("separate window bounds without onBoundsChanged", () => {
  test("persists the browser's fitted bounds and restores them on reopening", async () => {
    const harness = createHarness({
      updateBounds: { width: 730, height: 428 },
    });
    await harness.open();
    await harness.fit();
    expect(harness.getState().bounds).toMatchObject({
      width: 730,
      height: 428,
    });
    await harness.close();
    expect(harness.stored.bounds).toMatchObject({ width: 730, height: 428 });
    await harness.open();
    await harness.fit({ width: 900, height: 800 });
    expect(harness.browser.windows.create.mock.calls[1][0]).toMatchObject({
      width: 730,
      height: 428,
    });
    expect(harness.browser.windows.update).toHaveBeenCalledTimes(1);
  });

  test("records a manual resize through the live-window fallback", async () => {
    const harness = createHarness();
    const win = await harness.open();
    await harness.fit();
    await harness.browser.windows.update(win.id, {
      left: -20,
      top: 0,
      width: 820,
      height: 610,
    });
    await harness.refresh();
    await harness.close();
    await harness.open();
    expect(harness.browser.windows.create.mock.calls[1][0]).toMatchObject({
      left: -20,
      top: 0,
      width: 820,
      height: 610,
    });
  });

  test.each([
    ["native bounds event", { width: 1000 }],
    ["fallback read", { height: 850 }],
    ["fit read", { width: 1000, height: 850 }],
  ])(
    "preserves a resize before the first fit detected by a %s",
    async (notification, changedSize) => {
      const harness = createHarness({ boundsEvents: true });
      const win = await harness.open();
      const resized = { ...win, ...changedSize };
      harness.windows.set(win.id, resized);
      if (notification === "native bounds event") {
        harness.boundsChanged(resized);
      } else if (notification === "fallback read") {
        await harness.refresh();
      }

      await harness.fit();
      expect(harness.browser.windows.update).not.toHaveBeenCalled();
      expect(harness.getState().fitPending).toBe(false);
      await harness.close();
      expect(harness.stored.bounds).toMatchObject(changedSize);
      await harness.open();
      expect(harness.browser.windows.create.mock.calls[1][0]).toMatchObject(
        changedSize
      );
    }
  );

  test("still fits after initial bounds events and position-only adjustments", async () => {
    const harness = createHarness({
      createBounds: { width: 730, height: 700 },
      boundsEvents: true,
    });
    const win = await harness.open();
    harness.boundsChanged(win);
    harness.boundsChanged({ ...win, left: -740, top: 90 });
    await harness.refresh();
    expect(harness.getState().fitPending).toBe(true);

    await harness.fit();
    expect(harness.browser.windows.update).toHaveBeenCalledWith(win.id, {
      width: 744,
      height: 450,
    });
    expect(harness.getState().bounds).toEqual({
      left: -740,
      top: 90,
      width: 744,
      height: 450,
    });

    harness.boundsChanged({ ...win, width: 1000, height: 850 });
    await harness.close();
    expect(harness.stored.bounds).toMatchObject({ width: 1000, height: 850 });
  });

  test.each([
    ["resizes", { width: 1000, height: 850 }],
    ["maximizes", { width: 1280, height: 900, state: "maximized" }],
  ])(
    "does not fit a stale normal snapshot when the user %s during its read",
    async (_action, changedBounds) => {
      const harness = createHarness({ boundsEvents: true });
      const win = await harness.open();
      let resolveRead;
      harness.browser.windows.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          })
      );
      const pendingFit = harness.fit();
      harness.boundsChanged({ ...win, ...changedBounds });
      resolveRead(win);
      await pendingFit;

      expect(harness.browser.windows.update).not.toHaveBeenCalled();
      expect(harness.getState().fitPending).toBe(false);
      await harness.close();
      expect(harness.stored.bounds).toMatchObject(
        changedBounds.state
          ? { width: win.width, height: win.height }
          : changedBounds
      );
    }
  );

  test.each([
    [0, 0],
    [-1280, -720],
  ])(
    "keeps a fitted window inside the screen at %s, %s",
    async (availLeft, availTop) => {
      const harness = createHarness();
      const win = await harness.open();
      harness.windows.set(win.id, {
        ...win,
        left: availLeft + 218,
        top: availTop + 90,
      });
      await harness.fit({
        width: 1440,
        height: 860,
        availWidth: 1280,
        availHeight: 720,
        availLeft,
        availTop,
      });
      expect(harness.getState().bounds).toEqual({
        left: availLeft + 20,
        top: availTop + 40,
        width: 1240,
        height: 640,
      });
      await harness.close();
      await harness.open();
      expect(harness.browser.windows.create.mock.calls[1][0]).toMatchObject(
        harness.stored.bounds
      );
    }
  );
  test("invalid measurements do not consume the first valid fit", async () => {
    const harness = createHarness();
    await harness.open();
    await harness.fit({ height: NaN });
    expect(harness.getState().fitPending).toBe(true);
    await harness.fit();
    expect(harness.getState().bounds.height).toBe(450);
  });

  test("preserves saved user bounds and normal bounds when maximized", async () => {
    const saved = { left: 100, top: 100, width: 820, height: 610 };
    const harness = createHarness({ saved });
    const win = await harness.open();
    await harness.fit();
    expect(harness.browser.windows.update).not.toHaveBeenCalled();
    harness.windows.set(win.id, {
      ...win,
      state: "maximized",
      width: 1280,
      height: 900,
    });
    await harness.refresh();
    await harness.close();
    expect(harness.stored.bounds).toEqual(saved);
  });

  test("a delayed read of a closed window cannot overwrite the new window cache", async () => {
    const harness = createHarness();
    const oldWindow = await harness.open();
    let resolveRead;
    harness.browser.windows.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const pendingRead = harness.refresh(oldWindow.id);
    await harness.close();
    const newWindow = await harness.open();
    const expected = harness.getState().bounds;
    resolveRead({ ...oldWindow, width: 999, height: 888 });
    await pendingRead;
    expect(harness.getState().id).toBe(newWindow.id);
    expect(harness.getState().bounds).toEqual(expected);
  });

  test("a fit waiting on a closed window does not resize its replacement", async () => {
    const harness = createHarness();
    const oldWindow = await harness.open();
    let resolveRead;
    harness.browser.windows.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const pendingFit = harness.fit();
    await harness.close();
    await harness.open();
    resolveRead(oldWindow);
    await pendingFit;
    expect(harness.browser.windows.update).not.toHaveBeenCalled();
  });

  test("an old fit cannot cancel its replacement's first fit", async () => {
    const harness = createHarness();
    const oldWindow = await harness.open();
    let resolveRead;
    harness.browser.windows.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const pendingFit = harness.fit();
    await harness.close();
    delete harness.stored.bounds;
    const newWindow = await harness.open();
    resolveRead(oldWindow);
    await pendingFit;

    expect(harness.getState().fitPending).toBe(true);
    await harness.fit();
    expect(harness.browser.windows.update).toHaveBeenCalledTimes(1);
    expect(harness.browser.windows.update).toHaveBeenCalledWith(newWindow.id, {
      width: 744,
      height: 450,
    });
  });

  test("an older fallback read cannot replace a newer native bounds event", async () => {
    const harness = createHarness({ boundsEvents: true });
    const win = await harness.open();
    let resolveRead;
    harness.browser.windows.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const pendingRead = harness.refresh();
    harness.boundsChanged({ ...win, width: 900, height: 600 });
    resolveRead(win);
    await pendingRead;
    expect(harness.getState().bounds).toMatchObject({
      width: 900,
      height: 600,
    });
  });

  test("concurrent fallback reads only apply the latest requested result", async () => {
    const harness = createHarness();
    const win = await harness.open();
    let resolveFirst;
    let resolveSecond;
    harness.browser.windows.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );
    const first = harness.refresh();
    const second = harness.refresh();
    resolveFirst({ ...win, width: 850, height: 500 });
    await first;
    resolveSecond({ ...win, width: 950, height: 650 });
    await second;
    expect(harness.getState().bounds).toMatchObject({
      width: 950,
      height: 650,
    });
  });

  test("rechecks a user resize whose read resolves after the fit response", async () => {
    const harness = createHarness();
    const win = await harness.open();
    const fitted = { ...win, width: 744, height: 450 };
    let resolveFit;
    let markFitStarted;
    const fitStarted = new Promise((resolve) => {
      markFitStarted = resolve;
    });
    harness.browser.windows.update.mockImplementationOnce(() => {
      harness.windows.set(win.id, fitted);
      const result = new Promise((resolve) => {
        resolveFit = resolve;
      });
      markFitStarted();
      return result;
    });
    const pendingFit = harness.fit();
    await fitStarted;
    const resized = { ...win, width: 820, height: 610 };
    harness.windows.set(win.id, resized);
    let resolveRead;
    harness.browser.windows.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const pendingRead = harness.refresh();
    resolveFit(fitted);
    await pendingFit;
    resolveRead(resized);
    await pendingRead;
    await harness.close();
    expect(harness.stored.bounds).toMatchObject({ width: 820, height: 610 });
  });

  test("rechecks the fitted window when an older read changes the cache first", async () => {
    const harness = createHarness();
    const win = await harness.open();
    let resolveRead;
    harness.browser.windows.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const pendingRead = harness.refresh();
    const fitted = { ...win, width: 744, height: 450 };
    let resolveFit;
    let markFitStarted;
    const fitStarted = new Promise((resolve) => {
      markFitStarted = resolve;
    });
    harness.browser.windows.update.mockImplementationOnce(() => {
      harness.windows.set(win.id, fitted);
      const result = new Promise((resolve) => {
        resolveFit = resolve;
      });
      markFitStarted();
      return result;
    });
    const pendingFit = harness.fit();
    await fitStarted;
    resolveRead(win);
    await pendingRead;
    resolveFit(fitted);
    await pendingFit;
    await harness.close();
    expect(harness.stored.bounds).toMatchObject({ width: 744, height: 450 });
  });
});
