import Sval from "sval";
import { Blob as NodeBlob } from "buffer";
import { PROVIDER_CAPABILITIES } from "./capabilities";
import { protocolCapabilities } from "./protocolCapabilities";
import { validateDeclarativeRules } from "./declarativeRules";
import { runDeclarative } from "./declarative";
import { createProviderRegistry } from "./registry";
import { createAssetStore } from "./transport";
import { providerHelpers } from "./sdk";
import { validateInput } from "./validation";

global.TextEncoder ||= require("util").TextEncoder;
global.TextDecoder ||= require("util").TextDecoder;
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

const polygon = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const question = {
  type: "choice",
  instructions: "Choose",
  criteria: { yes: "The condition holds", no: "The condition does not hold" },
};
const request = {
  baseUrl: "https://example.invalid/v1",
  model: "model",
  auth: { type: "bearer", secret: { $secret: "apiKey" } },
};
const fields = [{ key: "apiKey", type: "password" }];

function fixture(task, kind) {
  const support = protocolCapabilities[task];
  const assets = createAssetStore();
  const image = assets.put(
    new NodeBlob([new Uint8Array([0, 255, 42])], { type: "image/png" })
  );
  const audio = assets.put(new NodeBlob(["audio"], { type: "audio/wav" }));
  const outputAudio = assets.put(new NodeBlob(["mp3"], { type: "audio/mpeg" }));
  const inputs = {
    chat: { messages: [{ role: "user", content: "hello" }] },
    translate: { items: [{ id: "a", text: "hello" }], targetLanguage: "zh" },
    summarize: { text: "article", language: "zh" },
    dictionary: { text: "bank", language: "zh" },
    detectLanguage: { text: "hello", candidates: ["en", "zh"] },
    suggest: { text: "hel", language: "en" },
    segmentSubtitle: {
      items: [{ id: "a", text: "hello", start: 0, end: 1 }],
      targetLanguage: "zh",
    },
    evaluate: { state: "hello", questions: { q: question } },
    recognizeText: { image },
    parseImage: { image },
    analyzeLayout: { image, imageSize: { width: 10, height: 10 } },
    transcribe: { audio, language: "en", requireTimestamps: true },
    synthesizeSpeech: { text: "hello", voice: "alloy", speed: 1.1 },
  };
  const results = {
    chat: { text: "hello", reasoning: "", finishReason: "stop" },
    translate: { items: [{ id: "a", text: "你好" }] },
    summarize: { text: "summary" },
    dictionary: { text: "# bank", format: "markdown" },
    detectLanguage: { language: "en", confidence: 0.9 },
    suggest: { items: ["hello"] },
    segmentSubtitle: {
      groups: [{ ids: ["a"], text: "hello", translation: "你好" }],
    },
    evaluate: {
      answers: {
        q: {
          type: "choice",
          choice: "yes",
          confidence: 0.9,
          action: { act_probability: 1 },
        },
      },
      model: "model",
      usage: {},
    },
    recognizeText: {
      text: "hello",
      format: "text",
      items: [{ text: "hello", poly: polygon }],
    },
    parseImage: {
      text: "# hello",
      format: "markdown",
      items: [{ text: "# hello", poly: null }],
    },
    analyzeLayout: { regions: [{ type: "text", poly: polygon, order: 0 }] },
    transcribe: {
      text: "hello",
      segments: [{ text: "hello", start: 0, end: 1 }],
    },
    synthesizeSpeech: { audio: outputAudio, mimeType: outputAudio.mimeType },
  };
  const descriptor = {
    handler: task,
    outputModes: ["complete"],
    inputModalities: support.modalities,
    ...(task === "recognizeText" && { coordinates: true }),
    ...(task === "transcribe" && { timestamps: true }),
    ...(task === "translate" && { batch: { supported: true } }),
  };
  const content = ["chat", "summarize", "dictionary", "parseImage"].includes(
    task
  )
    ? results[task].text
    : JSON.stringify(
        task === "translate" ? results[task].items : results[task]
      );
  const http = {
    request: jest.fn(async () =>
      task === "synthesizeSpeech"
        ? { status: 200, body: outputAudio }
        : task === "transcribe"
          ? { status: 200, body: JSON.stringify(results[task]) }
          : {
              status: 200,
              body: JSON.stringify({
                choices: [{ message: { content }, finish_reason: "stop" }],
              }),
            }
    ),
  };
  const rule = { protocol: support.protocol, task, request };
  const snapshot = {
    apiVersion: 1,
    implementation: { kind },
    source: { external: true },
    settings: fields,
    capabilities: { [task]: descriptor },
    rules: { format: "protocol", handlers: { [task]: rule } },
  };
  const config = { model: "model", baseUrl: "https://example.invalid/v1" };
  const ctx = {
    config,
    assets,
    helpers: providerHelpers,
    http,
    secrets: { ref: (key) => ({ key }) },
  };
  const registry = createProviderRegistry({
    resolveInstance: () => ({ apiSlug: "one", provider: snapshot }),
    createContext: (_, invocation) => ({ ...ctx, ...invocation }),
    runners: {
      declarative: runDeclarative,
      script: async (_, handler, input, context) => {
        const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
        // These examples use the same public SDK entry points documented for authors.
        interpreter.run(`exports.run = async function(input, config, ctx, task, descriptor) {
          var sdk = ctx.helpers.openai.chatCompletions;
          if (task === "transcribe") return ctx.helpers.openai.audio.parseTranscription(await ctx.http.request(ctx.helpers.openai.audio.buildTranscriptionRequest(Object.assign({}, input, config))));
          if (task === "synthesizeSpeech") { var response = await ctx.http.request(ctx.helpers.openai.audio.buildSpeechRequest(Object.assign({}, input, config))); return { audio: response.body, mimeType: response.body.mimeType }; }
          var messages = task === "chat" ? input.messages : task === "translate" ? ctx.helpers.translation.buildMessages(input) : ctx.helpers.textTasks.buildMessages(task, input, descriptor);
          messages = await sdk.prepareMessages(messages, ctx.assets.read);
          var request = sdk.buildRequest(Object.assign({}, config, { messages: messages, stream: Boolean(ctx.options.streaming) }));
          var result;
          if (ctx.options.streaming) {
            var parser = sdk.createStreamParser();
            var translation = task === "translate" ? await ctx.helpers.translation.createStreamParser(input) : null;
            for await (var frame of ctx.http.stream(request)) {
              if (frame.type !== "sse") continue;
              for (var event of parser.push(frame.data)) {
                if (!translation) await ctx.emit(event);
                else if (event.type === "text.delta") for (var item of translation.push(event.text)) await ctx.emit(item);
              }
            }
            result = parser.finish();
            if (translation) return translation.finish();
          } else result = sdk.parseResponse(await ctx.http.request(request));
          return task === "chat" ? result : task === "translate" ? ctx.helpers.translation.parseResult(result.text, input) : ctx.helpers.textTasks.parseResult(task, result.text, input, Object.assign({}, descriptor, {model: config.model, usage: result.usage}));
        };`);
        return interpreter.exports.run(
          input,
          context.config,
          {
            ...context,
            assets: { read: (ref) => context.assets.get(ref).arrayBuffer() },
          },
          handler,
          descriptor
        );
      },
    },
  });
  return {
    registry,
    input: inputs[task],
    expected: results[task],
    http,
    snapshot,
    ctx,
    descriptor,
  };
}

test("every registered network capability has a standard protocol and execution fixture", () => {
  expect(Object.keys(protocolCapabilities).sort()).toEqual(
    PROVIDER_CAPABILITIES.filter((task) => task !== "speak").sort()
  );
});

test.each(
  Object.keys(protocolCapabilities).flatMap((task) =>
    ["declarative", "script"].map((kind) => [task, kind])
  )
)(
  "%s executes through %s and the registry validates its final result",
  async (task, kind) => {
    const f = fixture(task, kind);
    await expect(
      f.registry.invoke("one", task, f.input, { streaming: "disabled" }).result
    ).resolves.toEqual(f.expected);
    expect(f.http.request).toHaveBeenCalledTimes(1);
    const requests = {
      transcribe: {
        url: "https://example.invalid/v1/audio/transcriptions",
        bodyType: "multipart",
        body: { file: f.input.audio, response_format: "verbose_json" },
      },
      synthesizeSpeech: {
        url: "https://example.invalid/v1/audio/speech",
        responseType: "asset",
        body: { input: "hello", voice: "alloy", speed: 1.1 },
      },
    };
    expect(f.http.request.mock.calls[0][0]).toMatchObject(
      requests[task] || { url: "https://example.invalid/v1/chat/completions" }
    );
  }
);

test.each([true, false])(
  "suggest renders its user message with provider defaults configured: %p",
  async (configured) => {
    const f = fixture("suggest", "declarative");
    if (configured)
      f.snapshot.defaultPrompts = {
        suggest: [
          {
            id: "default",
            name: "Default",
            userPrompt: "Complete formally: {{text}}",
          },
        ],
      };
    const input = { text: "hello", language: "en" };
    await expect(
      f.registry.invoke("one", "suggest", input).result
    ).resolves.toEqual({ items: ["hello"] });
    expect(f.http.request).toHaveBeenCalledTimes(1);
    expect(f.http.request.mock.calls[0][0].body.messages[1]).toEqual({
      role: "user",
      content: configured ? "Complete formally: hello" : "hello",
    });
    expect(input).toEqual({ text: "hello", language: "en" });
  }
);

test.each(Object.keys(protocolCapabilities))(
  "%s streaming declaration agrees with its executor",
  (task) => {
    const f = fixture(task, "declarative");
    f.descriptor.outputModes.push("stream");
    const validate = () =>
      validateDeclarativeRules(
        f.snapshot.rules,
        f.snapshot.capabilities,
        fields
      );
    let failure;
    try {
      validate();
    } catch (error) {
      failure = error.message;
    }
    expect(failure).toBe(
      protocolCapabilities[task].stream
        ? undefined
        : "Unsupported protocol capability features."
    );
  }
);

test.each(
  ["chat", "translate", "summarize", "dictionary"].flatMap((task) =>
    ["declarative", "script"].map((kind) => [task, kind])
  )
)(
  "%s streams through %s and rejects a missing terminal frame",
  async (task, kind) => {
    const f = fixture(task, kind);
    f.descriptor.outputModes.push("stream");
    const content =
      task === "translate" ? JSON.stringify(f.expected.items) : f.expected.text;
    let truncated = false;
    f.http.stream = async function* () {
      yield { type: "headers", status: 200, headers: {} };
      yield {
        type: "sse",
        data: JSON.stringify({
          choices: [{ delta: { content }, finish_reason: null }],
        }),
      };
      if (truncated) return;
      yield {
        type: "sse",
        data: JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }],
        }),
      };
      yield { type: "sse", data: "[DONE]" };
    };
    const call = f.registry.invoke("one", task, f.input);
    const events = [];
    const consume = (async () => {
      for await (const event of call.events) events.push(event);
    })();
    await expect(call.result).resolves.toEqual(f.expected);
    await consume;
    expect(
      events.some((event) =>
        task === "translate"
          ? ["item.delta", "item.complete"].includes(event.type)
          : event.type === "text.delta"
      )
    ).toBe(true);
    truncated = true;
    const failed = f.registry.invoke("one", task, f.input);
    const drain = (async () => {
      try {
        for await (const event of failed.events) void event;
      } catch {}
    })();
    await expect(failed.result).rejects.toMatchObject({
      code: "INCOMPLETE_RESPONSE",
    });
    await drain;
  }
);

test("HTTP format rejects streaming, and external system speech never reaches a runner", async () => {
  expect(() =>
    validateDeclarativeRules(
      {
        format: "http",
        handlers: { run: { request: {}, response: { kind: "json" } } },
      },
      { chat: { handler: "run", outputModes: ["stream"] } }
    )
  ).toThrow("HTTP");
  const f = fixture("chat", "script");
  f.snapshot.capabilities.speak = { handler: "speak" };
  await expect(
    f.registry.invoke("one", "speak", { text: "hello" }).result
  ).rejects.toMatchObject({ code: "INVALID_MANIFEST" });
  expect(f.http.request).not.toHaveBeenCalled();
});

test("context templates preserve document summary separately from surrounding context", () => {
  const input = {
    text: "bank",
    language: "zh",
    context: "river bank",
    document: {
      title: "Geography",
      description: "A river guide",
      summary: "River ecology",
    },
    tone: "formal",
    glossary: { bank: "河岸" },
    instructions:
      "{{title}}|{{description}}|{{summary}}|{{context}}|{{tone}}|{{glossary}}",
    userPrompt: "{{text}}",
  };
  expect(
    providerHelpers.textTasks.buildMessages("dictionary", input)[0].content
  ).toBe(
    "Geography|A river guide|River ecology|river bank|formal|- bank: 河岸"
  );
  expect(() =>
    validateInput("dictionary", { ...input, document: { title: 3 } })
  ).toThrow("document");
  expect(() =>
    validateInput("segmentSubtitle", {
      ...fixture("segmentSubtitle", "declarative").input,
      glossary: { term: 5 },
    })
  ).toThrow("glossary");
});

test("summary scene prompt aliases render the transcript and video metadata", () => {
  const messages = providerHelpers.textTasks.buildMessages("summarize", {
    text: "The full transcript",
    language: "zh",
    document: { title: "Video title", description: "Video description" },
    userPrompt: "{{title}}|{{description}}|{{transcript}}",
  });
  expect(messages[1].content).toBe(
    "Video title|Video description|The full transcript"
  );
});

test("chat converts owned image and audio parts and refuses unsupported audio MIME types", async () => {
  const ref = { assetId: "asset-1", mimeType: "image/png" };
  const read = jest.fn(async () => new Uint8Array([0, 255, 42]).buffer);
  const messages = await providerHelpers.openai.chatCompletions.prepareMessages(
    [
      {
        role: "user",
        content: [
          { type: "image", asset: ref },
          { type: "audio", asset: { ...ref, mimeType: "audio/wav" } },
        ],
      },
    ],
    read
  );
  expect(messages[0].content).toEqual([
    { type: "image_url", image_url: { url: "data:image/png;base64,AP8q" } },
    { type: "input_audio", input_audio: { data: "AP8q", format: "wav" } },
  ]);
  await expect(
    providerHelpers.openai.chatCompletions.prepareMessages(
      [
        {
          role: "user",
          content: [
            { type: "audio", asset: { ...ref, mimeType: "audio/mp4" } },
          ],
        },
      ],
      read
    )
  ).rejects.toMatchObject({ code: "INVALID_ASSET" });
});

test.each(["one message", "multiple messages"])(
  "chat reads five assets sequentially across %s and preserves order",
  async (layout) => {
    const parts = Array.from({ length: 5 }, (_, index) => ({
      type: "image",
      asset: { assetId: `asset-${index + 1}`, mimeType: "image/png" },
    }));
    const messages = [
      { role: "system", content: "Read these images" },
      ...(layout === "one message"
        ? [
            {
              role: "user",
              content: [{ type: "text", text: "Images" }, ...parts],
            },
          ]
        : parts.map((part) => ({ role: "user", content: [part] }))),
    ];
    const releases = [];
    const notify = [];
    const started = parts.map(
      (_, index) =>
        new Promise((resolve) => {
          notify[index] = resolve;
        })
    );
    let active = 0;
    let maximum = 0;
    const read = jest.fn(async (ref) => {
      const index = Number(ref.assetId.split("-")[1]) - 1;
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => {
        releases[index] = resolve;
        notify[index]();
      });
      active--;
      return new Uint8Array([index]).buffer;
    });
    const result = providerHelpers.openai.chatCompletions.prepareMessages(
      messages,
      read
    );
    for (let index = 0; index < parts.length; index++) {
      await started[index];
      releases[index]();
    }
    const converted = await result;
    expect(maximum).toBe(1);
    expect(read.mock.calls.map(([ref]) => ref)).toEqual(
      parts.map((part) => part.asset)
    );
    expect(converted).toEqual(
      messages.map((message) => ({
        ...message,
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map((part) =>
                part.type === "text"
                  ? part
                  : {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${Buffer.from([Number(part.asset.assetId.split("-")[1]) - 1]).toString("base64")}`,
                      },
                    }
              ),
      }))
    );
  }
);

test("chat stops reading subsequent assets when a read fails", async () => {
  const error = new Error("Asset read failed");
  const parts = Array.from({ length: 3 }, (_, index) => ({
    type: "image",
    asset: { assetId: `asset-${index + 1}`, mimeType: "image/png" },
  }));
  const read = jest
    .fn()
    .mockResolvedValueOnce(new Uint8Array([0]).buffer)
    .mockRejectedValueOnce(error);
  await expect(
    providerHelpers.openai.chatCompletions.prepareMessages(
      [
        { role: "user", content: parts.slice(0, 2) },
        { role: "user", content: parts.slice(2) },
      ],
      read
    )
  ).rejects.toBe(error);
  expect(read.mock.calls.map(([ref]) => ref)).toEqual(
    parts.slice(0, 2).map((part) => part.asset)
  );
});

test.each([
  "detectLanguage",
  "suggest",
  "segmentSubtitle",
  "evaluate",
  "recognizeText",
  "analyzeLayout",
])("%s rejects malformed structured output", async (task) => {
  const f = fixture(task, "declarative");
  f.http.request.mockResolvedValue({
    status: 200,
    body: JSON.stringify({
      choices: [{ message: { content: "not JSON" }, finish_reason: "stop" }],
    }),
  });
  await expect(
    f.registry.invoke("one", task, f.input).result
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
