import {
  getCapabilityDescriptor,
  supportsProviderCapability,
} from "./capabilities";
import { validateModels, validateServiceConfig } from "./instances";

const provider = {
  apiVersion: "1",
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
  models: [
    {
      id: "small",
      capabilities: {
        translate: {
          batch: { supported: true, maxItems: 2 },
          outputModes: ["complete"],
        },
      },
    },
    {
      id: "fake",
      capabilities: { chat: { inputModalities: ["text", "image"] } },
    },
  ],
  modelField: "model",
};
test("model restrictions narrow batching/streaming/capabilities without expanding service modalities", () => {
  const instance = { provider, pluginConfig: { model: "small" } };
  expect(getCapabilityDescriptor(instance, "translate").batch.maxItems).toBe(2);
  expect(
    supportsProviderCapability(instance, "translate", { stream: true })
  ).toBe(false);
  expect(supportsProviderCapability(instance, "chat")).toBe(false);
  expect(
    getCapabilityDescriptor(
      { ...instance, pluginConfig: { model: "fake" } },
      "chat"
    ).inputModalities
  ).toEqual(["text"]);
  expect(
    supportsProviderCapability(
      { ...instance, pluginConfig: { model: "unknown" } },
      "translate"
    )
  ).toBe(true);
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
test("unknown model capabilities and handler overrides cannot be installed", () => {
  const service = {
    ...provider,
    models: [{ id: "m", capabilities: { transcribe: {} } }],
  };
  expect(() =>
    validateModels(service, [{ key: "model", type: "text" }])
  ).toThrow("unknown");
  expect(() =>
    validateModels(
      {
        ...provider,
        models: [{ id: "m", capabilities: { chat: { handler: "other" } } }],
      },
      [{ key: "model", type: "text" }]
    )
  ).toThrow("handler");
});
