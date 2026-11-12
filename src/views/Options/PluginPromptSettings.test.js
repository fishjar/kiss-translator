import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import PluginPromptSettings from "./PluginPromptSettings";
import { DEFAULT_API_SETTING } from "../../config/api";
import { resolveApiPromptSettings } from "../../config/prompt";
import { createServiceInstance } from "../../providers/instances";
import {
  withDefaultPromptInput,
  getPluginPromptOptions,
} from "../../providers/defaultPrompts";
import { buildMessages } from "../../providers/sdk/translation";
import { buildTextTaskMessages } from "../../providers/sdk/textTasks";

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test.each(
  [
    ["batch", "batchPromptSlug", "batch system prompt", true],
    ["nobatch", "nobatchPromptSlug", "user prompt", false],
    ["dictionary", "dictPromptSlug", "dictionary prompt", false],
  ].flatMap((testCase) =>
    ["new", "legacy-empty", "legacy-inline", "unavailable"].map((state) => [
      ...testCase,
      state,
    ])
  )
)(
  "selecting plugin default restores the full %s pair (%s, %s, %s, %s)",
  async (slot, slugKey, category, batch, state) => {
    const preset = {
      id: "default",
      name: "Preset",
      systemPrompt: "Preset rules",
      userPrompt: slot === "batch" ? "{{segments}}" : "{{text}}",
      ...(slot === "batch" && { protocol: "line" }),
    };
    const manifest = {
      apiVersion: 1,
      id: "prompt-test",
      name: "Prompt test",
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
          defaultPrompts: { [slot]: [preset] },
        },
      ],
    };
    let current = {
      ...DEFAULT_API_SETTING,
      ...createServiceInstance(
        manifest,
        "text",
        "exports.translate=()=>({items:[]});exports.dictionary=()=>({text:'ok'});",
        {},
        "prompt-test"
      ),
      useBatchFetch: batch,
    };
    const [systemKey, userKey] = {
      batch: ["systemPrompt", "batchUserPrompt"],
      nobatch: ["nobatchPrompt", "nobatchUserPrompt"],
      dictionary: ["dictPrompt", "dictUserPrompt"],
    }[slot];
    if (state !== "new") {
      current = {
        ...current,
        [slugKey]: state === "unavailable" ? "missing" : "",
        [systemKey]: state === "legacy-inline" ? "Saved rules" : "",
        [userKey]: state === "legacy-inline" ? "Saved input" : "",
      };
    }
    const saved = { ...current };
    const changes = jest.fn();
    const prompts = [
      {
        slug: "custom",
        name: "Custom",
        category,
        systemPrompt: "Custom",
        userPrompt: "Fixed custom",
      },
    ];
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    function Harness() {
      const [api, setApi] = useState(current);
      return (
        <PluginPromptSettings
          api={api}
          prompts={prompts}
          onChange={(key, value) => {
            changes(key, value);
            current = { ...current, [key]: value };
            setApi(current);
          }}
        />
      );
    }
    async function choose(value) {
      const input = node.querySelector(`input[name="${slugKey}"]`);
      await act(async () =>
        Simulate.mouseDown(
          input.parentElement.querySelector('[role="combobox"]'),
          { button: 0 }
        )
      );
      const option = document.querySelector(
        `[role="option"][data-value="${value}"]`
      );
      expect(option).not.toBeNull();
      await act(async () => Simulate.click(option));
    }
    const messages = (resolved) =>
      slot === "dictionary"
        ? buildTextTaskMessages(
            "dictionary",
            withDefaultPromptInput(resolved, "dictionary", {
              text: "Source",
              instructions: resolved.dictPrompt,
              userPrompt: resolved.dictUserPrompt,
            })
          )
        : buildMessages(
            withDefaultPromptInput(resolved, "translate", {
              items: [{ id: "0", text: "Source" }],
              targetLanguage: "zh",
              translationMode: batch ? "batch" : "single",
              systemPrompt: batch
                ? resolved.systemPrompt
                : resolved.nobatchPrompt,
              userPrompt: batch
                ? resolved.batchUserPrompt
                : resolved.nobatchUserPrompt,
              outputProtocol: resolved.outputProtocol,
            })
          );
    try {
      await act(async () => root.render(<Harness />));
      expect(changes).not.toHaveBeenCalled();
      expect(current).toEqual(saved);
      if (state === "new") {
        await choose("custom");
        expect(
          messages(resolveApiPromptSettings(current, prompts)).map(
            (m) => m.content
          )
        ).toEqual(["Custom", "Fixed custom"]);
        changes.mockClear();
      } else if (state === "legacy-inline") {
        expect(
          messages(resolveApiPromptSettings(current, prompts)).map(
            (m) => m.content
          )
        ).toEqual(["Saved rules", "Saved input"]);
      }
      await choose("");
      expect(current[slugKey]).toMatch(/^plugin:/);
      expect(changes).toHaveBeenCalledTimes(1);
      const result = messages(resolveApiPromptSettings(current, prompts));
      expect(result[0].content).toBe("Preset rules");
      expect(result[1].content).toContain("Source");
      const empty = { ...current, [slugKey]: "custom" };
      expect(() =>
        messages(
          resolveApiPromptSettings(empty, [
            { ...prompts[0], systemPrompt: "", userPrompt: "" },
          ])
        )
      ).not.toThrow();
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  }
);

test.each([
  ["subtitle", "subtitlePromptSlug", "segmentSubtitle"],
  ["vlm", "vlmPromptSlug", "parseImage"],
])(
  "%s keeps its existing default-selection behavior",
  async (slot, slugKey, capability) => {
    const api = {
      apiType: "Plugin",
      provider: {
        implementation: { kind: "script" },
        capabilities: { [capability]: { handler: capability } },
        defaultPrompts: {
          [slot]: [{ id: "default", name: "Preset", systemPrompt: "Rules" }],
        },
      },
    };
    api[slugKey] = getPluginPromptOptions(api, slot)[0].slug;
    const onChange = jest.fn();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          <PluginPromptSettings api={api} prompts={[]} onChange={onChange} />
        )
      );
      await act(async () =>
        Simulate.mouseDown(node.querySelector('[role="combobox"]'), {
          button: 0,
        })
      );
      await act(async () =>
        Simulate.click(document.querySelector('[role="option"][data-value=""]'))
      );
      expect(onChange).toHaveBeenCalledWith(slugKey, "");
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  }
);
