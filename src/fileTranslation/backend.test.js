import { TextEncoder } from "util";
global.TextEncoder = TextEncoder;
import browser from "webextension-polyfill";
import {
  attachFileSession,
  executeFileMethod,
  getFileContext,
  validateScenePatch,
} from "./backend";
import { FILE_PROTOCOL, isFileBridgePage } from "./protocol";
import { getSettingWithDefault, saveEdit } from "../libs/storage";
import { runtimeHost } from "../localAi/runtime/runtimeHostAdapter";
import { invokeBackgroundPlugin } from "../providers/backgroundInvocation";
import { prepareImage } from "../localAi/core/inputLimits";
jest.mock("../builtin-plugins/runtime", () => ({ createNativeRegistry: jest.fn() }));
jest.mock("../providers/backgroundInvocation", () => ({
  invokeBackgroundPlugin: jest.fn(),
}));
jest.mock("../localAi/core/inputLimits", () => ({ prepareImage: jest.fn() }));

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
  browser.storage.local.get.mockImplementation(async (key) => typeof key === "string" && key.startsWith("kiss-provider-plugin-grant:") ? { [key]: { enabled: true, origins: [] } } : {});
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => `id-${++counter}`, subtle: require("crypto").webcrypto.subtle },
  });
  getSettingWithDefault.mockResolvedValue({
    uiLang: "zh",
    transApis: [
      {
        apiSlug: "test",
        apiType: "OpenAI",
        apiName: "Test",
        sourceType: "network",
        apiKey: "secret",
        apiUrl: "private",
        headers: { Authorization: "secret" },
        enabledCapabilities: ["translate"],
      },
    ],
    fileTranslateSetting: { txt: { toLang: "zh-CN" } },
    prompts: [],
    customStyles: [],
    syncKey: "also-secret",
  });
});

test("DOC bridge consumes a completed owned upload and restricts task and backend", async () => {
  runtimeHost.request.mockResolvedValue({ regions: [], backend: "wasm" });
  const uploads = new Map([
    [
      "owned",
      {
        received: 3,
        size: 3,
        type: "image/png",
        chunks: [new Uint8Array([1, 2, 3])],
      },
    ],
  ]);
  const signal = new AbortController().signal;
  await expect(
    executeFileMethod(
      "analyzeLayout",
      { uploadId: "owned", modelId: "pp-doclayout-v3-onnx", device: "webgpu" },
      signal,
      uploads
    )
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(uploads.has("owned")).toBe(true);
  await expect(
    executeFileMethod(
      "analyzeLayout",
      { uploadId: "owned", modelId: "pp-doclayout-v3-onnx", device: "wasm" },
      signal,
      uploads
    )
  ).resolves.toMatchObject({ backend: "wasm" });
  expect(runtimeHost.request).toHaveBeenCalledWith(
    expect.objectContaining({
      service: "doc",
      method: "analyze",
      payload: {
        blob: expect.any(Blob),
        modelRef: "pp-doclayout-v3-onnx",
        loadSpec: { device: "wasm" },
      },
    }),
    { signal }
  );
  expect(uploads.has("owned")).toBe(false);
  await expect(
    executeFileMethod(
      "analyzeLayout",
      { uploadId: "owned", device: "wasm" },
      signal,
      uploads
    )
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("document decision bridge accepts bounded evidence with backend-owned instructions", async () => {
  runtimeHost.request.mockResolvedValue({
    answers: { structure: { choice: "a", confidence: 0.9 } },
  });
  const signal = new AbortController().signal;
  for (const invalid of [undefined, "content", { text: "x".repeat(12001) }]) {
    await expect(
      executeFileMethod(
        "decideDocumentStructure",
        {
          modelId: "laya-multilingual-int8",
          state: invalid,
          candidates: ["a", "b"],
        },
        signal,
        new Map()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  await executeFileMethod(
    "decideDocumentStructure",
    {
      modelId: "laya-multilingual-int8",
      state: { page: 1 },
      candidates: ["a", "b"],
      instructions: "untrusted",
    },
    signal,
    new Map()
  );
  const payload = runtimeHost.request.mock.calls.at(-1)[0].payload;
  expect(payload.questions.structure.instructions).not.toContain("untrusted");
  expect(payload.questions.structure.criteria).toEqual(["a", "b"]);
});

test("layout instance routing preserves real polygons and never trusts webpage model overrides", async () => {
  getSettingWithDefault.mockResolvedValue({
    transApis: [
      {
        apiSlug: "layout-plugin",
        apiType: "Plugin",
        enabledCapabilities: ["analyzeLayout"],
        provider: {
          apiVersion: "1",
          source: { pluginId: "test-plugin" }, settings: [],
          implementation: { kind: "script" },
          capabilities: {
            analyzeLayout: { handler: "layout", outputModes: ["complete"] },
          },
        },
      },
    ],
  });
  const image = new Blob(["image"], { type: "image/png" });
  prepareImage.mockResolvedValue({
    blob: image,
    size: { width: 100, height: 200 },
  });
  const cancel = jest.fn();
  invokeBackgroundPlugin.mockReturnValue({
    events: (async function* () {})(),
    result: Promise.resolve({
      regions: [
        {
          type: "text",
          order: 0,
          poly: [
            [5, 8],
            [30, 8],
            [30, 40],
            [5, 40],
          ],
        },
      ],
    }),
    cancel,
  });
  const uploads = new Map([
    ["owned", { received: 5, size: 5, type: "image/png", chunks: ["image"] }],
  ]);
  const result = await executeFileMethod(
    "analyzeLayout",
    {
      uploadId: "owned",
      serviceId: "layout-plugin",
      modelId: "wrong",
      device: "wrong",
    },
    new AbortController().signal,
    uploads
  );
  expect(result).toEqual({
    imageSize: { width: 100, height: 200 },
    regions: [
      {
        type: "text",
        order: 0,
        polygon: [
          [5, 8],
          [30, 8],
          [30, 40],
          [5, 40],
        ],
        bbox: [5, 8, 30, 40],
      },
    ],
  });
  expect(invokeBackgroundPlugin.mock.calls[0][0].apiSlug).toBe("layout-plugin");
  expect(invokeBackgroundPlugin.mock.calls[0][1]).toBe("analyzeLayout");
  expect(cancel).toHaveBeenCalled();
  expect(uploads.size).toBe(0);
  await expect(
    executeFileMethod(
      "analyzeLayout",
      { serviceId: "deleted", uploadId: "owned" },
      undefined,
      uploads
    )
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
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
    apiType: "OpenAI",
    apiName: "Test",
    sourceType: "network",
    enabledCapabilities: ["translate"],
    translationAvailable: true,
    layoutAvailable: false,
    provider: { apiVersion: "1", implementation: { kind: "native" }, capabilities: { translate: expect.any(Object) } },
    recognitionFeatures: {},
    recognitionSignature: expect.any(String),
    translationSignature: expect.any(String),
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(result).not.toHaveProperty("syncKey");
});

test.each(["key", "prompt"])("translation signatures invalidate %s edits without exposing credentials", async (field) => {
  const saved = await getSettingWithDefault();
  const previous = (await getFileContext()).services[0].translationSignature;
  const next = JSON.parse(JSON.stringify(saved));
  if (field === "key") next.transApis[0].key = "changed-secret";
  else next.prompts = [{ slug: "own-prompt", category: "user prompt", name: "Own", systemPrompt: "changed prompt", userPrompt: "{{text}}" }];
  getSettingWithDefault.mockResolvedValueOnce(next);
  const result = await getFileContext();
  expect(result.services[0].translationSignature).not.toBe(previous);
  expect(JSON.stringify(result)).not.toContain("changed-secret");
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
      txt: { toLang: "en", apiSlug: "new" },
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
  ).toEqual({ toLang: "zh-CN", apiSlug: "new" });
  expect(
    await executeFileMethod("patchScene", {
      kind: "epub",
      patch: { readerPreferences: { fontSize: 18 } },
    })
  ).toEqual({ readerPreferences: { fontSize: 18, themeId: "dark" } });
});

test("production bridge allows local and online pages but rejects other origins and paths", () => {
  process.env.REACT_APP_FILE_BRIDGE_DEV = "false";
  for (const base of [
    "https://kiss-translator.rayjar.com",
    "https://fishjar.github.io/kiss-translator",
    "https://kiss-translator-dev.rayjar.com",
    "https://kiss-translator-dev.pages.dev",
    "https://kiss-translator.pages.dev",
  ]) {
    for (const suffix of ["", ".html"]) {
      const url = `${base}/file-translate${suffix}`;
      expect(isFileBridgePage(url)).toBe(true);
      expect(isFileBridgePage(`${url}?test=1#preview`)).toBe(true);
      expect(isFileBridgePage(`${url}/`)).toBe(false);
      expect(isFileBridgePage(`${url}/other`)).toBe(false);
      expect(isFileBridgePage(`${url}-extra`)).toBe(false);
      const wrongOrigin = new URL(url);
      wrongOrigin.hostname += ".evil.com";
      expect(isFileBridgePage(wrongOrigin.href)).toBe(false);
      const wrongPort = new URL(url);
      wrongPort.port = "3001";
      expect(isFileBridgePage(wrongPort.href)).toBe(false);
    }
  }
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
  expect(
    isFileBridgePage("http://127.0.0.1:3000/file-translate.html?test=1")
  ).toBe(true);
  for (const url of [
    "http://localhost:3001/file-translate.html",
    "http://127.0.0.1:3001/file-translate.html",
    "http://localhost:3000/options.html",
    "http://localhost:3000/file-translate.html/other",
    "http://localhost.evil.com:3000/file-translate.html",
    "https://fishjar.github.io/other/file-translate.html",
    "https://fishjar.github.io.evil.com/kiss-translator/file-translate.html",
    "https://7c6c8b49.kiss-translator-dev.pages.dev/file-translate",
    "https://dev.kiss-translator.pages.dev/file-translate",
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
  const execute = jest.fn(
    (_method, _params, signal) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", resolve, { once: true });
      })
  );
  const close = attachFileSession(port, execute);
  await port.receive({
    requestId: "hello",
    method: "handshake",
    protocolVersion: FILE_PROTOCOL,
  });
  const sessionId = port.postMessage.mock.calls[0][0].result.sessionId;
  const runs = [];
  try {
    for (let index = 0; index < 500; index++) {
      runs.push(
        port.receive({
          requestId: `text-${index}`,
          method: "translateText",
          sessionId,
          params: {},
        })
      );
    }
    expect(execute).toHaveBeenCalledTimes(500);
    expect(
      port.postMessage.mock.calls.some(
        ([message]) => message.error?.code === "BUSY"
      )
    ).toBe(false);
    for (let index = 0; index < 64; index++) {
      runs.push(
        port.receive({
          requestId: `context-${index}`,
          method: "getContext",
          sessionId,
          params: {},
        })
      );
    }
    await port.receive({
      requestId: "overflow",
      method: "getContext",
      sessionId,
      params: {},
    });
    expect(execute).toHaveBeenCalledTimes(564);
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "overflow",
        error: expect.objectContaining({ code: "BUSY" }),
      })
    );
    await port.receive({ requestId: "ping", method: "ping", sessionId });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "ping", result: null })
    );
    runs.push(
      port.receive({
        requestId: "extra-text",
        method: "translateText",
        sessionId,
        params: {},
      })
    );
    expect(execute).toHaveBeenCalledTimes(565);
    await port.receive({
      requestId: "cancel",
      method: "cancel",
      sessionId,
      params: { requestId: "context-0" },
    });
    await runs[500];
    runs.push(
      port.receive({
        requestId: "replacement",
        method: "getContext",
        sessionId,
        params: {},
      })
    );
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
        params: { size: 3, type },
      });
      const response = port.postMessage.mock.calls.find(
        ([message]) => message.requestId === "begin"
      )[0];
      if (type === "image/jpg") {
        expect(response.result.uploadId).toEqual(expect.any(String));
        await port.receive({
          requestId: "recognize",
          sessionId,
          method: "recognizeImage",
          params: { uploadId: response.result.uploadId },
        });
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

function imageService(id, capabilities) {
  return { apiSlug: id, apiType: "Plugin", sourceType: "network", enabledCapabilities: Object.keys(capabilities),
    provider: { apiVersion: "1", source: { pluginId: "test-plugin" }, implementation: { kind: "script" }, settings: [], capabilities } };
}
function ownedImage() {
  return new Map([["owned", { received: 5, size: 5, type: "image/png", chunks: ["image"] }]]);
}
function recognitionInvocation(result) {
  return { events: (async function* () {})(), result, cancel: jest.fn() };
}
test("single recognition validates modes and restores crop coordinates after preprocessing", async () => {
  getSettingWithDefault.mockResolvedValue({ transApis: [imageService("ocr", {
    recognizeText: { handler: "ocr", coordinates: true },
  })], prompts: [] });
  prepareImage.mockResolvedValue({ blob: new Blob(["image"]), original: { width: 200, height: 400 }, size: { width: 100, height: 200 } });
  invokeBackgroundPlugin.mockClear();
  invokeBackgroundPlugin.mockReturnValue(recognitionInvocation(Promise.resolve({ text: "line", format: "text", items: [
    { text: "line", poly: [[10, 20], [50, 20], [50, 40], [10, 40]] },
  ] })));
  const result = await executeFileMethod("recognizeImage", { uploadId: "owned", serviceId: "ocr", capability: "recognizeText", taskMode: "doc", requireCoordinates: true }, new AbortController().signal, ownedImage());
  expect(result.items[0].poly).toEqual([[20, 40], [100, 40], [100, 80], [20, 80]]);
  expect(result.imageSize).toEqual({ width: 200, height: 400 });
  expect(result.serviceId).toBe("ocr");
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
  await expect(executeFileMethod("recognizeImage", { uploadId: "owned", serviceId: "ocr", capability: "recognizeText", taskMode: "table" }, new AbortController().signal, ownedImage())).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
});
test("selected failure never invokes another available recognition service", async () => {
  getSettingWithDefault.mockResolvedValue({ transApis: [imageService("selected", { parseImage: { handler: "parse" } }), imageService("other", { recognizeText: { handler: "ocr" } })], prompts: [] });
  prepareImage.mockResolvedValue({ blob: new Blob(["image"]), original: { width: 100, height: 200 }, size: { width: 100, height: 200 } });
  invokeBackgroundPlugin.mockClear();
  invokeBackgroundPlugin.mockImplementation(() => recognitionInvocation(Promise.reject(new Error("selected failed"))));
  await expect(executeFileMethod("recognizeImage", { uploadId: "owned", serviceId: "selected", capability: "parseImage" }, new AbortController().signal, ownedImage())).rejects.toThrow("selected failed");
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
  expect(invokeBackgroundPlugin.mock.calls[0][0].apiSlug).toBe("selected");
  await expect(executeFileMethod("recognizeImage", { uploadId: "owned", serviceId: "deleted", capability: "parseImage" }, new AbortController().signal, ownedImage())).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  expect(invokeBackgroundPlugin).toHaveBeenCalledTimes(1);
});
test("recognition patch is a nullable single service and rejects old candidate/model fields", () => {
  const selection = { apiSlug: "ocr", capability: "recognizeText" };
  expect(validateScenePatch("image", { recognitionService: selection })).toEqual({ recognitionService: selection });
  expect(validateScenePatch("pdf", { recognitionService: null, visionServiceSlug: "vlm" })).toEqual({ recognitionService: null, visionServiceSlug: "vlm" });
  for (const patch of [{ recognitionService: [selection] }, { recognitionService: { ...selection, capability: "chat" } }, { ocrApiSlugs: ["ocr"] }, { visionModel: "model" }])
    expect(() => validateScenePatch("image", patch)).toThrow();
});
