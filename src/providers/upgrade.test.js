import {
  copyCompatibleConfig,
  upgradeServiceInstance,
  isServiceUpgradeAvailable,
} from "./upgrade";
import { createServiceInstance, validateServiceConfig } from "./instances";

test.each([undefined, []])(
  "missing or empty settings never copy unmatched config: %j",
  (settings) => {
    const api = {
      provider: settings ? { settings } : {},
      pluginConfig: { added: "old" },
    };
    const original = JSON.stringify(api);
    expect(copyCompatibleConfig(api, [{ key: "added", type: "text" }])).toEqual(
      { values: {}, skipped: [] }
    );
    expect(JSON.stringify(api)).toBe(original);
  }
);
test("copy rejects changed secret types and invalid new constraints and keeps independent data", () => {
  const api = {
    provider: {
      settings: [
        { key: "key", type: "password" },
        { key: "speed", type: "number" },
        { key: "model", type: "text" },
      ],
    },
    pluginConfig: { key: "secret", speed: 1, model: "m" },
  };
  const copied = copyCompatibleConfig(api, [
    { key: "key", type: "text" },
    { key: "speed", type: "number", min: 2 },
    { key: "model", type: "text" },
  ]);
  expect(copied).toEqual({ values: { model: "m" }, skipped: ["key", "speed"] });
  copied.values.model = "changed";
  expect(api.pluginConfig.model).toBe("m");
});

const manifest = {
  apiVersion: 1,
  id: "upgrade-test",
  name: "Upgrade test",
  version: "1.0.0",
  services: [
    {
      id: "text",
      name: "Text",
      implementation: { kind: "script", entry: "text.js" },
      settings: [
        { key: "apiKey", type: "password" },
        { key: "temperature", type: "number", defaultValue: 0 },
      ],
      capabilities: {
        translate: { handler: "translate" },
        dictionary: { handler: "dictionary" },
      },
    },
  ],
};
const code = "exports.translate=()=>{}";
const oldApi = () => ({
  ...createServiceInstance(
    manifest,
    "text",
    code,
    { apiKey: "saved-key", temperature: 1 },
    "stable-id"
  ),
  apiName: "Custom name",
  sortOrder: -1,
  isDisabled: true,
  useBatchFetch: true,
  useStream: false,
  batchPromptSlug: "custom-prompt",
  httpTimeout: 42,
  asrMaxDurationSeconds: 25,
  asrTimestampSupport: "supported",
  enabledCapabilities: ["translate"],
});
const newPack = () => ({
  manifest: { ...manifest, version: "2.0.0" },
  implementations: { text: "exports.translate=()=>42" },
  resources: { "logo.png": { data: "new" } },
});

test("upgrades the snapshot and resources while preserving identity and every host setting", () => {
  const api = oldApi();
  const original = JSON.stringify(api);
  const pack = newPack();
  const result = upgradeServiceInstance(api, pack);
  expect(result).toEqual({
    ...api,
    provider: expect.objectContaining({
      code: pack.implementations.text,
      resources: pack.resources,
      source: expect.objectContaining({ version: "2.0.0" }),
    }),
  });
  expect(JSON.stringify(api)).toBe(original);
  expect(result.enabledCapabilities).toEqual(["translate"]);
  expect(isServiceUpgradeAvailable(result, pack)).toBe(false);
});

test("changed fields fall back to new defaults, removed values disappear and missing required fields do not block upgrade", () => {
  const api = oldApi();
  const pack = newPack();
  pack.manifest.services = [
    {
      ...manifest.services[0],
      settings: [
        { key: "temperature", type: "number", min: 2, defaultValue: 3 },
        { key: "newRequired", type: "text", required: true },
      ],
    },
  ];
  const result = upgradeServiceInstance(api, pack);
  expect(result.pluginConfig).toEqual({ temperature: 3 });
  expect(() =>
    validateServiceConfig(
      result.provider,
      result.pluginConfig,
      result.enabledCapabilities
    )
  ).toThrow("Required field");
});

test("removed enabled capabilities are filtered without enabling new ones or rejecting the upgrade", () => {
  const pack = newPack();
  pack.manifest.services = [
    {
      ...manifest.services[0],
      capabilities: {
        dictionary: { handler: "dictionary" },
        chat: { handler: "chat" },
      },
    },
  ];
  const result = upgradeServiceInstance(oldApi(), pack);
  expect(result.enabledCapabilities).toEqual([]);
  expect(result.apiSlug).toBe("stable-id");
});

test("incompatible host and stale or mismatched upgrade targets cannot change an instance", () => {
  const api = oldApi();
  const pack = newPack();
  expect(() =>
    upgradeServiceInstance(api, {
      ...pack,
      manifest: { ...pack.manifest, minHostVersion: "999.0.0" },
    })
  ).toThrow();
  for (const changes of [
    { version: "1.0.0" },
    { version: "0.9.0" },
    { id: "other" },
    { services: [] },
  ]) {
    const candidate = { ...pack, manifest: { ...pack.manifest, ...changes } };
    expect(isServiceUpgradeAvailable(api, candidate)).toBe(false);
    expect(() => upgradeServiceInstance(api, candidate)).toThrow();
  }
});
