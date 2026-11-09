import { builtinFieldBounds, validateBuiltinSettingChanges } from "./fields";
import { DEFAULT_API_LIST } from "../config/api";
import {
  builtinServiceDefinitions,
  getBuiltinServiceDefinition,
} from "./definitions";
import {
  validateCapabilities,
  mergeSettingFields,
} from "../providers/instances";

test("every preset has a compiled flat contract and a valid root field schema", () => {
  for (const preset of DEFAULT_API_LIST) {
    const definition = getBuiltinServiceDefinition(preset.apiType);
    expect(definition.implementation).toEqual({
      kind: "native",
      entry: preset.apiType,
    });
    expect(definition.configLocation).toBe("root");
    expect(() => validateCapabilities(definition.capabilities)).not.toThrow();
    expect(() => mergeSettingFields([], definition.settings)).not.toThrow();
    expect(() => validateBuiltinSettingChanges({}, preset)).not.toThrow();
  }
  expect(getBuiltinServiceDefinition("constructor")).toBeUndefined();
  expect(
    builtinServiceDefinitions.OpenAI.capabilities.summarize.outputModes
  ).toEqual(["complete"]);
  expect(
    builtinServiceDefinitions.OpenAI.capabilities.dictionary.outputModes
  ).toContain("stream");
});

test("native field validation preserves unchanged legacy values and rejects invalid edits", () => {
  const previous = {
    url: "https://old.invalid",
    httpTimeout: "legacy-value",
    key: "own-secret",
  };
  const next = { ...previous, url: "https://new.invalid" };
  expect(validateBuiltinSettingChanges(previous, next)).toBe(next);
  expect(previous.url).toBe("https://old.invalid");
  expect(() =>
    validateBuiltinSettingChanges(previous, { ...next, httpTimeout: 0 })
  ).toThrow("number");
  expect(() =>
    validateBuiltinSettingChanges(previous, { ...next, key: 42 })
  ).toThrow("text");
  expect(builtinFieldBounds.fetchInterval).toEqual({ min: 0, max: 5000 });
});
