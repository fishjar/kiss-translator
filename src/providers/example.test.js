import fs from "fs";
import path from "path";
import Sval from "sval";
import { zipSync } from "fflate";
import { readProviderPackage } from "./package";
import { createServiceInstance, projectInstanceConfig } from "./instances";
import { providerHelpers } from "./sdk";
import { runDeclarative } from "./declarative";
import { resolveApiPromptSettings } from "../config/prompt";
import { DEFAULT_API_SETTING } from "../config/api";
const { TextDecoder, TextEncoder } = require("util");
global.TextEncoder ||= TextEncoder;
global.TextDecoder ||= TextDecoder;
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

function example() {
  const root = path.join(
    process.cwd(),
    "docs/plugins/examples/openai-compatible-bundle"
  );
  const files = {
    "manifest.json": fs.readFileSync(path.join(root, "manifest.json")),
  };
  for (const service of JSON.parse(files["manifest.json"]).services)
    files[service.implementation.entry] = fs.readFileSync(
      path.join(root, service.implementation.entry)
    );
  return readProviderPackage(zipSync(files));
}

test("native default prompt references do not overwrite the plugin's ID-based translation contract", () => {
  const pack = example();
  const api = resolveApiPromptSettings({
    ...DEFAULT_API_SETTING,
    ...createServiceInstance(
      pack.manifest,
      "chat-completions",
      pack.implementations["chat-completions"],
      {
        baseUrl: "https://example.invalid/v1",
        apiKey: "secret",
        model: "test-model",
      },
      "original"
    ),
  });
  expect(api.nobatchUserPrompt).toBe("{{text}}");
  expect(api.systemPrompt).toContain("keeping every ID");
  expect(
    providerHelpers.translation.buildMessages({
      items: [{ id: "0", text: "hello" }],
      targetLanguage: "zh",
      translationMode: "single",
      outputProtocol: "text",
      systemPrompt: api.nobatchPrompt,
      userPrompt: api.nobatchUserPrompt,
    })[1].content
  ).toBe("hello");
});

test("distributed vision script assembles an image data URL using owned bytes and does not invent coordinates", async () => {
  const pack = example();
  const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
  interpreter.run(pack.implementations.vision);
  const request = jest.fn(async () => ({
    status: 200,
    body: {
      choices: [
        { message: { content: "recognized text" }, finish_reason: "stop" },
      ],
    },
  }));
  const read = jest.fn(async () => Uint8Array.from([0, 255, 42]).buffer);
  const ref = { assetId: "asset-1", mimeType: "image/png" };
  const result = await interpreter.exports.parseImage(
    { image: ref },
    { baseUrl: "https://example.invalid/v1", model: "vision-model" },
    {
      helpers: providerHelpers,
      assets: { read },
      secrets: { ref: (key) => ({ key }) },
      http: { request },
    }
  );
  expect(read).toHaveBeenCalledWith(ref);
  expect(
    request.mock.calls[0][0].body.messages[0].content[1].image_url.url
  ).toBe("data:image/png;base64,AP8q");
  expect(result.items).toEqual([{ text: "recognized text", poly: null }]);
});

test("distributed streaming script emits production SDK events and rejects a missing terminal frame", async () => {
  const pack = example();
  const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
  interpreter.run(pack.implementations["chat-completions"]);
  const input = { messages: [{ role: "user", content: "hello" }] };
  const emit = jest.fn(async () => {});
  const context = {
    helpers: providerHelpers,
    options: { streaming: true },
    secrets: { ref: (key) => ({ key }) },
    emit,
    http: {
      async *stream() {
        yield {
          type: "sse",
          data: JSON.stringify({
            choices: [{ delta: { content: "text" }, finish_reason: "stop" }],
          }),
        };
        yield { type: "sse", data: "[DONE]" };
      },
    },
  };
  const config = { baseUrl: "https://example.invalid/v1", model: "text-model" };
  await expect(
    interpreter.exports.chat(input, config, context)
  ).resolves.toMatchObject({ text: "text" });
  expect(emit).toHaveBeenCalledWith({ type: "text.delta", text: "text" });
  context.http.stream = async function* () {
    yield {
      type: "sse",
      data: JSON.stringify({ choices: [{ delta: { content: "partial" } }] }),
    };
  };
  await expect(
    interpreter.exports.chat(input, config, context)
  ).rejects.toMatchObject({ code: "INCOMPLETE_RESPONSE" });
});

test("the same text service streams ordered translation items and rejects missing or duplicate IDs", async () => {
  const pack = example();
  const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
  interpreter.run(pack.implementations["chat-completions"]);
  const input = {
    items: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    targetLanguage: "zh",
  };
  const emit = jest.fn(async () => {});
  let text = '[{"id":"b","text":"乙"},{"id":"a","text":"甲"}]';
  const ctx = {
    helpers: providerHelpers,
    options: { streaming: true },
    emit,
    secrets: { ref: (key) => ({ key }) },
    http: {
      async *stream() {
        for (const content of [text.slice(0, 12), text.slice(12)])
          yield {
            type: "sse",
            data: JSON.stringify({ choices: [{ delta: { content } }] }),
          };
        yield {
          type: "sse",
          data: JSON.stringify({
            choices: [{ delta: {}, finish_reason: "stop" }],
          }),
        };
        yield { type: "sse", data: "[DONE]" };
      },
    },
  };
  const config = {
    baseUrl: "https://example.invalid/v1",
    model: "custom-model",
  };
  await expect(
    interpreter.exports.translate(input, config, ctx)
  ).resolves.toEqual({
    items: [
      { id: "a", text: "甲" },
      { id: "b", text: "乙" },
    ],
  });
  expect(emit.mock.calls.map(([event]) => event.type)).toEqual([
    "item.complete",
    "item.complete",
  ]);
  text = '[{"id":"a","text":"甲"}]';
  await expect(
    interpreter.exports.translate(input, config, ctx)
  ).rejects.toMatchObject({ code: "INCOMPLETE_RESPONSE" });
  text = '[{"id":"a","text":"甲"},{"id":"a","text":"甲"}]';
  await expect(
    interpreter.exports.translate(input, config, ctx)
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("distributed mixed package runs translation with the production SDK and independent secret projection", async () => {
  const pack = example();
  const instance = createServiceInstance(
    pack.manifest,
    "chat-completions",
    pack.implementations["chat-completions"],
    {
      baseUrl: "https://example.invalid/v1",
      apiKey: "secret",
      model: "test-model",
    },
    "existing-id"
  );
  const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
  interpreter.run(instance.provider.code);
  const request = jest.fn(async () => ({
    status: 200,
    body: JSON.stringify({
      choices: [
        {
          message: {
            content: '[{"id":"b","text":"乙"},{"id":"a","text":"甲"}]',
          },
          finish_reason: "stop",
        },
      ],
    }),
  }));
  const config = projectInstanceConfig(instance).config;
  expect(config.apiKey).toBeUndefined();
  const result = await interpreter.exports.translate(
    {
      items: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      targetLanguage: "zh",
    },
    config,
    {
      helpers: providerHelpers,
      secrets: { ref: (key) => ({ scope: instance.apiSlug, key }) },
      http: { request },
    }
  );
  expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
  expect(request.mock.calls[0][0].url).toBe(
    "https://example.invalid/v1/chat/completions"
  );
  expect(request.mock.calls[0][0].auth.secret.scope).toBe("existing-id");
});

test.each([
  ["gpt-6-luna", "none", 0],
  ["gpt-6.1-sol", "low", undefined],
  ["gpt-6-astra", "low", undefined],
  ["gpt-6.1-sol-2026-10-01", "low", undefined],
  ["custom-model", undefined, 0],
])(
  "distributed scripts send compatible reasoning and sampling parameters for %s",
  async (model, effort, temperature) => {
    const pack = example();
    const request = jest.fn(async () => ({
      status: 200,
      body: {
        choices: [
          {
            message: { content: '[{"id":"a","text":"你好"}]' },
            finish_reason: "stop",
          },
        ],
      },
    }));
    const ctx = {
      helpers: providerHelpers,
      options: { streaming: false },
      secrets: { ref: (key) => ({ key }) },
      assets: { read: async () => new Uint8Array([1]).buffer },
      http: { request },
    };
    const config = {
      model,
      baseUrl: "https://example.invalid/v1",
      translationTemperature: 0,
    };
    const chat = new Sval({ ecmaVer: "latest", sandBox: true });
    chat.run(pack.implementations["chat-completions"]);
    await chat.exports.translate(
      { items: [{ id: "a", text: "hello" }], targetLanguage: "zh" },
      config,
      ctx
    );
    expect(request.mock.calls[0][0].body.reasoning_effort).toBe(effort);
    expect(request.mock.calls[0][0].body.temperature).toBe(temperature);
    const vision = new Sval({ ecmaVer: "latest", sandBox: true });
    vision.run(pack.implementations.vision);
    await vision.exports.parseImage(
      { image: { assetId: "image-1", mimeType: "image/png" } },
      config,
      ctx
    );
    expect(request.mock.calls[1][0].body.reasoning_effort).toBe(effort);
    expect(request.mock.calls[1][0].body.temperature).toBeUndefined();
  }
);

test("distributed JSON transcription and speech run through the production declarative executor", async () => {
  const pack = example();
  const request = jest.fn(async (descriptor) => ({
    status: 200,
    body:
      descriptor.responseType === "asset"
        ? { assetId: "asset-2", mimeType: "audio/mpeg" }
        : '{"text":"hello"}',
  }));
  const ctx = {
    config: {
      baseUrl: "https://example.invalid/v1",
      model: pack.manifest.services
        .find((service) => service.id === "transcriptions")
        .settings.find((field) => field.key === "model").defaultValue,
      speed: 1,
    },
    helpers: providerHelpers,
    secrets: { ref: (key) => ({ key }) },
    http: { request },
  };
  await expect(
    runDeclarative(
      { rules: pack.implementations.transcriptions },
      "transcribe",
      { audio: { assetId: "asset-1" }, language: "auto" },
      ctx
    )
  ).resolves.toEqual({ text: "hello" });
  expect(request.mock.calls[0][0].body.model).toBe("gpt-transcribe");
  expect(request.mock.calls[0][0].body.response_format).toBe("json");
  expect(request.mock.calls[0][0].body.language).toBeUndefined();
  const speech = pack.manifest.services.find(
    (service) => service.id === "speech"
  );
  ctx.config.model = speech.settings.find(
    (field) => field.key === "model"
  ).defaultValue;
  ctx.config.voice = speech.settings.find(
    (field) => field.key === "voice"
  ).defaultValue;
  await expect(
    runDeclarative(
      { rules: pack.implementations.speech },
      "synthesizeSpeech",
      { text: "hello", speed: 1 },
      ctx
    )
  ).resolves.toEqual({
    audio: { assetId: "asset-2", mimeType: "audio/mpeg" },
    mimeType: "audio/mpeg",
  });
  expect(request.mock.calls[1][0].body.speed).toBe(1);
  expect(request.mock.calls[1][0].body.model).toBe("gpt-4o-mini-tts");
  expect(request.mock.calls[1][0].body.voice).toBe("marin");
  expect(request.mock.calls[1][0].body.response_format).toBe("mp3");
});
