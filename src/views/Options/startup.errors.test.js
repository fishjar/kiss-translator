jest.mock("../../config", () => ({
  STOKEY_SETTING: "settings",
  STOKEY_RULES: "rules",
  STOKEY_WORDS: "words",
  STOKEY_SYNC: "sync",
}));
jest.mock("../../libs/client", () => ({ isGm: true }));
jest.mock("../../libs/gm", () => ({ adaptScript: jest.fn() }));
jest.mock("../../libs/storage", () => ({ runDataMigration: jest.fn() }));
jest.mock("../../libs/storageRefresh", () => ({
  refreshStorageKeys: jest.fn(),
}));
jest.mock("../../libs/sync", () => ({
  trySyncRules: jest.fn(),
  trySyncSetting: jest.fn(),
  trySyncWords: jest.fn(),
}));
jest.mock("../../libs/log", () => ({ kissLog: jest.fn() }));
jest.mock("../../libs/utils", () => ({
  sleep: jest.fn(() => Promise.resolve()),
}));

const { createOptionsStartup } = require("./startup");
const { runDataMigration } = require("../../libs/storage");
const { adaptScript } = require("../../libs/gm");
const { sleep } = require("../../libs/utils");

async function getStartupFailure() {
  const { localReady, completed } = createOptionsStartup();
  const results = await Promise.allSettled([
    localReady,
    ...Object.values(completed),
  ]);
  expect(results.every(({ status }) => status === "rejected")).toBe(true);
  return results[0].reason;
}

describe("userscript startup recovery messages", () => {
  const originalName = process.env.REACT_APP_NAME;
  const originalVersion = process.env.REACT_APP_VERSION;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_NAME = "KISS Translator";
    process.env.REACT_APP_VERSION = "2.0.32";
    delete window.APP_INFO;
  });

  afterEach(() => {
    if (originalName === undefined) delete process.env.REACT_APP_NAME;
    else process.env.REACT_APP_NAME = originalName;
    if (originalVersion === undefined) delete process.env.REACT_APP_VERSION;
    else process.env.REACT_APP_VERSION = originalVersion;
    delete window.APP_INFO;
  });

  test("provides Chinese and English recovery instructions for incompatible versions", async () => {
    window.APP_INFO = {
      name: "KISS Translator",
      version: "2.1.0",
      eventName: "gm-ping",
    };
    const error = await getStartupFailure();
    expect(error.message).toContain(
      "\u672c\u5730\u811a\u672c\u7248\u672c(v2.1.0)"
    );
    expect(error.message).toContain("\u8bbe\u7f6e\u9875\u7248\u672c(v2.0.32)");
    expect(error.message).toContain("\u8bf7\u66f4\u65b0\u811a\u672c");
    expect(error.message).toContain("The version of the local script");
    expect(adaptScript).not.toHaveBeenCalled();
    expect(runDataMigration).not.toHaveBeenCalled();
  });

  test("provides Chinese and English recovery instructions after the bounded bridge wait", async () => {
    const error = await getStartupFailure();
    expect(error.message).toContain(
      "\u8fde\u63a5\u6cb9\u7334\u811a\u672c\u8d85\u65f6"
    );
    expect(error.message).toContain("\u5b89\u88c5\u5e76\u542f\u7528");
    expect(error.message).toContain("Time out. Please confirm");
    expect(sleep).toHaveBeenCalledTimes(8);
    expect(adaptScript).not.toHaveBeenCalled();
    expect(runDataMigration).not.toHaveBeenCalled();
  });
});
