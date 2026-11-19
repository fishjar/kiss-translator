import { zipSync, strToU8 } from "fflate";
import {
  assertPluginCompatibility,
  pluginCompatibilityFields,
} from "./compatibility";
import { readProviderPackage, readProviderDirectory } from "./package";
import { createServiceInstance } from "./instances";
import { createProviderRegistry } from "./registry";
import { SDK_VERSION, SUPPORTED_SDK_VERSIONS } from "./sdk/version";

const manifest = {
  apiVersion: 1,
  id: "compat-test",
  version: "1.0.0",
  services: [
    {
      id: "chat",
      implementation: { kind: "script", entry: "chat.js" },
      capabilities: { chat: { handler: "chat" } },
    },
  ],
};
const files = (changes) => ({
  "manifest.json": strToU8(JSON.stringify({ ...manifest, ...changes })),
  "chat.js": strToU8("throw new Error('Must not execute at import')"),
});

test("API manifests remain byte-for-byte objects without added defaults", () => {
  const pack = readProviderPackage(zipSync(files({})));
  expect(pack.manifest).toEqual(manifest);
  const api = createServiceInstance(
    pack.manifest,
    "chat",
    pack.implementations.chat,
    {},
    "one"
  );
  expect(api.provider).not.toHaveProperty("kind");
});

test.each([{ kind: "page" }, { apiVersion: 99 }, { apiVersion: "99" }])(
  "ZIP, folder, instance and synced execution reject incompatible declarations %j",
  async (changes) => {
    expect(() => readProviderPackage(zipSync(files(changes)))).toThrow();
    await expect(
      readProviderDirectory(
        Object.entries(files(changes)).map(([name, bytes]) => ({
          webkitRelativePath: `plugin/${name}`,
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer,
        }))
      )
    ).rejects.toThrow();
    expect(() =>
      createServiceInstance(
        { ...manifest, ...changes },
        "chat",
        "exports.chat = () => ({text:'ok'})",
        {},
        "one"
      )
    ).toThrow();
    const runner = jest.fn();
    const registry = createProviderRegistry({
      resolveInstance: () => ({ provider: { ...changes } }),
      createContext: jest.fn(),
      runners: { script: runner },
    });
    await expect(registry.invoke("one", "chat", {}).result).rejects.toThrow();
    expect(runner).not.toHaveBeenCalled();
  }
);

test.each([1, 2])(
  "plugin API %i loads and is preserved in instances",
  (apiVersion) => {
    expect(SDK_VERSION).toBe(2);
    expect(SUPPORTED_SDK_VERSIONS).toEqual([1, 2]);
    expect(pluginCompatibilityFields({ apiVersion })).toEqual({
      apiVersion,
    });
    expect(() => assertPluginCompatibility({ apiVersion })).not.toThrow();
    const pack = readProviderPackage(zipSync(files({ apiVersion })));
    const api = createServiceInstance(
      pack.manifest,
      "chat",
      pack.implementations.chat,
      {},
      "api"
    );
    expect(api.provider.apiVersion).toBe(apiVersion);
  }
);

test.each([
  undefined,
  null,
  "1",
  "2",
  "3",
  0,
  -1,
  1.5,
  3,
  Number.MAX_SAFE_INTEGER + 1,
])(
  "invalid or unsupported API version %s rejects at import and execution",
  async (apiVersion) => {
    expect(() => assertPluginCompatibility({ apiVersion })).toThrow("API");
    expect(() => readProviderPackage(zipSync(files({ apiVersion })))).toThrow();
    const runner = jest.fn();
    const context = jest.fn();
    const registry = createProviderRegistry({
      resolveInstance: () => ({ provider: { apiVersion } }),
      createContext: context,
      runners: { script: runner },
    });
    await expect(
      registry.invoke("api", "chat", {
        messages: [{ role: "user", content: "hello" }],
      }).result
    ).rejects.toMatchObject({ code: "SDK_VERSION_UNSUPPORTED" });
    expect(context).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  }
);

test.each([{ manifestVersion: 1 }, { rulesVersion: 1 }])(
  "legacy version fields reject %j",
  (change) => {
    expect(() => readProviderPackage(zipSync(files(change)))).toThrow();
    expect(() =>
      assertPluginCompatibility({ apiVersion: 1, ...change })
    ).toThrow("Legacy");
  }
);

test("external speech declarations are rejected before script execution", () => {
  const changes = {
    services: [
      {
        ...manifest.services[0],
        capabilities: { speak: { handler: "speak" } },
      },
    ],
  };
  expect(() => readProviderPackage(zipSync(files(changes)))).toThrow(
    "capability"
  );
  expect(() =>
    createServiceInstance(
      { ...manifest, ...changes },
      "chat",
      "exports.speak = () => ({status:'ended'})",
      {},
      "speech"
    )
  ).toThrow("capability");
});

test("explicit declarations survive instance serialization", () => {
  const pack = readProviderPackage(
    zipSync(files({ kind: "provider", apiVersion: 2 }))
  );
  const api = createServiceInstance(
    pack.manifest,
    "chat",
    pack.implementations.chat,
    {},
    "one"
  );
  expect(JSON.parse(JSON.stringify(api)).provider).toMatchObject({
    kind: "provider",
    apiVersion: 2,
  });
});
