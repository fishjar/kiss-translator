import { createAssetStore, createTransportBroker } from "./transport";
import { runDeclarative } from "./declarative";
import { providerHelpers } from "./sdk";
import { TextEncoder, TextDecoder } from "util";
beforeAll(() => {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
});

const api = {
  apiSlug: "one",
  pluginConfig: {
    apiKey: "private",
    baseUrl: "https://example.invalid/v1",
    model: "m",
  },
  provider: {
    settings: [{ key: "apiKey", type: "password" }],
    permissions: { endpointFields: ["baseUrl"] },
  },
};

test("Broker requires both instance permission and local approval, and scopes credentials", async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    text: async () => "{}",
  }));
  const controller = new AbortController();
  const broker = createTransportBroker(api, {
    fetchImpl,
    assets: createAssetStore(),
    signal: controller.signal,
    approvedOrigins: new Set(["https://example.invalid"]),
  });
  const request = {
    url: "https://example.invalid/v1/chat",
    method: "POST",
    auth: { type: "bearer", secret: broker.secrets.ref("apiKey") },
    bodyType: "json",
    body: { temperature: 0.3 },
  };
  await broker.http.request(request);
  const init = fetchImpl.mock.calls[0][1];
  expect(init.headers.Authorization).toBe("Bearer private");
  expect(init.credentials).toBe("omit");
  expect(init.redirect).toBe("error");
  expect(init.signal).toBe(controller.signal);
  await expect(
    broker.http.request({ ...request, url: "https://other.invalid" })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  await expect(
    broker.http.request({
      ...request,
      auth: { type: "bearer", secret: { scope: "other", key: "apiKey" } },
    })
  ).rejects.toMatchObject({ code: "SECRET_UNAVAILABLE" });
  controller.abort();
  await expect(broker.http.request(request)).rejects.toBeDefined();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("secret bindings cannot bypass the Cookie prohibition", async () => {
  const fetchImpl = jest.fn();
  const broker = createTransportBroker(api, {
    fetchImpl,
    assets: createAssetStore(),
    signal: new AbortController().signal,
    approvedOrigins: new Set(["https://example.invalid"]),
  });
  await expect(
    broker.http.request({
      url: "https://example.invalid",
      secretBindings: [
        {
          target: "header",
          name: "Cookie",
          secret: broker.secrets.ref("apiKey"),
        },
      ],
    })
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("declarative resolution retains numeric values, omits auto language, and rejects prototype access", async () => {
  const request = jest.fn(async () => ({ status: 200, body: '{"text":"ok"}' }));
  const ctx = {
    config: { speed: 0.3 },
    helpers: providerHelpers,
    secrets: { ref: (key) => ({ key }) },
    http: { request },
  };
  const snapshot = {
    rules: {
      rulesVersion: 1,
      handlers: {
        transcribe: {
          request: {
            body: {
              speed: { $ref: "config.speed" },
              language: {
                $ref: "input.language",
                omitValues: ["auto"],
                transform: "languages.toIso6391",
              },
            },
          },
          response: { kind: "json", map: { text: { $ref: "response.text" } } },
        },
      },
    },
  };
  expect(
    await runDeclarative(snapshot, "transcribe", { language: "auto" }, ctx)
  ).toEqual({ text: "ok" });
  expect(request.mock.calls[0][0].body).toEqual({ speed: 0.3 });
  snapshot.rules.handlers.transcribe.request.body.speed.$ref =
    "config.constructor";
  await expect(
    runDeclarative(snapshot, "transcribe", {}, ctx)
  ).rejects.toMatchObject({ code: "INVALID_RULE" });
});

test("secret bindings inject only within the approved request and cannot cross instance scope", async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    text: async () => "{}",
  }));
  const broker = createTransportBroker(api, {
    fetchImpl,
    assets: createAssetStore(),
    signal: new AbortController().signal,
    approvedOrigins: new Set(["https://example.invalid"]),
  });
  await broker.http.request({
    url: "https://example.invalid/test",
    method: "POST",
    bodyType: "json",
    body: {},
    secretBindings: [
      { target: "query", name: "token", secret: broker.secrets.ref("apiKey") },
      { target: "json", name: "key", secret: broker.secrets.ref("apiKey") },
    ],
  });
  expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get("token")).toBe(
    "private"
  );
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
    key: "private",
  });
  await expect(
    broker.http.request({
      url: "https://example.invalid",
      secretBindings: [
        {
          target: "header",
          name: "Key",
          secret: { scope: "other", key: "apiKey" },
        },
      ],
    })
  ).rejects.toMatchObject({ code: "SECRET_UNAVAILABLE" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("stream consumption retains the scheduler slot and NDJSON handles Unicode split across bytes", async () => {
  const bytes = new TextEncoder().encode('{"text":"中文"}\n');
  let offset = 0;
  const fetchImpl = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    headers: new Map(),
    body: {
      getReader: () => ({
        read: async () =>
          offset < bytes.length
            ? { value: bytes.slice(offset, ++offset), done: false }
            : { done: true },
        cancel: async () => {},
        releaseLock: () => {},
      }),
    },
    text: async () => "{}",
  }));
  const broker = createTransportBroker(
    { ...api, fetchLimit: 1, fetchInterval: 0 },
    {
      fetchImpl,
      assets: createAssetStore(),
      signal: new AbortController().signal,
      approvedOrigins: new Set(["https://example.invalid"]),
    }
  );
  const stream = broker.http.stream({
    url: "https://example.invalid/stream",
    streamFormat: "ndjson",
  });
  await stream.next();
  const second = broker.http.request({ url: "https://example.invalid/second" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(await stream.next()).toEqual({
    done: false,
    value: { type: "json", value: { text: "中文" } },
  });
  await stream.return();
  await second;
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
