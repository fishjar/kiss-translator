import {
  validateDefaultPrompts,
  withDefaultPromptInput,
} from "./defaultPrompts";
import { createServiceInstance } from "./instances";
import { resolveApiPromptSettings } from "../config/prompt";

const service = {
  id: "text",
  name: "Text",
  implementation: { kind: "script", entry: "text.js" },
  capabilities: {
    translate: { handler: "translate", batch: { supported: true } },
    parseImage: { handler: "ocr" },
  },
  defaultPrompts: {
    batch: { systemPrompt: "batch", userPrompt: "{{items}}" },
    nobatch: { systemPrompt: "single" },
    vlm: { systemPrompt: "read image" },
  },
};
test("default declarations validate task bindings and copied snapshots remain independent", () => {
  validateDefaultPrompts(service);
  for (const defaultPrompts of [
    [],
    { unknown: { systemPrompt: "x" } },
    { dictionary: { systemPrompt: "x" } },
    { nobatch: { systemPrompt: 5 } },
    { nobatch: { systemPrompt: "x", protocol: "xml" } },
    { batch: { systemPrompt: "x", protocol: "text" } },
    { vlm: { systemPrompt: "x", protocol: "text" } },
  ])
    expect(() =>
      validateDefaultPrompts({ ...service, defaultPrompts })
    ).toThrow("prompt");
  const api = createServiceInstance(
    {
      apiVersion: 1,
      id: "example",
      version: "1.0.0",
      services: [service],
    },
    "text",
    "exports.translate=()=>{}",
    {},
    "instance"
  );
  expect(api.provider.defaultPrompts).toEqual(service.defaultPrompts);
  expect(api.provider.defaultPrompts).not.toBe(service.defaultPrompts);
  expect(resolveApiPromptSettings(api).nobatchPrompt).toBe("single");
});

test.each([
  [undefined, "Complete formally: {{text}}"],
  ["Custom: {{text}}", "Custom: {{text}}"],
  ["", ""],
])(
  "suggest preserves user prompt precedence for %p",
  (userPrompt, expected) => {
    const provider = {
      capabilities: { suggest: { handler: "suggest" } },
      defaultPrompts: {
        suggest: { userPrompt: "Complete formally: {{text}}" },
      },
    };
    validateDefaultPrompts(provider);
    const input = Object.freeze({ text: "hello", userPrompt });
    const result = withDefaultPromptInput({ provider }, "suggest", input);
    expect(result.userPrompt).toBe(expected);
    expect(input.userPrompt).toBe(userPrompt);
  }
);

test("explicit batch mode chooses the batch default even for one item", () => {
  const input = {
    items: [{ id: "0", text: "a" }],
    translationMode: "batch",
    targetLanguage: "zh",
  };
  expect(
    withDefaultPromptInput({ provider: service }, "translate", input)
      .systemPrompt
  ).toBe("batch");
});
test("task and scene instructions override defaults; batch tasks and image calls use their declared slots", () => {
  const api = { provider: service };
  const input = { items: [{ id: "0", text: "a" }], targetLanguage: "zh" };
  expect(withDefaultPromptInput(api, "translate", input).systemPrompt).toBe(
    "single"
  );
  expect(
    withDefaultPromptInput({ ...api, useBatchFetch: true }, "translate", input)
      .systemPrompt
  ).toBe("batch");
  expect(
    withDefaultPromptInput(api, "translate", {
      ...input,
      systemPrompt: "scene",
    }).systemPrompt
  ).toBe("scene");
  expect(withDefaultPromptInput(api, "parseImage", {}).prompt).toBe(
    "read image"
  );
  expect(
    withDefaultPromptInput(api, "translate", {
      ...input,
      systemPrompt: "",
      userPrompt: "",
    })
  ).toMatchObject({ systemPrompt: "", userPrompt: "" });
  expect(input.systemPrompt).toBeUndefined();
});
