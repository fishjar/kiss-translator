import { zipSync, strToU8 } from "fflate";
import { readProviderPackage } from "./package";
import { createServiceInstance } from "./instances";
import { validateConfig, validateServiceConfig, mergeSettingFields } from "./instances";
import { packageServiceCatalog } from "./packageCatalog";
import { builtinPlugins, createBuiltinInstance } from "../builtin-plugins";

function pack(changes = {}) {
  const manifest = {
    manifestVersion: 1,
    apiVersion: "1",
    id: "example-pack",
    name: "example",
    version: "1.0.0",
    services: [
      {
        id: "chat",
        implementation: { kind: "script", entry: "chat.js" },
        capabilities: { chat: { handler: "chat" } },
      },
    ],
    ...changes,
  };
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "chat.js": strToU8("exports.chat = () => ({text:'ok'})"),
  });
}

test("valid package retains executable entries but refuses traversal, native code and missing entries", () => {
  const parsed = readProviderPackage(pack());
  expect(parsed.implementations.chat).toContain("exports.chat");
  expect(() =>
    readProviderPackage(zipSync({ "../manifest.json": strToU8("{}") }))
  ).toThrow("path");
  expect(() =>
    readProviderPackage(
      pack({
        services: [
          {
            id: "native",
            implementation: { kind: "native", entry: "chat.js" },
          },
        ],
      })
    )
  ).toThrow("entry");
  expect(() =>
    readProviderPackage(
      pack({
        services: [
          {
            id: "missing",
            implementation: { kind: "script", entry: "missing.js" },
          },
        ],
      })
    )
  ).toThrow("entry");
});

test("built-in definitions are all native and independent instances preserve their caller IDs", () => {
  expect(builtinPlugins.length).toBeGreaterThan(20);
  expect(
    builtinPlugins.every((plugin) =>
      plugin.services.every(
        (service) => service.implementation.kind === "native"
      )
    )
  ).toBe(true);
  const type = builtinPlugins[0].services[0].id;
  const first = createBuiltinInstance(type, "existing-a", "A");
  const second = createBuiltinInstance(type, "existing-b", "B");
  first.provider.capabilities.translate.handler = "changed";
  expect(second.apiSlug).toBe("existing-b");
  expect(second.provider.capabilities.translate.handler).toBe("translate");
});

test("instance config validates types before persisting a template snapshot", () => {
  const parsed = readProviderPackage(pack());
  parsed.manifest.services[0].settings = [
    { key: "speed", type: "number", min: 0.5, max: 2, required: true },
  ];
  expect(() =>
    createServiceInstance(
      parsed.manifest,
      "chat",
      parsed.implementations.chat,
      { speed: "1" },
      "id"
    )
  ).toThrow("number");
  expect(() =>
    createServiceInstance(
      parsed.manifest,
      "chat",
      parsed.implementations.chat,
      { speed: 3 },
      "id"
    )
  ).toThrow("number");
});

test("adding an incomplete instance preserves defaults and a model snapshot without bypassing execution validation", () => {
  const parsed = readProviderPackage(pack());
  const service = parsed.manifest.services[0];
  service.settings = [{ key: "token", type: "password", isSecret: true, required: true },
    { key: "model", type: "text", required: true }];
  service.models = [{ id: "first-model" }];
  const api = createServiceInstance(parsed.manifest, "chat", parsed.implementations.chat, {}, "new-id");
  expect(api.pluginConfig.model).toBe("first-model");
  expect(api.provider.models).toEqual(service.models);
  expect(() => validateServiceConfig(api.provider, api.pluginConfig, api.enabledCapabilities)).toThrow("Required");
  const catalog = packageServiceCatalog(parsed.manifest);
  expect(catalog[0]).toMatchObject({ id: "chat", models: [{ id: "first-model" }] });
  expect(catalog[0].implementation).toBeUndefined();
  expect(packageServiceCatalog({ services: [{ ...service, models: undefined, modelField: "customModel" }] })[0].modelField).toBe("customModel");
  service.models[0].id = "changed";
  expect(api.provider.models[0].id).toBe("first-model");
  expect(catalog[0].models[0].id).toBe("first-model");
});

test("editing validates dictionary selections and rejects ambiguous or invalid field definitions", () => {
  const fields = mergeSettingFields(
    [],
    [
      {
        key: "voice",
        type: "select",
        required: true,
        optionsSource: "speech.voices.openai.tts-1",
      },
    ]
  );
  expect(validateConfig(fields, { voice: "alloy" })).toEqual({
    voice: "alloy",
  });
  expect(() => validateConfig(fields, { voice: "unknown" })).toThrow(
    "selection"
  );
  expect(() =>
    mergeSettingFields(
      [],
      [{ key: "voice", type: "select", optionsSource: "unsupported" }]
    )
  ).toThrow("source");
  expect(() =>
    mergeSettingFields([], [{ key: "speed", type: "number", min: 2, max: 1 }])
  ).toThrow("bounds");
  expect(() =>
    validateConfig([{ key: "model", type: "text", required: true }], {
      model: "  ",
    })
  ).toThrow("Required");
});

test("package origin declarations cannot grant cookies, non-origin URLs, secret endpoints or malformed features", () => {
  for (const permissions of [
    { network: ["https://example.invalid/path"] },
    { network: ["http://example.invalid"] },
    { endpointFields: ["password"] },
  ])
    expect(() => readProviderPackage(pack({ permissions }))).toThrow(
      "permission"
    );
  expect(() =>
    readProviderPackage(
      pack({
        services: [
          {
            id: "constructor",
            implementation: { kind: "script", entry: "chat.js" },
            capabilities: { chat: { handler: "chat" } },
          },
        ],
      })
    )
  ).toThrow("entry");
  expect(() =>
    readProviderPackage(
      pack({
        services: [
          {
            id: "chat",
            implementation: { kind: "script", entry: "chat.js" },
            capabilities: {
              chat: { handler: "chat", inputModalities: ["video"] },
            },
          },
        ],
      })
    )
  ).toThrow("descriptor");
});
