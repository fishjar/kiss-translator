import { act } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "../../libs/browser";
import { getCurTab } from "../../libs/msg";
import { loadPopupData } from "./loadData";
import { usePopupPage } from "./usePopupPage";
import { isCurrentPopupDocument } from "../../libs/popupDocument";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/browser", () => {
  const createEvent = () => {
    const listeners = new Set();
    const addListener = jest.fn();
    const removeListener = jest.fn();
    return {
      addListener,
      removeListener,
      emit: (...args) =>
        [...listeners].forEach((listener) => listener(...args)),
      clear: () => {
        listeners.clear();
        addListener.mockImplementation((listener) => listeners.add(listener));
        removeListener.mockImplementation((listener) =>
          listeners.delete(listener)
        );
      },
    };
  };
  return {
    browser: {
      tabs: {
        get: jest.fn(),
        onUpdated: createEvent(),
        onRemoved: createEvent(),
        onActivated: createEvent(),
      },
    },
  };
});
jest.mock("../../libs/msg", () => ({ getCurTab: jest.fn() }));
jest.mock("../../libs/log", () => ({ kissLog: jest.fn() }));
jest.mock("./loadData", () => ({ loadPopupData: jest.fn() }));
jest.mock("../../libs/popupDocument", () => ({
  isCurrentPopupDocument: jest.fn(),
}));

const tab = (id = 17, changes = {}) => ({
  id,
  windowId: 3,
  status: "complete",
  url: `https://example.com/page/${id}`,
  ...changes,
});
const data = (toLang = "en") => ({
  rule: { transOpen: "false", toLang },
  setting: { darkMode: "auto" },
});
const mountedPages = [];

function deferred() {
  let resolve;
  const promise = new Promise((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let current;
  let mounted = true;
  function Harness() {
    current = usePopupPage();
    return null;
  }
  act(() => root.render(<Harness />));
  const view = {
    get page() {
      return current;
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      act(() => root.unmount());
      container.remove();
    },
  };
  mountedPages.push(view);
  return view;
}

function updateTab(changeInfo, target = tab()) {
  act(() => browser.tabs.onUpdated.emit(target.id, changeInfo, target));
}

describe("usePopupPage tab lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCurTab.mockReset().mockResolvedValue(tab());
    loadPopupData.mockReset().mockResolvedValue(data());
    browser.tabs.get.mockReset();
    isCurrentPopupDocument.mockReset().mockResolvedValue(true);
    for (const name of ["onUpdated", "onRemoved", "onActivated"]) {
      browser.tabs[name].clear();
    }
  });

  afterEach(() => {
    mountedPages.splice(0).forEach((view) => view.unmount());
  });

  test("captures the target tab and ignores updates from unrelated tabs", async () => {
    const view = renderPage();
    await flushEffects();

    expect(getCurTab).toHaveBeenCalledTimes(1);
    expect(loadPopupData).toHaveBeenCalledWith({ tabId: 17 });
    expect(view.page.tab).toEqual(tab());
    expect(view.page.data).toEqual(data());
    expect(view.page.isLoading).toBe(false);

    updateTab({ status: "loading" }, tab(29));
    expect(view.page.data).toEqual(data());
    expect(loadPopupData).toHaveBeenCalledTimes(1);
  });

  test.each(["onUpdated", "onActivated"])(
    "refreshes the initial tab snapshot after %s arrives during lookup",
    async (eventName) => {
      const pending = deferred();
      const currentTab =
        eventName === "onUpdated"
          ? tab(17, { url: "https://example.com/new" })
          : tab(29);
      getCurTab
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(currentTab);
      const view = renderPage();

      act(() => {
        if (eventName === "onUpdated") {
          browser.tabs.onUpdated.emit(
            17,
            { url: currentTab.url, status: "loading" },
            { ...currentTab, status: "loading" }
          );
        } else {
          browser.tabs.onActivated.emit({ tabId: 29, windowId: 3 });
        }
      });
      expect(loadPopupData).not.toHaveBeenCalled();
      pending.resolve(tab(17));
      await flushEffects();

      expect(getCurTab).toHaveBeenCalledTimes(2);
      expect(loadPopupData).toHaveBeenCalledTimes(1);
      expect(loadPopupData).toHaveBeenCalledWith({ tabId: currentTab.id });
      expect(view.page.tab).toEqual(currentTab);
      expect(view.page.data).toEqual(data());
    }
  );

  test("clears old page data immediately and ignores an older navigation response", async () => {
    const firstNavigation = deferred();
    const secondNavigation = deferred();
    loadPopupData
      .mockResolvedValueOnce(data("en"))
      .mockReturnValueOnce(firstNavigation.promise)
      .mockReturnValueOnce(secondNavigation.promise);
    const view = renderPage();
    await flushEffects();
    expect(view.page.data.rule.toLang).toBe("en");

    updateTab({ url: "https://example.com/first", status: "complete" });
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(true);
    updateTab({ url: "https://example.com/second", status: "complete" });

    secondNavigation.resolve(data("fr"));
    await flushEffects();
    expect(view.page.data.rule.toLang).toBe("fr");
    expect(view.page.tab.url).toBe("https://example.com/second");
    firstNavigation.resolve(data("de"));
    await flushEffects();
    expect(view.page.data.rule.toLang).toBe("fr");
    expect(view.page.tab.url).toBe("https://example.com/second");
    expect(view.page.isLoading).toBe(false);
  });

  test("loads a verified current runtime before background resources finish", async () => {
    getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
    const view = renderPage();
    await flushEffects();
    expect(loadPopupData).toHaveBeenCalledTimes(1);
    expect(view.page.data).toEqual(data());
    expect(view.page.isLoading).toBe(false);

    updateTab({ url: "https://example.com/new", status: "loading" });
    await flushEffects();
    expect(loadPopupData).toHaveBeenCalledTimes(2);
    expect(view.page.data).toEqual(data());

    updateTab(
      { status: "complete" },
      tab(17, { url: "https://example.com/new" })
    );
    await flushEffects();
    expect(loadPopupData).toHaveBeenCalledTimes(3);
    expect(loadPopupData).toHaveBeenCalledWith({ tabId: 17 });
    expect(view.page.data).toEqual(data());
    expect(view.page.isLoading).toBe(false);
  });

  test("does not restore an old content-script response during navigation", async () => {
    const pending = deferred();
    loadPopupData
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(data("fr"));
    const view = renderPage();
    await flushEffects();

    updateTab({ url: "https://example.com/new", status: "loading" });
    pending.resolve(data("de"));
    await flushEffects();
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(true);
    expect(loadPopupData).toHaveBeenCalledTimes(2);

    updateTab(
      { status: "complete" },
      tab(17, { url: "https://example.com/new" })
    );
    await flushEffects();
    expect(view.page.data.rule.toLang).toBe("fr");
    expect(view.page.isLoading).toBe(false);
  });

  test("rejects stale action setters after navigating to a new document", async () => {
    loadPopupData
      .mockResolvedValueOnce(data("en"))
      .mockResolvedValue(data("fr"));
    const view = renderPage();
    await flushEffects();
    const { setRule, setSetting, markUnavailable } = view.page;

    updateTab({ url: "https://example.com/new", status: "complete" });
    await flushEffects();
    act(() => {
      setRule((previous) => ({ ...previous, toLang: "de" }));
      setSetting((previous) => ({ ...previous, darkMode: "dark" }));
      markUnavailable();
    });
    expect(view.page.data).toEqual(data("fr"));

    act(() => {
      view.page.setRule((previous) => ({ ...previous, toLang: "ja" }));
      view.page.setSetting((previous) => ({
        ...previous,
        darkMode: "light",
      }));
    });
    expect(view.page.data.rule.toLang).toBe("ja");
    expect(view.page.data.setting.darkMode).toBe("light");
  });

  test("clears unavailable receivers and invalidates their pending action setters", async () => {
    loadPopupData.mockResolvedValueOnce(data()).mockResolvedValue(undefined);
    const view = renderPage();
    await flushEffects();
    const { generation, setRule, setSetting, markUnavailable } = view.page;

    act(() => markUnavailable());
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(true);
    expect(view.page.generation).toBeGreaterThan(generation);
    act(() => {
      setRule({ transOpen: "true" });
      setSetting({ darkMode: "dark" });
    });
    expect(view.page.data).toBeNull();
    await flushEffects();
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(false);
  });

  test("discovers a surviving frame without accepting the removed frame's callbacks", async () => {
    const recovery = deferred();
    loadPopupData
      .mockResolvedValueOnce({
        ...data(),
        document: { token: "removed", frameId: 7 },
      })
      .mockReturnValueOnce(recovery.promise);
    const view = renderPage();
    await flushEffects();
    const previous = view.page;

    act(() => {
      previous.markUnavailable();
      previous.markUnavailable();
    });
    expect(view.page.data).toBeNull();
    expect(view.page.generation).toBeGreaterThan(previous.generation);
    expect(loadPopupData).toHaveBeenCalledTimes(2);
    expect(loadPopupData).toHaveBeenLastCalledWith({ tabId: 17 });
    recovery.resolve({
      ...data("fr"),
      document: { token: "surviving", frameId: 11 },
    });
    await flushEffects();
    const recoveredGeneration = view.page.generation;
    act(() => {
      previous.setRule({ toLang: "stale" });
      previous.setSetting({ darkMode: "stale" });
      previous.markUnavailable();
    });
    expect(view.page.data.rule.toLang).toBe("fr");
    expect(view.page.data.setting).toEqual(data().setting);
    expect(view.page.data.document).toEqual({
      token: "surviving",
      frameId: 11,
    });
    expect(view.page.generation).toBe(recoveredGeneration);
    expect(loadPopupData).toHaveBeenCalledTimes(2);
    expect(getCurTab).toHaveBeenCalledTimes(1);
  });

  test("settles a failed receiver recovery without retrying a stale loading tab", async () => {
    jest.useFakeTimers();
    try {
      getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
      loadPopupData
        .mockResolvedValueOnce({
          ...data(),
          document: { token: "removed", frameId: 7 },
        })
        .mockResolvedValue(undefined);
      const view = renderPage();
      await flushEffects();
      act(() => view.page.markUnavailable());
      await flushEffects();
      expect(view.page.data).toBeNull();
      expect(view.page.isLoading).toBe(false);
      act(() => jest.advanceTimersByTime(2000));
      await flushEffects();
      expect(loadPopupData).toHaveBeenCalledTimes(2);
      expect(isCurrentPopupDocument).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("recovers using a completion event's latest tab snapshot before its validation settles", async () => {
    jest.useFakeTimers();
    try {
      getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
      loadPopupData
        .mockResolvedValueOnce({
          ...data(),
          document: { token: "removed", frameId: 7 },
        })
        .mockResolvedValue({
          ...data("fr"),
          document: { token: "surviving", frameId: 11 },
        });
      const completion = deferred();
      isCurrentPopupDocument.mockReturnValueOnce(completion.promise);
      const view = renderPage();
      await flushEffects();
      updateTab({ status: "complete" });
      act(() => view.page.markUnavailable());
      await flushEffects();
      expect(view.page.tab.status).toBe("complete");
      expect(view.page.data.document.token).toBe("surviving");
      const generation = view.page.generation;
      completion.resolve(false);
      await flushEffects();
      act(() => jest.advanceTimersByTime(2000));
      await flushEffects();
      expect(view.page.generation).toBe(generation);
      expect(view.page.data.rule.toLang).toBe("fr");
      expect(loadPopupData).toHaveBeenCalledTimes(2);
      expect(isCurrentPopupDocument).toHaveBeenCalledTimes(1);
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test.each(["navigation", "activation", "removal"])(
    "ignores receiver recovery after a newer tab %s",
    async (event) => {
      const recovery = deferred();
      loadPopupData
        .mockResolvedValueOnce(data())
        .mockReturnValueOnce(recovery.promise)
        .mockResolvedValue(data("fr"));
      browser.tabs.get.mockResolvedValue(tab(29));
      const view = renderPage();
      await flushEffects();
      act(() => view.page.markUnavailable());
      if (event === "navigation") {
        updateTab({ url: "https://example.com/new", status: "complete" });
      } else {
        act(() => {
          if (event === "activation") {
            browser.tabs.onActivated.emit({ tabId: 29, windowId: 3 });
          } else {
            browser.tabs.onRemoved.emit(17);
          }
        });
      }
      await flushEffects();
      const current = view.page;
      recovery.resolve(data("stale"));
      await flushEffects();
      expect(view.page.generation).toBe(current.generation);
      expect(view.page.tab).toEqual(current.tab);
      expect(view.page.data).toEqual(event === "removal" ? null : data("fr"));
      expect(view.page.isLoading).toBe(false);
    }
  );

  test("retargets activation in its window while ignoring other windows", async () => {
    loadPopupData
      .mockResolvedValueOnce(data("en"))
      .mockResolvedValue(data("fr"));
    browser.tabs.get.mockResolvedValue(tab(29));
    const view = renderPage();
    await flushEffects();

    act(() => {
      browser.tabs.onActivated.emit({ tabId: 41, windowId: 9 });
      browser.tabs.onActivated.emit({ tabId: 17, windowId: 3 });
    });
    expect(browser.tabs.get).not.toHaveBeenCalled();
    expect(view.page.tab.id).toBe(17);

    act(() => browser.tabs.onActivated.emit({ tabId: 29, windowId: 3 }));
    expect(view.page.data).toBeNull();
    expect(browser.tabs.get).toHaveBeenCalledWith(29);
    await flushEffects();
    expect(view.page.tab.id).toBe(29);
    expect(view.page.data.rule.toLang).toBe("fr");
    expect(loadPopupData).toHaveBeenLastCalledWith({ tabId: 29 });
    expect(getCurTab).toHaveBeenCalledTimes(1);
  });

  test("keeps a removed tab unavailable when its pending query resolves", async () => {
    const pending = deferred();
    loadPopupData
      .mockResolvedValueOnce(data())
      .mockReturnValue(pending.promise);
    const view = renderPage();
    await flushEffects();
    updateTab({ status: "complete" });

    act(() => browser.tabs.onRemoved.emit(17));
    expect(view.page.tab).toBeNull();
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(false);
    pending.resolve(data("de"));
    await flushEffects();
    expect(view.page.tab).toBeNull();
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(false);
  });

  test("can activate another tab after an obsolete tab lookup is removed", async () => {
    const pending = deferred();
    browser.tabs.get
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(tab(41));
    const view = renderPage();
    await flushEffects();

    act(() => browser.tabs.onActivated.emit({ tabId: 29, windowId: 3 }));
    updateTab({ status: "complete" }, tab(29));
    pending.resolve(tab(29));
    await flushEffects();
    act(() => {
      browser.tabs.onRemoved.emit(29);
      browser.tabs.onActivated.emit({ tabId: 41, windowId: 3 });
    });
    await flushEffects();

    expect(browser.tabs.get).toHaveBeenLastCalledWith(41);
    expect(view.page.tab.id).toBe(41);
    expect(view.page.data).toEqual(data());
    expect(loadPopupData).toHaveBeenLastCalledWith({ tabId: 41 });
  });

  test("retries initialization while resources are loading", async () => {
    jest.useFakeTimers();
    try {
      getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
      loadPopupData
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(data("fr"));
      const view = renderPage();
      await flushEffects();
      expect(view.page.data).toBeNull();
      expect(view.page.isLoading).toBe(true);
      act(() => jest.advanceTimersByTime(250));
      await flushEffects();
      expect(view.page.data.rule.toLang).toBe("fr");
      expect(view.page.isLoading).toBe(false);
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("changes generation when a loading same-URL document is replaced", async () => {
    jest.useFakeTimers();
    try {
      getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
      loadPopupData
        .mockResolvedValueOnce({
          ...data("en"),
          document: { token: "old", frameId: 0 },
        })
        .mockResolvedValue({
          ...data("fr"),
          document: { token: "new", frameId: 0 },
        });
      const view = renderPage();
      await flushEffects();
      const previous = view.page;
      isCurrentPopupDocument.mockResolvedValueOnce(false);
      act(() => jest.advanceTimersByTime(250));
      await flushEffects();
      expect(view.page.generation).toBeGreaterThan(previous.generation);
      expect(view.page.data.rule.toLang).toBe("fr");
      act(() => previous.setRule({ toLang: "stale" }));
      expect(view.page.data.rule.toLang).toBe("fr");
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("finishing resources preserves edits and generation for the same document", async () => {
    jest.useFakeTimers();
    try {
      getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
      loadPopupData.mockResolvedValue({
        ...data(),
        document: { token: "current", frameId: 0 },
      });
      const view = renderPage();
      await flushEffects();
      const generation = view.page.generation;
      act(() => view.page.setRule((rule) => ({ ...rule, toLang: "de" })));
      updateTab({ status: "complete" });
      await flushEffects();
      expect(view.page.generation).toBe(generation);
      expect(view.page.data.rule.toLang).toBe("de");
      act(() => jest.advanceTimersByTime(500));
      await flushEffects();
      expect(loadPopupData).toHaveBeenCalledTimes(1);
      expect(isCurrentPopupDocument).toHaveBeenCalledTimes(1);
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("child-frame loading and completion preserve the displayed document and its edits", async () => {
    loadPopupData.mockResolvedValue({
      ...data(),
      document: { token: "current", frameId: 0 },
    });
    const view = renderPage();
    await flushEffects();
    const previous = view.page;
    act(() => {
      previous.setRule((rule) => ({ ...rule, toLang: "de" }));
      previous.setSetting((setting) => ({ ...setting, darkMode: "dark" }));
    });
    updateTab({ status: "loading" });
    await flushEffects();
    expect(view.page.tab.status).toBe("loading");
    expect(view.page.generation).toBe(previous.generation);
    expect(view.page.isLoading).toBe(false);
    expect(view.page.data.rule.toLang).toBe("de");
    expect(view.page.data.setting.darkMode).toBe("dark");
    updateTab({ status: "complete" });
    await flushEffects();
    expect(view.page.generation).toBe(previous.generation);
    expect(view.page.tab.status).toBe("complete");
    expect(view.page.data.rule.toLang).toBe("de");
    // An action that started before the child navigation still owns this page.
    act(() => previous.setRule((rule) => ({ ...rule, transOpen: "true" })));
    expect(view.page.data.rule.transOpen).toBe("true");
    expect(loadPopupData).toHaveBeenCalledTimes(1);
    expect(isCurrentPopupDocument).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["loading", "complete", true],
    ["loading", "complete", false],
    ["complete", "loading", true],
    ["complete", "loading", false],
  ])(
    "ignores an older %s validation after %s is verified (old identity: %s)",
    async (firstStatus, latestStatus, oldIdentity) => {
      jest.useFakeTimers();
      try {
        loadPopupData.mockResolvedValue({
          ...data(),
          document: { token: "current", frameId: 0 },
        });
        const first = deferred();
        const latest = deferred();
        isCurrentPopupDocument
          .mockReturnValueOnce(first.promise)
          .mockReturnValueOnce(latest.promise);
        const view = renderPage();
        await flushEffects();
        const generation = view.page.generation;
        act(() => view.page.setRule((rule) => ({ ...rule, toLang: "de" })));
        updateTab({ status: firstStatus });
        updateTab({ status: latestStatus });
        latest.resolve(true);
        await flushEffects();
        first.resolve(oldIdentity);
        await flushEffects();
        expect(view.page.generation).toBe(generation);
        expect(view.page.tab.status).toBe(latestStatus);
        expect(view.page.data.rule.toLang).toBe("de");
        act(() => jest.advanceTimersByTime(250));
        await flushEffects();
        expect(loadPopupData).toHaveBeenCalledTimes(1);
        expect(isCurrentPopupDocument).toHaveBeenCalledTimes(
          latestStatus === "loading" ? 3 : 2
        );
        view.unmount();
      } finally {
        jest.useRealTimers();
      }
    }
  );

  test.each(["loading", "complete"])(
    "ignores an obsolete watcher after a newer %s event verifies the document",
    async (status) => {
      jest.useFakeTimers();
      try {
        getCurTab.mockResolvedValue(tab(17, { status: "loading" }));
        loadPopupData.mockResolvedValue({
          ...data(),
          document: { token: "current", frameId: 0 },
        });
        const pendingWatch = deferred();
        isCurrentPopupDocument.mockReturnValueOnce(pendingWatch.promise);
        const view = renderPage();
        await flushEffects();
        const generation = view.page.generation;
        act(() => jest.advanceTimersByTime(250));
        updateTab({ status });
        await flushEffects();
        pendingWatch.resolve(false);
        await flushEffects();
        expect(view.page.generation).toBe(generation);
        expect(view.page.tab.status).toBe(status);
        expect(loadPopupData).toHaveBeenCalledTimes(1);
        act(() => jest.advanceTimersByTime(250));
        await flushEffects();
        expect(isCurrentPopupDocument).toHaveBeenCalledTimes(
          status === "loading" ? 3 : 2
        );
        view.unmount();
      } finally {
        jest.useRealTimers();
      }
    }
  );

  test("continues watching a preserved loading document until its replacement commits", async () => {
    jest.useFakeTimers();
    try {
      loadPopupData
        .mockResolvedValueOnce({
          ...data(),
          document: { token: "old", frameId: 0 },
        })
        .mockResolvedValue({
          ...data("fr"),
          document: { token: "new", frameId: 0 },
        });
      const view = renderPage();
      await flushEffects();
      const previous = view.page;
      updateTab({ status: "loading" });
      await flushEffects();
      expect(view.page.generation).toBe(previous.generation);
      isCurrentPopupDocument.mockResolvedValueOnce(false);
      act(() => jest.advanceTimersByTime(250));
      await flushEffects();
      expect(view.page.generation).toBeGreaterThan(previous.generation);
      expect(view.page.data.document.token).toBe("new");
      act(() => previous.setRule({ toLang: "stale" }));
      expect(view.page.data.rule.toLang).toBe("fr");
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("invalidates a same-URL loading event when document verification detects a pending navigation", async () => {
    loadPopupData
      .mockResolvedValueOnce({
        ...data(),
        document: { token: "old", frameId: 0 },
      })
      .mockResolvedValue(undefined);
    const view = renderPage();
    await flushEffects();
    const previous = view.page;
    isCurrentPopupDocument.mockResolvedValueOnce(false);
    updateTab(
      { status: "loading" },
      tab(17, { pendingUrl: tab().url, status: "loading" })
    );
    await flushEffects();
    expect(isCurrentPopupDocument).toHaveBeenCalledWith(17, {
      token: "old",
      frameId: 0,
    });
    expect(view.page.generation).toBeGreaterThan(previous.generation);
    expect(view.page.data).toBeNull();
    expect(view.page.isLoading).toBe(true);
    act(() => previous.setRule(data("stale").rule));
    expect(view.page.data).toBeNull();
  });

  test("releases listeners on close and captures a new tab when reopened", async () => {
    const pending = deferred();
    getCurTab.mockResolvedValueOnce(tab(17)).mockResolvedValueOnce(tab(29));
    loadPopupData
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(data("fr"));
    const first = renderPage();
    await flushEffects();
    first.unmount();
    for (const name of ["onUpdated", "onRemoved", "onActivated"]) {
      const event = browser.tabs[name];
      expect(event.removeListener).toHaveBeenCalledWith(
        event.addListener.mock.calls[0][0]
      );
    }

    const reopened = renderPage();
    await flushEffects();
    expect(reopened.page.tab.id).toBe(29);
    expect(reopened.page.data.rule.toLang).toBe("fr");
    expect(loadPopupData).toHaveBeenLastCalledWith({ tabId: 29 });
    pending.resolve(data("de"));
    await flushEffects();
    expect(reopened.page.data.rule.toLang).toBe("fr");
  });
});
