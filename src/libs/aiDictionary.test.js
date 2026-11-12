import { resolveAiDictApiSetting } from "./aiDictionary";
import { PROMPT_CATEGORY_DICTIONARY } from "../config/prompt";
const api = {
  apiType: "OpenAI",
  apiSlug: "test",
  dictPrompt: "",
  dictUserPrompt: "{{text}}",
};
const resolve = (patch = {}) =>
  resolveAiDictApiSetting({
    aiDictApiSlug: "test",
    transApis: [api],
    ...patch,
  });
test("accepts either half and rejects blank, disabled and unsupported dictionaries", () => {
  expect(resolve()).toMatchObject({
    dictPrompt: "",
    dictUserPrompt: "{{text}}",
  });
  expect(
    resolve({
      transApis: [{ ...api, dictPrompt: "Rules", dictUserPrompt: "" }],
    })
  ).not.toBeNull();
  for (const updated of [
    { isDisabled: true },
    { apiType: "Google" },
    { enabledCapabilities: [] },
  ])
    expect(resolve({ transApis: [{ ...api, ...updated }] })).toBeNull();
});
test("global dictionary selection validates category and both halves", () => {
  const prompt = {
    slug: "custom",
    category: PROMPT_CATEGORY_DICTIONARY,
    systemPrompt: "",
    userPrompt: "{{text}}",
  };
  expect(
    resolve({ aiDictPromptSlug: prompt.slug, prompts: [prompt] })
  ).toMatchObject({ dictUserPrompt: "{{text}}" });
  for (const updated of [{ category: "summary prompt" }])
    expect(
      resolve({
        aiDictPromptSlug: prompt.slug,
        prompts: [{ ...prompt, ...updated }],
      })
    ).toBeNull();
});
test("plugin availability uses its selected pair without replacing explicit empties", () => {
  const plugin = {
    apiType: "Plugin",
    apiSlug: "test",
    provider: {
      apiVersion: 1,
      implementation: { kind: "script" },
      capabilities: { dictionary: { handler: "dictionary" } },
      defaultPrompts: {
        dictionary: [
          { id: "default", systemPrompt: "", userPrompt: "{{text}}" },
        ],
      },
    },
  };
  expect(resolve({ transApis: [plugin] })).toMatchObject({
    dictUserPrompt: "{{text}}",
  });
  expect(
    resolve({ transApis: [{ ...plugin, dictPrompt: "", dictUserPrompt: "" }] })
  ).toMatchObject({ dictUserPrompt: "{{text}}" });
  expect(
    resolve({
      transApis: [
        { ...plugin, provider: { ...plugin.provider, defaultPrompts: {} } },
      ],
    })
  ).toMatchObject({ dictUserPrompt: expect.stringContaining("{{text}}") });
  expect(plugin.dictUserPrompt).toBeUndefined();
});
