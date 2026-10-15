jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: { uiLang: "zh" } }),
}));
import { act } from "react";
import { createRoot } from "react-dom/client";
import PluginAuthorization from "./PluginAuthorization";
import { ConfirmProvider } from "../../hooks/Confirm";
import { browser } from "../../libs/browser";
import {
  readPluginGrant,
  approvePlugin,
  revokePlugin,
} from "../../providers/grants";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));

jest.mock("../../libs/browser", () => ({
  browser: {
    storage: {
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  },
}));
jest.mock("../../providers/grants", () => ({
  providerPluginId: (api) => api.provider.source.pluginId,
  PLUGIN_GRANT_PREFIX: "kiss-provider-plugin-grant:",
  readPluginGrant: jest.fn(),
  approvePlugin: jest.fn(),
  revokePlugin: jest.fn(),
}));
jest.mock("../../components/ApiProviderIcon", () => () => null);
const old = {
  apiSlug: "one",
  provider: {
    id: "chat",
    name: "Chat",
    capabilities: { chat: { handler: "chat" } },
    code: "old",
    implementation: { kind: "script" },
    permissions: {
      network: ["https://fixed.invalid"],
      endpointFields: ["baseUrl"],
    },
    settings: [{ key: "baseUrl", label: "API 基础地址" }],
    source: { pluginId: "example", pluginName: "Example", version: "1.0.0" },
  },
};
let root, container;
const button = (text) =>
  [...document.querySelectorAll("button")].find(
    (item) => item.textContent === text
  );
beforeEach(() => {
  jest.clearAllMocks();
  readPluginGrant.mockResolvedValue(null);
  HTMLElement.prototype.scrollIntoView = jest.fn();
  window.location.hash = "#/plugins?plugin=example";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(instances = [old, { ...old, apiSlug: "two" }]) {
  await act(async () =>
    root.render(
      <ConfirmProvider>
        <PluginAuthorization packages={[]} instances={instances} />
      </ConfirmProvider>
    )
  );
}
test("missing-template snapshots are located and authorized with a real MUI dialog; cancelling has no effect", async () => {
  await render();
  expect(container.textContent).toContain("Example");
  expect(container.textContent).toContain("API 基础地址");
  expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
  await act(async () => button("授权").click());
  expect(document.querySelector('[role="dialog"]').textContent).toContain(
    "https://fixed.invalid"
  );
  await act(async () => button("取消").click());
  expect(approvePlugin).not.toHaveBeenCalled();
  await act(async () => button("授权").click());
  await act(async () => button("授权插件").click());
  expect(approvePlugin).toHaveBeenCalledTimes(1);
  readPluginGrant.mockResolvedValue({
    enabled: true,
    origins: ["https://fixed.invalid"],
  });
  await act(async () =>
    browser.storage.onChanged.addListener.mock.calls[0][0](
      { "kiss-provider-plugin-grant:example": { newValue: {} } },
      "local"
    )
  );
  expect(container.textContent).toContain("已授权");
});
test("revocation confirms the number of matching instances and targets the displayed snapshot", async () => {
  readPluginGrant.mockResolvedValue({
    enabled: true,
    origins: ["https://fixed.invalid"],
  });
  await render();
  await act(async () => button("撤销授权").click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("2 个关联实例");
  await act(async () =>
    [...dialog.querySelectorAll("button")]
      .find((item) => item.textContent === "撤销授权")
      .click()
  );
  expect(revokePlugin).toHaveBeenCalledTimes(1);
  expect(revokePlugin).toHaveBeenCalledWith("example");
});

test("versions merge into one card with deduplicated addresses, fields and services", async () => {
  const newer = {
    ...old,
    apiSlug: "new",
    provider: {
      ...old.provider,
      code: "changed",
      source: { ...old.provider.source, version: "2.0.0" },
    },
  };
  await render([old, newer]);
  expect(container.querySelectorAll(".MuiAccordion-root")).toHaveLength(1);
  expect(container.textContent.match(/https:\/\/fixed.invalid/g)).toHaveLength(
    1
  );
  expect(container.textContent.match(/API 基础地址/g)).toHaveLength(1);
  expect(
    [...container.querySelectorAll(".MuiChip-label")].filter(
      (item) => item.textContent === "Chat"
    )
  ).toHaveLength(1);
  expect(container.textContent).toContain("1.0.0、2.0.0");
  expect(container.querySelectorAll("span[id]")).toHaveLength(0);
});
test("new targets show partial authorization and confirmation adds the pending targets", async () => {
  readPluginGrant.mockResolvedValue({
    enabled: true,
    origins: ["https://fixed.invalid"],
  });
  const newer = {
    ...old,
    apiSlug: "new",
    provider: {
      ...old.provider,
      permissions: {
        ...old.provider.permissions,
        network: ["https://new.invalid"],
      },
      source: { ...old.provider.source, version: "2.0.0" },
    },
  };
  await render([old, newer]);
  expect(container.textContent).toContain("新增地址待授权");
  await act(async () => button("授权").click());
  expect(document.querySelector('[role="dialog"]').textContent).toContain(
    "https://new.invalid"
  );
  await act(async () => button("授权插件").click());
  expect(approvePlugin).toHaveBeenCalledWith("example", [
    "https://fixed.invalid",
    "https://new.invalid",
  ]);
});
