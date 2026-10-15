import fs from "fs";
import path from "path";
import { runDeclarative } from "./declarative";
import { zipSync } from "fflate";
import { readProviderPackage } from "./package";
import { createServiceInstance, projectInstanceConfig } from "./instances";
import { providerHelpers } from "./sdk";
import defaults from "./sdk/defaultTranslationPrompts.json";
import { TRANSLATION_PROTOCOL_PROMPTS } from "./sdk/translation";

const { TextDecoder, TextEncoder } = require("util");
global.TextEncoder ||= TextEncoder;
global.TextDecoder ||= TextDecoder;
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

function example() {
  const root = path.join(process.cwd(), "docs/plugins/examples/deepseek");
  const pack = readProviderPackage(
    zipSync({
      "manifest.json": fs.readFileSync(path.join(root, "manifest.json")),
      "services/chat.json": fs.readFileSync(
        path.join(root, "services/chat.json")
      ),
    })
  );
  const instance = createServiceInstance(
    pack.manifest,
    "chat-completions",
    pack.implementations["chat-completions"],
    { apiKey: "secret" },
    "deepseek-test"
  );
  const handlers = Object.fromEntries(
    ["chat", "translate"].map((handler) => [
      handler,
      (input, config, context) =>
        runDeclarative(instance.provider, handler, input, {
          ...context,
          config,
        }),
    ])
  );
  const request = jest.fn(async () => ({
    status: 200,
    body: JSON.stringify({
      choices: [
        {
          message: { content: "你好", reasoning_content: "thinking" },
          finish_reason: "stop",
        },
      ],
    }),
  }));
  const ctx = {
    helpers: providerHelpers,
    options: { streaming: false },
    secrets: { ref: (key) => ({ key }) },
    http: { request },
    emit: jest.fn(async () => {}),
  };
  return {
    pack,
    handlers,
    config: projectInstanceConfig(instance).config,
    ctx,
    request,
  };
}

const chatInput = { messages: [{ role: "user", content: "Hello" }] };
const translationInput = {
  items: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  targetLanguage: "zh",
};

test.each(["chat", "translate"])(
  "DeepSeek %s uses three thinking modes and omits default effort",
  async (handler) => {
    const { handlers, config, ctx, request } = example();
    if (handler === "translate")
      request.mockResolvedValue({
        status: 200,
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: '[{"id":"a","text":"甲"},{"id":"b","text":"乙"}]',
              },
              finish_reason: "stop",
            },
          ],
        }),
      });
    const input = handler === "chat" ? chatInput : translationInput;
    for (const mode of ["auto", "enabled", "disabled"]) {
      await handlers[handler](
        input,
        { ...config, thinkingMode: mode, thinkingEffort: "_default" },
        ctx
      );
      const body = request.mock.calls.at(-1)[0].body;
      expect(body.thinking).toEqual(
        mode === "auto" ? undefined : { type: mode }
      );
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.temperature).toBe(
        handler === "translate" && mode === "disabled" ? 0 : undefined
      );
      await handlers[handler](
        input,
        { ...config, thinkingMode: mode, thinkingEffort: "low" },
        ctx
      );
      expect(request.mock.calls.at(-1)[0].body.reasoning_effort).toBe(
        mode === "enabled" ? "low" : undefined
      );
    }
  }
);

test("DeepSeek package creates an instance with current models, SDK prompts and isolated secrets", async () => {
  const { pack, handlers, config, ctx, request } = example();
  expect(pack.manifest.services[0].models.map((model) => model.id)).toEqual([
    "deepseek-flash",
    "deepseek-v4-pro",
  ]);
  expect(pack.manifest.services[0].defaultPrompts).toEqual({
    batch: { ...defaults, protocol: "json" },
    nobatch: { ...TRANSLATION_PROTOCOL_PROMPTS.text, protocol: "text" },
  });
  expect(config.apiKey).toBeUndefined();
  await expect(handlers.chat(chatInput, config, ctx)).resolves.toMatchObject({
    text: "你好",
    reasoning: "thinking",
  });
  expect(request.mock.calls[0][0]).toMatchObject({
    url: "https://api.deepseek.com/chat/completions",
    method: "POST",
    auth: { type: "bearer", secret: { key: "apiKey" } },
    body: {
      model: "deepseek-flash",
      messages: chatInput.messages,
      stream: false,
      thinking: { type: "disabled" },
    },
  });
  expect(request.mock.calls[0][0].body.reasoning_effort).toBeUndefined();
  expect(request.mock.calls[0][0].body.temperature).toBeUndefined();
});

test("DeepSeek translation aligns IDs, sends temperature only without thinking and preserves config", async () => {
  const { handlers, config, ctx, request } = example();
  request.mockResolvedValue({
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
  });
  await expect(
    handlers.translate(translationInput, config, ctx)
  ).resolves.toEqual({
    items: [
      { id: "a", text: "甲" },
      { id: "b", text: "乙" },
    ],
  });
  expect(request.mock.calls[0][0].body.temperature).toBe(0);
  expect(request.mock.calls[0][0].body.response_format).toBeUndefined();
  await handlers.translate(
    translationInput,
    { ...config, thinkingMode: "enabled", thinkingEffort: "max" },
    ctx
  );
  expect(request.mock.calls[1][0].body).toMatchObject({
    thinking: { type: "enabled" },
    reasoning_effort: "max",
  });
  expect(request.mock.calls[1][0].body.temperature).toBeUndefined();
  expect(config.thinkingMode).toBe("disabled");
  request.mockResolvedValue({
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
    handlers.translate(translationInput, config, ctx)
  ).rejects.toMatchObject({ code: "INCOMPLETE_RESPONSE" });
});

function streamContext(ctx, text, terminal = true) {
  return {
    ...ctx,
    options: { streaming: true },
    http: {
      async *stream() {
        yield { type: "headers", status: 200 };
        yield {
          type: "sse",
          data: JSON.stringify({
            choices: [{ delta: { reasoning_content: "thinking" } }],
          }),
        };
        for (const content of [text.slice(0, 12), text.slice(12)])
          yield {
            type: "sse",
            data: JSON.stringify({ choices: [{ delta: { content } }] }),
          };
        if (terminal) {
          yield {
            type: "sse",
            data: JSON.stringify({
              choices: [{ delta: {}, finish_reason: "stop" }],
            }),
          };
          yield { type: "sse", data: "[DONE]" };
        }
      },
    },
  };
}

test("DeepSeek chat streams reasoning and text and rejects truncated streams", async () => {
  const { handlers, config, ctx } = example();
  await expect(
    handlers.chat(chatInput, config, streamContext(ctx, "hello"))
  ).resolves.toMatchObject({ text: "hello", reasoning: "thinking" });
  expect(ctx.emit).toHaveBeenCalledWith({
    type: "reasoning.delta",
    text: "thinking",
  });
  expect(ctx.emit).toHaveBeenCalledWith({ type: "text.delta", text: "hello" });
  await expect(
    handlers.chat(chatInput, config, streamContext(ctx, "partial", false))
  ).rejects.toMatchObject({ code: "INCOMPLETE_RESPONSE" });
});

test("DeepSeek streaming translation excludes reasoning and rejects duplicate IDs", async () => {
  const { handlers, config, ctx } = example();
  const text = '[{"id":"b","text":"乙"},{"id":"a","text":"甲"}]';
  await expect(
    handlers.translate(translationInput, config, streamContext(ctx, text))
  ).resolves.toEqual({
    items: [
      { id: "a", text: "甲" },
      { id: "b", text: "乙" },
    ],
  });
  expect(ctx.emit.mock.calls.map(([event]) => event.type)).toEqual([
    "item.complete",
    "item.complete",
  ]);
  await expect(
    handlers.translate(
      translationInput,
      config,
      streamContext(ctx, '[{"id":"a","text":"甲"},{"id":"a","text":"甲"}]')
    )
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("DeepSeek declarative plugin propagates cancellation and API errors", async () => {
  const { handlers, config, ctx, request } = example();
  const cancellation = Object.assign(new Error("cancelled"), {
    name: "AbortError",
  });
  request.mockRejectedValueOnce(cancellation);
  await expect(handlers.chat(chatInput, config, ctx)).rejects.toBe(
    cancellation
  );
  request.mockResolvedValueOnce({
    status: 200,
    body: '{"error":{"message":"quota exceeded"}}',
  });
  await expect(handlers.chat(chatInput, config, ctx)).rejects.toMatchObject({
    code: "PROVIDER_ERROR",
  });
});

test.each([
  ['[{"id":"a","text":"甲"}]', "INCOMPLETE_RESPONSE"],
  ['[{"id":"a","text":"甲"},{"id":"a","text":"甲"}]', "INVALID_RESPONSE"],
  ['[{"id":"a","text":"甲"},{"id":"unknown","text":"乙"}]', "INVALID_RESPONSE"],
])(
  "DeepSeek validates all translation IDs for complete and streaming results: %s",
  async (text, code) => {
    const { handlers, config, ctx, request } = example();
    request.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: { content: text },
            finish_reason: "stop",
          },
        ],
      }),
    });
    await expect(
      handlers.translate(translationInput, config, ctx)
    ).rejects.toMatchObject({ code });
    await expect(
      handlers.translate(translationInput, config, streamContext(ctx, text))
    ).rejects.toMatchObject({ code });
  }
);
