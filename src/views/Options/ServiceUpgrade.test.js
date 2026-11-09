import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { ServiceUpgradeAction } from "./ServiceUpgrade";
import { commitServiceUpgrade } from "../../providers/upgradeStorage";
import { createServiceInstance } from "../../providers/instances";
jest.mock("../../providers/upgradeStorage", () => ({
  commitServiceUpgrade: jest.fn(),
}));
jest.mock("../../hooks/ProviderPackages", () => ({
  useProviderPackages: () => ({ packages: [mockPack] }),
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ reloadSetting: mockReload }),
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
const mockReload = jest.fn();
const manifest = {
  apiVersion: 1,
  id: "upgrade-test",
  name: "Test",
  version: "1.0.0",
  services: [
    {
      id: "text",
      name: "Text",
      implementation: { kind: "script", entry: "text.js" },
      settings: [],
      capabilities: { translate: { handler: "translate" } },
    },
  ],
};
const api = createServiceInstance(
  manifest,
  "text",
  "exports.translate=()=>{}",
  {},
  "stable"
);
const mockPack = {
  id: manifest.id,
  manifest: { ...manifest, version: "2.0.0" },
  implementations: { text: "exports.translate=()=>42" },
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let node, root;
beforeEach(() => {
  jest.clearAllMocks();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});

test("upgrade is disabled for unsaved edits and explains why", async () => {
  await act(async () => root.render(<ServiceUpgradeAction api={api} dirty />));
  expect(node.querySelector("button").disabled).toBe(true);
  expect(node.textContent).toContain("请先保存");
  expect(node.textContent).toContain("升级到 2.0.0");
});

test("one click upgrades the existing ID, blocks duplicate clicks and refreshes only after the write", async () => {
  let finish;
  commitServiceUpgrade.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const onUpgraded = jest.fn();
  await act(async () =>
    root.render(<ServiceUpgradeAction api={api} onUpgraded={onUpgraded} />)
  );
  const button = node.querySelector("button");
  act(() => {
    Simulate.click(button);
    Simulate.click(button);
  });
  expect(commitServiceUpgrade).toHaveBeenCalledTimes(1);
  expect(commitServiceUpgrade).toHaveBeenCalledWith("stable", mockPack);
  expect(button.disabled).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(onUpgraded).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(false);
});

test("a failed write shows the error without resetting the form", async () => {
  commitServiceUpgrade.mockRejectedValue(new Error("write failed"));
  const onUpgraded = jest.fn();
  await act(async () =>
    root.render(<ServiceUpgradeAction api={api} onUpgraded={onUpgraded} />)
  );
  await act(async () => Simulate.click(node.querySelector("button")));
  expect(node.textContent).toContain("write failed");
  expect(mockReload).not.toHaveBeenCalled();
  expect(onUpgraded).not.toHaveBeenCalled();
  expect(node.querySelector("button").disabled).toBe(false);
});
