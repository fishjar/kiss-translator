import { act } from "react";
import { createRoot } from "react-dom/client";
import Options from "./index";
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_SETTING,
  DEFAULT_SYNC,
  SETTINGS_VERSION_V2,
  STOKEY_RULES,
  STOKEY_SETTING,
  STOKEY_SYNC,
  STOKEY_WORDS,
} from "../../config";
import { adaptScript } from "../../libs/gm";
import { browser } from "../../libs/browser";
import { runDataMigration, storage } from "../../libs/storage";
import {
  syncData,
  trySyncRules,
  trySyncSetting,
  trySyncWords,
} from "../../libs/sync";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockIsGm = false;

jest.mock("../../libs/client", () => ({
  get isGm() {
    return mockIsGm;
  },
  isExt: true,
}));

jest.mock("../../libs/browser", () => ({
  isOptions: () => true,
  browser: {
    storage: {
      local: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
    },
  },
}));

jest.mock("../../libs/storageCoordination", () => {
  let queue = Promise.resolve();
  return {
    withStorageLock: (operation) => {
      const pending = queue.then(() => operation());
      queue = pending.catch(() => {});
      return pending;
    },
  };
});

jest.mock("../../libs/gm", () => ({ adaptScript: jest.fn() }));

jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));

jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
  logger: { setLevel: jest.fn(), error: jest.fn() },
  LogLevel: { INFO: { value: 1 } },
}));

jest.mock("../../libs/storage", () => {
  const actual = jest.requireActual("../../libs/storage");
  return {
    ...actual,
    storage: {
      ...actual.storage,
      getObj: jest.fn(actual.storage.getObj),
      setObj: jest.fn(actual.storage.setObj),
      del: jest.fn(actual.storage.del),
    },
    runDataMigration: jest.fn(actual.runDataMigration),
  };
});

jest.mock("../../libs/rules", () => ({ checkRules: (rules) => rules }));

jest.mock("../../libs/sync", () => ({
  syncData: jest.fn(),
  trySyncSetting: jest.fn(),
  trySyncRules: jest.fn(),
  trySyncWords: jest.fn(),
}));

jest.mock("./OptionsTheme", () => {
  return function MockTheme({ children }) {
    return children;
  };
});

jest.mock("../../hooks/Alert", () => ({
  AlertProvider: function MockAlertProvider({ children }) {
    return children;
  },
}));

jest.mock("../../hooks/Confirm", () => ({
  ConfirmProvider: function MockConfirmProvider({ children }) {
    return children;
  },
}));

jest.mock("@mui/material/Backdrop", () => {
  return function MockBackdrop({ open, children, ...props }) {
    const React = require("react");
    return open
      ? React.createElement(
          "div",
          {
            "data-testid": props["data-testid"],
            "aria-label": props["aria-label"],
          },
          children
        )
      : null;
  };
});

jest.mock("@mui/material/CircularProgress", () => {
  return function MockCircularProgress() {
    return null;
  };
});

jest.mock("./Layout", () => {
  return function MockLayout() {
    const React = require("react");
    const { Outlet } = require("react-router-dom");
    return React.createElement("main", null, React.createElement(Outlet));
  };
});

function mockSettingsPage(testId, withRules = false) {
  return function MockSettingsPage({ initialSettingsReady }) {
    const React = require("react");
    const { useSetting } = require("../../hooks/Setting");
    const { setting } = useSetting();
    return React.createElement(
      "section",
      {
        "data-testid": testId,
        "data-initial-settings-ready": initialSettingsReady,
      },
      React.createElement(
        "output",
        { "data-testid": "setting-value" },
        JSON.stringify({
          marker: setting.marker,
          darkMode: setting.darkMode,
          version: setting.version,
        })
      ),
      withRules ? React.createElement(MockRulesOutput) : null
    );
  };
}

function MockRulesOutput() {
  const React = require("react");
  const { useRules } = require("../../hooks/Rules");
  const { list } = useRules();
  return React.createElement(
    "output",
    { "data-testid": "rules-value" },
    list.map((rule) => rule.marker || rule.pattern).join(",")
  );
}

function mockEmptyPage() {
  return null;
}

jest.mock("./Setting", () => mockSettingsPage("setting-page", true));
jest.mock("./Rules", () => mockSettingsPage("rules-page", true));
jest.mock("./Apis", () => mockSettingsPage("apis-page"));
jest.mock("./About", () => mockEmptyPage);
jest.mock("./SyncSetting", () => mockEmptyPage);
jest.mock("./Prompts", () => mockEmptyPage);
jest.mock("./InputSetting", () => mockEmptyPage);
jest.mock("./Tranbox", () => mockEmptyPage);
jest.mock("./FavWords", () => mockEmptyPage);
jest.mock("./Playground", () => mockSettingsPage("playground-page"));
jest.mock("./MouseHover", () => mockEmptyPage);
jest.mock("./Subtitle", () => mockEmptyPage);
jest.mock("./StylesSetting", () => mockEmptyPage);

const hosts = new Set();
const pendingDeferreds = new Set();
const originalAppName = process.env.REACT_APP_NAME;
const originalAppVersion = process.env.REACT_APP_VERSION;
let storedValues;

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function commitStoredValues(values) {
  Object.entries(values).forEach(([key, value]) => {
    storedValues.set(key, JSON.parse(value));
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  const result = { promise, resolve };
  pendingDeferreds.add(result);
  return result;
}

function renderOptions(hash) {
  window.history.replaceState(null, "", hash);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const host = {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
      hosts.delete(host);
    },
  };
  hosts.add(host);
  act(() => root.render(<Options />));
  return host;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advanceTime(duration) {
  await act(async () => {
    jest.advanceTimersByTime(duration);
  });
}

function readSetting(host) {
  return JSON.parse(
    host.container.querySelector("[data-testid='setting-value']").textContent
  );
}

function readPlaygroundReadiness(host) {
  return host.container
    .querySelector("[data-testid='playground-page']")
    .getAttribute("data-initial-settings-ready");
}

function expectInteractionBlocked(host, expected) {
  const content = host.container.querySelector(
    "[data-testid='options-content']"
  );
  expect(content.hasAttribute("inert")).toBe(expected);
  expect(content.getAttribute("aria-busy")).toBe(String(expected));
  expect(
    host.container.querySelector("[data-testid='options-sync-backdrop']") !==
      null
  ).toBe(expected);
}

describe("Options startup with real storage hooks", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    mockIsGm = false;
    storedValues = new Map([
      [
        STOKEY_SETTING,
        {
          ...copy(DEFAULT_SETTING),
          marker: "local-setting",
          darkMode: "light",
          version: CURRENT_SETTINGS_VERSION,
        },
      ],
      [STOKEY_RULES, [{ pattern: "*", marker: "local-rules" }]],
      [STOKEY_WORDS, {}],
      [STOKEY_SYNC, copy(DEFAULT_SYNC)],
    ]);
    browser.storage.local.get.mockImplementation(async (keys) =>
      Object.fromEntries(
        keys.map((key) => [key, JSON.stringify(storedValues.get(key))])
      )
    );
    browser.storage.local.set.mockImplementation(async (values) => {
      commitStoredValues(values);
    });
    browser.storage.local.remove.mockImplementation(async (keys) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        storedValues.delete(key);
      });
    });
    const actual = jest.requireActual("../../libs/storage");
    storage.getObj.mockImplementation(actual.storage.getObj);
    storage.setObj.mockImplementation(actual.storage.setObj);
    storage.del.mockImplementation(actual.storage.del);
    runDataMigration.mockImplementation(actual.runDataMigration);
    syncData.mockResolvedValue(undefined);
    trySyncSetting.mockResolvedValue(undefined);
    trySyncRules.mockResolvedValue(undefined);
    trySyncWords.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    for (const host of hosts) host.unmount();
    await act(async () => {
      for (const pending of pendingDeferreds) pending.resolve();
      pendingDeferreds.clear();
    });
    jest.useRealTimers();
    window.history.replaceState(null, "", "#/");
    delete window.APP_INFO;
    if (originalAppName === undefined) delete process.env.REACT_APP_NAME;
    else process.env.REACT_APP_NAME = originalAppName;
    if (originalAppVersion === undefined) delete process.env.REACT_APP_VERSION;
    else process.env.REACT_APP_VERSION = originalAppVersion;
  });

  test("initializes Playground only after synchronized settings reach the provider", async () => {
    const settingSync = deferred();
    const remoteSetting = {
      ...storedValues.get(STOKEY_SETTING),
      marker: "remote-setting",
    };
    trySyncSetting.mockImplementation(async () => {
      await settingSync.promise;
      await storage.setObj(STOKEY_SETTING, remoteSetting);
    });
    const view = renderOptions("#/playground");
    await flushEffects();
    expect(readSetting(view).marker).toBe("local-setting");
    expect(readPlaygroundReadiness(view)).toBe("false");
    expectInteractionBlocked(view, true);

    await act(async () => settingSync.resolve());
    await flushEffects();

    expect(readSetting(view).marker).toBe("remote-setting");
    expect(readPlaygroundReadiness(view)).toBe("true");
    expectInteractionBlocked(view, false);
  });

  test.each([
    ["#/", "setting-page"],
    ["#/rules", "rules-page"],
  ])(
    "shows local data on %s while refreshing settings and rules",
    async (hash, pageId) => {
      const settingSync = deferred();
      const rulesSync = deferred();
      const remoteSetting = {
        ...storedValues.get(STOKEY_SETTING),
        marker: "remote-setting",
        darkMode: "dark",
      };
      const remoteRules = [{ pattern: "*", marker: "remote-rules" }];
      trySyncSetting.mockImplementation(async () => {
        await settingSync.promise;
        await storage.setObj(STOKEY_SETTING, remoteSetting);
      });
      trySyncRules.mockImplementation(async () => {
        await rulesSync.promise;
        await storage.setObj(STOKEY_RULES, remoteRules);
      });

      const host = renderOptions(hash);
      await flushEffects();
      expect(
        host.container.querySelector(`[data-testid='${pageId}']`)
      ).not.toBe(null);
      expect(readSetting(host).marker).toBe("local-setting");
      expect(
        host.container.querySelector("[data-testid='rules-value']").textContent
      ).toBe("local-rules");
      expectInteractionBlocked(host, true);

      await advanceTime(6000);
      expect(storage.setObj).not.toHaveBeenCalled();
      expect(syncData).not.toHaveBeenCalled();
      expect(trySyncSetting).toHaveBeenCalledTimes(1);
      expect(trySyncRules).not.toHaveBeenCalled();

      await act(async () => settingSync.resolve());
      await flushEffects();
      expect(readSetting(host)).toMatchObject({
        marker: "remote-setting",
        darkMode: "dark",
      });
      expectInteractionBlocked(host, true);
      expect(trySyncRules).toHaveBeenCalledTimes(1);

      await act(async () => rulesSync.resolve());
      await flushEffects();
      expect(
        host.container.querySelector("[data-testid='rules-value']").textContent
      ).toBe("remote-rules");
      expectInteractionBlocked(host, false);
      await advanceTime(6000);
      expect(storedValues.get(STOKEY_SETTING)).toEqual(remoteSetting);
      expect(storedValues.get(STOKEY_RULES)).toEqual(remoteRules);
      expect(storage.setObj).toHaveBeenCalledTimes(2);
      expect(syncData).not.toHaveBeenCalled();
    }
  );

  test("keeps settings blocked until the mounted hook finishes its remote refresh", async () => {
    const settingSync = deferred();
    const settingRead = deferred();
    const rulesSync = deferred();
    const remoteSetting = {
      ...storedValues.get(STOKEY_SETTING),
      marker: "remote-setting",
    };
    trySyncSetting.mockImplementation(async () => {
      await settingSync.promise;
      await storage.setObj(STOKEY_SETTING, remoteSetting);
    });
    trySyncRules.mockReturnValue(rulesSync.promise);
    const host = renderOptions("#/apis");
    await flushEffects();

    const originalRead = browser.storage.local.get.getMockImplementation();
    let refreshPending = false;
    let refreshStarted = false;
    browser.storage.local.get.mockImplementation(async (keys) => {
      if (refreshPending && keys.includes(STOKEY_SETTING)) {
        refreshStarted = true;
        await settingRead.promise;
      }
      return originalRead(keys);
    });
    browser.storage.local.set.mockImplementation(async (values) => {
      commitStoredValues(values);
      if (Object.prototype.hasOwnProperty.call(values, STOKEY_SETTING)) {
        refreshPending = true;
      }
    });
    await act(async () => settingSync.resolve());
    await flushEffects();
    expect(storedValues.get(STOKEY_SETTING)).toEqual(remoteSetting);
    expect(refreshStarted).toBe(true);
    // Invalidation cannot adopt a payload before the coordinated read completes.
    expect(readSetting(host).marker).toBe("local-setting");
    expectInteractionBlocked(host, true);
    expect(trySyncRules).not.toHaveBeenCalled();

    await act(async () => settingRead.resolve());
    await flushEffects();
    expect(readSetting(host).marker).toBe("remote-setting");
    expectInteractionBlocked(host, false);
    expect(trySyncRules).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, "test-gm-bridge"])(
    "accepts an older compatible userscript bridge (%p) before migration and local storage access",
    async (eventName) => {
      mockIsGm = true;
      process.env.REACT_APP_NAME = "KISS Translator";
      process.env.REACT_APP_VERSION = "2.0.32";
      const migration = deferred();
      const settingSync = deferred();
      runDataMigration.mockReturnValue(migration.promise);
      trySyncSetting.mockReturnValue(settingSync.promise);
      const host = renderOptions("#/apis");
      await flushEffects();

      expect(storage.getObj).not.toHaveBeenCalled();
      expect(browser.storage.local.get).not.toHaveBeenCalled();
      expect(runDataMigration).not.toHaveBeenCalled();
      expect(host.container.querySelector("[data-testid='apis-page']")).toBe(
        null
      );

      window.APP_INFO = {
        name: "KISS Translator",
        version: "2.0.31",
        eventName,
      };
      await advanceTime(1000);
      if (eventName) expect(adaptScript).toHaveBeenCalledWith(eventName);
      else expect(adaptScript).not.toHaveBeenCalled();
      expect(runDataMigration).toHaveBeenCalledTimes(1);
      expect(storage.getObj).not.toHaveBeenCalled();
      expect(browser.storage.local.get).not.toHaveBeenCalled();
      expect(trySyncSetting).not.toHaveBeenCalled();

      await act(async () => migration.resolve());
      await flushEffects();
      expect(readSetting(host).marker).toBe("local-setting");
      expectInteractionBlocked(host, true);
      expect(trySyncSetting).toHaveBeenCalledTimes(1);
      await advanceTime(6000);
      expect(storage.setObj).not.toHaveBeenCalled();
      expect(syncData).not.toHaveBeenCalled();
    }
  );

  test("does not let an unfinished legacy normalization overwrite newer remote settings", async () => {
    const legacySetting = {
      ...storedValues.get(STOKEY_SETTING),
      marker: "legacy-setting",
      version: SETTINGS_VERSION_V2,
      darkMode: true,
    };
    const remoteSetting = {
      ...storedValues.get(STOKEY_SETTING),
      marker: "remote-setting",
      version: CURRENT_SETTINGS_VERSION,
      darkMode: "auto",
    };
    storedValues.set(STOKEY_SETTING, legacySetting);
    const normalizationWrite = deferred();
    const settingSync = deferred();
    browser.storage.local.set.mockImplementation(async (values) => {
      const setting = values[STOKEY_SETTING]
        ? JSON.parse(values[STOKEY_SETTING])
        : null;
      if (setting?.marker === "legacy-setting") {
        await normalizationWrite.promise;
      }
      commitStoredValues(values);
    });
    trySyncSetting.mockImplementation(async () => {
      await settingSync.promise;
      await storage.setObj(STOKEY_SETTING, remoteSetting);
    });

    const host = renderOptions("#/apis");
    await flushEffects();
    expect(runDataMigration).toHaveBeenCalledTimes(1);
    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
    const normalized = JSON.parse(
      browser.storage.local.set.mock.calls[0][0][STOKEY_SETTING]
    );
    expect(normalized).toMatchObject({
      marker: "legacy-setting",
      version: CURRENT_SETTINGS_VERSION,
      darkMode: "dark",
    });
    expect(host.container.querySelector("[data-testid='apis-page']")).toBe(
      null
    );
    expect(
      host.container.querySelector("[data-testid='options-sync-backdrop']")
    ).not.toBe(null);
    expect(storage.getObj).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();

    // Even a ready network result must wait for the actual migration write.
    await act(async () => settingSync.resolve());
    await flushEffects();
    await advanceTime(6000);
    expect(trySyncSetting).not.toHaveBeenCalled();
    expect(host.container.querySelector("[data-testid='apis-page']")).toBe(
      null
    );
    expect(storedValues.get(STOKEY_SETTING)).toEqual(legacySetting);

    await act(async () => normalizationWrite.resolve());
    await flushEffects();
    await advanceTime(6000);

    expect(readSetting(host)).toMatchObject({
      marker: "remote-setting",
      darkMode: "auto",
      version: CURRENT_SETTINGS_VERSION,
    });
    expect(storedValues.get(STOKEY_SETTING)).toEqual(remoteSetting);
    expect(trySyncSetting).toHaveBeenCalledTimes(1);
    expect(browser.storage.local.set).toHaveBeenCalledTimes(2);
    expect(syncData).not.toHaveBeenCalled();
    expectInteractionBlocked(host, false);
  });

  test("ignores a failed refresh after browser back unmounts its route", async () => {
    const rulesSync = deferred();
    trySyncRules.mockReturnValue(rulesSync.promise);
    const host = renderOptions("#/apis");
    await flushEffects();
    const navigate = async (hash) => {
      await act(async () => {
        window.history.pushState(null, "", hash);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await flushEffects();
    };
    await navigate("#/rules");
    let rejectRead;
    const pendingRead = new Promise((_, reject) => {
      rejectRead = reject;
    });
    const originalRead = browser.storage.local.get.getMockImplementation();
    let reloadStarted = false;
    browser.storage.local.get.mockImplementation((keys) => {
      if (keys.includes(STOKEY_RULES)) {
        reloadStarted = true;
        return pendingRead;
      }
      return originalRead(keys);
    });
    await act(async () => rulesSync.resolve());
    await flushEffects();
    expect(reloadStarted).toBe(true);
    await navigate("#/apis");
    const page = host.container.querySelector("[data-testid='apis-page']");
    await act(async () => rejectRead(new Error("Storage request timeout")));
    await flushEffects();
    expect(page.isConnected).toBe(true);
    expect(host.container.textContent).not.toContain("Storage request timeout");
    expectInteractionBlocked(host, false);
  });
});
