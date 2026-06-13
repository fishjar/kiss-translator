import { act } from "react";
import { createRoot } from "react-dom/client";
import Options from "./index";
import { trySyncRules, trySyncSetting, trySyncWords } from "../../libs/sync";
import { kissLog } from "../../libs/log";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/client", () => ({
  isGm: false,
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

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: function SettingProvider(props) {
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
    jest.clearAllMocks();
    trySyncRules.mockResolvedValue(undefined);
    trySyncSetting.mockResolvedValue(undefined);
    trySyncWords.mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.location.hash = "";
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
});
