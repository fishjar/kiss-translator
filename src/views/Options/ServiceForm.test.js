import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { ServiceFormHeader, serviceTransportFeatures } from "./ServiceForm";
import PluginPromptSettings from "./PluginPromptSettings";
import { PROMPT_CATEGORY_USER } from "../../config/prompt";
import { builtinPlugins, createBuiltinInstance } from "../../builtin-plugins";
import { API_SPE_TYPES } from "../../config/api";
import fs from "fs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test.each([
  ["translate", false, {}, true],
  ["translate", false, { nobatch: { systemPrompt: "" } }, false],
  ["translate", true, { nobatch: { systemPrompt: "Single" } }, true],
  ["translate", true, { batch: { userPrompt: "Batch" } }, false],
  ["dictionary", false, {}, true],
  ["dictionary", false, { dictionary: { userPrompt: "Dictionary" } }, false],
  ["segmentSubtitle", false, { subtitle: { systemPrompt: "Subtitle" } }, false],
  ["parseImage", false, { vlm: { systemPrompt: "Vision" } }, false],
])(
  "plugin default option availability follows the current slot: %s %s",
  async (capability, useBatchFetch, defaultPrompts, disabled) => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const onChange = jest.fn();
    const api = {
      apiType: "Plugin",
      useBatchFetch,
      enabledCapabilities: [capability],
      provider: {
        capabilities: { [capability]: { handler: capability } },
        defaultPrompts,
      },
    };
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
      const option = document.querySelector('[role="option"][data-value=""]');
      expect(option).not.toBeNull();
      expect(option.getAttribute("aria-disabled")).toBe(
        disabled ? "true" : null
      );
      expect(node.querySelector("input").value).toBe("");
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  }
);
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: {
      providerPlugins: [{ pluginId: "indexed", name: "Indexed Plugin" }],
    },
  }),
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));

test("every compiled service uses effective task descriptors for batch/stream controls", () => {
  const rows = [];
  for (const plugin of builtinPlugins) {
    if (plugin.services[0].id === "LocalAI") continue;
    const api = createBuiltinInstance(plugin.services[0].id, "probe", "Probe");
    // Cross-check the new form against the established request-adapter feature
    // classification, rather than repeating the form's descriptor calculation.
    const expected = {
      batch: API_SPE_TYPES.batch.has(api.apiType),
      stream: API_SPE_TYPES.stream.has(api.apiType),
    };
    expect(serviceTransportFeatures(api)).toEqual(expected);
    rows.push({ apiType: api.apiType, ...expected });
  }
  fs.mkdirSync("tmp", { recursive: true });
  fs.writeFileSync(
    "tmp/service-form-feature-audit.json",
    JSON.stringify(rows, null, 2)
  );
  const local = createBuiltinInstance("LocalAI", "local", "Local");
  expect(
    serviceTransportFeatures({ ...local, modelRef: "whisper-base-timestamped" })
  ).toEqual({ batch: false, stream: false });
  expect(
    serviceTransportFeatures({
      ...local,
      modelRef: "hy-mt2-1.8b",
      enabledCapabilities: ["translate"],
    })
  ).toEqual({ batch: true, stream: true });
  expect(
    serviceTransportFeatures({
      ...local,
      modelRef: "hy-mt2-1.8b",
      enabledCapabilities: [],
    })
  ).toEqual({ batch: false, stream: false });
});
test("shared header handles disabled/pinned and prompt selection has no preview", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const change = jest.fn();
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const api = {
    apiType: "Plugin",
    apiName: "Service",
    provider: {
      apiVersion: "1",
      name: "Endpoint",
      source: {
        external: true,
        pluginId: "example",
        pluginName: "Example Plugin",
      },
      capabilities: { translate: { handler: "translate" } },
      defaultPrompts: {
        nobatch: {
          systemPrompt: "Read-only {{text}}",
          userPrompt: "{{items}}",
        },
      },
    },
  };
  function Harness() {
    const [current, setCurrent] = useState(api);
    return (
      <>
        <ServiceFormHeader
          api={current}
          onChange={(key, value) =>
            setCurrent((prev) => ({ ...prev, [key]: value }))
          }
        />
        <PluginPromptSettings
          api={current}
          prompts={[
            {
              slug: "custom",
              name: "Custom",
              category: PROMPT_CATEGORY_USER,
              systemPrompt: "Custom prompt",
            },
          ]}
          onChange={change}
        />
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(node.textContent).toContain("外部插件 · Example Plugin");
    expect(node.querySelector("textarea")).toBeNull();
    expect(node.textContent).toContain("插件内部默认");
    expect(node.textContent).not.toContain("复制提示词");
    expect(node.textContent).not.toContain("插件未公开默认提示词");
    expect(writeText).not.toHaveBeenCalled();
    expect(api.provider.defaultPrompts.nobatch.systemPrompt).toBe(
      "Read-only {{text}}"
    );
    await act(async () => node.querySelector('input[name="isPinned"]').click());
    expect(node.querySelector('input[name="isPinned"]').checked).toBe(true);
    expect(change).not.toHaveBeenCalled();
    await act(async () =>
      Simulate.change(node.querySelector('input[name="nobatchPromptSlug"]'), {
        target: { value: "custom" },
      })
    );
    expect(change).toHaveBeenCalledWith("nobatchPromptSlug", "custom");
  } finally {
    await act(async () => root.unmount());
    node.remove();
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else delete navigator.clipboard;
  }
});
