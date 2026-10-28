import { zipSync } from "fflate";
import { readProviderPackage } from "./package";
import { runDeclarative } from "./declarative";
import { createServiceInstance, projectInstanceConfig } from "./instances";
import { createProviderRegistry } from "./registry";
import { providerHelpers } from "./sdk";
import { createAssetStore, createTransportBroker } from "./transport";

global.TextEncoder ||= require("util").TextEncoder;
global.TextDecoder ||= require("util").TextDecoder;
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

function fixture() {
  const request = {
    baseUrl: { $ref: "config.baseUrl" },
    model: { $ref: "config.model" },
    auth: { type: "bearer", secret: { $secret: "apiKey" } },
    parameters: { temperature: { $if: { $ref: "config.thinking" }, else: 0 } },
  };
  const rules = {
    format: "protocol",
    handlers: Object.fromEntries(
      ["chat", "translate", "parseImage", "dictionary", "segmentSubtitle"].map(
        (task) => [
          task,
          {
            task,
            protocol: "openai-chat-completions",
            request: JSON.parse(JSON.stringify(request)),
          },
        ]
      )
    ),
  };
  const manifest = {
    apiVersion: 1,
    id: "test-declarative",
    name: "Test",
    version: "1.0.0",
    permissions: { network: ["https://example.invalid"] },
    services: [
      {
        id: "text",
        name: "Text and image",
        implementation: { kind: "declarative", entry: "service.json" },
        settings: [
          {
            key: "baseUrl",
            type: "text",
            defaultValue: "https://example.invalid/v1",
          },
          { key: "model", type: "text", defaultValue: "test" },
          { key: "apiKey", type: "password" },
          { key: "thinking", type: "boolean", defaultValue: false },
        ],
        capabilities: {
          dictionary: {
            handler: "dictionary",
            outputModes: ["complete", "stream"],
          },
          segmentSubtitle: {
            handler: "segmentSubtitle",
            outputModes: ["complete"],
          },
          chat: { handler: "chat", outputModes: ["complete", "stream"] },
          translate: {
            handler: "translate",
            batch: { supported: true },
            outputModes: ["complete", "stream"],
          },
          parseImage: {
            handler: "parseImage",
            inputModalities: ["image"],
            coordinates: false,
            outputModes: ["complete"],
          },
        },
        defaultPrompts: { vlm: { systemPrompt: "Read the table." } },
      },
    ],
  };
  return { rules, manifest };
}

function packageBytes({ rules, manifest }) {
  return zipSync({
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
    "service.json": new TextEncoder().encode(JSON.stringify(rules)),
  });
}

function execution(f = fixture()) {
  const pack = readProviderPackage(packageBytes(f));
  const instance = createServiceInstance(
    pack.manifest,
    "text",
    pack.implementations.text,
    { apiKey: "secret" },
    "test"
  );
  const ctx = {
    config: projectInstanceConfig(instance).config,
    helpers: providerHelpers,
    options: { streaming: false },
    secrets: { ref: (key) => ({ key }) },
    emit: jest.fn(async () => {}),
    assets: createAssetStore(),
    http: {
      request: jest.fn(async () => ({
        status: 200,
        body: JSON.stringify({
          choices: [
            { message: { content: "line 1\nline 2" }, finish_reason: "stop" },
          ],
        }),
      })),
    },
  };
  return { instance, ctx };
}

test.each([
  [
    "unknown protocol",
    (f) => {
      f.rules.handlers.chat.protocol = "unknown";
    },
  ],
  [
    "unknown task",
    (f) => {
      f.rules.handlers.chat.task = "summarize";
    },
  ],
  [
    "task mismatch",
    (f) => {
      f.rules.handlers.chat.task = "translate";
    },
  ],
  [
    "reserved model",
    (f) => {
      f.rules.handlers.chat.request.parameters.model = "override";
    },
  ],
  [
    "reserved messages",
    (f) => {
      f.rules.handlers.chat.request.parameters.messages = [];
    },
  ],
  [
    "reserved stream",
    (f) => {
      f.rules.handlers.chat.request.parameters.stream = true;
    },
  ],
  [
    "nonboolean condition",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature.$if.$ref =
        "config.model";
    },
  ],
  [
    "expression condition",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature.$if =
        "config.thinking";
    },
  ],
  [
    "comparison on a boolean",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature.$if.equals = false;
    },
  ],
  [
    "undeclared select option",
    (f) => {
      f.manifest.services[0].settings.push({
        key: "mode",
        type: "select",
        options: [{ value: "auto" }],
      });
      f.rules.handlers.chat.request.parameters.temperature.$if = {
        $ref: "config.mode",
        equals: "enabled",
      };
    },
  ],
  [
    "secret select comparison",
    (f) => {
      f.manifest.services[0].settings.push({
        key: "mode",
        type: "select",
        isSecret: true,
        options: [{ value: "auto" }],
      });
      f.rules.handlers.chat.request.parameters.temperature.$if = {
        $ref: "config.mode",
        equals: "auto",
      };
    },
  ],
  [
    "unknown condition operator",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature.$if.not = true;
    },
  ],
  [
    "missing branches",
    (f) => {
      delete f.rules.handlers.chat.request.parameters.temperature.else;
    },
  ],
  [
    "unknown operator",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature = { $eval: "1" };
    },
  ],
  [
    "secret outside auth",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature = {
        $secret: "apiKey",
      };
    },
  ],
  [
    "undeclared secret",
    (f) => {
      f.rules.handlers.chat.request.auth.secret.$secret = "other";
    },
  ],
  [
    "prototype reference",
    (f) => {
      f.rules.handlers.chat.request.parameters.temperature = {
        $ref: "config.constructor",
      };
    },
  ],
  [
    "coordinates",
    (f) => {
      f.manifest.services[0].capabilities.chat.coordinates = true;
    },
  ],
  [
    "image streaming",
    (f) => {
      f.manifest.services[0].capabilities.parseImage.outputModes.push("stream");
    },
  ],
  [
    "unsupported image input modality",
    (f) => {
      f.manifest.services[0].capabilities.parseImage.inputModalities = [
        "audio",
      ];
    },
  ],
])("rejects %s at installation and snapshot execution", async (_, mutate) => {
  const f = fixture();
  mutate(f);
  expect(() => readProviderPackage(packageBytes(f))).toThrow(
    expect.objectContaining({ code: "INVALID_MANIFEST" })
  );
  const { ctx } = execution();
  await expect(
    runDeclarative(
      { apiVersion: 1, rules: f.rules, ...f.manifest.services[0] },
      "chat",
      { messages: [{ role: "user", content: "hi" }] },
      ctx
    )
  ).rejects.toMatchObject({ code: "INVALID_RULE" });
  expect(ctx.http.request).not.toHaveBeenCalled();
});

test("conditions require boolean values and omit missing branches without coercing false or zero", async () => {
  const { instance, ctx } = execution();
  const input = { messages: [{ role: "user", content: "hi" }] };
  await runDeclarative(instance.provider, "chat", input, ctx);
  expect(ctx.http.request.mock.calls[0][0].body.temperature).toBe(0);
  ctx.config.thinking = true;
  await runDeclarative(instance.provider, "chat", input, ctx);
  expect(ctx.http.request.mock.calls[1][0].body.temperature).toBeUndefined();
  ctx.config.thinking = "false";
  await expect(
    runDeclarative(instance.provider, "chat", input, ctx)
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("select conditions compare declared values strictly and omit missing branches", async () => {
  const f = fixture();
  f.manifest.services[0].settings.push({
    key: "mode",
    type: "select",
    defaultValue: "1",
    options: [{ value: "1" }, { value: 1 }],
  });
  f.rules.handlers.chat.request.parameters.temperature = {
    $if: { $ref: "config.mode", equals: "1" },
    then: 0,
  };
  const { instance, ctx } = execution(f);
  const input = { messages: [{ role: "user", content: "hi" }] };
  await runDeclarative(instance.provider, "chat", input, ctx);
  expect(ctx.http.request.mock.calls[0][0].body.temperature).toBe(0);
  ctx.config.mode = 1;
  await runDeclarative(instance.provider, "chat", input, ctx);
  expect(ctx.http.request.mock.calls[1][0].body.temperature).toBeUndefined();
});

test("protocol format runs through capability routing, applies image prompts and uses only owned bytes", async () => {
  const { instance, ctx } = execution();
  const image = ctx.assets.put({
    type: "image/png",
    size: 3,
    arrayBuffer: async () => Uint8Array.from([0, 255, 42]).buffer,
  });
  const registry = createProviderRegistry({
    resolveInstance: () => instance,
    createContext: (_, invocation) => ({ ...ctx, ...invocation }),
    runners: { declarative: runDeclarative },
  });
  const invoke = (input) =>
    registry.invoke("test", "parseImage", input, { streaming: "disabled" })
      .result;
  await expect(invoke({ image })).resolves.toEqual({
    text: "line 1\nline 2",
    format: "markdown",
    items: [
      { text: "line 1", poly: null },
      { text: "line 2", poly: null },
    ],
  });
  expect(ctx.http.request.mock.calls[0][0].body.messages[0].content).toEqual([
    { type: "text", text: "Read the table." },
    { type: "image_url", image_url: { url: "data:image/png;base64,AP8q" } },
  ]);
  await invoke({ image, prompt: "" });
  expect(
    ctx.http.request.mock.calls[1][0].body.messages[0].content[0].text
  ).toBe("");
  await expect(
    invoke({ image: { assetId: "asset-999", mimeType: "image/png" } })
  ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
  await expect(
    invoke({ image: { ...image, mimeType: "image/jpeg" } })
  ).rejects.toMatchObject({ code: "INVALID_ASSET" });
  const invalid = ctx.assets.put({ type: "text/plain", size: 1 });
  await expect(invoke({ image: invalid })).rejects.toMatchObject({
    code: "INVALID_ASSET",
  });
  const oversized = ctx.assets.put({
    type: "image/png",
    size: 8 * 1024 * 1024 + 1,
  });
  await expect(invoke({ image: oversized })).rejects.toMatchObject({
    code: "RESOURCE_BUDGET_EXCEEDED",
  });
  await expect(
    registry.invoke("test", "parseImage", { image }, { streaming: "required" })
      .result
  ).rejects.toMatchObject({ code: "STREAM_UNSUPPORTED" });
});

test("v2 text tasks execute through the registry and capability switches still apply", async () => {
  const { instance, ctx } = execution();
  const registry = createProviderRegistry({
    resolveInstance: () => instance,
    createContext: (_, invocation) => ({ ...ctx, ...invocation }),
    runners: { declarative: runDeclarative },
  });
  await expect(
    registry.invoke(
      "test",
      "chat",
      { messages: [{ role: "user", content: "hi" }] },
      { streaming: "disabled" }
    ).result
  ).resolves.toMatchObject({ text: "line 1\nline 2" });
  ctx.http.request.mockResolvedValue({
    status: 200,
    body: JSON.stringify({
      choices: [
        {
          message: { content: '[{"id":"a","text":"甲"}]' },
          finish_reason: "stop",
        },
      ],
    }),
  });
  await expect(
    registry.invoke(
      "test",
      "translate",
      { items: [{ id: "a", text: "A" }], targetLanguage: "zh" },
      { streaming: "disabled" }
    ).result
  ).resolves.toEqual({ items: [{ id: "a", text: "甲" }] });
  instance.enabledCapabilities = [];
  await expect(
    registry.invoke("test", "chat", {
      messages: [{ role: "user", content: "hi" }],
    }).result
  ).rejects.toMatchObject({ code: "CAPABILITY_DISABLED" });
});

test("v2 protocol requests use the Broker for network scope validation, secret injection and cancellation", async () => {
  const { instance, ctx } = execution();
  const controller = new AbortController();
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
  }));
  const broker = createTransportBroker(instance, {
    assets: ctx.assets,
    signal: controller.signal,
    fetchImpl,
  });
  const input = { messages: [{ role: "user", content: "hi" }] };
  await expect(
    runDeclarative(instance.provider, "chat", input, { ...ctx, ...broker })
  ).resolves.toMatchObject({ text: "ok" });
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer secret"
  );
  const denied = createTransportBroker(
    { ...instance, provider: { ...instance.provider, permissions: {} } },
    { assets: ctx.assets, signal: controller.signal, fetchImpl }
  );
  await expect(
    runDeclarative(instance.provider, "chat", input, { ...ctx, ...denied })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  controller.abort();
  await expect(
    runDeclarative(instance.provider, "chat", input, { ...ctx, ...broker })
  ).rejects.toBeDefined();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("dictionary templates and Markdown results work through the declarative executor", async () => {
  const { instance, ctx } = execution();
  const input = {
    text: "bank",
    language: "zh",
    sourceLanguage: "en",
    context: "river",
    instructions: "Explain {{text}} in {{to}}: {{context}}",
    userPrompt: "Word: {{text}}",
  };
  await expect(
    runDeclarative(instance.provider, "dictionary", input, ctx)
  ).resolves.toEqual({ text: "line 1\nline 2", format: "markdown" });
  const body = ctx.http.request.mock.calls[0][0].body;
  const parsed = typeof body === "string" ? JSON.parse(body) : body;
  expect(parsed.messages).toEqual([
    { role: "system", content: "Explain bank in zh: river" },
    { role: "user", content: "Word: bank" },
  ]);
});

test("dictionary streams text deltas and returns the complete Markdown", async () => {
  const { instance, ctx } = execution();
  ctx.options.streaming = true;
  ctx.http.stream = async function* () {
    yield {
      type: "sse",
      data: JSON.stringify({
        choices: [{ delta: { content: "# Bank" }, finish_reason: null }],
      }),
    };
    yield {
      type: "sse",
      data: JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
    };
    yield { type: "sse", data: "[DONE]" };
  };
  await expect(
    runDeclarative(instance.provider, "dictionary", { text: "bank" }, ctx)
  ).resolves.toEqual({ text: "# Bank", format: "markdown" });
  expect(ctx.emit).toHaveBeenCalledWith(
    expect.objectContaining({ type: "text.delta", text: "# Bank" })
  );
});

test("subtitle protocol accepts ordered groups and rejects invalid coverage and streaming", async () => {
  const { instance, ctx } = execution();
  const input = {
    items: [
      { id: "a", text: "Hello", start: 0, end: 1 },
      { id: "b", text: "world", start: 1, end: 2 },
    ],
    targetLanguage: "zh",
  };
  const groups = [
    { ids: ["a", "b"], text: "Hello world", translation: "你好" },
  ];
  const respond = (content) =>
    ctx.http.request.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content }, finish_reason: "stop" }],
      }),
    });
  respond(JSON.stringify({ groups }));
  await expect(
    runDeclarative(instance.provider, "segmentSubtitle", input, ctx)
  ).resolves.toEqual({ groups });
  for (const ids of [["a"], ["b", "a"], ["a", "a"], ["a", "unknown"]]) {
    respond(JSON.stringify({ groups: [{ ...groups[0], ids }] }));
    await expect(
      runDeclarative(instance.provider, "segmentSubtitle", input, ctx)
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  }
  respond("bad JSON");
  await expect(
    runDeclarative(instance.provider, "segmentSubtitle", input, ctx)
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  ctx.options.streaming = true;
  await expect(
    runDeclarative(instance.provider, "segmentSubtitle", input, ctx)
  ).rejects.toMatchObject({ code: "STREAM_UNSUPPORTED" });
});

test("dictionary rejects an empty completion", async () => {
  const { instance, ctx } = execution();
  ctx.http.request.mockResolvedValue({
    status: 200,
    body: JSON.stringify({
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
    }),
  });
  await expect(
    runDeclarative(instance.provider, "dictionary", { text: "bank" }, ctx)
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
