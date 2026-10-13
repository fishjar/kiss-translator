import { OPT_TRANS_BUILTINAI } from "./api";
import {
  availableApiForScene,
  isApiAvailableFor,
  normalizeApiCapabilities,
  supportsApiCapability,
} from "./serviceSelection";
import { createBuiltinInstance } from "../builtin-plugins";

test.each([
  ["chrome", true], ["edge", true], ["firefox", true],
  ["web", false], ["userscript", false], ["", false], [undefined, false],
])("client %p controls external and local availability", (client, available) => {
  const previous = process.env.REACT_APP_CLIENT;
  try {
    if (client === undefined) delete process.env.REACT_APP_CLIENT;
    else process.env.REACT_APP_CLIENT = client;
    jest.isolateModules(() => {
      const { isApiAvailableFor } = require("./serviceSelection");
      const external = {
        provider: { apiVersion: "1", implementation: { kind: "script" }, capabilities: { translate: {} } },
      };
      const local = { apiType: "LocalAI", modelRef: "hy-mt2-1.8b" };
      expect(isApiAvailableFor(external, "translate")).toBe(available);
      expect(isApiAvailableFor(local, "translate", {
        installedModels: new Set([local.modelRef]),
      })).toBe(available);
    });
  } finally {
    if (previous === undefined) delete process.env.REACT_APP_CLIENT;
    else process.env.REACT_APP_CLIENT = previous;
  }
});

test("installed native models only appear in scenes matching their actual task", () => {
  const api = {
    apiType: "LocalAI",
    sourceType: "local",
    modelRef: "hy-mt2-1.8b",
    enabledCapabilities: ["translate", "analyzeLayout", "transcribe"],
  };
  const context = { installedModels: new Set([api.modelRef]) };
  expect(isApiAvailableFor(api, "translate", context)).toBe(true);
  expect(isApiAvailableFor(api, "analyzeLayout", context)).toBe(false);
  expect(isApiAvailableFor(api, "transcribe", context)).toBe(false);
  expect(
    isApiAvailableFor({ ...api, modelRef: "unknown" }, "translate", {
      installedModels: new Set(["unknown"]),
    })
  ).toBe(false);
});

test("an installed layout model cannot advertise an unsupported compute backend", () => {
  const api = {
    apiType: "LocalAI",
    sourceType: "local",
    modelRef: "pp-doclayout-v3-onnx",
    enabledCapabilities: ["analyzeLayout"],
    device: "webgpu",
  };
  const context = { installedModels: new Set([api.modelRef]) };
  expect(isApiAvailableFor(api, "analyzeLayout", context)).toBe(false);
  expect(isApiAvailableFor({ ...api, device: "wasm" }, "analyzeLayout", context)).toBe(
    true
  );
});

test("native snapshots restrict scene features while preserving legacy tags", () => {
  const api = createBuiltinInstance("OpenAI", "native", "Native");
  api.enabledCapabilities = ["translate", "summarize"];
  expect(isApiAvailableFor(api, "translate")).toBe(true);
  expect(
    isApiAvailableFor(api, "summarize", { requirements: { stream: true } })
  ).toBe(false);
  delete api.provider.capabilities.translate;
  expect(isApiAvailableFor(api, "translate")).toBe(false);
  expect(supportsApiCapability(api, "translate")).toBe(false);
  api.provider.apiVersion = "unsupported";
  expect(isApiAvailableFor(api, "summarize")).toBe(false);
});

test("system playback uses speak and malformed implementation is unavailable", () => {
  const api = createBuiltinInstance("SystemTTS", "speech", "Speech");
  expect(supportsApiCapability(api, "speak")).toBe(true);
  expect(supportsApiCapability(api, "synthesizeSpeech")).toBe(false);
  delete api.provider.implementation;
  expect(isApiAvailableFor(api, "synthesizeSpeech")).toBe(false);
});

test("Gemini Interactions does not advertise image recognition through a native snapshot", () => {
  const api = createBuiltinInstance("Gemini", "vision", "Vision");
  api.enabledCapabilities = ["recognizeText"];
  api.url = "https://generativelanguage.googleapis.com/v1beta/interactions";
  expect(isApiAvailableFor(api, "recognizeText")).toBe(false);
});

test("single selection ignores leftover fallback lists and never chooses another service", () => {
  const first = createBuiltinInstance("Microsoft", "first", "First");
  const second = createBuiltinInstance("Microsoft", "second", "Second");
  const scene = { apiSlug: "first", apiSlugs: ["second"] };
  expect(availableApiForScene(scene, [first, second])).toBe(first);
  expect(availableApiForScene(scene, [{ ...first, isDisabled: true }, second])).toBeUndefined();
  expect(availableApiForScene({ apiSlug: "missing", apiSlugs: ["second"] }, [second])).toBeUndefined();
  expect(availableApiForScene({ apiSlugs: ["second"] }, [second])).toBeUndefined();
});

test("built-in AI is classified separately from network adapters", () => {
  expect(
    normalizeApiCapabilities({ apiType: OPT_TRANS_BUILTINAI }).sourceType
  ).toBe("builtin");
  expect(normalizeApiCapabilities({ apiType: "Microsoft" }).sourceType).toBe(
    "network"
  );
});

test("unimplemented capabilities and absent local models cannot be selected", () => {
  const apis = [
    {
      apiSlug: "local",
      sourceType: "local",
      modelRef: "m",
      enabledCapabilities: ["translate"],
    },
    { apiSlug: "recognizeText", sourceType: "network", apiType: "OpenAI", enabledCapabilities: ["recognizeText"] },
    {
      apiSlug: "network",
      sourceType: "network", apiType: "OpenAI",
      enabledCapabilities: ["translate"],
    },
  ];
  expect(
    availableApiForScene(
      { apiSlug: "network" },
      apis,
      "translate"
    )?.apiSlug
  ).toEqual("network");
});

test("does not silently repair invalid enabled selections during a read", () => {
  const normalized = normalizeApiCapabilities({
    apiType: "OpenAI",
    enabledCapabilities: ["translate", "recognizeText", "recognizeText", "invalid_cap"],
  });
  expect(normalized.enabledCapabilities).toEqual(["translate", "recognizeText", "recognizeText", "invalid_cap"]);
});

test("OCR and VLM advertise distinct capabilities and task requirements", () => {
  const ocr = { apiType: "LocalAI", sourceType: "local", modelRef: "ppocr-v5-mobile", enabledCapabilities: ["recognizeText"] };
  const vlm = { apiType: "LocalAI", modelRef: "paddleocr-vl-1.6-onnx-q8", device: "webgpu", enabledCapabilities: ["parseImage"] };
  expect(supportsApiCapability(ocr, "recognizeText")).toBe(true);
  expect(supportsApiCapability(ocr, "parseImage")).toBe(false);
  expect(supportsApiCapability(vlm, "parseImage")).toBe(true);
  expect(supportsApiCapability(vlm, "recognizeText")).toBe(false);
  expect(isApiAvailableFor(vlm, "parseImage", { requirements: { taskMode: "table" } })).toBe(true);
  expect(isApiAvailableFor(vlm, "parseImage", { requirements: { coordinates: true } })).toBe(false);
});

test("preserves enabled settings and verifies summary availability across builtin, local, and network", () => {
  const normalized = normalizeApiCapabilities({
    apiType: "OpenAI",
    enabledCapabilities: ["translate", "summarize", "invalid_cap"],
  });
  expect(normalized.enabledCapabilities).toEqual(["translate", "summarize", "invalid_cap"]);

  const apis = [
    {
      apiSlug: "builtin",
      sourceType: "builtin",
      apiType: OPT_TRANS_BUILTINAI,
      enabledCapabilities: ["translate", "summarize"],
    },
    {
      apiSlug: "local-llm",
      sourceType: "local",
      apiType: "LocalAI",
      modelRef: "hy-mt2-1.8b",
      enabledCapabilities: ["summarize"],
    },
    {
      apiSlug: "gpt4",
      sourceType: "network", apiType: "OpenAI",
      enabledCapabilities: ["translate", "summarize"],
    },
  ];

  // 1. 网络 AI 接口可用
  expect(isApiAvailableFor(apis[2], "summarize")).toBe(true);

  // 2. 本地 AI 模型安装时可用，未安装时不可用
  expect(
    isApiAvailableFor(apis[1], "summarize", {
      installedModels: new Set(["hy-mt2-1.8b"]),
    })
  ).toBe(true);
  expect(
    isApiAvailableFor(apis[1], "summarize", {
      installedModels: new Set(["other-model"]),
    })
  ).toBe(false);

  // 3. BuiltinAI: 依赖 globalThis.ai.summarizer
  const originalAi = globalThis.ai;
  try {
    globalThis.ai = { summarizer: {} };
    expect(isApiAvailableFor(apis[0], "summarize")).toBe(true);

    delete globalThis.ai;
    expect(isApiAvailableFor(apis[0], "summarize")).toBe(false);
  } finally {
    if (originalAi !== undefined) {
      globalThis.ai = originalAi;
    } else {
      delete globalThis.ai;
    }
  }
});

test("preserves enabled settings and verifies availableApiForScene", () => {
  const normalized = normalizeApiCapabilities({
    apiType: "LocalAI",
    sourceType: "local",
    enabledCapabilities: ["analyzeLayout", "invalid_cap"],
  });
  expect(normalized.enabledCapabilities).toEqual(["analyzeLayout", "invalid_cap"]);

  const apis = [
    {
      apiSlug: "local-layout",
      sourceType: "local",
      apiType: "LocalAI",
      modelRef: "pp-doclayout-v3-onnx",
      enabledCapabilities: ["analyzeLayout"],
    },
    {
      apiSlug: "other-service",
      sourceType: "network", apiType: "OpenAI",
      enabledCapabilities: ["translate"],
    },
  ];
  const scene = {
    layoutApiSlug: "local-layout",
    layoutApiSlugs: ["local-layout"],
  };

  const availableWhenInstalled = availableApiForScene(scene, apis, "analyzeLayout", {
    installedModels: new Set(["pp-doclayout-v3-onnx"]),
  }, "layoutApiSlug");
  expect(availableWhenInstalled?.apiSlug).toBe("local-layout");

  const availableWhenNotInstalled = availableApiForScene(scene, apis, "analyzeLayout", {
    installedModels: new Set(["other-model"]),
  }, "layoutApiSlug");
  expect(availableWhenNotInstalled).toBeUndefined();
});
