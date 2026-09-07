/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Rules from "./Rules";
import { SettingProvider } from "../../hooks/Setting";
import { apiFetch } from "../../apis";
import {
  DEFAULT_SETTING,
  DEFAULT_SYNC,
  STOKEY_SETTING,
  STOKEY_SYNC,
} from "../../config";
import {
  delSubRules,
  getSubRules,
  setSubRules,
  storage,
} from "../../libs/storage";

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
jest.mock("../../libs/storage", () => ({
  ...jest.requireActual("../../libs/storage"),
  debounceSyncMeta: jest.fn(),
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../hooks/Rules", () => ({
  useRules: () => ({ list: [] }),
}));
jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(),
}));
jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [{ apiSlug: "Tencent", apiName: "Tencent" }],
  }),
}));
jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({
    allTextStyles: [{ styleSlug: "style_none", styleName: "style_none" }],
  }),
}));

const SOURCE_URL = "https://rules.example/main.json";
const NEW_URL = "https://rules.example/new.json";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Rules subscription persistence", () => {
  let container;
  let root;

  async function clickText(selector, text) {
    const element = Array.from(container.querySelectorAll(selector)).find(
      (item) => item.textContent === text
    );
    expect(element).toBeDefined();
    await act(async () => element.click());
  }

  async function renderSubscribeTab(key) {
    await act(async () => {
      root.render(
        <SettingProvider>
          <Rules key={key} />
        </SettingProvider>
      );
    });
    await clickText('[role="tab"]', "subscribe_rules");
  }

  async function saveSubscription() {
    await clickText("button", "add");
    const input = container.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;
      setValue.call(input, NEW_URL);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText("button", "save");
    expect(apiFetch).toHaveBeenCalledWith(NEW_URL);
  }

  beforeEach(async () => {
    localStorage.clear();
    apiFetch.mockReset();
    await storage.setObj(STOKEY_SETTING, {
      ...DEFAULT_SETTING,
      injectRules: false,
      subrulesList: [{ url: SOURCE_URL, selected: true }],
    });
    await storage.setObj(STOKEY_SYNC, {
      ...DEFAULT_SYNC,
      dataCaches: { [SOURCE_URL]: 123 },
    });
    await setSubRules(SOURCE_URL, [{ pattern: "existing.example" }]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  test.each([false, true])(
    "persists a submitted subscription across tab navigation (return before completion: %s)",
    async (returnBeforeCompletion) => {
      const request = deferred();
      apiFetch.mockReturnValueOnce(request.promise);
      await renderSubscribeTab();
      await saveSubscription();
      await clickText('[role="tab"]', "personal_rules");
      if (returnBeforeCompletion) {
        await clickText('[role="tab"]', "subscribe_rules");
      }

      await act(async () => {
        request.resolve([{ pattern: "new.example" }]);
        await request.promise;
      });

      const savedSetting = await storage.getObj(STOKEY_SETTING);
      const savedSync = await storage.getObj(STOKEY_SYNC);
      expect(savedSetting.subrulesList).toContainEqual({
        url: NEW_URL,
        selected: false,
      });
      expect(await getSubRules(NEW_URL)).toEqual([
        expect.objectContaining({ pattern: "new.example" }),
      ]);
      expect(savedSync.dataCaches[NEW_URL]).toEqual(expect.any(Number));
      expect(savedSync.dataCaches[SOURCE_URL]).toBe(123);

      if (!returnBeforeCompletion) {
        await clickText('[role="tab"]', "subscribe_rules");
      }
      expect(container.textContent).toContain(NEW_URL);
    }
  );

  test.each([false, true])(
    "adds the same subscription only once after returning to a pending save (retry finishes first: %s)",
    async (retryFinishesFirst) => {
      const originalRequest = deferred();
      const retryRequest = deferred();
      apiFetch
        .mockReturnValueOnce(originalRequest.promise)
        .mockReturnValueOnce(retryRequest.promise);
      await renderSubscribeTab();
      await saveSubscription();
      await clickText('[role="tab"]', "personal_rules");
      await clickText('[role="tab"]', "subscribe_rules");
      await saveSubscription();
      expect(apiFetch).toHaveBeenCalledTimes(2);

      const requests = retryFinishesFirst
        ? [retryRequest, originalRequest]
        : [originalRequest, retryRequest];
      for (const request of requests) {
        await act(async () => {
          request.resolve([{ pattern: "new.example" }]);
          await request.promise;
        });
      }

      const savedSetting = await storage.getObj(STOKEY_SETTING);
      expect(
        savedSetting.subrulesList.filter((item) => item.url === NEW_URL)
      ).toEqual([{ url: NEW_URL, selected: false }]);
    }
  );

  test.each([
    ["tab", false],
    ["tab", true],
    ["route", false],
    ["route", true],
  ])(
    "keeps deletion newer than an outstanding save across %s navigation (re-add finishes first: %s)",
    async (navigation, readdFinishesFirst) => {
      const originalRequest = deferred();
      const retryRequest = deferred();
      const readdRequest = deferred();
      apiFetch
        .mockReturnValueOnce(originalRequest.promise)
        .mockReturnValueOnce(retryRequest.promise)
        .mockReturnValueOnce(readdRequest.promise);
      await renderSubscribeTab();
      await saveSubscription();
      if (navigation === "route") {
        await renderSubscribeTab("remounted");
      } else {
        await clickText('[role="tab"]', "personal_rules");
        await clickText('[role="tab"]', "subscribe_rules");
      }
      await saveSubscription();
      expect(apiFetch).toHaveBeenCalledTimes(2);

      await act(async () => {
        retryRequest.resolve([{ pattern: "retry.example" }]);
        await retryRequest.promise;
      });
      const deleteButton = container.querySelector(
        `button[aria-label="Delete subscription ${NEW_URL}"]`
      );
      expect(deleteButton).not.toBeNull();
      await act(async () => deleteButton.click());

      async function expectDeleted() {
        const savedSetting = await storage.getObj(STOKEY_SETTING);
        const savedSync = await storage.getObj(STOKEY_SYNC);
        expect(
          savedSetting.subrulesList.some((item) => item.url === NEW_URL)
        ).toBe(false);
        expect(savedSync.dataCaches[NEW_URL]).toBeUndefined();
        expect(await getSubRules(NEW_URL)).toBeNull();
      }

      async function readdSubscription() {
        await saveSubscription();
        expect(apiFetch).toHaveBeenCalledTimes(3);
        await act(async () => {
          readdRequest.resolve([{ pattern: "readded.example" }]);
          await readdRequest.promise;
        });
      }

      await expectDeleted();
      if (readdFinishesFirst) await readdSubscription();
      await act(async () => {
        originalRequest.resolve([{ pattern: "stale.example" }]);
        await originalRequest.promise;
      });
      if (!readdFinishesFirst) {
        await expectDeleted();
        await readdSubscription();
      }

      const savedSetting = await storage.getObj(STOKEY_SETTING);
      const savedSync = await storage.getObj(STOKEY_SYNC);
      expect(
        savedSetting.subrulesList.filter((item) => item.url === NEW_URL)
      ).toEqual([{ url: NEW_URL, selected: false }]);
      expect(savedSync.dataCaches[NEW_URL]).toEqual(expect.any(Number));
      expect(await getSubRules(NEW_URL)).toEqual([
        expect.objectContaining({ pattern: "readded.example" }),
      ]);
    }
  );

  test("does not persist a cancelled subscription when its request completes", async () => {
    const request = deferred();
    apiFetch.mockReturnValueOnce(request.promise);
    await renderSubscribeTab();
    await saveSubscription();
    await clickText("button", "cancel");
    await clickText('[role="tab"]', "personal_rules");

    await act(async () => {
      request.resolve([{ pattern: "cancelled.example" }]);
      await request.promise;
    });

    const savedSetting = await storage.getObj(STOKEY_SETTING);
    const savedSync = await storage.getObj(STOKEY_SYNC);
    expect(savedSetting.subrulesList).toEqual([
      { url: SOURCE_URL, selected: true },
    ]);
    expect(savedSync.dataCaches[NEW_URL]).toBeUndefined();
    expect(await getSubRules(NEW_URL)).toBeNull();
  });

  test("keeps a manual sync visible when an older initial fetch fails", async () => {
    await delSubRules(SOURCE_URL);
    const initialRequest = deferred();
    const manualRequest = deferred();
    apiFetch
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(manualRequest.promise);
    await renderSubscribeTab();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    const syncButton = container.querySelector(
      `button[aria-label="Sync subscription ${SOURCE_URL}"]`
    );
    await act(async () => syncButton.click());
    expect(apiFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      manualRequest.resolve([{ pattern: "fresh.example" }]);
      await manualRequest.promise;
    });
    expect(container.textContent).toContain("fresh.example");

    await act(async () => {
      initialRequest.reject(new Error("initial fetch failed"));
      await initialRequest.promise.catch(() => {});
    });
    expect(container.textContent).toContain("fresh.example");
    expect(await getSubRules(SOURCE_URL)).toEqual([
      expect.objectContaining({ pattern: "fresh.example" }),
    ]);
  });
});
