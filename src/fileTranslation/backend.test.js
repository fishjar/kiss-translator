import browser from "webextension-polyfill";
import {
  attachFileSession,
  executeFileMethod,
  getFileContext,
  validateScenePatch,
} from "./backend";
import { FILE_PROTOCOL, isFileBridgePage } from "./protocol";
import { getSettingWithDefault, saveEdit } from "../libs/storage";

jest.mock("webextension-polyfill", () => ({
  runtime: {
    getManifest: () => ({ version: "2.1.0" }),
    id: "test-extension",
    getURL: (path) => path,
  },
  storage: {
    local: { get: jest.fn(async () => ({})) },
    onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
  },
  tabs: { create: jest.fn() },
}));
jest.mock("../apis/vision", () => ({ recognizeNetworkImage: jest.fn() }));
jest.mock("../libs/storage", () => ({
  getSettingWithDefault: jest.fn(),
  saveEdit: jest.fn(),
  normalizeStoredSetting: (value) => value,
}));
jest.mock("../libs/fileTranslationService", () => ({
  executeFileTranslation: jest.fn(),
}));
jest.mock("../localAi/fileOperations", () => ({
  ALL_OCR_MODELS: [],
  OCR_GROUPS: [],
  recognizeFileImage: jest.fn(),
  translateWithLocalModel: jest.fn(),
}));
jest.mock("../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: { request: jest.fn() },
}));
jest.mock("../localAi/core/settings", () => ({
  normalizeSettings: () => ({ maxImageFileMB: 10 }),
}));

let counter = 0;
beforeEach(() => {
  browser.storage.local.get.mockResolvedValue({});
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => `id-${++counter}` },
  });
  getSettingWithDefault.mockResolvedValue({
    uiLang: "zh",
    transApis: [
      {
        apiSlug: "test",
        apiName: "Test",
        sourceType: "network",
        apiKey: "secret",
        apiUrl: "private",
        headers: { Authorization: "secret" },
        capabilities: ["translation"],
      },
    ],
    fileTranslateSetting: { txt: { toLang: "zh-CN" } },
    prompts: [],
    customStyles: [],
    syncKey: "also-secret",
  });
});

function makePort() {
  let receive, disconnected;
  return {
    postMessage: jest.fn(),
    onMessage: {
      addListener: (fn) => {
        receive = fn;
      },
      removeListener: jest.fn(),
    },
    onDisconnect: {
      addListener: (fn) => {
        disconnected = fn;
      },
      removeListener: jest.fn(),
    },
    disconnect: jest.fn(),
    receive: (message) => receive(message),
    close: () => disconnected(),
  };
}

test("context projects service metadata without credentials or arbitrary setting fields", async () => {
  const result = await getFileContext();
  expect(result.uiLang).toBe("zh");
  expect(result.services[0]).toEqual({
    apiSlug: "test",
    apiName: "Test",
    sourceType: "network",
    capabilities: ["translation"],
    translationAvailable: true,
    ocrAvailable: false,
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(result).not.toHaveProperty("syncKey");
});

test("only known scene fields and correctly typed nested patches are accepted", () => {
  expect(() => validateScenePatch("txt", { apiKey: "new" })).toThrow();
  expect(() => validateScenePatch("txt", { apiSlugs: "test" })).toThrow();
  expect(() =>
    validateScenePatch("epub", { readerPreferences: { fontSize: -1 } })
  ).toThrow();
  expect(() =>
    validateScenePatch("image", { readerPreferences: {} })
  ).toThrow();
  expect(
    validateScenePatch("epub", { readerPreferences: { fontSize: 18 } })
  ).toEqual({ readerPreferences: { fontSize: 18 } });
});

test("scene patches merge with the latest value inside the storage transaction", async () => {
  const previous = {
    unrelated: "keep",
    fileTranslateSetting: {
      txt: { toLang: "en", apiSlugs: ["new"] },
      epub: { readerPreferences: { fontSize: 16, themeId: "dark" } },
    },
  };
  saveEdit.mockImplementation(async (_key, update) => ({
    value: update(previous),
  }));
  expect(
    await executeFileMethod("patchScene", {
      kind: "txt",
      patch: { toLang: "zh-CN" },
    })
  ).toEqual({ toLang: "zh-CN", apiSlugs: ["new"] });
  expect(
    await executeFileMethod("patchScene", {
      kind: "epub",
      patch: { readerPreferences: { fontSize: 18 } },
    })
  ).toEqual({ readerPreferences: { fontSize: 18, themeId: "dark" } });
});

test("production bridge allows local and online pages but rejects other origins and paths", () => {
  process.env.REACT_APP_FILE_BRIDGE_DEV = "false";
  expect(
    isFileBridgePage(
      "https://fishjar.github.io/kiss-translator/file-translate.html?test=1"
    )
  ).toBe(true);
  expect(
    isFileBridgePage("https://kiss-translator.rayjar.com/file-translate.html")
  ).toBe(true);
  expect(isFileBridgePage("http://localhost:3000/file-translate.html")).toBe(
    true
  );
  expect(isFileBridgePage("http://127.0.0.1:3000/file-translate.html?test=1")).toBe(
    true
  );
  for (const url of [
    "http://localhost:3001/file-translate.html",
    "http://127.0.0.1:3001/file-translate.html",
    "http://localhost:3000/options.html",
    "http://localhost:3000/file-translate.html/other",
    "http://localhost.evil.com:3000/file-translate.html",
    "https://fishjar.github.io/other/file-translate.html",
    "https://fishjar.github.io.evil.com/kiss-translator/file-translate.html",
  ])
    expect(isFileBridgePage(url)).toBe(false);
  process.env.REACT_APP_FILE_BRIDGE_DEV = "true";
  expect(isFileBridgePage("http://localhost:3000/file-translate.html")).toBe(
    true
  );
  expect(isFileBridgePage("http://localhost:3001/file-translate.html")).toBe(
    false
  );
  delete process.env.REACT_APP_FILE_BRIDGE_DEV;
});

test("handshake rejects incompatible versions and prevents unauthenticated dispatch", async () => {
  const port = makePort(),
    execute = jest.fn();
  const close = attachFileSession(port, execute);
  await port.receive({
    requestId: "first",
    method: "handshake",
    protocolVersion: 2,
  });
  expect(port.postMessage.mock.calls.at(-1)[0].error.code).toBe(
    "INCOMPATIBLE_PROTOCOL"
  );
  await port.receive({
    requestId: "second",
    method: "getContext",
    sessionId: "fake",
  });
  expect(execute).not.toHaveBeenCalled();
  close();
});

test("cancellation and disconnect abort execution, without cancelling another port", async () => {
  const ports = [makePort(), makePort()];
  const signals = [];
  const execute = jest.fn(
    (_method, _params, signal) =>
      new Promise((resolve) => {
        signals.push(signal);
        signal.addEventListener("abort", resolve, { once: true });
      })
  );
  const closes = ports.map((port) => attachFileSession(port, execute));
  for (const port of ports)
    await port.receive({
      requestId: "hello",
      method: "handshake",
      protocolVersion: FILE_PROTOCOL,
    });
  const sessions = ports.map(
    (port) => port.postMessage.mock.calls[0][0].result.sessionId
  );
  const runs = ports.map((port, index) =>
    port.receive({
      requestId: "translate",
      method: "translateText",
      sessionId: sessions[index],
      params: {},
    })
  );
  await ports[0].receive({
    requestId: "cancel",
    method: "cancel",
    sessionId: sessions[0],
    params: { requestId: "translate" },
  });
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
  ports[1].close();
  await Promise.all(runs);
  closes.forEach((close) => close());
  expect(browser.storage.onChanged.removeListener).toHaveBeenCalled();
});

test("translation requests have no bridge count limit and do not consume other request slots", async () => {
  const port = makePort();
  const execute = jest.fn((_method, _params, signal) => new Promise((resolve) => {
    signal.addEventListener("abort", resolve, { once: true });
  }));
  const close = attachFileSession(port, execute);
  await port.receive({ requestId: "hello", method: "handshake", protocolVersion: FILE_PROTOCOL });
  const sessionId = port.postMessage.mock.calls[0][0].result.sessionId;
  const runs = [];
  try {
    for (let index = 0; index < 500; index++) {
      runs.push(port.receive({ requestId: `text-${index}`, method: "translateText", sessionId, params: {} }));
    }
    expect(execute).toHaveBeenCalledTimes(500);
    expect(port.postMessage.mock.calls.some(([message]) => message.error?.code === "BUSY")).toBe(false);
    for (let index = 0; index < 64; index++) {
      runs.push(port.receive({ requestId: `context-${index}`, method: "getContext", sessionId, params: {} }));
    }
    await port.receive({ requestId: "overflow", method: "getContext", sessionId, params: {} });
    expect(execute).toHaveBeenCalledTimes(564);
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: "overflow", error: expect.objectContaining({ code: "BUSY" }) }));
    await port.receive({ requestId: "ping", method: "ping", sessionId });
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: "ping", result: null }));
    runs.push(port.receive({ requestId: "extra-text", method: "translateText", sessionId, params: {} }));
    expect(execute).toHaveBeenCalledTimes(565);
    await port.receive({ requestId: "cancel", method: "cancel", sessionId, params: { requestId: "context-0" } });
    await runs[500];
    runs.push(port.receive({ requestId: "replacement", method: "getContext", sessionId, params: {} }));
    expect(execute).toHaveBeenCalledTimes(566);
  } finally {
    close();
    await Promise.all(runs);
  }
});

test.each(["image/jpg", "", "image/bmp", "image/gif"])(
  "upload MIME validation handles %p without relaxing the whitelist",
  async (type) => {
    const port = makePort();
    const execute = jest.fn(async (method, params, signal, uploads) => {
      expect(uploads.get(params.uploadId).type).toBe("image/jpeg");
      return null;
    });
    const close = attachFileSession(port, execute);
    try {
      await port.receive({ requestId: "hello", method: "handshake", protocolVersion: FILE_PROTOCOL });
      const sessionId = port.postMessage.mock.calls[0][0].result.sessionId;
      await port.receive({ requestId: "begin", sessionId, method: "uploadBegin", params: { size: 3, type } });
      const response = port.postMessage.mock.calls.find(([message]) => message.requestId === "begin")[0];
      if (type === "image/jpg") {
        expect(response.result.uploadId).toEqual(expect.any(String));
        await port.receive({ requestId: "recognize", sessionId, method: "recognizeImage", params: { uploadId: response.result.uploadId } });
        expect(execute).toHaveBeenCalledTimes(1);
      } else {
        expect(response.error.code).toBe("INPUT_LIMIT_EXCEEDED");
        expect(execute).not.toHaveBeenCalled();
      }
    } finally {
      close();
    }
  }
);

test("uploads reject wrong ordering and oversized chunks and are released on disconnect", async () => {
  const port = makePort();
  attachFileSession(port, jest.fn());
  await port.receive({
    requestId: "hello",
    method: "handshake",
    protocolVersion: FILE_PROTOCOL,
  });
  const sessionId = port.postMessage.mock.calls[0][0].result.sessionId;
  await port.receive({
    requestId: "begin",
    sessionId,
    method: "uploadBegin",
    params: { size: 3, type: "image/png" },
  });
  const uploadId = port.postMessage.mock.calls.at(-1)[0].result.uploadId;
  await port.receive({
    requestId: "wrong",
    sessionId,
    method: "uploadChunk",
    params: { uploadId, sequence: 1, data: btoa("abc") },
  });
  expect(port.postMessage.mock.calls.at(-1)[0].error.code).toBe(
    "INVALID_INPUT"
  );
  await port.receive({
    requestId: "large",
    sessionId,
    method: "uploadChunk",
    params: { uploadId, sequence: 0, data: btoa("abcd") },
  });
  expect(port.postMessage.mock.calls.at(-1)[0].error.code).toBe(
    "INPUT_LIMIT_EXCEEDED"
  );
  await port.receive({
    requestId: "good",
    sessionId,
    method: "uploadChunk",
    params: { uploadId, sequence: 0, data: btoa("abc") },
  });
  expect(port.postMessage.mock.calls.at(-1)[0]).toMatchObject({ result: null });
  port.close();
});
