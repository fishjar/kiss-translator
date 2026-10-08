/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Rules from "./Rules";
import { AlertProvider } from "../../hooks/Alert";
import { SettingProvider } from "../../hooks/Setting";
import {
  DEFAULT_SETTING,
  DEFAULT_SYNC,
  STOKEY_SETTING,
  STOKEY_SYNC,
  STOKEY_RULES,
} from "../../config";
import { storage } from "../../libs/storage";

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
jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
  LogLevel: { INFO: { value: 1 } },
}));

function changeField(container, name, value) {
  const input = container.querySelector(`[name="${name}"]`);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickText(container, selector, text) {
  const element = Array.from(container.querySelectorAll(selector)).find(
    (item) => item.textContent === text
  );
  expect(element).toBeDefined();
  await act(async () => element.click());
}

function unloadIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

test.each([true, false])(
  "preserves a renamed editor until persistence settles (success: %s)",
  async (success) => {
    localStorage.clear();
    await storage.setObj(STOKEY_SETTING, {
      ...DEFAULT_SETTING,
      injectRules: false,
      subrulesList: [],
    });
    await storage.setObj(STOKEY_SYNC, DEFAULT_SYNC);
    await storage.setObj(STOKEY_RULES, [
      { pattern: "personal.example", enabled: true, rootsSelector: "article" },
      { pattern: "*", selector: "p", rootsSelector: "body" },
    ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let finishSave;
    let saveSpy;
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
      await clickText(container, '[role="tab"]', "personal_rules");
      await act(async () =>
        container.querySelector(".MuiAccordionSummary-root").click()
      );
      const patternField = container.querySelector('[name="pattern"]');
      changeField(container, "rootsSelector", "main");
      changeField(container, "pattern", "renamed.example");
      expect(unloadIsBlocked()).toBe(true);

      const persist = storage.saveEdit;
      saveSpy = jest.spyOn(storage, "saveEdit").mockImplementationOnce(
        (...args) =>
          new Promise((resolve, reject) => {
            finishSave = () => {
              if (success) resolve(persist(...args));
              else reject(new Error("Storage unavailable"));
            };
          })
      );
      await clickText(container, "button", "save");
      expect(container.querySelector('[name="pattern"]')).toBe(patternField);
      expect(patternField.value).toBe("renamed.example");
      expect(patternField.disabled).toBe(true);
      expect(unloadIsBlocked()).toBe(true);

      await act(async () => {
        finishSave();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(container.querySelector('[name="pattern"]')).toBe(patternField);
      expect(patternField.value).toBe("renamed.example");
      expect(patternField.disabled).toBe(false);
      expect(container.querySelector('[name="rootsSelector"]').value).toBe(
        "main"
      );
      expect(unloadIsBlocked()).toBe(!success);

      const settledPattern = (await storage.getObj(STOKEY_RULES))[0].pattern;
      expect(settledPattern).toBe(
        success ? "renamed.example" : "personal.example"
      );
      if (success) {
        // Reusing the old pattern must create a separate editor identity.
        await act(async () => {
          await storage.saveEdit(STOKEY_RULES, (previous) => [
            { pattern: "personal.example" },
            ...previous,
          ]);
        });
      } else {
        await clickText(container, "button", "save");
      }
      expect(container.querySelector('[name="pattern"]')).toBe(patternField);
      expect(patternField.value).toBe("renamed.example");
      expect(unloadIsBlocked()).toBe(false);
      expect(await storage.getObj(STOKEY_RULES)).toContainEqual(
        expect.objectContaining({
          pattern: "renamed.example",
          rootsSelector: "main",
        })
      );
    } finally {
      saveSpy?.mockRestore();
      act(() => root.unmount());
      container.remove();
      localStorage.clear();
    }
  }
);
