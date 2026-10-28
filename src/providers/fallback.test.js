import { zipSync, strToU8 } from "fflate";
import { runDeclarative } from "./declarative";
import { readProviderPackage } from "./package";
import { providerHelpers } from "./sdk";

jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

function fixture(
  format,
  reference = { $ref: "input.value", fallbackRef: "config.defaultValue" }
) {
  const fields = [
    { key: "defaultValue", type: "text" },
    { key: "apiKey", type: "password" },
  ];
  const rule =
    format === "http"
      ? {
          request: {
            url: "https://example.invalid",
            body: { value: reference },
          },
          response: { kind: "json", map: { text: { $ref: "response.text" } } },
        }
      : {
          protocol: "openai-chat-completions",
          task: "chat",
          request: {
            baseUrl: "https://example.invalid",
            model: "test",
            auth: { type: "bearer", secret: { $secret: "apiKey" } },
            parameters: { temperature: reference },
          },
        };
  const snapshot = {
    apiVersion: 1,
    settings: fields,
    capabilities: { chat: { handler: "chat" } },
    rules: { format, handlers: { chat: rule } },
  };
  const ctx = {
    config: { defaultValue: "configured" },
    helpers: providerHelpers,
    options: {},
    secrets: { ref: (key) => ({ key }) },
    http: {
      request: jest.fn(async () => ({
        status: 200,
        body: JSON.stringify({
          text: "ok",
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        }),
      })),
    },
  };
  const importPackage = () =>
    readProviderPackage(
      zipSync({
        "manifest.json": strToU8(
          JSON.stringify({
            apiVersion: 1,
            id: "fallback-test",
            version: "1.0.0",
            services: [
              {
                id: "chat",
                settings: fields,
                capabilities: snapshot.capabilities,
                implementation: { kind: "declarative", entry: "chat.json" },
              },
            ],
          })
        ),
        "chat.json": strToU8(JSON.stringify(snapshot.rules)),
      })
    );
  const invoke = (input = {}) =>
    runDeclarative(
      snapshot,
      "chat",
      { messages: [{ role: "user", content: "Hello" }], ...input },
      ctx
    );
  const sent = () =>
    ctx.http.request.mock.calls.at(-1)[0].body[
      format === "http" ? "value" : "temperature"
    ];
  return { snapshot, rule, ctx, importPackage, invoke, sent };
}

describe.each(["http", "protocol"])("%s field fallback", (format) => {
  test.each([undefined, null, "explicit", "", 0, false])(
    "preserves explicit values and falls back only for nullish %j",
    async (value) => {
      const f = fixture(format);
      f.importPackage();
      await f.invoke({ value });
      expect(f.sent()).toBe(value ?? "configured");
      expect(f.ctx.config.defaultValue).toBe("configured");
    }
  );

  test("missing fallback rejects; omission is applied after fallback", async () => {
    const f = fixture(format);
    delete f.ctx.config.defaultValue;
    await expect(f.invoke()).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.ctx.http.request).not.toHaveBeenCalled();
    const omitted = fixture(format, {
      $ref: "input.value",
      fallbackRef: "config.defaultValue",
      omitIfEmpty: true,
      omitValues: ["configured"],
      transform: "languages.toIso6391",
    });
    await omitted.invoke();
    expect(omitted.sent()).toBeUndefined();
    delete omitted.ctx.config.defaultValue;
    await omitted.invoke();
    expect(omitted.sent()).toBeUndefined();
  });

  test("a null fallback retains normal reference null semantics", async () => {
    const f = fixture(format);
    f.ctx.config.defaultValue = null;
    await f.invoke();
    expect(f.sent()).toBeNull();
  });

  test("fallback is transformed after selection", async () => {
    const f = fixture(format, {
      $ref: "input.value",
      fallbackRef: "config.defaultValue",
      transform: "languages.toIso6391",
    });
    f.ctx.config.defaultValue = "zh-CN";
    await f.invoke();
    expect(f.sent()).toBe("zh");
  });

  test.each([
    { $ref: "input.value", fallbackRef: 1 },
    { $ref: "input.value", fallbackRef: "config.constructor" },
    { $ref: "input.value", fallbackRef: "input.value || config.defaultValue" },
    { $ref: "input.value", fallbackRef: "config.apiKey" },
    { $ref: "config.apiKey", fallbackRef: "input.value" },
    { $ref: "resources.value", fallbackRef: "config.defaultValue" },
    { $ref: "input.value", fallbackRef: { $ref: "config.defaultValue" } },
    { fallbackRef: "config.defaultValue" },
  ])(
    "invalid references reject at import and execution: %j",
    async (reference) => {
      const f = fixture(format, reference);
      expect(f.importPackage).toThrow();
      await expect(f.invoke()).rejects.toMatchObject({ code: "INVALID_RULE" });
      expect(f.ctx.http.request).not.toHaveBeenCalled();
    }
  );
});

test.each([
  { rulesVersion: 1 },
  { manifestVersion: 1 },
  { format: "unknown" },
  { format: undefined },
])("legacy or unknown rule formats reject: %j", async (changes) => {
  const f = fixture("http");
  Object.assign(f.snapshot.rules, changes);
  expect(f.importPackage).toThrow();
  await expect(f.invoke()).rejects.toMatchObject({ code: "INVALID_RULE" });
  expect(f.ctx.http.request).not.toHaveBeenCalled();
});

test("response mappings and conditions cannot use fallback", async () => {
  const f = fixture("http");
  f.rule.response.map.text.fallbackRef = "config.defaultValue";
  expect(f.importPackage).toThrow();
  await expect(f.invoke()).rejects.toMatchObject({ code: "INVALID_RULE" });
  const condition = fixture("protocol", {
    $if: { $ref: "config.enabled", fallbackRef: "input.value" },
    then: 1,
  });
  expect(condition.importPackage).toThrow();
  await expect(condition.invoke()).rejects.toMatchObject({
    code: "INVALID_RULE",
  });
});

test.each([
  "../speech",
  "%2e%2e/speech",
  ".%2E/speech",
  "nested/%2E%2e/speech",
  "nested\\speech",
  "\\\\other.invalid/speech",
  "audio/%5cspeech",
  "audio/\nspeech",
  "audio/%00speech",
  "audio/%7fspeech",
  "audio/%zz",
  "/speech",
  "https://other.invalid/speech",
])("URL rules reject unsafe paths before HTTP: %s", async (path) => {
  const f = fixture("http");
  f.rule.request.url = { $url: { base: "config.baseUrl", path } };
  f.ctx.config.baseUrl = "https://example.invalid/api/v1";
  expect(f.importPackage).toThrow();
  await expect(f.invoke({ value: 1 })).rejects.toMatchObject({
    code: "INVALID_RULE",
  });
  expect(f.ctx.http.request).not.toHaveBeenCalled();
});

test.each([
  [
    "https://example.invalid/api/v1",
    "audio/speech",
    "https://example.invalid/api/v1/audio/speech",
  ],
  [
    "https://example.invalid/api/v1/?old=yes#fragment",
    "audio/speech?mode=pcm",
    "https://example.invalid/api/v1/audio/speech?mode=pcm",
  ],
  [
    "https://example.invalid/api/./v1/",
    "./audio/speech",
    "https://example.invalid/api/v1/audio/speech",
  ],
])(
  "URL rules resolve within the canonical base directory",
  async (base, path, expected) => {
    const f = fixture("http");
    f.rule.request.url = { $url: { base: "config.baseUrl", path } };
    f.ctx.config.baseUrl = base;
    f.importPackage();
    await f.invoke({ value: 1 });
    expect(f.ctx.http.request.mock.calls[0][0].url).toBe(expected);
  }
);

test("invalid base URLs reject with INVALID_RULE before HTTP", async () => {
  const f = fixture("http");
  f.rule.request.url = { $url: { base: "config.baseUrl", path: "speech" } };
  f.ctx.config.baseUrl = "invalid";
  await expect(f.invoke({ value: 1 })).rejects.toMatchObject({
    code: "INVALID_RULE",
  });
  expect(f.ctx.http.request).not.toHaveBeenCalled();
});
