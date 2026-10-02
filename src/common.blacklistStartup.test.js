const mockTranslatorManagerStart = jest.fn();
const mockStorageListeners = new Set();
const mockStorageGet = jest.fn();
const mockStorageAddListener = jest.fn((listener) => {
  mockStorageListeners.add(listener);
});
const mockStorageRemoveListener = jest.fn((listener) => {
  mockStorageListeners.delete(listener);
});

jest.mock("./config", () => ({
  OPT_HIGHLIGHT_WORDS_DISABLE: "-",
  STOKEY_SETTING: "setting",
}));

jest.mock("./libs/browser", () => ({
  browser: {
    storage: {
      local: { get: mockStorageGet },
      onChanged: {
        addListener: mockStorageAddListener,
        removeListener: mockStorageRemoveListener,
      },
    },
  },
}));

jest.mock("./libs/storage", () => ({
  getSettingWithDefault: jest.fn(),
  getFabWithDefault: jest.fn(),
  getWordsWithDefault: jest.fn(),
  runDataMigration: jest.fn(),
}));

jest.mock("./libs/iframe", () => ({ isIframe: false }));
jest.mock("./libs/gm", () => ({
  handlePing: jest.fn(),
  injectScript: jest.fn(),
}));
jest.mock("./libs/rules", () => ({ matchRule: jest.fn() }));
jest.mock("./libs/subRules", () => ({ trySyncAllSubRules: jest.fn() }));
jest.mock("./libs/blacklist", () => ({ isInBlacklist: jest.fn() }));
jest.mock("./subtitle/subtitle", () => ({ runSubtitle: jest.fn() }));
jest.mock("./libs/log", () => ({
  logger: { setLevel: jest.fn(), info: jest.fn() },
}));
jest.mock("./libs/injector", () => ({ injectInlineJs: jest.fn() }));
jest.mock("./libs/translatorManager", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    start: mockTranslatorManagerStart,
  })),
}));

function makeSetting(blacklist = "blocked.example") {
  return {
    blacklist,
    tranboxSetting: { blacklist: "", transOpen: true },
    inputRule: { blacklist: "", transOpen: true },
    mouseHoverSetting: { blacklist: "", useMouseHover: true },
    logLevel: 1,
  };
}

function emitSettingChange(value, area = "local") {
  const changes = { setting: { newValue: value } };
  [...mockStorageListeners].forEach((listener) => listener(changes, area));
}

async function flushPendingStartup() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("common blacklist startup recovery", () => {
  let run;
  let getSettingWithDefault;
  let matchRule;
  let TranslatorManager;
  let runDataMigration;
  let originalGM;
  let originalContentType;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageListeners.clear();
    mockStorageAddListener.mockImplementation((listener) => {
      mockStorageListeners.add(listener);
    });
    mockStorageRemoveListener.mockImplementation((listener) => {
      mockStorageListeners.delete(listener);
    });
    mockStorageGet.mockReset();
    mockStorageGet.mockResolvedValue({
      setting: JSON.stringify(makeSetting()),
    });

    originalGM = globalThis.GM;
    originalContentType = document.contentType;
    document.documentElement.innerHTML =
      "<head></head><body><main>Page text</main></body>";
    Object.defineProperty(document, "contentType", {
      configurable: true,
      value: "text/html",
    });

    ({ getSettingWithDefault, runDataMigration } = require("./libs/storage"));
    const { getFabWithDefault, getWordsWithDefault } = require("./libs/storage");
    ({ matchRule } = require("./libs/rules"));
    TranslatorManager = require("./libs/translatorManager").default;
    const { isInBlacklist } = require("./libs/blacklist");

    getSettingWithDefault.mockResolvedValue(makeSetting());
    getFabWithDefault.mockResolvedValue({ isHide: false });
    getWordsWithDefault.mockResolvedValue({});
    runDataMigration.mockResolvedValue();
    matchRule.mockResolvedValue({
      transOpen: "true",
      highlightWords: "-",
    });
    isInBlacklist.mockImplementation(
      (_href, blacklist) => blacklist === "blocked.example"
    );
    ({ run } = require("./common"));
  });

  afterEach(async () => {
    await flushPendingStartup();
    mockStorageListeners.clear();
    Object.defineProperty(document, "contentType", {
      configurable: true,
      value: originalContentType,
    });
    if (originalGM === undefined) delete globalThis.GM;
    else globalThis.GM = originalGM;
  });

  test("does not start the manager while the current document is blacklisted", async () => {
    await run();
    await flushPendingStartup();

    expect(matchRule).not.toHaveBeenCalled();
    expect(TranslatorManager).not.toHaveBeenCalled();
    expect(mockTranslatorManagerStart).not.toHaveBeenCalled();
    expect(mockStorageAddListener).toHaveBeenCalledTimes(1);
    expect(mockStorageGet).toHaveBeenCalledWith(["setting"]);
    expect(mockStorageListeners.size).toBe(1);
  });

  test("starts the existing document once after its blacklist is cleared", async () => {
    const href = window.location.href;
    await run();
    await flushPendingStartup();
    const listener = mockStorageAddListener.mock.calls[0][0];
    const unblockedSetting = makeSetting("");
    getSettingWithDefault.mockResolvedValue(unblockedSetting);

    emitSettingChange(JSON.stringify(unblockedSetting));

    expect(mockStorageRemoveListener).toHaveBeenCalledWith(listener);
    expect(mockStorageListeners.size).toBe(0);
    expect(TranslatorManager).not.toHaveBeenCalled();
    await flushPendingStartup();

    expect(window.location.href).toBe(href);
    expect(getSettingWithDefault).toHaveBeenCalledTimes(2);
    expect(TranslatorManager).toHaveBeenCalledTimes(1);
    expect(mockTranslatorManagerStart).toHaveBeenCalledTimes(1);
    expect(TranslatorManager.mock.calls[0][0].setting).toBe(unblockedSetting);
    expect(mockStorageRemoveListener).toHaveBeenCalledTimes(1);
    expect(mockStorageRemoveListener.mock.invocationCallOrder[0]).toBeLessThan(
      TranslatorManager.mock.invocationCallOrder[0]
    );
  });

  test("does not start the manager again for repeated setting events", async () => {
    await run();
    await flushPendingStartup();
    const listener = mockStorageAddListener.mock.calls[0][0];
    const unblockedSetting = makeSetting("");
    getSettingWithDefault.mockResolvedValue(unblockedSetting);
    const changes = {
      setting: { newValue: JSON.stringify(unblockedSetting) },
    };

    listener(changes, "local");
    listener(changes, "local");
    emitSettingChange(JSON.stringify(unblockedSetting));
    await flushPendingStartup();
    listener(changes, "local");
    await flushPendingStartup();

    expect(getSettingWithDefault).toHaveBeenCalledTimes(2);
    expect(TranslatorManager).toHaveBeenCalledTimes(1);
    expect(mockTranslatorManagerStart).toHaveBeenCalledTimes(1);
    expect(mockStorageRemoveListener).toHaveBeenCalledTimes(1);
    expect(mockStorageListeners.size).toBe(0);
  });

  test("does not register recovery for skipped image documents", async () => {
    Object.defineProperty(document, "contentType", {
      configurable: true,
      value: "image/png",
    });

    await run();
    await flushPendingStartup();

    expect(TranslatorManager).not.toHaveBeenCalled();
    expect(mockTranslatorManagerStart).not.toHaveBeenCalled();
    expect(mockStorageAddListener).not.toHaveBeenCalled();
    expect(mockStorageGet).not.toHaveBeenCalled();
    expect(mockStorageListeners.size).toBe(0);
  });

  test("does not register extension recovery for a blacklisted userscript", async () => {
    await run(true);
    await flushPendingStartup();

    expect(runDataMigration).toHaveBeenCalledTimes(1);
    expect(TranslatorManager).not.toHaveBeenCalled();
    expect(mockTranslatorManagerStart).not.toHaveBeenCalled();
    expect(mockStorageAddListener).not.toHaveBeenCalled();
    expect(mockStorageGet).not.toHaveBeenCalled();
    expect(mockStorageListeners.size).toBe(0);
  });
});
