jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../providers/sceneInvocation", () => ({
  invokeScene: jest.fn(),
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light" }),
}));
jest.mock("../../hooks/SystemColorScheme", () => ({
  useSystemDarkPreference: () => false,
}));
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import AddServiceMenu from "./AddServiceMenu";
import OptionsTheme from "./OptionsTheme";
import { ProviderSettings } from "./PluginInstanceFields";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.crypto ||= require("crypto").webcrypto;
const mockPackages = [];
const mockSetting = { providerPlugins: [] };
jest.mock("../../hooks/ProviderPackages", () => ({
  useProviderPackages: () => ({ packages: mockPackages, error: "" }),
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: mockSetting }),
}));

const service = {
  id: "text",
  name: "Text",
  implementation: { kind: "script", entry: "text.js" },
  capabilities: {
    chat: { handler: "chat", outputModes: ["complete", "stream"] },
  },
  settings: [
    {
      key: "token",
      label: "Token",
      type: "password",
      isSecret: true,
      required: true,
    },
    { key: "model", label: "Model", type: "text", required: true },
  ],
  models: [{ id: "first", name: "First" }],
};

test("external submenu adds a default snapshot without authorization and disables synced missing packages", async () => {
  mockPackages.push({
    id: "installed",
    manifest: {
      manifestVersion: 1,
      apiVersion: "1",
      id: "installed",
      name: "Installed",
      version: "1.0.0",
      services: [service],
    },
    implementations: { text: "exports.chat=()=>({text:'ok'})" },
  });
  mockSetting.providerPlugins = [
    { pluginId: "missing", name: "Missing", services: [service] },
  ];
  const onSelect = jest.fn();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Harness() {
    const [anchor, setAnchor] = useState(null);
    return (
      <div className="kt-m3-root">
        <button onClick={(event) => setAnchor(event.currentTarget)}>Add</button>
        <AddServiceMenu
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          onSelect={onSelect}
        />
      </div>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => Simulate.click(node.querySelector("button")));
    const parent = Array.from(node.querySelectorAll('[role="menuitem"]')).find(
      (item) => item.textContent === "插件接口"
    );
    await act(async () => Simulate.keyDown(parent, { key: "ArrowRight" }));
    const children = Array.from(
      node
        .querySelector('[aria-label="插件接口"]')
        .querySelectorAll('[role="menuitem"]')
    );
    expect(
      children
        .find((item) => item.textContent.includes("Missing"))
        .getAttribute("aria-disabled")
    ).toBe("true");
    await act(async () =>
      Simulate.click(
        children.find((item) => item.textContent.includes("Installed"))
      )
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    const api = onSelect.mock.calls[0][0];
    expect(api.pluginConfig).toEqual({ model: "first" });
    expect(api.useStream).toBe(true);
    expect(api.provider.code).toContain("exports.chat");
    expect(api.provider.models).toEqual(service.models);
  } finally {
    await act(async () => root.unmount());
    node.remove();
    mockPackages.length = 0;
    mockSetting.providerPlugins = [];
  }
});

test("plugin model field accepts a custom ID while ordinary enums retain their selector", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const onChange = jest.fn();
  try {
    await act(async () =>
      root.render(
        <ProviderSettings
          service={service}
          values={{ model: "first", voice: "a" }}
          onChange={onChange}
          fields={[
            service.settings[1],
            {
              key: "voice",
              label: "Voice",
              type: "select",
              options: [{ value: "a", label: "A" }],
            },
          ]}
        />
      )
    );
    const model = node.querySelector('input[role="combobox"]');
    await act(async () => {
      Simulate.change(model, { target: { value: "custom-model" } });
    });
    expect(onChange).toHaveBeenCalledWith("model", "custom-model");
    expect(node.querySelector('input[value="a"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});

test("submenu opens and switches on click under OptionsTheme", async () => {
  const onSelect = jest.fn();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);

  function Harness() {
    const [anchor, setAnchor] = useState(null);
    return (
      <OptionsTheme>
        <button
          id="add-btn"
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          Add
        </button>
        <AddServiceMenu
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          onSelect={onSelect}
        />
      </OptionsTheme>
    );
  }

  try {
    await act(async () => root.render(<Harness />));
    await act(async () => Simulate.click(node.querySelector("#add-btn")));

    // 点击一级菜单项展开二级子菜单
    const systemCategory = Array.from(
      document.querySelectorAll('[role="menuitem"]')
    ).find((item) => item.textContent.includes("系统服务"));
    expect(systemCategory).not.toBeNull();
    await act(async () => Simulate.click(systemCategory));

    let submenu = document.querySelector('[aria-label="系统服务"]');
    expect(submenu).not.toBeNull();
    const systemServices = Array.from(
      submenu.querySelectorAll('[role="menuitem"]')
    );
    expect(systemServices.length).toBeGreaterThan(0);

    // 点击其他分类切换二级子菜单
    const networkCategory = Array.from(
      document.querySelectorAll('[role="menuitem"]')
    ).find((item) => item.textContent.includes("网络接口"));
    await act(async () => Simulate.click(networkCategory));

    submenu = document.querySelector('[aria-label="网络接口"]');
    expect(submenu).not.toBeNull();
    const networkServices = Array.from(
      submenu.querySelectorAll('[role="menuitem"]')
    );
    expect(networkServices.length).toBeGreaterThan(0);

    // 点击二级菜单项完成选择
    await act(async () => Simulate.click(networkServices[0]));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#add-api-menu")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});
