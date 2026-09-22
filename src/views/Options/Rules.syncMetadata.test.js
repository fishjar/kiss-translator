/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Rules from "./Rules";
import { AlertProvider } from "../../hooks/Alert";
import { SettingProvider } from "../../hooks/Setting";
import { apiFetch } from "../../apis";
import {
  DEFAULT_SETTING,
  DEFAULT_SYNC,
  STOKEY_SETTING,
  STOKEY_SYNC,
  STOKEY_RULES,
  KV_RULES_KEY,
} from "../../config";
import { setSubRules, storage } from "../../libs/storage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../apis", () => ({ apiFetch: jest.fn() }));
jest.mock("../../libs/client", () => ({
  isExt: false,
  isGm: false,
  isWeb: true,
}));
jest.mock("../../libs/browser", () => ({ isOptions: () => false }));
jest.mock("../../libs/gm", () => ({ getGmMethod: jest.fn() }));
jest.mock("../../libs/sync", () => ({
  syncData: jest.fn(),
  syncShareRules: jest.fn(),
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/Confirm", () => ({ useConfirm: () => jest.fn() }));
jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [{ apiSlug: "Microsoft", apiName: "Microsoft" }],
  }),
}));
jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({
    allTextStyles: [{ styleSlug: "style_none", styleName: "style_none" }],
  }),
}));

const SOURCE_URL = "https://rules.example/main.json";
const NEW_URL = "https://rules.example/new.json";

test("preserves edited rule metadata when a subscription is added later", async () => {
  localStorage.clear();
  await storage.setObj(STOKEY_SETTING, {
    ...DEFAULT_SETTING,
    injectRules: false,
    subrulesList: [{ url: SOURCE_URL, selected: true }],
  });
  await storage.setObj(STOKEY_SYNC, {
    ...DEFAULT_SYNC,
    dataCaches: { [SOURCE_URL]: 123 },
    syncMeta: { [KV_RULES_KEY]: { updateAt: 101, syncAt: 100 } },
  });
  await storage.setObj(STOKEY_RULES, [
    { pattern: "personal.example", enabled: true },
  ]);
  await setSubRules(SOURCE_URL, [{ pattern: "existing.example" }]);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const clickText = async (selector, text) => {
    const element = Array.from(container.querySelectorAll(selector)).find(
      (item) => item.textContent === text
    );
    expect(element).toBeDefined();
    await act(async () => element.click());
  };
  const waitForMetadata = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 380));
    });

  try {
    await act(async () => {
      root.render(
        <AlertProvider>
          <SettingProvider>
            <Rules />
          </SettingProvider>
        </AlertProvider>
      );
    });
    await clickText('[role="tab"]', "personal_rules");
    const toggle = container.querySelector(
      'input[aria-label="Toggle personal rule personal.example"]'
    );
    expect(toggle.checked).toBe(true);
    await act(async () => toggle.click());
    await waitForMetadata();
    expect((await storage.getObj(STOKEY_RULES))[0].enabled).toBe(false);
    const expectedMeta = (await storage.getObj(STOKEY_SYNC)).syncMeta[
      KV_RULES_KEY
    ];
    expect(expectedMeta.updateAt).toBeGreaterThan(101);

    await clickText('[role="tab"]', "subscribe_rules");
    apiFetch.mockResolvedValueOnce([{ pattern: "new.example" }]);
    await clickText("button", "add");
    const input = container.querySelector('input[type="text"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, NEW_URL);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText("button", "save");
    await waitForMetadata();

    expect(apiFetch).toHaveBeenCalledWith(NEW_URL);
    expect((await storage.getObj(STOKEY_SETTING)).subrulesList).toContainEqual({
      url: NEW_URL,
      selected: false,
    });
    const savedSync = await storage.getObj(STOKEY_SYNC);
    expect(savedSync.syncMeta[KV_RULES_KEY]).toEqual(expectedMeta);
    expect(savedSync.dataCaches[NEW_URL]).toEqual(expect.any(Number));
  } finally {
    act(() => root.unmount());
    container.remove();
    await waitForMetadata();
    localStorage.clear();
  }
});
