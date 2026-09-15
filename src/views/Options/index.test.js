import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Options, { normalizeOptionsHashPath } from "./index";
import {
  STOKEY_RULES,
  STOKEY_SETTING,
  STOKEY_SYNC,
  STOKEY_WORDS,
} from "../../config";
import { trySyncRules, trySyncSetting, trySyncWords } from "../../libs/sync";
import { refreshStorageKeys } from "../../libs/storageRefresh";
import { kissLog } from "../../libs/log";
import { adaptScript } from "../../libs/gm";
import { runDataMigration } from "../../libs/storage";
import { sleep } from "../../libs/utils";
import { USERSCRIPT_STORAGE_PROTOCOL } from "../../libs/userscriptProtocol";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockIsGm = false;
const mockSettingProvider = jest.fn();
const mockPageMounted = jest.fn();

jest.mock("../../libs/client", () => ({
  get isGm() {
    return mockIsGm;
  },
}));
jest.mock("../../libs/sync", () => ({
  trySyncRules: jest.fn(),
  trySyncSetting: jest.fn(),
  trySyncWords: jest.fn(),
}));
jest.mock("../../libs/storageRefresh", () => ({
  refreshStorageKeys: jest.fn(),
}));
jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
  LogLevel: { INFO: { value: 1 } },
}));
jest.mock("../../libs/gm", () => ({ adaptScript: jest.fn() }));
jest.mock("../../libs/storage", () => ({ runDataMigration: jest.fn() }));
jest.mock("../../libs/utils", () => ({ sleep: jest.fn() }));
jest.mock("../../hooks/Setting", () => ({
  SettingProvider: function SettingProvider(props) {
    mockSettingProvider(props);
    return props.children;
  },
}));
jest.mock("./OptionsTheme", () => {
  return function ThemeProvider(props) {
    return props.children;
  };
});
jest.mock("../../hooks/Alert", () => ({
  AlertProvider: function AlertProvider(props) {
    return props.children;
  },
}));
jest.mock("../../hooks/Confirm", () => ({
  ConfirmProvider: function ConfirmProvider(props) {
    return props.children;
  },
}));
jest.mock("@mui/material/Backdrop", () => {
  return function MockBackdrop(props) {
    const React = require("react");
    return props.open
      ? React.createElement(
          "div",
          {
            "data-testid": props["data-testid"],
            "aria-label": props["aria-label"],
            role: props.role,
          },
          props.children
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
    const { Link, Outlet } = require("react-router-dom");
    return React.createElement(
      "div",
      {},
      React.createElement(
        "header",
        { "data-testid": "options-header" },
        React.createElement("button", {}, "Change theme"),
        React.createElement(Link, { to: "/words" }, "Favorite words")
      ),
      React.createElement(Outlet)
    );
  };
});

function mockComponent(testId) {
  return function MockComponent() {
    const React = require("react");
    React.useEffect(() => {
      mockPageMounted(testId);
    }, []);
    return React.createElement(
      "div",
      { "data-testid": testId },
      React.createElement("button", {}, "Edit local data")
    );
  };
}

jest.mock("./Rules", () => mockComponent("rules-page"));
jest.mock("./FavWords", () => mockComponent("words-page"));
jest.mock("./Apis", () => mockComponent("apis-page"));
jest.mock("./Setting", () => mockComponent("setting-page"));
jest.mock("./StylesSetting", () => mockComponent("styles-page"));
jest.mock("./SyncSetting", () => mockComponent("sync-page"));
jest.mock("./About", () => mockComponent("about-page"));
jest.mock("./Prompts", () => mockComponent("prompts-page"));
jest.mock("./InputSetting", () => mockComponent("input-page"));
jest.mock("./Tranbox", () => mockComponent("tranbox-page"));
jest.mock("./Playground", () => mockComponent("playground-page"));
jest.mock("./MouseHover", () => mockComponent("mousehover-page"));
jest.mock("./Subtitle", () => mockComponent("subtitle-page"));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mountedViews = [];

function renderOptions(hash, { strict = false } = {}) {
  window.location.hash = hash;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      strict ? (
        <StrictMode>
          <Options />
        </StrictMode>
      ) : (
        <Options />
      )
    );
  });
  const view = {
    container,
    query: (testId) => container.querySelector(`[data-testid='${testId}']`),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      mountedViews.splice(mountedViews.indexOf(view), 1);
    },
  };
  mountedViews.push(view);
  return view;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function resolveDeferred(deferred) {
  await act(async () => {
    deferred.resolve();
    await deferred.promise;
  });
  await flushEffects();
}

function expectLocked(view, expected = true) {
  expect(view.query("options-content").hasAttribute("inert")).toBe(expected);
  expect(view.query("options-content").getAttribute("aria-busy")).toBe(
    String(expected)
  );
  expect(Boolean(view.query("options-sync-backdrop"))).toBe(expected);
}

describe("normalizeOptionsHashPath", () => {
  test.each([
    ["#/", "/"],
    ["#/?source=test", "/"],
    ["#/rules/", "/rules"],
    ["#/rules/?source=test", "/rules"],
    ["", "/"],
  ])("normalizes %p to %p", (hash, expected) => {
    expect(normalizeOptionsHashPath(hash)).toBe(expected);
  });
});

describe("Options startup sync", () => {
  const originalName = process.env.REACT_APP_NAME;
  const originalVersion = process.env.REACT_APP_VERSION;

  beforeEach(() => {
    mockIsGm = false;
    jest.resetAllMocks();
    trySyncRules.mockResolvedValue(undefined);
    trySyncSetting.mockResolvedValue(undefined);
    trySyncWords.mockResolvedValue(undefined);
    refreshStorageKeys.mockResolvedValue(undefined);
    runDataMigration.mockResolvedValue(undefined);
    sleep.mockResolvedValue(undefined);
    process.env.REACT_APP_NAME = "KISS Translator";
    process.env.REACT_APP_VERSION = "2.0.25";
  });

  afterEach(() => {
    [...mountedViews].forEach((view) => view.unmount());
    window.location.hash = "";
    delete window.APP_INFO;
    if (originalName === undefined) delete process.env.REACT_APP_NAME;
    else process.env.REACT_APP_NAME = originalName;
    if (originalVersion === undefined) delete process.env.REACT_APP_VERSION;
    else process.env.REACT_APP_VERSION = originalVersion;
  });

  test.each([
    ["#/?source=test", "setting-page"],
    ["#/rules", "rules-page"],
    ["#/words", "words-page"],
    ["#/apis", "apis-page"],
    ["#/styles", "styles-page"],
  ])(
    "renders local %s while shared settings sync is pending",
    async (hash, page) => {
      const settingSync = createDeferred();
      trySyncSetting.mockReturnValueOnce(settingSync.promise);
      const view = renderOptions(hash);
      await flushEffects();

      expect(view.query(page)).not.toBe(null);
      expect(mockSettingProvider).toHaveBeenCalled();
      expectLocked(view);
      expect(trySyncSetting).toHaveBeenCalledTimes(1);
      expect(trySyncRules).not.toHaveBeenCalled();
      expect(trySyncWords).not.toHaveBeenCalled();

      await resolveDeferred(settingSync);
      expectLocked(view, false);
      expect(
        mockPageMounted.mock.calls.filter(([name]) => name === page)
      ).toHaveLength(1);
    }
  );

  test("keeps rules visible and locked until persisted rules refresh completes", async () => {
    const rulesSync = createDeferred();
    const rulesRefresh = createDeferred();
    trySyncRules.mockReturnValueOnce(rulesSync.promise);
    refreshStorageKeys.mockImplementation((keys) =>
      keys.includes(STOKEY_RULES) ? rulesRefresh.promise : Promise.resolve()
    );
    const view = renderOptions("#/rules");
    await flushEffects();

    expect(view.query("rules-page")).not.toBe(null);
    expectLocked(view);
    expect(refreshStorageKeys).toHaveBeenCalledWith([
      STOKEY_SETTING,
      STOKEY_SYNC,
    ]);

    await resolveDeferred(rulesSync);
    expect(refreshStorageKeys).toHaveBeenCalledWith([
      STOKEY_RULES,
      STOKEY_SYNC,
    ]);
    expectLocked(view);
    await resolveDeferred(rulesRefresh);
    expectLocked(view, false);
  });

  test("the overview waits for rules after shared settings become ready", async () => {
    const settingSync = createDeferred();
    const rulesSync = createDeferred();
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    trySyncRules.mockReturnValueOnce(rulesSync.promise);
    const view = renderOptions("#/");
    await flushEffects();

    expect(view.query("setting-page")).not.toBe(null);
    expect(trySyncRules).not.toHaveBeenCalled();
    await resolveDeferred(settingSync);
    expect(trySyncRules).toHaveBeenCalledTimes(1);
    expect(trySyncWords).not.toHaveBeenCalled();
    expectLocked(view);
    await resolveDeferred(rulesSync);
    expectLocked(view, false);
  });

  test("syncs words before background rules when opened on favorite words", async () => {
    const wordsSync = createDeferred();
    trySyncWords.mockReturnValueOnce(wordsSync.promise);
    const view = renderOptions("#/words");
    await flushEffects();

    expect(trySyncWords).toHaveBeenCalledTimes(1);
    expect(trySyncRules).not.toHaveBeenCalled();
    expectLocked(view);
    await resolveDeferred(wordsSync);
    expect(trySyncRules).toHaveBeenCalledTimes(1);
    expectLocked(view, false);
  });

  test("refreshes background data without remounting an unlocked settings page", async () => {
    const rulesSync = createDeferred();
    const wordsSync = createDeferred();
    trySyncRules.mockReturnValueOnce(rulesSync.promise);
    trySyncWords.mockReturnValueOnce(wordsSync.promise);
    const view = renderOptions("#/apis");
    await flushEffects();

    expectLocked(view, false);
    expect(trySyncWords).not.toHaveBeenCalled();
    await resolveDeferred(rulesSync);
    await resolveDeferred(wordsSync);
    expect(refreshStorageKeys).toHaveBeenCalledWith([
      STOKEY_RULES,
      STOKEY_SYNC,
    ]);
    expect(refreshStorageKeys).toHaveBeenCalledWith([
      STOKEY_WORDS,
      STOKEY_SYNC,
    ]);
    expectLocked(view, false);
    expect(
      mockPageMounted.mock.calls.filter(([name]) => name === "apis-page")
    ).toHaveLength(1);
  });

  test("locks the destination route when its background words sync is pending", async () => {
    const wordsSync = createDeferred();
    trySyncWords.mockReturnValueOnce(wordsSync.promise);
    const view = renderOptions("#/apis");
    await flushEffects();
    expectLocked(view, false);

    act(() => view.container.querySelector("a[href='#/words']").click());
    expect(view.query("words-page")).not.toBe(null);
    expectLocked(view);
    await resolveDeferred(wordsSync);
    expectLocked(view, false);
  });

  test("keeps sync configuration locked until all startup syncs finish", async () => {
    const wordsSync = createDeferred();
    trySyncWords.mockReturnValueOnce(wordsSync.promise);
    const view = renderOptions("#/sync");
    await flushEffects();

    expect(view.query("sync-page")).not.toBe(null);
    expectLocked(view);
    await resolveDeferred(wordsSync);
    expectLocked(view, false);
  });

  test("uses native inert for mouse and keyboard exclusion across the whole shell", async () => {
    const settingSync = createDeferred();
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    const view = renderOptions("#/apis");
    await flushEffects();

    const content = view.query("options-content");
    expect(content.getAttribute("inert")).toBe("");
    expect(view.query("options-header").closest("[inert]")).toBe(content);
    expect(
      view.query("apis-page").querySelector("button").closest("[inert]")
    ).toBe(content);
    expect(view.query("options-sync-backdrop").closest("[inert]")).toBe(null);

    await resolveDeferred(settingSync);
    expect(content.hasAttribute("inert")).toBe(false);
  });

  test("refreshes local state after a failed sync and releases its page", async () => {
    trySyncRules.mockRejectedValueOnce(new Error("rules failed"));
    const view = renderOptions("#/rules");
    await flushEffects();

    expect(kissLog).toHaveBeenCalledWith(
      `sync options ${STOKEY_RULES}`,
      "rules failed"
    );
    expect(refreshStorageKeys).toHaveBeenCalledWith([
      STOKEY_RULES,
      STOKEY_SYNC,
    ]);
    expect(view.query("rules-page")).not.toBe(null);
    expectLocked(view, false);
  });

  test("does not make stale data editable when storage refresh fails", async () => {
    refreshStorageKeys.mockRejectedValueOnce(new Error("storage unavailable"));
    const view = renderOptions("#/apis");
    await flushEffects();

    expect(view.container.textContent).toContain("storage unavailable");
    expect(view.query("apis-page")).toBe(null);
  });

  test("does not start duplicate syncs when StrictMode restarts effects", async () => {
    const settingSync = createDeferred();
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    const view = renderOptions("#/apis", { strict: true });
    await flushEffects();
    expect(trySyncSetting).toHaveBeenCalledTimes(1);

    await resolveDeferred(settingSync);
    expect(trySyncRules).toHaveBeenCalledTimes(1);
    expect(trySyncWords).toHaveBeenCalledTimes(1);
    expect(refreshStorageKeys).toHaveBeenCalledTimes(3);
    expectLocked(view, false);
  });

  test("settles pending work safely after unmount", async () => {
    const settingSync = createDeferred();
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    const view = renderOptions("#/apis");
    await flushEffects();
    view.unmount();
    const renderCount = mockSettingProvider.mock.calls.length;

    await resolveDeferred(settingSync);
    expect(mockSettingProvider).toHaveBeenCalledTimes(renderCount);
    expect(refreshStorageKeys).toHaveBeenCalledTimes(3);
  });

  test("waits for the GM bridge and migration, then renders during network sync", async () => {
    const bridgeWait = createDeferred();
    const migration = createDeferred();
    const settingSync = createDeferred();
    mockIsGm = true;
    sleep.mockReturnValueOnce(bridgeWait.promise);
    runDataMigration.mockReturnValueOnce(migration.promise);
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    const view = renderOptions("#/apis", { strict: true });
    await flushEffects();

    expect(mockSettingProvider).not.toHaveBeenCalled();
    expect(adaptScript).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.0.24",
      storageProtocol: USERSCRIPT_STORAGE_PROTOCOL,
      eventName: "kiss-ping",
    };
    await resolveDeferred(bridgeWait);
    expect(adaptScript).toHaveBeenCalledTimes(1);
    expect(adaptScript).toHaveBeenCalledWith("kiss-ping");
    expect(runDataMigration).toHaveBeenCalledTimes(1);
    expect(mockSettingProvider).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();

    await resolveDeferred(migration);
    expect(view.query("apis-page")).not.toBe(null);
    expectLocked(view);
    expect(trySyncSetting).toHaveBeenCalledTimes(1);
    expect(runDataMigration.mock.invocationCallOrder[0]).toBeGreaterThan(
      adaptScript.mock.invocationCallOrder[0]
    );
    expect(mockSettingProvider.mock.invocationCallOrder[0]).toBeGreaterThan(
      runDataMigration.mock.invocationCallOrder[0]
    );
    await resolveDeferred(settingSync);
    expectLocked(view, false);
  });

  test("finishes local migration before mounting extension settings or syncing", async () => {
    const migration = createDeferred();
    const settingSync = createDeferred();
    runDataMigration.mockReturnValueOnce(migration.promise);
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    const view = renderOptions("#/apis", { strict: true });
    await flushEffects();

    expect(runDataMigration).toHaveBeenCalledTimes(1);
    expect(mockSettingProvider).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();
    await resolveDeferred(migration);
    expect(view.query("apis-page")).not.toBe(null);
    expectLocked(view);
    await resolveDeferred(settingSync);
    expectLocked(view, false);
  });

  test("does not expose editable settings after local migration fails", async () => {
    runDataMigration.mockResolvedValueOnce(false);
    const view = renderOptions("#/apis");
    await flushEffects();

    expect(view.container.textContent).toContain(
      "Unable to migrate local settings"
    );
    expect(mockSettingProvider).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();
  });

  test("shows a version mismatch without reading storage", async () => {
    mockIsGm = true;
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.1.0",
      eventName: "kiss-ping",
    };
    const view = renderOptions("#/apis");
    await flushEffects();

    expect(view.container.textContent).toContain("not the latest version");
    expect(adaptScript).not.toHaveBeenCalled();
    expect(runDataMigration).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();
    expect(mockSettingProvider).not.toHaveBeenCalled();
  });

  test("shows a timeout when the userscript bridge stays unavailable", async () => {
    mockIsGm = true;
    const view = renderOptions("#/apis");
    await flushEffects();

    expect(view.container.textContent).toContain("Time out. Please confirm");
    expect(sleep).toHaveBeenCalledTimes(8);
    expect(runDataMigration).not.toHaveBeenCalled();
    expect(trySyncSetting).not.toHaveBeenCalled();
    expect(mockSettingProvider).not.toHaveBeenCalled();
  });
});
