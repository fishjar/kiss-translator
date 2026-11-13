import {
  applyTestPrompt,
  createTestInput,
  structuredTestSamples,
} from "./testInput";
import { PROVIDER_CAPABILITIES } from "./capabilities";
import { validateInput } from "./validation";

test.each(PROVIDER_CAPABILITIES)(
  "%s test form creates a valid production input",
  (capability) => {
    const store = {
      put: jest.fn(() => ({ assetId: "asset-1", mimeType: "test/data" })),
    };
    const text = structuredTestSamples[capability]
      ? JSON.stringify(structuredTestSamples[capability])
      : "hello";
    const input = createTestInput(capability, text, {}, store);
    expect(() => validateInput(capability, input)).not.toThrow();
    if (
      ["transcribe", "recognizeText", "parseImage", "analyzeLayout"].includes(
        capability
      )
    )
      expect(store.put).toHaveBeenCalledTimes(1);
  }
);

const {
  resolveApiPromptSettings,
  DEFAULT_SUMMARY_PROMPT,
  PROMPT_CATEGORY_SUMMARY,
} = require("../config/prompt");
const { withDefaultPromptInput } = require("./defaultPrompts");
const { buildTextTaskMessages } = require("./sdk/textTasks");
test.each(["translate", "dictionary"])(
  "%s test keeps absent templates absent and preserves explicit empties",
  (capability) => {
    const api = { provider: { implementation: { kind: "script" } } };
    const input = applyTestPrompt(capability, { text: "bank" }, api);
    expect(Object.hasOwn(input, "userPrompt")).toBe(false);
    expect(
      Object.hasOwn(
        input,
        capability === "translate" ? "systemPrompt" : "instructions"
      )
    ).toBe(false);
    const fields =
      capability === "translate"
        ? { nobatchPrompt: "", nobatchUserPrompt: null }
        : { dictPrompt: "", dictUserPrompt: null };
    expect(
      applyTestPrompt(capability, { text: "bank" }, { ...api, ...fields })
    ).toMatchObject({
      [capability === "translate" ? "systemPrompt" : "instructions"]: "",
      userPrompt: "",
    });
  }
);
test("native summary test explicitly selects a default and renders a usable request", () => {
  const api = resolveApiPromptSettings({ apiType: "OpenAI" });
  const input = applyTestPrompt(
    "summarize",
    createTestInput("summarize", "Transcript"),
    api
  );
  expect(input).toMatchObject({
    instructions: DEFAULT_SUMMARY_PROMPT.systemPrompt,
    userPrompt: DEFAULT_SUMMARY_PROMPT.userPrompt,
  });
  expect(
    buildTextTaskMessages("summarize", input).some((m) =>
      m.content.includes("Transcript")
    )
  ).toBe(true);
});
test("summary test follows the video scene then service preset, respecting custom empty templates", () => {
  const preset = {
    id: "default",
    systemPrompt: "Plugin summary",
    userPrompt: "{{text}}",
  };
  const api = {
    provider: {
      implementation: { kind: "script" },
      defaultPrompts: { summary: [preset] },
    },
  };
  expect(
    applyTestPrompt("summarize", { text: "Transcript" }, api)
  ).toMatchObject({
    instructions: preset.systemPrompt,
    userPrompt: preset.userPrompt,
  });
  const prompt = {
    slug: "scene",
    category: PROMPT_CATEGORY_SUMMARY,
    systemPrompt: "",
    userPrompt: "Scene {{transcript}}",
  };
  expect(
    applyTestPrompt("summarize", { text: "Transcript" }, api, {
      prompts: [prompt],
      subtitleSetting: { summaryPromptSlug: "scene" },
    })
  ).toMatchObject({ instructions: "", userPrompt: prompt.userPrompt });
  expect(
    applyTestPrompt("summarize", { text: "Transcript" }, api, {
      prompts: [{ ...prompt, userPrompt: "" }],
      subtitleSetting: { summaryPromptSlug: "scene" },
    })
  ).toMatchObject({ instructions: "", userPrompt: "" });
});

test("summary test respects the selected global default and falls back after an invalid selection", () => {
  const preset = {
    id: "default",
    systemPrompt: "Plugin summary",
    userPrompt: "{{text}}",
  };
  const api = {
    provider: {
      implementation: { kind: "script" },
      capabilities: { summarize: { outputModes: ["text"] } },
      defaultPrompts: { summary: [preset] },
    },
  };
  expect(
    applyTestPrompt("summarize", { text: "Transcript" }, api, {
      subtitleSetting: { summaryPromptSlug: DEFAULT_SUMMARY_PROMPT.slug },
    })
  ).toMatchObject({
    instructions: DEFAULT_SUMMARY_PROMPT.systemPrompt,
    userPrompt: DEFAULT_SUMMARY_PROMPT.userPrompt,
  });
  expect(
    applyTestPrompt("summarize", { text: "Transcript" }, api, {
      subtitleSetting: { summaryPromptSlug: "missing" },
    })
  ).toMatchObject({
    instructions: preset.systemPrompt,
    userPrompt: preset.userPrompt,
  });
  expect(
    applyTestPrompt(
      "summarize",
      { text: "Transcript" },
      {
        provider: { ...api.provider, defaultPrompts: {} },
      }
    )
  ).toMatchObject({
    instructions: DEFAULT_SUMMARY_PROMPT.systemPrompt,
    userPrompt: DEFAULT_SUMMARY_PROMPT.userPrompt,
  });
});
test("plugin capability test preparation retains preset selection through configuration resolution", () => {
  const api = {
    provider: {
      implementation: { kind: "script" },
      defaultPrompts: {
        dictionary: [
          { id: "default", systemPrompt: "Define", userPrompt: "{{text}}" },
        ],
      },
    },
  };
  const prepared = applyTestPrompt(
    "dictionary",
    { text: "bank" },
    resolveApiPromptSettings(api)
  );
  expect(withDefaultPromptInput(api, "dictionary", prepared)).toMatchObject({
    instructions: "Define",
    userPrompt: "{{text}}",
  });
});

test("new plugin instances explicitly select presets before inheriting host form defaults", () => {
  const { createServiceInstance } = require("./instances");
  const { DEFAULT_API_SETTING } = require("../config/api");
  const manifest = {
    apiVersion: 1,
    id: "fresh",
    name: "Fresh",
    version: "1.0.0",
    services: [
      {
        id: "text",
        name: "Text",
        implementation: { kind: "script", entry: "text.js" },
        capabilities: {
          translate: { handler: "translate", batch: { supported: true } },
          dictionary: { handler: "dictionary" },
        },
        defaultPrompts: {
          batch: [
            {
              id: "default",
              name: "Batch",
              systemPrompt: "Translate",
              userPrompt: "{{segments}}",
              protocol: "json",
            },
          ],
          nobatch: [
            {
              id: "default",
              name: "Single",
              systemPrompt: "",
              userPrompt: "{{text}}",
              protocol: "text",
            },
          ],
          dictionary: [
            {
              id: "default",
              name: "Dictionary",
              systemPrompt: "Define",
              userPrompt: "{{text}}",
            },
          ],
        },
      },
    ],
  };
  const instance = createServiceInstance(
    manifest,
    "text",
    "exports.translate=()=>({items:[]});exports.dictionary=()=>({text:'Definition'});",
    {},
    "fresh"
  );
  const resolved = resolveApiPromptSettings({
    ...DEFAULT_API_SETTING,
    ...instance,
  });
  expect(resolved.nobatchUserPrompt).toBe("{{text}}");
  expect(resolved.dictUserPrompt).toBe("{{text}}");
  expect(resolved.batchUserPrompt).toBe("{{segments}}");
});
