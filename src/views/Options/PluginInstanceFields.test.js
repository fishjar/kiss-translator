import { invokeService } from "../../providers/serviceRuntime";
import { getSettingWithDefault } from "../../libs/storage";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import PluginInstanceFields, { ProviderSettings } from "./PluginInstanceFields";
import SensitiveTextField from "./SensitiveTextField";
import { ConfirmProvider } from "../../hooks/Confirm";

jest.mock("../../providers/serviceRuntime", () => ({
  invokeService: jest.fn(),
}));
jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../providers/sceneInvocation", () => ({
  invokeScene: jest.fn(),
}));
jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock("../../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mockUiLang = "zh";
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n(mockUiLang),
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: { uiLang: mockUiLang },
    updateSetting: mockUpdateSetting,
  }),
}));
const mockUpdateSetting = jest.fn();
jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));
jest.mock("../../libs/browser", () => ({
  browser: {
    storage: {
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  },
}));
jest.mock("./PluginPromptSettings", () => () => null);
jest.mock("./CapabilityOptions", () => () => null);
jest.mock("./ServiceUpgrade", () => ({ ServiceUpgradeAction: () => null }));
const api = {
  apiSlug: "one",
  apiName: "Chat",
  apiType: "Plugin",
  enabledCapabilities: ["chat"],
  pluginConfig: { baseUrl: "https://api.invalid/v1" },
  provider: {
    apiVersion: 1,
    name: "Chat",
    implementation: { kind: "script" },
    code: "exports.chat = () => ({text:'ok'})",
    capabilities: { chat: { handler: "chat" } },
    settings: [{ key: "baseUrl", type: "text", label: "API 地址" }],
    permissions: { endpointFields: ["baseUrl"] },
  },
};
const button = (text) =>
  [...document.querySelectorAll("button")].find(
    (item) => item.textContent === text
  );
let root, container, deleteApi;
beforeEach(() => {
  mockUiLang = "zh";
  jest.clearAllMocks();
  mockUpdateSetting.mockReset();
  mockUpdateSetting.mockResolvedValue(undefined);
  deleteApi = jest.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(value = api) {
  await act(async () =>
    root.render(
      <ConfirmProvider>
        <PluginInstanceFields api={value} deleteApi={deleteApi} />
      </ConfirmProvider>
    )
  );
}
test("services can be tested without local authorization", async () => {
  await render();
  expect(container.textContent).not.toContain("前往授权");
  expect(button("执行测试").disabled).toBe(false);
  await render({
    ...api,
    pluginConfig: { baseUrl: "https://new.invalid:8443/v2" },
  });
  expect(button("执行测试").disabled).toBe(false);
});

test("service configuration hides declared Origin rewriting domains", async () => {
  await render({
    ...api,
    provider: {
      ...api.provider,
      permissions: {
        network: ["https://api.invalid"],
        originRewrite: ["https://api.invalid"],
      },
    },
  });
  expect(container.textContent).not.toContain("https://api.invalid");
  expect(mockUpdateSetting).not.toHaveBeenCalled();
});

test("changing the model preserves explicitly disabled capabilities", async () => {
  const disabled = {
    ...api,
    enabledCapabilities: [],
    pluginConfig: { model: "first" },
    provider: {
      ...api.provider,
      settings: [{ key: "model", type: "text", label: "Model" }],
      models: [{ id: "first" }, { id: "second" }],
    },
  };
  await render(disabled);
  await act(async () =>
    Simulate.change(container.querySelector('input[role="combobox"]'), {
      target: { value: "second" },
    })
  );
  await act(async () => button("保存").click());
  expect(mockUpdateSetting).toHaveBeenCalled();
  const saved = mockUpdateSetting.mock.calls[0][0]({ transApis: [disabled] });
  expect(saved.transApis[0].pluginConfig.model).toBe("second");
  expect(saved.transApis[0].enabledCapabilities).toEqual([]);
});

test("service operations have no authorization action and deletion uses a cancellable MUI dialog", async () => {
  await render();
  await act(async () => button("接口操作").click());
  expect(document.body.textContent).not.toContain("授权实现与网络");
  const remove = () =>
    [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === "删除服务"
    );
  await act(async () => remove().click());
  expect(document.querySelector('[role="dialog"]').textContent).toContain(
    "删除此服务实例？"
  );
  expect(button("接口操作").disabled).toBe(true);
  await act(async () =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((item) => item.textContent === "取消")
      .click()
  );
  expect(deleteApi).not.toHaveBeenCalled();
  await act(async () => button("接口操作").click());
  await act(async () => remove().click());
  await act(async () => button("确定").click());
  expect(deleteApi).toHaveBeenCalledWith("one");
});

test("the cancel button still cancels an active service test", async () => {
  getSettingWithDefault.mockResolvedValue({
    transApis: [api],
    prompts: [],
    subtitleSetting: {},
  });
  let reject;
  const cancel = jest.fn(() => reject(new Error("cancelled")));
  invokeService.mockReturnValue({
    result: new Promise((_, failure) => {
      reject = failure;
    }),
    events: (async function* () {})(),
    cancel,
  });
  await render();
  await act(async () => button("执行测试").click());
  expect(invokeService).toHaveBeenCalledTimes(1);
  expect(button("测试中…").disabled).toBe(true);
  expect(container.textContent).toContain("已用");
  expect(
    button("测试中…").querySelector('[role="progressbar"]')
  ).not.toBeNull();
  await act(async () => button("取消").click());
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(button("执行测试").disabled).toBe(false);
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(container.textContent).toContain("总耗时");
});

test.each(["success", "failure"])(
  "test loading starts before saved configuration resolves and clears on %s",
  async (outcome) => {
    let loaded, finish, fail;
    getSettingWithDefault.mockReturnValue(
      new Promise((resolve) => {
        loaded = resolve;
      })
    );
    invokeService.mockReturnValue({
      result: new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
      events: (async function* () {})(),
      cancel: jest.fn(),
    });
    await render();
    await act(async () => button("执行测试").click());
    expect(button("测试中…").getAttribute("aria-busy")).toBe("true");
    expect(
      button("测试中…").querySelector('[role="progressbar"]')
    ).not.toBeNull();
    expect(button("取消").disabled).toBe(false);
    expect(invokeService).not.toHaveBeenCalled();
    await act(async () =>
      loaded({ transApis: [api], prompts: [], subtitleSetting: {} })
    );
    expect(button("测试中…").disabled).toBe(true);
    await act(async () => {
      if (outcome === "success") finish({ text: "Test completed" });
      else fail(new Error("Test failed"));
    });
    expect(button("执行测试").disabled).toBe(false);
    expect(button("取消").disabled).toBe(true);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).toContain(
      outcome === "success" ? "Test completed" : "Test failed"
    );
  }
);

test("translation quick test stays available while chat is selected and uses edited configuration", async () => {
  const translatedApi = {
    ...api,
    enabledCapabilities: ["chat", "translate"],
    provider: {
      ...api.provider,
      capabilities: {
        chat: { handler: "chat" },
        translate: { handler: "translate" },
      },
    },
  };
  invokeService.mockReturnValue({
    result: Promise.resolve({ items: [{ id: "0", text: "你好" }] }),
    events: (async function* () {})(),
    cancel: jest.fn(),
  });
  await render(translatedApi);
  const input = container.querySelector(
    'input[value="https://api.invalid/v1"]'
  );
  await act(async () =>
    Simulate.change(input, { target: { value: "https://edited.invalid/v1" } })
  );
  await act(async () => button("快捷翻译测试").click());
  expect(invokeService).toHaveBeenCalledWith(
    expect.objectContaining({
      pluginConfig: { baseUrl: "https://edited.invalid/v1" },
    }),
    "translate",
    expect.any(Object),
    expect.any(Object)
  );
  expect(getSettingWithDefault).not.toHaveBeenCalled();
});

test("nontranslation plugins have no quick translation action", async () => {
  await render();
  expect(button("快捷翻译测试")).toBeUndefined();
});

test("standard thinking fields use shared selects and show effort only when enabled", async () => {
  const thinkingApi = {
    ...api,
    pluginConfig: {
      ...api.pluginConfig,
      thinkingMode: "disabled",
      thinkingEffort: "high",
    },
    provider: {
      ...api.provider,
      settings: [
        ...api.provider.settings,
        {
          key: "thinkingMode",
          type: "select",
          defaultValue: "disabled",
          options: ["auto", "enabled", "disabled"].map((value) => ({ value })),
        },
        {
          key: "thinkingEffort",
          type: "select",
          defaultValue: "high",
          options: ["low", "high", "_default"].map((value) => ({ value })),
        },
      ],
    },
  };
  await render(thinkingApi);
  expect(container.querySelectorAll('input[name="thinkingMode"]')).toHaveLength(
    1
  );
  expect(container.querySelector('input[name="thinkingEffort"]')).toBeNull();
  await act(async () =>
    Simulate.change(container.querySelector('input[name="thinkingMode"]'), {
      target: { value: "enabled" },
    })
  );
  expect(container.querySelector('input[name="thinkingEffort"]').value).toBe(
    "_default"
  );
  await act(async () =>
    Simulate.change(container.querySelector('input[name="thinkingEffort"]'), {
      target: { value: "_default" },
    })
  );
  expect(container.querySelector('input[name="thinkingEffort"]').value).toBe(
    "_default"
  );
  await act(async () =>
    Simulate.change(container.querySelector('input[name="thinkingMode"]'), {
      target: { value: "auto" },
    })
  );
  expect(container.querySelector('input[name="thinkingEffort"]')).toBeNull();
});

test("missing required credentials are saved before a modal warning, without clearing hidden or empty fields", async () => {
  const incomplete = {
    ...api,
    pluginConfig: { ...api.pluginConfig, apiKey: "", hidden: "keep" },
    provider: {
      ...api.provider,
      settings: [
        ...api.provider.settings,
        {
          key: "apiKey",
          label: "API Key",
          type: "password",
          required: true,
          isSecret: true,
        },
        { key: "hidden", type: "text", visibleForCapabilities: ["translate"] },
      ],
    },
  };
  let complete;
  mockUpdateSetting.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  await render(incomplete);
  expect(container.textContent).not.toContain("请填写必填配置");
  await act(async () =>
    Simulate.change(container.querySelector('input[name="apiName"]'), {
      target: { value: "Renamed" },
    })
  );
  await act(async () => button("保存").click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const saved = mockUpdateSetting.mock.calls[0][0]({
    transApis: [incomplete],
    keep: true,
  });
  expect(saved).toMatchObject({
    keep: true,
    transApis: [
      {
        apiName: "Renamed",
        pluginConfig: {
          apiKey: "",
          hidden: "keep",
          baseUrl: "https://api.invalid/v1",
        },
      },
    ],
  });
  await act(async () => complete());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("配置已保存");
  expect(dialog.textContent).toContain("API Key 未填写");
  expect(dialog.querySelectorAll("button")).toHaveLength(1);
  await act(async () => button("知道了").click());
  expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
  expect(button("保存").disabled).toBe(true);
  await render(saved.transApis[0]);
  expect(container.querySelector('input[name="apiName"]').value).toBe(
    "Renamed"
  );
});

test("out-of-range plugin numbers remain unchanged when saved", async () => {
  const numeric = {
    ...api,
    pluginConfig: { ...api.pluginConfig, temperature: 0 },
    provider: {
      ...api.provider,
      settings: [
        ...api.provider.settings,
        {
          key: "temperature",
          label: "采样温度",
          type: "number",
          min: 0,
          max: 2,
        },
      ],
    },
  };
  await render(numeric);
  await act(async () =>
    Simulate.change(container.querySelector('input[type="number"]'), {
      target: { value: "5" },
    })
  );
  await act(async () => button("保存").click());
  const saved = mockUpdateSetting.mock.calls[0][0]({ transApis: [numeric] });
  expect(saved.transApis[0].pluginConfig.temperature).toBe(5);
  expect(document.querySelector('[role="dialog"]').textContent).toContain(
    "采样温度 数值超出"
  );
});

test("storage errors use a modal and retain drafts for retry; valid saves have no warning", async () => {
  await render();
  await act(async () =>
    Simulate.change(container.querySelector('input[name="apiName"]'), {
      target: { value: "Retry me" },
    })
  );
  mockUpdateSetting.mockRejectedValueOnce(new Error("写入失败"));
  await act(async () => button("保存").click());
  expect(document.querySelector('[role="dialog"]').textContent).toContain(
    "保存失败"
  );
  expect(container.querySelector('input[name="apiName"]').value).toBe(
    "Retry me"
  );
  expect(button("保存").disabled).toBe(false);
  await act(async () => button("知道了").click());
  await act(async () => button("保存").click());
  expect(mockUpdateSetting).toHaveBeenCalledTimes(2);
  expect(document.querySelector("#service-feedback-title")).toBeNull();
  expect(button("保存").disabled).toBe(true);
});

test.each(["builtin", "password", "secret text"])(
  "%s key reveals on focus and masks on blur without changing its value",
  (kind) => {
    const onChange = jest.fn();
    function Form() {
      const [value, setValue] = useState("original-key");
      const change = (next) => {
        onChange(next);
        setValue(next);
      };
      return kind === "builtin" ? (
        <SensitiveTextField
          label="API Key"
          value={value}
          onChange={(event) => change(event.target.value)}
        />
      ) : (
        <ProviderSettings
          fields={[
            {
              key: "apiKey",
              label: "API Key",
              type: kind === "password" ? "password" : "text",
              isSecret: true,
            },
          ]}
          values={{ apiKey: value }}
          onChange={(_, next) => change(next)}
        />
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Form />));
    const input = container.querySelector("input");
    expect(input.value).toBe("•".repeat(12));
    act(() => Simulate.focus(input));
    expect(input.value).toBe("original-key");
    expect(input.type).toBe("text");
    act(() => Simulate.change(input, { target: { value: "edited-key" } }));
    act(() => Simulate.blur(input));
    expect(input.value).toBe("•".repeat(10));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("edited-key");
    act(() => Simulate.focus(input));
    expect(input.value).toBe("edited-key");
    act(() => root.unmount());
    container.remove();
  }
);

test("English forms localize plugin fields and capability labels without changing configuration", async () => {
  mockUiLang = "en";
  const localized = {
    ...api,
    apiName: "文本生成与翻译",
    provider: {
      ...api.provider,
      name: "文本生成与翻译",
      source: {
        ...api.provider.source,
        external: true,
        pluginName: "OpenAI 兼容协议示例",
      },
      settings: [
        { key: "baseUrl", label: "API 基础地址（包含 /v1）", type: "text" },
        {
          key: "voice",
          label: "Original voice",
          labelI18n: { en: "Voice" },
          type: "select",
          options: [
            {
              value: "alloy",
              label: "原始选项",
              labelI18n: { en: "Alloy voice" },
            },
          ],
        },
      ],
    },
    pluginConfig: { baseUrl: "https://custom.invalid/v1", voice: "alloy" },
  };
  const before = JSON.stringify(localized);
  await render(localized);
  expect(container.textContent).toContain("Text generation and translation");
  expect(container.textContent).toContain(
    "Plugin interfaces · OpenAI-compatible example"
  );
  expect(container.textContent).toContain("API base URL (including /v1)");
  expect(container.textContent).toContain("Chat");
  expect(container.textContent).toContain("Alloy voice");
  expect(container.textContent).toContain("Save");
  expect(container.querySelector('input[name="apiName"]').value).toBe(
    "文本生成与翻译"
  );
  expect(JSON.stringify(localized)).toBe(before);
  expect(mockUpdateSetting).not.toHaveBeenCalled();
});

test("external service timeout is a saved service option, separate from pluginConfig", async () => {
  await render();
  const input = container.querySelector('input[name="httpTimeout"]');
  expect(input.value).toBe("120");
  expect([input.min, input.max]).toEqual(["1", "600"]);
  await act(async () => Simulate.change(input, { target: { value: "600" } }));
  await act(async () => button("保存").click());
  const saved = mockUpdateSetting.mock.calls[0][0]({ transApis: [api] });
  expect(saved.transApis[0].httpTimeout).toBe(600);
  expect(saved.transApis[0].pluginConfig).toEqual(api.pluginConfig);
});

test("plugin TTS selects and saves its declared voice for capability tests", async () => {
  const speechApi = {
    ...api,
    enabledCapabilities: ["synthesizeSpeech"],
    pluginConfig: { voice: "alloy" },
    provider: {
      ...api.provider,
      capabilities: { synthesizeSpeech: { handler: "synthesizeSpeech" } },
      settings: [
        {
          key: "voice",
          label: "音色",
          type: "select",
          required: true,
          options: [
            { value: "alloy", label: "Alloy" },
            { value: "nova", label: "Nova" },
          ],
        },
      ],
    },
  };
  await render(speechApi);
  const select = [...container.querySelectorAll('[role="combobox"]')].find(
    (item) => item.textContent === "Alloy"
  );
  await act(async () => Simulate.mouseDown(select, { button: 0 }));
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent === "Nova"
  );
  await act(async () => option.click());
  await act(async () => button("保存").click());
  const saved = mockUpdateSetting.mock.calls[0][0]({ transApis: [speechApi] })
    .transApis[0];
  expect(saved.pluginConfig.voice).toBe("nova");
  await render(saved);
  expect(
    [...container.querySelectorAll('[role="combobox"]')].some(
      (item) => item.textContent === "Nova"
    )
  ).toBe(true);
  getSettingWithDefault.mockResolvedValue({
    transApis: [saved],
    prompts: [],
    subtitleSetting: {},
  });
  invokeService.mockReturnValue({
    result: Promise.resolve({}),
    events: (async function* () {})(),
    cancel: jest.fn(),
  });
  await act(async () => button("执行测试").click());
  expect(invokeService).toHaveBeenCalledWith(
    expect.objectContaining({ pluginConfig: { voice: "nova" } }),
    "synthesizeSpeech",
    expect.objectContaining({ text: "Hello" }),
    expect.anything()
  );
});

test("summary capability test supplies the saved scene template pair", async () => {
  const summaryApi = {
    ...api,
    enabledCapabilities: ["summarize"],
    provider: {
      ...api.provider,
      capabilities: { summarize: { handler: "summarize" } },
    },
  };
  getSettingWithDefault.mockResolvedValue({
    transApis: [summaryApi],
    prompts: [
      {
        slug: "summary-scene",
        category: "summary prompt",
        systemPrompt: "",
        userPrompt: "Scene {{transcript}}",
      },
    ],
    subtitleSetting: { summaryPromptSlug: "summary-scene" },
  });
  invokeService.mockReturnValue({
    result: Promise.resolve({ text: "Summary" }),
    events: (async function* () {})(),
    cancel: jest.fn(),
  });
  await render(summaryApi);
  await act(async () => button("执行测试").click());
  expect(invokeService.mock.calls[0][2]).toMatchObject({
    instructions: "",
    userPrompt: "Scene {{transcript}}",
  });
});

test("the bare model Autocomplete popper mounts inside the .kt-m3-root scope", () => {
  // 弹层默认 portal 到 body，脱离 .kt-m3-root 令牌作用域后选中态
  // var(--kt-secc)/var(--kt-onsecc) 不可达；须与 ReusableAutocomplete
  // 同回退链挂回根内。
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  document.body.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  act(() =>
    popperRoot.render(
      <ProviderSettings
        service={{ modelField: "model", models: [{ id: "m1" }] }}
        fields={[{ key: "model", label: "Model", type: "text" }]}
        values={{ model: "" }}
        onChange={jest.fn()}
      />
    )
  );
  const input = mount.querySelector("input");
  act(() => Simulate.mouseDown(input, { button: 0 }));
  const popper = document.querySelector(".kt-autocomplete-popper");
  expect(popper).toBeTruthy();
  expect(popper.parentElement).toBe(wrapper);
  act(() => popperRoot.unmount());
  wrapper.remove();
});

test("the model popper styles inject into the shadow root when the field lives in a shadow tree", () => {
  // ProviderSettings 位于影子树内时，head 注入体不级联进影子根：注入目标
  // 必须随字段节点所属根走（getRootNode），选中/聚焦/圆角规则才能在影子
  // 树内的弹层上生效。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  act(() =>
    popperRoot.render(
      <ProviderSettings
        service={{ modelField: "model", models: [{ id: "m1" }] }}
        fields={[{ key: "model", label: "Model", type: "text" }]}
        values={{ model: "" }}
        onChange={jest.fn()}
      />
    )
  );
  const input = mount.querySelector("input");
  act(() => Simulate.mouseDown(input, { button: 0 }));
  // 弹层挂回影子根内的 .kt-m3-root，注入体落在同一影子根（head 零泄漏）。
  const popper = shadow.querySelector(".kt-autocomplete-popper");
  expect(popper).toBeTruthy();
  expect(popper.parentElement).toBe(wrapper);
  const injected = shadow.querySelector("#kt-autocomplete-styles");
  expect(injected).toBeTruthy();
  expect(injected.textContent).toContain('[aria-selected="true"]');
  expect(injected.textContent).toContain("border-radius: 8px");
  act(() => popperRoot.unmount());
  host.remove();
});

test("the model popper emotion styles mount inside the shadow root via a per-root cache", () => {
  // 弹层经 container portal 回影子根后，其 Paper/Listbox 的 emotion 规则
  // 若仍由 head 默认缓存产出则不级联进影子树：组件树必须整体包进以影子根
  // 为 container 的专属缓存，样式注入目标与弹层挂载点同根。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  try {
    act(() =>
      popperRoot.render(
        <ProviderSettings
          service={{ modelField: "model", models: [{ id: "m1" }] }}
          fields={[{ key: "model", label: "Model", type: "text" }]}
          values={{ model: "" }}
          onChange={jest.fn()}
        />
      )
    );
    const input = mount.querySelector("input");
    act(() => Simulate.mouseDown(input, { button: 0 }));
    const popper = shadow.querySelector(".kt-autocomplete-popper");
    expect(popper).toBeTruthy();
    const shadowEmotionStyles = shadow.querySelectorAll(
      'style[data-emotion="kt-aut-popper"]'
    );
    expect(shadowEmotionStyles.length).toBeGreaterThan(0);
  } finally {
    act(() => popperRoot.unmount());
    host.remove();
  }
});

test("injects the pseudo-dropdown styles when the model field arrives after mount", () => {
  // 模型字段随 fields 异步到达（如 service 配置迟加载）：注入 effect 必须
  // 随 fields 重跑，否则晚到的模型 Autocomplete 弹层选中态规则整体缺注入。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  try {
    act(() =>
      popperRoot.render(
        <ProviderSettings
          service={{ modelField: "model", models: [{ id: "m1" }] }}
          fields={[]}
          values={{ model: "" }}
          onChange={jest.fn()}
        />
      )
    );
    act(() =>
      popperRoot.render(
        <ProviderSettings
          service={{ modelField: "model", models: [{ id: "m1" }] }}
          fields={[{ key: "model", label: "Model", type: "text" }]}
          values={{ model: "" }}
          onChange={jest.fn()}
        />
      )
    );
    const input = mount.querySelector("input");
    act(() => Simulate.mouseDown(input, { button: 0 }));
    const popper = shadow.querySelector(".kt-autocomplete-popper");
    expect(popper).toBeTruthy();
    const injected = shadow.querySelector("#kt-autocomplete-styles");
    expect(injected).toBeTruthy();
    expect(injected.textContent).toContain('[aria-selected="true"]');
  } finally {
    act(() => popperRoot.unmount());
    host.remove();
  }
});

test("select menu lands in the shadow root and delivers focus without a silent marker", async () => {
  // 影子宿主场景：select 菜单默认 portal 到 body，与影子缓存注入的样式
  // 异根（样式不级联出影子边界即失活）；菜单 DOM 须挂回影子根。菜单入
  // 影子根后 MUI 自持焦点链关掉，初始焦点经 focusMenuTarget→scriptFocus
  // 交付到选中项。真键盘开启（无指针交互）下 scriptFocus 不挂静默标记。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  try {
    act(() =>
      popperRoot.render(
        <ProviderSettings
          service={{ modelField: "model", models: [{ id: "m1" }] }}
          fields={[
            { key: "model", label: "Model", type: "text" },
            {
              key: "mode",
              label: "Mode",
              type: "select",
              options: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ],
            },
          ]}
          values={{ model: "", mode: "b" }}
          onChange={jest.fn()}
        />
      )
    );
    const trigger = mount.querySelector('div[role="combobox"]');
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    // Grow 'auto' 过渡在 jsdom 经 rAF + 定时器收尾：开面板独立 act 后留出
    // 真实时钟，让 onEntered（TransitionProps 初始焦点交付）完整走完。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const listbox = shadow.querySelector('ul[role="listbox"]');
    expect(listbox).not.toBeNull();
    // 菜单 DOM 落影子根：body 零泄漏。
    expect(document.querySelector('ul[role="listbox"]')).toBeNull();
    const focused = shadow.activeElement;
    expect(focused).not.toBeNull();
    expect(focused.getAttribute("role")).toBe("option");
    expect(focused.getAttribute("aria-selected")).toBe("true");
    expect(focused.textContent).toBe("B");
    expect(focused.hasAttribute("data-kt-focus-silent")).toBe(false);
  } finally {
    await act(async () => popperRoot.unmount());
    host.remove();
  }
});

test("arrow keys navigate shadow-rooted menus option by option", async () => {
  // 影子树内 document.activeElement＝影子宿主，MUI MenuList 的方向键导航
  // 读不到真实焦点（每次回卷首项）；影子口径捕获处理器接管后须逐项移动。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  try {
    act(() =>
      popperRoot.render(
        <ProviderSettings
          fields={[
            {
              key: "mode",
              label: "Mode",
              type: "select",
              options: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
                { value: "c", label: "C" },
              ],
            },
          ]}
          values={{ mode: "b" }}
          onChange={jest.fn()}
        />
      )
    );
    const trigger = mount.querySelector('div[role="combobox"]');
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const focused = shadow.activeElement;
    expect(focused.getAttribute("role")).toBe("option");
    expect(focused.textContent).toBe("B");
    act(() =>
      focused.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(shadow.activeElement.textContent).toBe("C");
    act(() =>
      shadow.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(shadow.activeElement.textContent).toBe("A");
  } finally {
    await act(async () => popperRoot.unmount());
    host.remove();
  }
});

test("select menu still lands in the shadow root after another select field unmounts", async () => {
  // 纯 select 面（无模型字段实例）同样接入影子缓存与菜单容器解析；
  // 首个 select 字段卸载不得让剩余字段的菜单容器解析失效（共享 ref
  // 在卸载时被清空）。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  const selectA = {
    key: "modeA",
    label: "Mode A",
    type: "select",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  };
  const selectB = {
    key: "modeB",
    label: "Mode B",
    type: "select",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  };
  try {
    act(() =>
      popperRoot.render(
        <ProviderSettings
          fields={[selectA, selectB]}
          values={{ modeA: "b", modeB: "b" }}
          onChange={jest.fn()}
        />
      )
    );
    // 卸载首个 select 字段，剩余字段继续服务。
    act(() =>
      popperRoot.render(
        <ProviderSettings
          fields={[selectB]}
          values={{ modeB: "b" }}
          onChange={jest.fn()}
        />
      )
    );
    const trigger = mount.querySelector('div[role="combobox"]');
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    // 剩余字段的菜单仍落影子根：body 零泄漏。
    expect(shadow.querySelector('ul[role="listbox"]')).not.toBeNull();
    expect(document.querySelector('ul[role="listbox"]')).toBeNull();
  } finally {
    await act(async () => popperRoot.unmount());
    host.remove();
  }
});

test("select menu keeps the document portal and default focus in non-shadow topology", async () => {
  // 非影子路径回归：MenuProps 三键不声明，菜单照常 portal 到 body，
  // MUI 默认焦点行为不变（MenuList autofocus 聚焦选中项）。
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  document.body.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  try {
    act(() =>
      popperRoot.render(
        <ProviderSettings
          service={{ modelField: "model", models: [{ id: "m1" }] }}
          fields={[
            {
              key: "mode",
              label: "Mode",
              type: "select",
              options: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ],
            },
          ]}
          values={{ mode: "b" }}
          onChange={jest.fn()}
        />
      )
    );
    const trigger = mount.querySelector('div[role="combobox"]');
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const listbox = document.querySelector('ul[role="listbox"]');
    expect(listbox).not.toBeNull();
    const focused = document.activeElement;
    expect(focused).not.toBeNull();
    expect(focused.getAttribute("role")).toBe("option");
    expect(focused.getAttribute("aria-selected")).toBe("true");
  } finally {
    await act(async () => popperRoot.unmount());
    wrapper.remove();
  }
});

test("modelField switch from invalid to valid re-runs the injection effects", () => {
  // modelField 无效→有效切换时 fields 不变：effect 缺 service.modelField
  // 依赖则不重跑，字段换型（text → Autocomplete）后注入与影子缓存缺位。
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "kt-m3-root";
  shadow.append(wrapper);
  const mount = document.createElement("div");
  wrapper.append(mount);
  const popperRoot = createRoot(mount);
  try {
    const baseProps = {
      fields: [{ key: "model", label: "Model", type: "text" }],
      values: { model: "" },
      onChange: jest.fn(),
    };
    act(() =>
      popperRoot.render(
        <ProviderSettings
          {...baseProps}
          service={{ modelField: "nonexistent", models: [{ id: "m1" }] }}
        />
      )
    );
    // modelField 与字段键不匹配：模型字段以普通文本框渲染，无 Autocomplete、
    // 无注入。
    expect(mount.querySelector(".kt-autocomplete-popper")).toBeNull();
    expect(mount.querySelector('input[role="combobox"]')).toBeNull();
    expect(shadow.querySelector("#kt-autocomplete-styles")).toBeNull();
    act(() =>
      popperRoot.render(
        <ProviderSettings
          {...baseProps}
          service={{ modelField: "model", models: [{ id: "m1" }] }}
        />
      )
    );
    // service.modelField 变化（fields 不变）触发 effect 重跑：Autocomplete
    // 挂载且注入体落影子根。
    const modelInput = mount.querySelector('input[role="combobox"]');
    expect(modelInput).not.toBeNull();
    act(() => Simulate.mouseDown(modelInput, { button: 0 }));
    expect(shadow.querySelector(".kt-autocomplete-popper")).toBeTruthy();
    const injected = shadow.querySelector("#kt-autocomplete-styles");
    expect(injected).toBeTruthy();
    expect(injected.textContent).toContain('[aria-selected="true"]');
  } finally {
    act(() => popperRoot.unmount());
    host.remove();
  }
});
