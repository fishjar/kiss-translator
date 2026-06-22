import { act } from "react";
import { createRoot } from "react-dom/client";
import Options from "./index";
import { trySyncRules, trySyncSetting, trySyncWords } from "../../libs/sync";
import { kissLog } from "../../libs/log";
import { adaptScript } from "../../libs/gm";
import { runDataMigration } from "../../libs/storage";
import { sleep } from "../../libs/utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockIsGm = false;
const mockSettingProvider = jest.fn();

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

jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
}));

jest.mock("../../libs/gm", () => ({
  adaptScript: jest.fn(),
}));

jest.mock("../../libs/storage", () => ({
  runDataMigration: jest.fn(),
}));

jest.mock("../../libs/utils", () => ({
  sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: function SettingProvider(props) {
    mockSettingProvider(props);
    return props.children;
  },
}));

jest.mock("../../hooks/Theme", () => {
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
          },
          props.children
        )
      : null;
  };
});

jest.mock("@mui/material/CircularProgress", () => {
  return function MockCircularProgress() {
    const React = require("react");
    return React.createElement("div", { "data-testid": "sync-spinner" });
  };
});

function mockComponent(testId) {
  return function MockComponent() {
    const React = require("react");
    return React.createElement("div", testId ? { "data-testid": testId } : {});
  };
}

jest.mock("./Header", () => mockComponent("options-header"));
jest.mock("./Navigator", () => mockComponent("options-nav"));
jest.mock("./Rules", () => mockComponent("rules-page"));
jest.mock("./FavWords", () => mockComponent("words-page"));
jest.mock("./Apis", () => mockComponent("apis-page"));
jest.mock("./Setting", () => mockComponent("setting-page"));
jest.mock("./About", () => mockComponent());
jest.mock("./SyncSetting", () => mockComponent());
jest.mock("./Prompts", () => mockComponent());
jest.mock("./InputSetting", () => mockComponent());
jest.mock("./Tranbox", () => mockComponent());
jest.mock("./Playground", () => mockComponent());
jest.mock("./MouseHover", () => mockComponent());
jest.mock("./Subtitle", () => mockComponent());
jest.mock("./StylesSetting", () => mockComponent());

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderOptions(hash) {
  window.location.hash = hash;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Options />);
  });

  return {
    container,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Options startup sync", () => {
  beforeEach(() => {
    mockIsGm = false;
    jest.clearAllMocks();
    trySyncRules.mockResolvedValue(undefined);
    trySyncSetting.mockResolvedValue(undefined);
    trySyncWords.mockResolvedValue(undefined);
    runDataMigration.mockResolvedValue(undefined);
    sleep.mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.location.hash = "";
    delete window.APP_INFO;
  });

  test("renders rules page while waiting for rules sync", async () => {
    const rulesSync = createDeferred();
    trySyncRules.mockReturnValueOnce(rulesSync.promise);

    const view = renderOptions("#/rules");
    await flushEffects();

    expect(view.container.querySelector("[data-testid='rules-page']")).not.toBe(
      null
    );
    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).not.toBe(null);
    expect(trySyncRules).toHaveBeenCalledTimes(1);
    expect(trySyncSetting).not.toHaveBeenCalled();
    expect(trySyncWords).not.toHaveBeenCalled();

    await act(async () => {
      rulesSync.resolve();
      await rulesSync.promise;
    });
    await flushEffects();

    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).toBe(null);
    expect(trySyncSetting).toHaveBeenCalledTimes(1);
    expect(trySyncWords).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test("waits for words sync on favorite words page", async () => {
    const wordsSync = createDeferred();
    trySyncWords.mockReturnValueOnce(wordsSync.promise);

    const view = renderOptions("#/words");
    await flushEffects();

    expect(view.container.querySelector("[data-testid='words-page']")).not.toBe(
      null
    );
    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).not.toBe(null);
    expect(trySyncWords).toHaveBeenCalledTimes(1);
    expect(trySyncSetting).not.toHaveBeenCalled();
    expect(trySyncRules).not.toHaveBeenCalled();

    await act(async () => {
      wordsSync.resolve();
      await wordsSync.promise;
    });
    await flushEffects();

    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).toBe(null);
    expect(trySyncSetting).toHaveBeenCalledTimes(1);
    expect(trySyncRules).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test("waits for setting sync on other pages", async () => {
    const settingSync = createDeferred();
    trySyncSetting.mockReturnValueOnce(settingSync.promise);

    const view = renderOptions("#/apis");
    await flushEffects();

    expect(view.container.querySelector("[data-testid='apis-page']")).not.toBe(
      null
    );
    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).not.toBe(null);
    expect(trySyncSetting).toHaveBeenCalledTimes(1);
    expect(trySyncRules).not.toHaveBeenCalled();
    expect(trySyncWords).not.toHaveBeenCalled();

    await act(async () => {
      settingSync.resolve();
      await settingSync.promise;
    });
    await flushEffects();

    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).toBe(null);
    expect(trySyncRules).toHaveBeenCalledTimes(1);
    expect(trySyncWords).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test("background sync failures do not reopen the backdrop", async () => {
    trySyncRules.mockRejectedValueOnce(new Error("rules failed"));

    const view = renderOptions("#/apis");
    await flushEffects();

    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).toBe(null);
    await flushEffects();

    expect(kissLog).toHaveBeenCalledWith(
      "sync options background",
      "rules failed"
    );
    expect(
      view.container.querySelector("[data-testid='options-sync-backdrop']")
    ).toBe(null);

    view.unmount();
  });

  test("waits for userscript GM bridge before mounting settings", async () => {
    const originalName = process.env.REACT_APP_NAME;
    const originalVersion = process.env.REACT_APP_VERSION;
    let view;
    const settingSync = createDeferred();
    mockIsGm = true;
    trySyncSetting.mockReturnValueOnce(settingSync.promise);
    process.env.REACT_APP_NAME = "KISS Translator";
    process.env.REACT_APP_VERSION = "2.0.25";
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.0.25",
      eventName: "kiss-ping",
    };

    try {
      view = renderOptions("#/apis");

      await flushEffects();

      expect(adaptScript).toHaveBeenCalledWith("kiss-ping");
      expect(runDataMigration).toHaveBeenCalledTimes(1);
      expect(runDataMigration.mock.invocationCallOrder[0]).toBeGreaterThan(
        adaptScript.mock.invocationCallOrder[0]
      );
      expect(mockSettingProvider).toHaveBeenCalled();
      expect(mockSettingProvider.mock.invocationCallOrder[0]).toBeGreaterThan(
        runDataMigration.mock.invocationCallOrder[0]
      );
      expect(
        view.container.querySelector("[data-testid='apis-page']")
      ).not.toBe(null);
      expect(
        view.container.querySelector("[data-testid='options-sync-backdrop']")
      ).not.toBe(null);
      expect(trySyncSetting).toHaveBeenCalledTimes(1);
      expect(trySyncSetting.mock.invocationCallOrder[0]).toBeGreaterThan(
        runDataMigration.mock.invocationCallOrder[0]
      );

      await act(async () => {
        settingSync.resolve();
        await settingSync.promise;
      });
      await flushEffects();

      expect(
        view.container.querySelector("[data-testid='options-sync-backdrop']")
      ).toBe(null);
    } finally {
      view?.unmount();
      if (originalName === undefined) {
        delete process.env.REACT_APP_NAME;
      } else {
        process.env.REACT_APP_NAME = originalName;
      }
      if (originalVersion === undefined) {
        delete process.env.REACT_APP_VERSION;
      } else {
        process.env.REACT_APP_VERSION = originalVersion;
      }
    }
  });

  test("keeps userscript options loading while data migration is pending", async () => {
    const originalName = process.env.REACT_APP_NAME;
    const originalVersion = process.env.REACT_APP_VERSION;
    let view;
    const migration = createDeferred();
    mockIsGm = true;
    runDataMigration.mockReturnValueOnce(migration.promise);
    process.env.REACT_APP_NAME = "KISS Translator";
    process.env.REACT_APP_VERSION = "2.0.25";
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.0.25",
      eventName: "kiss-ping",
    };

    try {
      view = renderOptions("#/apis");

      await flushEffects();

      expect(adaptScript).toHaveBeenCalledWith("kiss-ping");
      expect(runDataMigration).toHaveBeenCalledTimes(1);
      expect(mockSettingProvider).not.toHaveBeenCalled();
      expect(view.container.querySelector("[data-testid='apis-page']")).toBe(
        null
      );
      expect(
        view.container.querySelector("[data-testid='options-sync-backdrop']")
      ).not.toBe(null);
      expect(trySyncSetting).not.toHaveBeenCalled();
      expect(trySyncRules).not.toHaveBeenCalled();
      expect(trySyncWords).not.toHaveBeenCalled();

      await act(async () => {
        migration.resolve();
        await migration.promise;
      });
      await flushEffects();

      expect(mockSettingProvider).toHaveBeenCalled();
      expect(
        view.container.querySelector("[data-testid='apis-page']")
      ).not.toBe(null);
      expect(trySyncSetting).toHaveBeenCalledTimes(1);
    } finally {
      view?.unmount();
      if (originalName === undefined) {
        delete process.env.REACT_APP_NAME;
      } else {
        process.env.REACT_APP_NAME = originalName;
      }
      if (originalVersion === undefined) {
        delete process.env.REACT_APP_VERSION;
      } else {
        process.env.REACT_APP_VERSION = originalVersion;
      }
    }
  });

  test("shows version mismatch error while mounted", async () => {
    const originalName = process.env.REACT_APP_NAME;
    const originalVersion = process.env.REACT_APP_VERSION;
    let view;
    mockIsGm = true;
    process.env.REACT_APP_NAME = "KISS Translator";
    process.env.REACT_APP_VERSION = "2.0.25";
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.1.0",
      eventName: "kiss-ping",
    };

    try {
      view = renderOptions("#/apis");

      await flushEffects();

      expect(
        view.container.textContent.includes("not the latest version")
      ).toBe(true);
      expect(adaptScript).not.toHaveBeenCalled();
      expect(runDataMigration).not.toHaveBeenCalled();
      expect(trySyncSetting).not.toHaveBeenCalled();
      expect(mockSettingProvider).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      if (originalName === undefined) {
        delete process.env.REACT_APP_NAME;
      } else {
        process.env.REACT_APP_NAME = originalName;
      }
      if (originalVersion === undefined) {
        delete process.env.REACT_APP_VERSION;
      } else {
        process.env.REACT_APP_VERSION = originalVersion;
      }
    }
  });

  test("shows timeout error when userscript APP_INFO is unavailable", async () => {
    const originalName = process.env.REACT_APP_NAME;
    const originalVersion = process.env.REACT_APP_VERSION;
    let view;
    mockIsGm = true;
    process.env.REACT_APP_NAME = "KISS Translator";
    process.env.REACT_APP_VERSION = "2.0.25";

    try {
      view = renderOptions("#/apis");

      await flushEffects();

      expect(
        view.container.textContent.includes("Time out. Please confirm")
      ).toBe(true);
      expect(sleep).toHaveBeenCalledTimes(8);
      expect(adaptScript).not.toHaveBeenCalled();
      expect(runDataMigration).not.toHaveBeenCalled();
      expect(trySyncSetting).not.toHaveBeenCalled();
      expect(mockSettingProvider).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      if (originalName === undefined) {
        delete process.env.REACT_APP_NAME;
      } else {
        process.env.REACT_APP_NAME = originalName;
      }
      if (originalVersion === undefined) {
        delete process.env.REACT_APP_VERSION;
      } else {
        process.env.REACT_APP_VERSION = originalVersion;
      }
    }
  });
});
