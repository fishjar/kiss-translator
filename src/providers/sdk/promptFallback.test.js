import { hasPromptPair, resolvePromptPair } from "./template";
import { buildMessages, TRANSLATION_PROTOCOL_PROMPTS } from "./translation";
import { buildTextTaskMessages } from "./textTasks";
import { withDefaultPromptInput, pluginPromptSlug } from "../defaultPrompts";
import {
  resolveApiPromptSettings,
  resolveEmptyApiPrompts,
} from "../../config/prompt";
import { DEFAULT_API_SETTING } from "../../config/api";
import { applyTestPrompt } from "../testInput";

const blanks = [undefined, null, "", " \n\t"];
const preset = {
  id: "default",
  systemPrompt: "Plugin rules",
  userPrompt: "{{text}}",
  protocol: "text",
};
const plugin = {
  implementation: { kind: "script" },
  capabilities: {
    translate: { outputModes: ["text"] },
    dictionary: { outputModes: ["text"] },
  },
  source: { pluginId: "test", serviceId: "chat" },
  defaultPrompts: { nobatch: [preset], dictionary: [preset] },
};
const input = {
  items: [{ id: "a", text: "literal {{tone}} $$ $&" }],
  sourceLanguage: "en",
  targetLanguage: "zh",
};

test.each(blanks)("raw empty pair falls back (%p)", (system) => {
  for (const user of blanks) {
    expect(hasPromptPair(system, user)).toBe(false);
    expect(resolvePromptPair(system, user, preset)).toMatchObject(presetPair());
    for (const protocol of ["text", "json", "line", "xml"]) {
      const options = {
        ...input,
        outputProtocol: protocol,
        translationMode: protocol === "text" ? "single" : "batch",
      };
      expect(
        buildMessages({ ...options, systemPrompt: system, userPrompt: user })
      ).toEqual(
        buildMessages({ ...options, ...TRANSLATION_PROTOCOL_PROMPTS[protocol] })
      );
    }
    for (const task of ["dictionary", "summarize"]) {
      expect(
        buildTextTaskMessages(task, {
          text: "Source",
          language: "zh",
          instructions: system,
          userPrompt: user,
        })
      ).toEqual(
        buildTextTaskMessages(task, { text: "Source", language: "zh" })
      );
    }
  }
});
function presetPair() {
  return { systemPrompt: preset.systemPrompt, userPrompt: preset.userPrompt };
}

test.each([
  ["Custom {{text}}", ""],
  ["", "Custom {{text}}"],
  ["Fixed", "Input"],
])(
  "nonempty custom pair remains complete (%s, %s)",
  (systemPrompt, userPrompt) => {
    expect(resolvePromptPair(systemPrompt, userPrompt, preset)).toEqual({
      systemPrompt,
      userPrompt,
    });
    const selected = withDefaultPromptInput({ provider: plugin }, "translate", {
      ...input,
      systemPrompt,
      userPrompt,
    });
    expect(selected).toMatchObject({ systemPrompt, userPrompt });
  }
);

test("rendered blank custom input errors without fallback", () => {
  expect(() =>
    buildMessages({ ...input, systemPrompt: "{{context}}" })
  ).toThrow();
  for (const task of ["dictionary", "summarize"])
    expect(() =>
      buildTextTaskMessages(task, {
        text: "Source",
        instructions: "{{context}}",
      })
    ).toThrow();
});

test("old form-created instance uses plugin presets in scenes and capability tests without mutation", () => {
  const old = {
    ...DEFAULT_API_SETTING,
    apiType: "Plugin",
    useBatchFetch: false,
    batchPromptSlug: "",
    nobatchPromptSlug: "",
    dictPromptSlug: "",
    provider: plugin,
  };
  const snapshot = JSON.stringify(old);
  const resolved = resolveApiPromptSettings(old);
  expect(resolved).toMatchObject({
    nobatchPrompt: "Plugin rules",
    nobatchUserPrompt: "{{text}}",
    dictPrompt: "Plugin rules",
    dictUserPrompt: "{{text}}",
  });
  expect(
    buildMessages(
      withDefaultPromptInput(
        old,
        "translate",
        applyTestPrompt("translate", input, resolved)
      )
    )[1].content
  ).toBe(input.items[0].text);
  expect(
    withDefaultPromptInput(
      old,
      "dictionary",
      applyTestPrompt("dictionary", { text: "Source" }, resolved)
    )
  ).toMatchObject({ instructions: "Plugin rules", userPrompt: "{{text}}" });
  expect(JSON.stringify(old)).toBe(snapshot);
});

test("selected plugin preset wins and absent or blank plugin presets use task defaults", () => {
  const second = { ...preset, id: "second", systemPrompt: "Selected" };
  const provider = { ...plugin, defaultPrompts: { nobatch: [preset, second] } };
  const api = {
    provider,
    nobatchPromptSlug: pluginPromptSlug(provider, "nobatch", "second"),
  };
  expect(resolveApiPromptSettings(api).nobatchPrompt).toBe("Selected");
  for (const defaultPrompts of [
    {},
    { nobatch: [{ id: "empty", systemPrompt: " ", userPrompt: null }] },
  ]) {
    expect(
      resolveEmptyApiPrompts({
        provider: { ...plugin, defaultPrompts },
        useBatchFetch: false,
      }).nobatchUserPrompt
    ).toContain("{{text}}");
  }
});

test.each(["line", "xml", "json"])(
  "native fallback matches %s without a preset reference",
  (batchProtocol) => {
    const api = { apiType: "OpenAI", batchProtocol, useBatchFetch: true };
    const resolved = resolveApiPromptSettings(api);
    expect(resolved.batchProtocol).toBe(batchProtocol);
    expect(resolved.batchUserPrompt).toContain("{{segments}}");
  }
);

test("explicit wire protocol selects matching defaults instead of incompatible plugin templates", () => {
  const api = {
    provider: {
      ...plugin,
      defaultPrompts: { batch: [{ ...preset, protocol: "json" }] },
    },
  };
  const selected = withDefaultPromptInput(api, "translate", {
    ...input,
    translationMode: "batch",
    outputProtocol: "xml",
  });
  expect(selected).toMatchObject(TRANSLATION_PROTOCOL_PROMPTS.xml);
  expect(buildMessages(selected)[1].content).toContain("<root>");
});

test("blank visual preset keeps its existing image prompt behavior", () => {
  const api = {
    provider: {
      ...plugin,
      defaultPrompts: {
        vlm: [{ id: "blank", systemPrompt: "", userPrompt: "" }],
      },
    },
  };
  expect(withDefaultPromptInput(api, "parseImage", {})).toEqual({ prompt: "" });
});
