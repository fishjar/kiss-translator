import { TextEncoder, TextDecoder } from "util";
beforeAll(() => {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
});
import { browser } from "../libs/browser";
import {
  approvePlugin,
  readPluginGrant,
  providerPluginId,
  approvedProviderOrigins,
  revokePlugin,
  providerGrantKey,
} from "./grants";
import { createTransportBroker, createAssetStore } from "./transport";
import {
  packageDefinitions,
  authorizationGroups,
} from "./authorizationDefinitions";
import { createServiceInstance } from "./instances";

jest.mock("../libs/browser", () => ({
  browser: {
    storage: { local: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } },
  },
}));
jest.mock("../libs/utils", () => ({
  sha256: async (text) =>
    require("crypto").createHash("sha256").update(text).digest("hex"),
}));

const definition = {
  id: "chat",
  name: "Chat",
  code: "exports.chat = () => ({text:'ok'})",
  implementation: { kind: "script" },
  settings: [{ key: "baseUrl", type: "text", label: "API 地址" }],
  permissions: {
    network: ["https://fixed.invalid"],
    endpointFields: ["baseUrl"],
  },
  source: { pluginId: "example", pluginName: "Example", version: "1.0.0" },
};
const instance = (apiSlug = "one", baseUrl = "https://api.invalid/v1") => ({
  apiSlug,
  provider: definition,
  pluginConfig: { baseUrl },
});
let records;
beforeEach(() => {
  records = {};
  browser.storage.local.get.mockImplementation(async (key) => ({
    [key]: records[key],
  }));
  browser.storage.local.set.mockImplementation(async (data) =>
    Object.assign(records, data)
  );
  browser.storage.local.remove.mockImplementation(async (key) => {
    delete records[key];
  });
});

test("authorization belongs to the plugin and endpoints come from each saved configuration", async () => {
  await approvePlugin("example", definition.permissions.network);
  for (const address of [
    "https://other.invalid/v2",
    "https://other.invalid:8443/v1",
    "http://localhost:9000/v1",
  ]) {
    const other = instance("imported-or-synced", address);
    expect(providerGrantKey(providerPluginId(other))).toBe(
      providerGrantKey(providerPluginId(instance()))
    );
    expect(await approvedProviderOrigins(other)).toEqual(
      new Set(["https://fixed.invalid", new URL(address).origin])
    );
  }
  await revokePlugin("example");
  await expect(approvedProviderOrigins(instance())).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
});

test.each([
  { code: "exports.chat = () => ({text:'changed'})" },
  { resources: { "prompt.txt": "new content" } },
  { source: { ...definition.source, version: "2.0.0" } },
])(
  "implementation updates with unchanged targets reuse plugin authorization: %o",
  async (changes) => {
    await approvePlugin("example", definition.permissions.network);
    expect(
      await approvedProviderOrigins({
        ...instance(),
        provider: { ...definition, ...changes },
      })
    ).toEqual(new Set(["https://fixed.invalid", "https://api.invalid"]));
  }
);
test("adding targets requires approval without interrupting old versions or sharing their targets", async () => {
  await approvePlugin("example", definition.permissions.network);
  const next = {
    ...instance("two"),
    provider: {
      ...definition,
      permissions: {
        ...definition.permissions,
        network: ["https://new.invalid"],
      },
      source: { ...definition.source, version: "2.0.0" },
    },
  };
  await expect(approvedProviderOrigins(next)).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
  await expect(approvedProviderOrigins(instance())).resolves.toBeDefined();
  await approvePlugin("example", ["https://new.invalid"]);
  expect((await readPluginGrant("example")).origins).toEqual([
    "https://fixed.invalid",
    "https://new.invalid",
  ]);
  expect(await approvedProviderOrigins(next)).toEqual(
    new Set(["https://new.invalid", "https://api.invalid"])
  );
  const fetchImpl = jest.fn();
  const broker = createTransportBroker(instance(), {
    approvedOrigins: await approvedProviderOrigins(instance()),
    assets: createAssetStore(),
    signal: new AbortController().signal,
    fetchImpl,
  });
  await expect(
    broker.http.request({ url: "https://new.invalid" })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  const other = {
    ...next,
    provider: {
      ...next.provider,
      source: { ...next.provider.source, pluginId: "different" },
    },
  };
  await expect(approvedProviderOrigins(other)).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
});

test("legacy records are ignored and a script without network targets still requires plugin approval", async () => {
  records["kiss-provider-grant:one"] = {
    fingerprint: "legacy",
    origins: ["https://api.invalid"],
  };
  await expect(approvedProviderOrigins(instance())).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
  records["kiss-provider-definition-grant:old"] = { fingerprint: "old" };
  await expect(approvedProviderOrigins(instance())).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
  const offline = {
    ...instance(),
    provider: { ...definition, permissions: {} },
  };
  await expect(approvedProviderOrigins(offline)).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
  await approvePlugin("example", []);
  expect(await approvedProviderOrigins(offline)).toEqual(new Set());
});

test("automatic endpoint approval does not permit unknown targets, HTTP remote or redirects", async () => {
  const api = instance("saved", "https://changed.invalid:8443/v2");
  await approvePlugin("example", api.provider.permissions.network);
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    text: async () => "{}",
  }));
  const broker = createTransportBroker(api, {
    approvedOrigins: await approvedProviderOrigins(api),
    assets: createAssetStore(),
    signal: new AbortController().signal,
    fetchImpl,
  });
  await broker.http.request({ url: "https://changed.invalid:8443/v2/chat" });
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    credentials: "omit",
  });
  await expect(
    broker.http.request({ url: "https://unknown.invalid" })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  await expect(
    broker.http.request({ url: "http://changed.invalid:8443" })
  ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("template preview needs no Key and exactly matches created instances; old snapshots remain manageable", async () => {
  const manifest = {
    manifestVersion: 1,
    apiVersion: "1",
    id: "example",
    name: "Example",
    version: "2.0.0",
    services: [
      {
        id: "chat",
        name: "Chat",
        implementation: { kind: "script", entry: "chat.js" },
        capabilities: { chat: { handler: "chat" } },
        settings: [{ key: "apiKey", type: "password", required: true }],
      },
    ],
  };
  const pack = { manifest, implementations: { chat: definition.code } };
  const preview = packageDefinitions(pack)[0];
  const created = createServiceInstance(
    manifest,
    "chat",
    definition.code,
    { apiKey: "private" },
    "new"
  );
  expect(preview.provider).toEqual(created.provider);
  await approvePlugin(
    providerPluginId(preview),
    preview.provider.permissions.network || []
  );
  expect(await approvedProviderOrigins(created)).toEqual(new Set());
  const groups = await authorizationGroups(
    [pack],
    [created, instance(), instance("duplicate")]
  );
  expect(groups).toHaveLength(1);
  expect(groups[0].versions).toEqual(["2.0.0", "1.0.0"]);
  expect(groups[0].services).toHaveLength(1);
  expect(groups[0].origins).toEqual(["https://fixed.invalid"]);
  expect(groups[0].instanceCount).toBe(3);
  expect(await authorizationGroups([], [instance()])).toHaveLength(1);
});

test.each([undefined, "", "invalid/id", "__proto__"])(
  "invalid plugin ID has no fallback grant: %s",
  async (pluginId) => {
    const invalid = {
      ...instance(),
      provider: { ...definition, source: { pluginId } },
    };
    await expect(approvedProviderOrigins(invalid)).rejects.toMatchObject({
      code: "INVALID_CONFIG",
    });
  }
);
