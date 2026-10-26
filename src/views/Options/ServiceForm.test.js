import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import {
  ServiceFormHeader,
  serviceTransportFeatures,
  AsrDurationSetting,
  ServiceTimeoutSetting,
} from "./ServiceForm";
import PluginPromptSettings from "./PluginPromptSettings";
import { PROMPT_CATEGORY_USER } from "../../config/prompt";
import { builtinPlugins, createBuiltinInstance } from "../../builtin-plugins";
import { API_SPE_TYPES } from "../../config/api";
import fs from "fs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("ASR duration setting has the 20-second default, integer bounds and an editable invalid draft", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const onChange = jest.fn();
  const api = {
    apiType: "Plugin",
    provider: { capabilities: { transcribe: { handler: "transcribe" } } },
  };
  try {
    await act(async () =>
      root.render(<AsrDurationSetting api={api} onChange={onChange} />)
    );
    let input = node.querySelector("input");
    expect(input.value).toBe("20");
    expect([input.min, input.max, input.step]).toEqual(["1", "300", "1"]);
    await act(async () => Simulate.change(input, { target: { value: "12" } }));
    expect(onChange).toHaveBeenCalledWith(12);
    await act(async () =>
      root.render(
        <AsrDurationSetting
          api={{ ...api, asrMaxDurationSeconds: 1.5 }}
          onChange={onChange}
        />
      )
    );
    input = node.querySelector("input");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.value).toBe("1.5");
    await act(async () =>
      root.render(
        <AsrDurationSetting
          api={{ ...api, enabledCapabilities: [] }}
          onChange={onChange}
        />
      )
    );
    expect(node.querySelector("input")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});

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

test("local timestamp support is read-only and ignores stored overrides when the model changes", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node),
    onTimestampChange = jest.fn();
  const modelTasks = require("../../config/localModelTasks.json");
  const api = {
    apiType: "LocalAI",
    modelRef: "sensevoice-small",
    asrTimestampSupport: "unsupported",
  };
  const render = (service) =>
    act(() =>
      root.render(
        <AsrDurationSetting
          api={service}
          onChange={jest.fn()}
          onTimestampChange={onTimestampChange}
        />
      )
    );
  const original = modelTasks.asrTimestamps["sensevoice-small"];
  try {
    render(api);
    const select = () =>
      node.querySelector('select[name="asrTimestampSupport"]');
    expect(select().disabled).toBe(true);
    expect(select().value).toBe("supported");
    act(() => Simulate.change(select(), { target: { value: "unsupported" } }));
    expect(onTimestampChange).not.toHaveBeenCalled();
    delete modelTasks.asrTimestamps["sensevoice-small"];
    render(api);
    expect(select().value).toBe("unknown");
    modelTasks.asrTimestamps["sensevoice-small"] = false;
    render(api);
    expect(select().value).toBe("unsupported");
    render({ ...api, modelRef: "whisper-base-timestamped" });
    expect(select().value).toBe("supported");
  } finally {
    modelTasks.asrTimestamps["sensevoice-small"] = original;
    act(() => root.unmount());
    node.remove();
  }
});

test("external ASR over localhost can override timestamp support and restores the saved choice", () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node),
    changed = jest.fn();
  const api = {
    apiType: "Plugin",
    sourceType: "local",
    url: "http://localhost:9000",
    provider: {
      implementation: { kind: "script" },
      capabilities: { transcribe: {} },
    },
  };
  try {
    act(() =>
      root.render(
        <AsrDurationSetting
          api={api}
          onChange={jest.fn()}
          onTimestampChange={changed}
        />
      )
    );
    let select = node.querySelector('select[name="asrTimestampSupport"]');
    expect(select.disabled).toBe(false);
    expect(select.value).toBe("auto");
    act(() => Simulate.change(select, { target: { value: "supported" } }));
    expect(changed).toHaveBeenCalledWith("supported");
    act(() =>
      root.render(
        <AsrDurationSetting
          api={{ ...api, asrTimestampSupport: "supported" }}
          onChange={jest.fn()}
          onTimestampChange={changed}
        />
      )
    );
    select = node.querySelector('select[name="asrTimestampSupport"]');
    expect(select.value).toBe("supported");
  } finally {
    act(() => root.unmount());
    node.remove();
  }
});

test.each([undefined, 30, 600])(
  "service timeout shows a default of 120 and preserves the saved value %s",
  async (httpTimeout) => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const onChange = jest.fn();
    try {
      await act(async () =>
        root.render(
          <ServiceTimeoutSetting api={{ httpTimeout }} onChange={onChange} />
        )
      );
      const input = node.querySelector('input[name="httpTimeout"]');
      expect(input.value).toBe(String(httpTimeout ?? 120));
      expect([input.min, input.max]).toEqual(["1", "600"]);
      for (const value of [1, 600]) {
        await act(async () =>
          Simulate.change(input, { target: { value: String(value) } })
        );
        expect(onChange).toHaveBeenLastCalledWith(value);
      }
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  }
);
