import { Blob as NodeBlob } from "buffer";
import { zipSync, strToU8 } from "fflate";
import { readProviderPackage } from "./package";
import { createServiceInstance } from "./instances";
import { importExecutionResources } from "./resources";
import { createAssetStore } from "./transport";
import { availableServiceIds } from "./lifecycle";

const manifest = {
  manifestVersion: 1,
  apiVersion: "1",
  id: "resources-test",
  version: "1.0.0",
  name: "Test",
  icon: "icon.png",
  resources: [
    { id: "dictionary", path: "words.json", mimeType: "application/json" },
  ],
  services: [
    {
      id: "lookup",
      name: "Lookup",
      implementation: { kind: "script", entry: "main.js" },
      capabilities: { dictionary: { handler: "lookup" } },
    },
  ],
};
function bytes(changes = {}, files = {}) {
  return zipSync({
    "manifest.json": strToU8(JSON.stringify({ ...manifest, ...changes })),
    "main.js": strToU8("exports.lookup = () => ({text:'ok',format:'text'})"),
    "words.json": strToU8('{"hello":"你好"}'),
    "icon.png": Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...files,
  });
}

test("execution resources are independent snapshots; optional icons stay local", async () => {
  const oldBlob = global.Blob;
  global.Blob = NodeBlob;
  try {
    const pack = readProviderPackage(bytes());
    const instance = createServiceInstance(
      pack.manifest,
      "lookup",
      pack.implementations.lookup,
      {},
      "old-id",
      pack.resources
    );
    expect(instance.provider.icon).toBeUndefined();
    expect(instance.provider.resources.dictionary).toEqual(
      pack.resources.dictionary
    );
    pack.resources.dictionary.data = btoa("changed");
    const assets = createAssetStore();
    const refs = importExecutionResources(instance.provider.resources, assets);
    expect(await assets.get(refs.dictionary).text()).toBe('{"hello":"你好"}');
    expect(pack.icon.mimeType).toBe("image/png");
  } finally {
    global.Blob = oldBlob;
  }
});

test("package rejects active icons, wrong signatures and oversized execution resources", () => {
  expect(() =>
    readProviderPackage(
      bytes({ icon: "icon.svg" }, { "icon.svg": strToU8("<svg/>") })
    )
  ).toThrow("Icon");
  expect(() =>
    readProviderPackage(bytes({}, { "icon.png": strToU8("not PNG") }))
  ).toThrow("Icon");
  expect(() =>
    readProviderPackage(
      bytes({}, { "words.json": new Uint8Array(256 * 1024 + 1) })
    )
  ).toThrow("Execution resources");
  expect(() =>
    importExecutionResources(
      { data: { mimeType: "x", data: "a".repeat(400000) } },
      createAssetStore()
    )
  ).toThrow("snapshot");
});

test("disable detection understands serialized storage without cancelling ordinary config changes", () => {
  const setting = {
    transApis: [
      { apiSlug: "active", pluginConfig: { model: "new" } },
      { apiSlug: "disabled", isDisabled: true },
    ],
  };
  expect([...availableServiceIds(JSON.stringify(setting))]).toEqual(["active"]);
  expect([...availableServiceIds(undefined)]).toEqual([]);
  expect(availableServiceIds("malformed")).toBeNull();
});
