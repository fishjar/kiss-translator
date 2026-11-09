import {
  getCapabilityDescriptor,
  supportsProviderCapability,
} from "./capabilities";
import { validateModels, validateServiceConfig } from "./instances";

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
