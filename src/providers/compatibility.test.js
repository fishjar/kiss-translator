import { zipSync, strToU8 } from "fflate";
import { version } from "../../package.json";
import {
  assertPluginCompatibility,
  pluginCompatibilityFields,
} from "./compatibility";
import { readProviderPackage, readProviderDirectory } from "./package";
import { createServiceInstance } from "./instances";
import { createProviderRegistry } from "./registry";
import { SDK_VERSION } from "./sdk/version";

const manifest = {
  manifestVersion: 1,
  apiVersion: "1",
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

test("legacy manifests remain byte-for-byte objects without added defaults", () => {
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
  expect(api.provider).not.toHaveProperty("minHostVersion");
});

test.each([
  "1.2",
  "v1.2.3",
  "1.2.3-beta",
  "-1.0.0",
  123,
  null,
  "99999999999999999999.0.0",
])("invalid minimum host version %s is rejected", (value) => {
  expect(() => assertPluginCompatibility({ minHostVersion: value })).toThrow();
});

test("version comparison handles below, equal and above without changing definitions", () => {
  expect(() =>
    assertPluginCompatibility({ minHostVersion: "2.10.0" }, "2.9.9")
  ).toThrow("2.10.0");
  expect(() =>
    assertPluginCompatibility({ minHostVersion: "2.10.0" }, "2.10.0")
  ).not.toThrow();
  expect(() =>
    assertPluginCompatibility({ minHostVersion: "2.10.0" }, "3.0.0")
  ).not.toThrow();
});

test.each([
  { kind: "page" },
  { minHostVersion: "999999.0.0" },
  { apiVersion: "99" },
])(
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

test("SDK 2 is independent of host release versions and preserves SDK 1 snapshots", () => {
  expect(SDK_VERSION).toBe("2");
  expect(pluginCompatibilityFields({ apiVersion: "2" })).toEqual({
    apiVersion: "2",
  });
  expect(pluginCompatibilityFields({})).toEqual({});
  for (const apiVersion of ["1", "2"]) {
    expect(() =>
      assertPluginCompatibility({ apiVersion }, "0.0.1")
    ).not.toThrow();
    const pack = readProviderPackage(zipSync(files({ apiVersion })));
    const api = createServiceInstance(
      pack.manifest,
      "chat",
      pack.implementations.chat,
      {},
      "sdk"
    );
    expect(api.provider.apiVersion).toBe(apiVersion);
    expect(pack.manifest).not.toHaveProperty("minHostVersion");
  }
  expect(() => assertPluginCompatibility({ apiVersion: "3" })).toThrow("SDK");
});

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
    zipSync(files({ kind: "provider", minHostVersion: version }))
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
    minHostVersion: version,
  });
});
