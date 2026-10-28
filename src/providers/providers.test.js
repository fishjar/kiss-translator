import { createInvocation } from "./invocation";
import { createProviderRegistry } from "./registry";
import { createServiceInstance, projectInstanceConfig } from "./instances";
import {
  buildChatRequest,
  parseChatResponse,
  createChatStreamParser,
} from "./sdk/openai";
import {
  buildMessages,
  parseResult,
  createTranslationStreamParser,
} from "./sdk/translation";
import { createSSEParser } from "./sdk/stream";

// Jest 27 resolves this package's browser main instead of its require export.
// Exercise the same installed implementation through its CommonJS distribution.
jest.mock("@streamparser/json", () =>
  jest.requireActual(
    require("path").join(
      require("path").dirname(require.resolve("@streamparser/json")),
      "../cjs/index.js"
    )
  )
);
beforeAll(() => {
  if (!global.TextEncoder) global.TextEncoder = require("util").TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = require("util").TextDecoder;
});

test("stream defaults are task-specific, respect false and reject unsupported explicit requirements", async () => {
  const contexts = [];
  const api = {
    apiSlug: "stream-default",
    provider: {
      apiVersion: 1,
      implementation: { kind: "native", entry: "probe" },
      capabilities: {
        chat: { handler: "chat", outputModes: ["complete", "stream"] },
        summarize: { handler: "summarize", outputModes: ["complete"] },
      },
    },
  };
  const registry = createProviderRegistry({
    resolveInstance: () => api,
    createContext: (_, ctx) => {
      contexts.push(ctx.options.streaming);
      return ctx;
    },
  });
  registry.registerNative("probe", {
    chat: () => ({ text: "ok" }),
    summarize: () => ({ text: "ok" }),
  });
  await registry.invoke(api.apiSlug, "chat", {
    messages: [{ role: "user", content: "hello" }],
  }).result;
  api.useStream = false;
  await registry.invoke(api.apiSlug, "chat", {
    messages: [{ role: "user", content: "hello" }],
  }).result;
  delete api.useStream;
  await registry.invoke(api.apiSlug, "summarize", { text: "hello" }).result;
  expect(contexts).toEqual([true, false, false]);
  await expect(
    registry.invoke(
      api.apiSlug,
      "summarize",
      { text: "hello" },
      { streaming: "required" }
    ).result
  ).rejects.toMatchObject({ code: "STREAM_UNSUPPORTED" });
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const instance = {
  apiSlug: "existing-id",
  provider: {
    apiVersion: 1,
    implementation: { kind: "native", entry: "builtin" },
    capabilities: { chat: { handler: "chat", outputModes: ["complete"] } },
  },
};

test("native handlers bypass the script executor and preserve instance identity", async () => {
  const script = jest.fn();
  const handler = jest.fn(async (_input, api) => ({
    text: api.apiSlug,
    reasoning: "",
  }));
  const registry = createProviderRegistry({
    resolveInstance: () => instance,
    createContext: () => ({}),
    runners: { script },
  });
  registry.registerNative("builtin", { chat: handler });
  expect(
    await registry.invoke("existing-id", "chat", {
      messages: [{ role: "user", content: "hello" }],
    }).result
  ).toEqual({ text: "existing-id", reasoning: "" });
  expect(script).not.toHaveBeenCalled();
  await expect(
    registry.invoke("existing-id", "translate", {}).result
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  await expect(
    registry.invoke("existing-id", "chat", {}, { streaming: "required" }).result
  ).rejects.toMatchObject({ code: "STREAM_UNSUPPORTED" });
});

test("cancellation settles a hung task, aborts work and suppresses late events", async () => {
  let ctx;
  const call = createInvocation(async (context) => {
    ctx = context;
    await new Promise(() => {});
  });
  const events = call.events[Symbol.asyncIterator]();
  const next = events.next();
  await tick();
  call.cancel();
  await expect(call.result).rejects.toMatchObject({ name: "AbortError" });
  await expect(next).rejects.toMatchObject({ name: "AbortError" });
  expect(ctx.signal.aborted).toBe(true);
  await ctx.emit({ type: "text.delta", text: "late" });
});

test("returning from event consumption releases backpressure without cancelling execution", async () => {
  let ctx;
  let done;
  const call = createInvocation(async (context) => {
    ctx = context;
    await new Promise((resolve) => {
      done = resolve;
    });
    return "finished";
  });
  const events = call.events[Symbol.asyncIterator]();
  await tick();
  for (let i = 0; i < 64; i++)
    await ctx.emit({ type: "text.delta", text: "a" });
  const producers = [
    ctx.emit({ type: "text.delta", text: "b" }),
    ctx.emit({ type: "text.delta", text: "c" }),
  ];
  await events.return();
  await Promise.all(producers);
  expect(ctx.signal.aborted).toBe(false);
  done();
  expect(await call.result).toBe("finished");
});

test("timeouts include pending execution and pre-aborted calls never execute", async () => {
  const call = createInvocation(() => new Promise(() => {}), { timeoutMs: 5 });
  await expect(call.result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  const controller = new AbortController();
  controller.abort();
  const execute = jest.fn();
  await expect(
    createInvocation(execute, { signal: controller.signal }).result
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(execute).not.toHaveBeenCalled();
});

test("shared settings and code are independent snapshots, secrets are removed from script config", () => {
  const manifest = {
    apiVersion: 1,
    id: "p",
    version: "1.0.0",
    sharedSettings: [{ key: "apiKey", type: "password", label: "key" }],
    services: [
      {
        id: "chat",
        name: "Chat",
        implementation: { kind: "script", entry: "chat.js" },
        capabilities: { chat: { handler: "chat" } },
        settings: [],
      },
    ],
  };
  const first = createServiceInstance(
    manifest,
    "chat",
    "exports.chat = () => 1",
    { apiKey: "a" },
    "a"
  );
  const second = createServiceInstance(
    manifest,
    "chat",
    "exports.chat = () => 2",
    { apiKey: "b" },
    "b"
  );
  manifest.services[0].capabilities.chat.handler = "changed";
  first.pluginConfig.apiKey = "new";
  expect(second.pluginConfig.apiKey).toBe("b");
  expect(first.provider.capabilities.chat.handler).toBe("chat");
  expect(projectInstanceConfig(first)).toEqual({
    config: {},
    secrets: { apiKey: "new" },
  });
});

test("OpenAI responses reject truncation/refusal and streaming preserves reasoning and usage", () => {
  const request = buildChatRequest({
    baseUrl: "https://example.com/v1/",
    model: "m",
    messages: [],
    temperature: 0.3,
  });
  expect(request.url).toBe("https://example.com/v1/chat/completions");
  expect(request.body.temperature).toBe(0.3);
  expect(() =>
    parseChatResponse({
      status: 200,
      body: {
        choices: [{ message: { content: "partial" }, finish_reason: "length" }],
      },
    })
  ).toThrow("length");
  const parser = createChatStreamParser();
  expect(
    parser.push(
      JSON.stringify({
        choices: [{ delta: { content: "hi", reasoning_content: "think" } }],
      })
    )
  ).toHaveLength(2);
  expect(() => parser.finish()).toThrow("terminator");
  parser.push(
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })
  );
  parser.push(JSON.stringify({ choices: [], usage: { total_tokens: 3 } }));
  parser.push("[DONE]");
  expect(parser.finish()).toEqual({
    text: "hi",
    reasoning: "think",
    finishReason: "stop",
    usage: { total_tokens: 3 },
  });
});

test("SSE supports split CRLF, multiline data and DONE without discarding protocol fields", () => {
  const parser = createSSEParser();
  expect(parser.push("event: custom\r")).toEqual([]);
  expect(parser.push("\ndata: one\r\ndata: two\r\n\r")).toEqual([
    { event: "custom", data: "one\ntwo" },
  ]);
  expect(parser.push("\ndata: [DONE]\n\n")).toEqual([
    { event: "message", data: "[DONE]" },
  ]);
  parser.finish();
});

test("translation utility keeps caller prompt and stable IDs and rejects missing/duplicate results", () => {
  const items = [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ];
  const messages = buildMessages({
    items,
    targetLanguage: "zh",
    systemPrompt: "Custom {{targetLanguage}}",
  });
  expect(messages[0].content).toBe("Custom zh");
  expect(
    buildMessages({
      items: [items[0]],
      sourceLanguage: "en",
      targetLanguage: "zh",
      document: { title: "page" },
      userPrompt: "{{title}} {{text}} {{to}} {{segments}}",
    })[1].content
  ).toBe('page A zh [{"id":"a","text":"A"}]');
  expect(
    parseResult('[{"id":"b","text":"乙"},{"id":"a","text":"甲"}]', { items })
      .items[0].id
  ).toBe("a");
  expect(() => parseResult('[{"id":"a","text":"甲"}]', { items })).toThrow(
    "Missing"
  );
  expect(() =>
    parseResult('[{"id":"a","text":"甲"},{"id":"a","text":"乙"}]', { items })
  ).toThrow("duplicate");
});

test("incremental batch parsing emits complete items before the final array and verifies completion", async () => {
  const parser = await createTranslationStreamParser({
    items: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  });
  expect(parser.push('[{"id":"b","text":"乙"},')).toEqual([
    { type: "item.complete", id: "b", text: "乙" },
  ]);
  expect(parser.push('{"id":"a","text":"甲"}]')).toEqual([
    { type: "item.complete", id: "a", text: "甲" },
  ]);
  expect(parser.finish().items).toEqual([
    { id: "a", text: "甲" },
    { id: "b", text: "乙" },
  ]);
  const incomplete = await createTranslationStreamParser({
    items: [{ id: "a", text: "A" }],
  });
  incomplete.push("[]");
  expect(() => incomplete.finish()).toThrow("Missing");
});
