import {
  createServiceInstance,
  validateServiceConfig,
  validateFieldCapabilities,
  mergeSettingFields,
} from "./instances";
import { createProviderRegistry } from "./registry";
import {
  supportedCapabilities,
  reconcileEnabledCapabilities,
} from "./capabilities";
import {
  enabledApiCapabilities,
  isApiAvailableFor,
  availableApiForScene,
  isApiConfigured,
} from "../config/serviceSelection";

const service = {
  id: "text",
  name: "Text",
  implementation: { kind: "script", entry: "text.js" },
  capabilities: {
    translate: { handler: "translate" },
    dictionary: { handler: "dictionary" },
  },
  settings: [
    { key: "url", type: "text", required: true },
    {
      key: "dictionaryStyle",
      type: "text",
      required: true,
      visibleForCapabilities: ["dictionary"],
    },
  ],
};
const manifest = {
  apiVersion: 1,
  id: "text-example",
  version: "1.0.0",
  services: [service],
};
test("incomplete instances remain editable but do not enter scene candidates", () => {
  const api = createServiceInstance(
    manifest,
    "text",
    "exports.translate=()=>{}",
    {},
    "pending",
    {},
    ["translate"]
  );
  expect(supportedCapabilities(api)).toContain("translate");
  expect(isApiConfigured(api)).toBe(false);
  expect(isApiAvailableFor(api, "translate")).toBe(false);
  expect(
    isApiConfigured({
      ...api,
      pluginConfig: { url: "https://example.invalid" },
    })
  ).toBe(true);
});
test("support is immutable while enabled tasks control forms, candidates and direct execution", async () => {
  const api = createServiceInstance(
    manifest,
    "text",
    "exports.translate=()=>{}",
    { url: "https://example.invalid" },
    "one",
    {},
    ["translate"]
  );
  expect(supportedCapabilities(api)).toEqual(["translate", "dictionary"]);
  expect(enabledApiCapabilities(api)).toEqual(["translate"]);
  expect(
    availableApiForScene({ apiSlug: "one" }, [api], "dictionary")
  ).toBeUndefined();
  const runner = jest.fn();
  const registry = createProviderRegistry({
    resolveInstance: () => api,
    runners: { script: runner },
    createContext: jest.fn(),
  });
  await expect(
    registry.invoke("one", "dictionary", { text: "word" }).result
  ).rejects.toMatchObject({ code: "CAPABILITY_DISABLED" });
  expect(runner).not.toHaveBeenCalled();
  expect(
    validateServiceConfig(
      api.provider,
      { url: "https://example.invalid", dictionaryStyle: "saved" },
      ["translate"]
    ).dictionaryStyle
  ).toBe("saved");
  expect(() =>
    validateServiceConfig(api.provider, { url: "https://example.invalid" }, [
      "dictionary",
    ])
  ).toThrow("dictionaryStyle");
  expect(
    isApiAvailableFor({ ...api, enabledCapabilities: [] }, "translate")
  ).toBe(false);
});
test("only declared capability fields may hide; endpoints, credentials and model remain common", () => {
  for (const changes of [
    { key: "model" },
    { key: "url" },
    { key: "secret", type: "password" },
    { visibleForCapabilities: ["transcribe"] },
    { visibleForCapabilities: [] },
  ]) {
    const fields = mergeSettingFields(
      [],
      [
        {
          key: "style",
          type: "text",
          visibleForCapabilities: ["dictionary"],
          ...changes,
        },
      ]
    );
    expect(() =>
      validateFieldCapabilities(service, fields, { endpointFields: ["url"] })
    ).toThrow();
  }
  expect(
    reconcileEnabledCapabilities(["dictionary"], ["translate", "dictionary"])
  ).toEqual(["dictionary"]);
  expect(reconcileEnabledCapabilities(["translate"], ["transcribe"])).toEqual([
    "transcribe",
  ]);
});
