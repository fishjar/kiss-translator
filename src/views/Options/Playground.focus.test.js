/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Playground from "./Playground";
import { SettingProvider } from "../../hooks/Setting";
import { apiTranslate } from "../../apis";
import { storage } from "../../libs/storage";
import { DEFAULT_SETTING, STOKEY_SETTING } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../libs/client", () => ({ isExt: false, isGm: false }));
jest.mock("../../libs/browser", () => ({ isOptions: () => false }));
jest.mock("../../libs/gm", () => ({ getGmMethod: jest.fn() }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../libs/sync", () => ({ syncData: jest.fn() }));
jest.mock("../../libs/detect", () => ({ tryDetectLang: async () => "en" }));
jest.mock("../../libs/storage", () => ({
  ...jest.requireActual("../../libs/storage"),
  storage: { getObj: jest.fn(), withTransaction: jest.fn() },
}));
// Keep the settings, form and result chain real; auxiliary tools are unrelated.
jest.mock("./TerminologySelect", () => ({ TerminologyFields: () => null }));
jest.mock("./TerminologyPlayground", () => () => null);
jest.mock("./SubtitleSegmentationPlayground", () => () => null);
jest.mock(
  "../../components/TranslationPanel/DictionaryPanels",
  () => () => null
);
jest.mock("../Selection/AudioBtn", () => ({ BrowserTtsBtn: () => null }));

async function flush() {
  await act(async () => {
    for (let step = 0; step < 30; step += 1) await Promise.resolve();
  });
}

describe("Playground focus through the settings persistence chain", () => {
  let root;
  let container;
  let storedSetting;

  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
    storedSetting = {
      ...DEFAULT_SETTING,
      transApis: [
        {
          apiSlug: "focus-test",
          apiName: "Focus test",
          apiType: "OpenAI",
          model: "first",
          useStream: true,
          streamRenderMode: "realtime",
        },
      ],
      tranboxSetting: {
        ...DEFAULT_SETTING.tranboxSetting,
        apiSlugs: ["focus-test"],
        fromLang: "en",
        toLang: "zh-CN",
        enDict: "-",
        enSug: "-",
        aiDictApiSlug: "-",
      },
    };
    storage.getObj.mockImplementation(async (key) =>
      key === STOKEY_SETTING ? JSON.parse(JSON.stringify(storedSetting)) : null
    );
    storage.withTransaction.mockImplementation((operation) =>
      operation(storage)
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  async function translate() {
    act(() =>
      root.render(
        <SettingProvider context="options">
          <Playground />
        </SettingProvider>
      )
    );
    await flush();
    const input = container.querySelector(
      'textarea:not([readonly]):not([aria-hidden="true"])'
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set.call(input, "Hello world");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
        })
      )
    );
    await flush();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
  }

  test("keeps an in-flight stream alive when focus returns", async () => {
    let finish;
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await translate();
    const request = apiTranslate.mock.calls[0][0];
    act(() => request.onStreamChunk({ text: "部分译文" }));
    const reads = storage.getObj.mock.calls.length;

    act(() => window.dispatchEvent(new Event("focus")));
    await flush();

    expect(storage.getObj.mock.calls.length).toBeGreaterThan(reads);
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(request.signal.aborted).toBe(false);
    expect(
      container.querySelector('textarea[readonly]:not([aria-hidden="true"])')
        .value
    ).toBe("部分译文");
    await act(async () => finish({ trText: "完整译文" }));
    expect(
      container.querySelector('textarea[readonly]:not([aria-hidden="true"])')
        .value
    ).toBe("完整译文");
  });

  test("keeps completed output on resume and translates after an actual API change", async () => {
    apiTranslate.mockResolvedValue({ trText: "完整译文" });
    await translate();
    const output = container.querySelector(
      'textarea[readonly]:not([aria-hidden="true"])'
    );
    output.scrollTop = 120;
    const mutations = [];
    const observer = new MutationObserver((records) =>
      mutations.push(...records)
    );
    observer.observe(output, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    try {
      for (const event of ["focus", "pageshow"]) {
        act(() => window.dispatchEvent(new Event(event)));
        await flush();
      }
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      expect(
        container.querySelector('textarea[readonly]:not([aria-hidden="true"])')
      ).toBe(output);
      expect(output.value).toBe("完整译文");
      expect(output.scrollTop).toBe(120);
      expect(mutations).toHaveLength(0);

      storedSetting.transApis[0].model = "second";
      act(() => window.dispatchEvent(new Event("focus")));
      await flush();
      expect(apiTranslate).toHaveBeenCalledTimes(2);
      expect(apiTranslate.mock.calls[1][0].apiSetting.model).toBe("second");
    } finally {
      observer.disconnect();
    }
  });
});
