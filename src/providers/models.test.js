import {
  getCapabilityDescriptor,
  supportsProviderCapability,
} from "./capabilities";
import {
  createServiceInstance,
  validateModels,
  validateServiceConfig,
} from "./instances";
import { packageServiceCatalog } from "./packageCatalog";
import { invokeInstance } from "./runtime";

const provider = {
  apiVersion: 1,
  capabilities: {
    translate: {
      handler: "translate",
      batch: { supported: true, maxItems: 20 },
      outputModes: ["complete", "stream"],
    },
    chat: {
      handler: "chat",
      outputModes: ["complete"],
      inputModalities: ["text"],
    },
  },
  models: [{ id: "small" }, { id: "large" }],
  modelField: "model",
};
test("catalogue and custom model IDs share the service capability contract", () => {
  for (const model of ["small", "large", "custom"]) {
    const instance = { provider, pluginConfig: { model } };
    expect(getCapabilityDescriptor(instance, "translate")).toBe(
      provider.capabilities.translate
    );
    expect(
      supportsProviderCapability(instance, "translate", { stream: true })
    ).toBe(true);
    expect(supportsProviderCapability(instance, "chat")).toBe(true);
  }
});

test("catalogue models without restrictions and custom IDs use the declared service contract", () => {
  const service = {
    ...provider,
    settings: [{ key: "model", type: "text", required: true }],
    models: [{ id: "suggested", name: "Suggested" }],
  };
  expect(() => validateModels(service, service.settings)).not.toThrow();
  for (const model of ["suggested", "custom-id"]) {
    expect(validateServiceConfig(service, { model })).toEqual({ model });
    expect(
      getCapabilityDescriptor(
        { provider: service, pluginConfig: { model } },
        "translate"
      )
    ).toEqual(provider.capabilities.translate);
  }
  expect(() => validateServiceConfig(service, { model: " " })).toThrow(
    "Required"
  );
});

const fixedModels = {
  ...provider,
  id: "fixed-models",
  name: "Fixed models",
  implementation: { kind: "script", entry: "service.js" },
  allowCustomModel: false,
  modelField: "engine",
  settings: [{ key: "engine", label: "Model", type: "text", required: true }],
};

test("invocation rejects a fixed model ID outside the service list", async () => {
  const instance = {
    apiSlug: "model-instance",
    provider: fixedModels,
    pluginConfig: { engine: "unknown" },
  };
  await expect(
    invokeInstance(
      instance,
      "chat",
      { messages: [{ role: "user", content: "Hello" }] },
      {}
    ).result
  ).rejects.toMatchObject({
    code: "INVALID_CONFIG",
    message: "Invalid model: engine",
  });
});

test.each([{}, { defaultValue: "large" }])(
  "fixed models use the field default or first model and preserve the rule in snapshots (%j)",
  (field) => {
    const service = {
      ...fixedModels,
      settings: [{ ...fixedModels.settings[0], ...field }],
    };
    const manifest = {
      apiVersion: 1,
      id: "model-plugin",
      name: "Model plugin",
      version: "1.0.0",
      services: [service],
    };
    const create = (values) =>
      createServiceInstance(
        manifest,
        service.id,
        "exports.chat = () => {};",
        values,
        "model-instance"
      );
    const instance = create({});
    const engine = field.defaultValue || "small";
    expect(instance.pluginConfig.engine).toBe(engine);
    expect(instance.provider).toMatchObject({
      models: service.models,
      modelField: "engine",
      allowCustomModel: false,
    });
    expect(packageServiceCatalog(manifest)[0].models).toEqual(service.models);
    expect(validateServiceConfig(instance.provider, { engine })).toEqual({
      engine,
    });
    expect(() => create({ engine: "custom" })).toThrow("Invalid model");
    expect(() =>
      validateServiceConfig(instance.provider, { engine: "custom" })
    ).toThrow("Invalid model");
    expect(
      createServiceInstance(
        { ...manifest, services: [{ ...service, allowCustomModel: true }] },
        service.id,
        "exports.chat = () => {};",
        { engine: "custom" },
        "custom-instance"
      ).pluginConfig.engine
    ).toBe("custom");
  }
);

test.each([
  { allowCustomModel: "false" },
  { models: undefined },
  { models: [] },
  { models: [{ id: "small" }, { id: "small" }] },
  { settings: [{ key: "engine", type: "select" }] },
  { settings: [{ key: "engine", type: "text", isSecret: true }] },
  { settings: [{ key: "engine", type: "text", defaultValue: "unknown" }] },
])("rejects invalid fixed model declarations (%j)", (override) => {
  const service = { ...fixedModels, ...override };
  expect(() => validateModels(service, service.settings)).toThrow();
});
test.each([
  {},
  { chat: {} },
  { transcribe: { timestamps: true } },
  null,
  false,
])(
  "model-level capabilities are rejected even when empty or matching the service: %j",
  (capabilities) => {
    expect(() =>
      validateModels({ ...provider, models: [{ id: "m", capabilities }] }, [
        { key: "model", type: "text" },
      ])
    ).toThrow("declare capabilities on separate services");
  }
);

test("different service contracts determine timestamp support", () => {
  for (const timestamps of [false, true]) {
    const service = {
      ...provider,
      capabilities: { transcribe: { handler: "transcribe", timestamps } },
    };
    expect(
      getCapabilityDescriptor(
        { provider: service, pluginConfig: { model: "small" } },
        "transcribe"
      ).timestamps
    ).toBe(timestamps);
  }
});
