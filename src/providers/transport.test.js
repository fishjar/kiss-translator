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

test("Broker enforces the instance network scope without local approval and scopes credentials", async () => {
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
    apiVersion: 1,
    rules: {
      format: "http",
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

test("fixed addresses work without approval and configured endpoints define the scope of new calls", async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    text: async () => "{}",
  }));
  const snapshot = {
    ...api,
    pluginConfig: { ...api.pluginConfig },
    provider: {
      ...api.provider,
      permissions: {
        network: ["https://fixed.invalid"],
        endpointFields: ["baseUrl"],
      },
    },
  };
  const original = createTransportBroker(snapshot, {
    fetchImpl,
    assets: createAssetStore(),
  });
  await original.http.request({ url: "https://fixed.invalid/test" });
  snapshot.pluginConfig.baseUrl = "https://new.invalid/v1";
  const updated = createTransportBroker(snapshot, {
    fetchImpl,
    assets: createAssetStore(),
  });
  await updated.http.request({ url: "https://new.invalid/test" });
  await original.http.request({ url: "https://example.invalid/test" });
  await expect(
    original.http.request({ url: "https://new.invalid/test" })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  await expect(
    updated.http.request({ url: "https://example.invalid/test" })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  await expect(
    original.http.stream({ url: "https://undeclared.invalid/test" }).next()
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test.each([
  ["https://fixed.invalid/test", true],
  ["http://localhost:8765/test", true],
  ["http://127.0.0.1:8765/test", true],
  ["http://[::1]:8765/test", true],
  ["http://remote.invalid/test", false],
  ["ftp://remote.invalid/test", false],
  ["https://name:password@fixed.invalid/test", false],
])(
  "protocol and embedded credential policy still applies to declared address %s",
  async (url, accepted) => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => "{}",
    }));
    const instance = {
      ...api,
      provider: {
        ...api.provider,
        permissions: { network: [new URL(url).origin] },
      },
    };
    const broker = createTransportBroker(instance, {
      fetchImpl,
      assets: createAssetStore(),
    });
    const outcome = await broker.http.request({ url }).then(
      (value) => ({ value }),
      (error) => ({ error })
    );
    expect(outcome).toMatchObject(
      accepted
        ? { value: { status: 200 } }
        : { error: { code: "NETWORK_DENIED" } }
    );
    expect(fetchImpl).toHaveBeenCalledTimes(accepted ? 1 : 0);
  }
);
