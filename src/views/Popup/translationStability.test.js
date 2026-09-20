/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { apiTranslate } from "../../apis";
import { useSetting } from "../../hooks/Setting";
import { readClipboardTextIfAllowed } from "../../libs/clipboard";
import { Trantab } from ".";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../libs/client", () => ({
  isAutoTranslateClipboardSupported: true,
}));
jest.mock("../../libs/clipboard", () => ({
  readClipboardTextIfAllowed: jest.fn(),
}));
jest.mock("../../libs/browser", () => ({
  browser: {
    storage: {
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  },
}));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../libs/detect", () => ({
  tryDetectLang: jest.fn(async () => "en"),
}));
jest.mock("./PopupCont", () => () => null);
jest.mock("./Header", () => () => null);
jest.mock("../Selection/DictCont", () => () => null);
jest.mock("../Selection/AiDictCont", () => () => null);
jest.mock("../Selection/SugCont", () => () => null);
jest.mock("../Selection/Zdic", () => () => null);
jest.mock("../Selection/CopyBtn", () => () => null);
jest.mock("../Selection/AudioBtn", () => ({
  BrowserTtsBtn: () => null,
}));

const baseSetting = {
  autoTranslateClipboard: true,
  tranboxSetting: {
    enDict: "-",
    enSug: "-",
    apiSlugs: ["openai"],
    fromLang: "en",
    toLang: "zh-CN",
    toLang2: "-",
    aiDictApiSlug: "-",
    aiDictPromptSlug: "-",
  },
  transApis: [
    {
      apiSlug: "openai",
      apiName: "OpenAI",
      apiType: "OpenAI",
      apiUrl: "https://example.com/translate",
      nobatchPromptSlug: "popup-prompt",
      useStream: true,
      streamRenderMode: "realtime",
    },
  ],
  langDetector: "-",
  prompts: [
    {
      slug: "popup-prompt",
      category: "user prompt",
      systemPrompt: "Translate the text.",
      userPrompt: "{{text}}",
    },
  ],
  subtitleSetting: {},
  translateVariants: true,
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Trantab translation request stability", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiTranslate.mockReset();
    apiTranslate.mockImplementation(() => new Promise(() => {}));
    readClipboardTextIfAllowed.mockReset();
    readClipboardTextIfAllowed.mockResolvedValue("Clipboard source text");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderSetting = async (setting) => {
    useSetting.mockReturnValue({ setting });
    act(() => root.render(<Trantab />));
    await flushEffects();
  };

  test.each([false, true])(
    "keeps the active stream when disabling clipboard translation (parsed settings: %s)",
    async (reparseSettings) => {
      await renderSetting(baseSetting);
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      const request = apiTranslate.mock.calls[0][0];
      act(() => request.onStreamChunk({ text: "Partial translation" }));

      const nextSetting = reparseSettings
        ? JSON.parse(JSON.stringify(baseSetting))
        : { ...baseSetting };
      nextSetting.autoTranslateClipboard = false;
      await renderSetting(nextSetting);

      expect(apiTranslate).toHaveBeenCalledTimes(1);
      expect(request.signal.aborted).toBe(false);
      expect(
        container.querySelector(".kt-translation-result textarea[readonly]")
          .value
      ).toBe("Partial translation");
      act(() => request.onStreamChunk({ text: "Continued translation" }));
      expect(
        container.querySelector(".kt-translation-result textarea[readonly]")
          .value
      ).toBe("Continued translation");
      expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(1);
    }
  );

  test.each(["API settings", "referenced prompt"])(
    "replaces the active request when %s change",
    async (changedField) => {
      await renderSetting(baseSetting);
      const firstRequest = apiTranslate.mock.calls[0][0];
      const nextSetting = JSON.parse(JSON.stringify(baseSetting));
      if (changedField === "API settings") {
        nextSetting.transApis[0].apiUrl = "https://example.com/reconfigured";
      } else {
        nextSetting.prompts[0].systemPrompt = "Translate using the new style.";
      }

      await renderSetting(nextSetting);

      expect(apiTranslate).toHaveBeenCalledTimes(2);
      expect(firstRequest.signal.aborted).toBe(true);
      const nextRequest = apiTranslate.mock.calls[1][0];
      expect(nextRequest.signal.aborted).toBe(false);
      expect(nextRequest.apiSetting.apiUrl).toBe(
        nextSetting.transApis[0].apiUrl
      );
      expect(nextRequest.apiSetting.nobatchPrompt).toBe(
        nextSetting.prompts[0].systemPrompt
      );
    }
  );

  test("keeps the active request when an unreferenced prompt changes", async () => {
    await renderSetting(baseSetting);
    const request = apiTranslate.mock.calls[0][0];
    const nextSetting = JSON.parse(JSON.stringify(baseSetting));
    nextSetting.prompts.push({
      slug: "unused-prompt",
      category: "user prompt",
      systemPrompt: "An unused prompt.",
    });

    await renderSetting(nextSetting);

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(request.signal.aborted).toBe(false);
  });

  test("loads API settings after the initial loading state", async () => {
    await renderSetting(null);
    expect(container.querySelector(".kt-popup-loading")).not.toBeNull();

    await renderSetting(baseSetting);

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".kt-popup-loading")).toBeNull();
  });
});
