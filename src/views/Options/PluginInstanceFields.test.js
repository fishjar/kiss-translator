import { invokeService } from "../../providers/serviceRuntime";
import { getSettingWithDefault } from "../../libs/storage";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import PluginInstanceFields, { ProviderSettings } from "./PluginInstanceFields";
import SensitiveTextField from "./SensitiveTextField";
import { ConfirmProvider } from "../../hooks/Confirm";
import { browser } from "../../libs/browser";
import { approvedProviderOrigins } from "../../providers/grants";

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
jest.mock("../../providers/grants", () => ({
  approvedProviderOrigins: jest.fn(),
  providerGrantKey: (id) => `kiss-provider-plugin-grant:${id}`,
  providerPluginId: () => "example",
  PLUGIN_GRANT_PREFIX: "kiss-provider-plugin-grant:",
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
    apiVersion: "1",
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
  approvedProviderOrigins.mockRejectedValue(
    Object.assign(new Error("未授权"), { code: "PERMISSION_REQUIRED" })
  );
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
test("unauthorized services show the plugin link, disable tests and refresh after plugin approval", async () => {
  await render();
  expect(container.textContent).toContain("请前往接口插件授权");
  expect(button("执行测试").disabled).toBe(true);
  await act(async () => button("前往授权").click());
  expect(window.location.hash).toBe("#/plugins?plugin=example");
  approvedProviderOrigins.mockResolvedValue(new Set());
  await act(async () =>
    browser.storage.onChanged.addListener.mock.calls.at(-1)[0](
      { "kiss-provider-plugin-grant:example": { newValue: {} } },
      "local"
    )
  );
  expect(container.textContent).not.toContain("请前往接口插件授权");
  expect(button("执行测试").disabled).toBe(false);
  await render({
    ...api,
    pluginConfig: { baseUrl: "https://new.invalid:8443/v2" },
  });
  expect(button("执行测试").disabled).toBe(false);
  expect(container.textContent).not.toContain("本机网络授权");
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

test("revoking the shared definition cancels an active service test", async () => {
  approvedProviderOrigins.mockResolvedValue(new Set());
  getSettingWithDefault.mockResolvedValue({
    transApis: [api],
    prompts: [],
    subtitleSetting: {},
  });
  let reject;
  const cancel = jest.fn(() => reject(new Error("已撤销授权")));
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
  approvedProviderOrigins.mockRejectedValue(
    Object.assign(new Error("未授权"), { code: "PERMISSION_REQUIRED" })
  );
  await act(async () =>
    browser.storage.onChanged.addListener.mock.calls.at(-1)[0](
      {
        "kiss-provider-plugin-grant:example": {
          newValue: undefined,
        },
      },
      "local"
    )
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(button("执行测试").disabled).toBe(true);
});

test("translation quick test stays available while chat is selected and uses edited configuration", async () => {
  approvedProviderOrigins.mockResolvedValue(new Set());
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
    "External plugin · OpenAI-compatible example"
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
