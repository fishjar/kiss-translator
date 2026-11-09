/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import PopupTextPanel from "./PopupTextPanel";
import { tryDetectLang } from "../../libs/detect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: { uiTweak: {} } }),
}));
jest.mock("../../libs/detect", () => ({ tryDetectLang: jest.fn() }));
jest.mock("../../libs/browser", () => ({ browser: {} }));
jest.mock("../Selection/CopyBtn", () => {
  const React = require("react");
  return () => React.createElement("button", { type: "button" }, "copy");
});
jest.mock("../Selection/DictCont", () => {
  const React = require("react");
  return ({ text, enDict }) =>
    React.createElement("div", {
      "data-testid": "default-dict",
      "data-dict-text": text,
      "data-dict-source": enDict,
    });
});
jest.mock("../Selection/AiDictCont", () => () => null);
jest.mock("../Selection/SugCont", () => () => null);
jest.mock("../Selection/Zdic", () => () => null);
jest.mock("../Selection/AudioBtn", () => {
  const React = require("react");
  return {
    BrowserTtsBtn: ({ text, lang, title, serviceId }) =>
      React.createElement("button", {
        type: "button",
        title,
        "data-speech-text": text,
        "data-speech-lang": lang,
        "data-speech-service": serviceId ?? "",
      }),
  };
});
jest.mock("../Selection/TranCont", () => {
  const React = require("react");
  return ({ ttsApiSlug, text }) =>
    React.createElement("div", {
      className: "kt-popup-text-result",
      "data-tts-service": String(ttsApiSlug),
      "data-result-text": text,
    });
});

const transApis = [
  {
    apiSlug: "microsoft",
    apiName: "Microsoft",
    apiType: "Microsoft",
    sortOrder: 2,
  },
];

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Toolbar popup text tab dictionary and source speech", () => {
  let container;
  let root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    container.className = "kt-m3-root";
    document.body.appendChild(container);
    root = createRoot(container);
    tryDetectLang.mockReset();
    tryDetectLang.mockResolvedValue("ja");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (overrides = {}) => {
    act(() =>
      root.render(
        <PopupTextPanel
          text="apple"
          setText={jest.fn()}
          apiSlugs={["microsoft"]}
          transApis={transApis}
          fromLang="auto"
          toLang="zh-CN"
          autoFocusInput={false}
          {...overrides}
        />
      )
    );
    await flushEffects();
  };

  test("restores the headword dictionary outside the height-ratio card", async () => {
    await render({ enDict: "Bing" });
    const dict = container.querySelector('[data-testid="default-dict"]');
    expect(dict).not.toBeNull();
    expect(dict.getAttribute("data-dict-text")).toBe("apple");
    expect(dict.getAttribute("data-dict-source")).toBe("Bing");
    expect(dict.closest(".kt-popup-text-card")).toBeNull();
    expect(dict.closest(".kt-popup-text-auxiliary")).not.toBeNull();
  });

  test("forwards the configured speech service to every translation result", async () => {
    await render({ enDict: "Bing", ttsApiSlug: "azure-tts" });
    expect(
      container.querySelector(".kt-popup-text-result").dataset.ttsService
    ).toBe("azure-tts");
  });

  test("a committed word keeps both the dictionary and the read-aloud icon", async () => {
    await render({ text: "apple", enDict: "Bing" });
    const speech = container.querySelector('button[title="read_source_aloud"]');
    expect(speech).not.toBeNull();
    expect(speech.dataset.speechText).toBe("apple");
    expect(speech.dataset.speechLang).toBe("ja");
    expect(
      container.querySelector('[data-testid="default-dict"]')
    ).not.toBeNull();
  });

  test("an empty editor hides the read-aloud icon", async () => {
    await render({ text: "", enDict: "Bing" });
    expect(
      container.querySelector('button[title="read_source_aloud"]')
    ).toBeNull();
  });

  test("the read-aloud icon is the last action in the source row", async () => {
    await render({ text: "apple", enDict: "Bing" });
    const actions = container.querySelector(".kt-popup-text-source-actions");
    expect(actions.lastElementChild.getAttribute("title")).toBe(
      "read_source_aloud"
    );
  });

  test("an uncommitted draft keeps the last valid detected language", async () => {
    await render({ text: "apple", enDict: "Bing" });
    const field = container.querySelector(".kt-popup-text-input");
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      field.focus();
      setValue.call(field, "apples");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const speech = container.querySelector('button[title="read_source_aloud"]');
    expect(speech).not.toBeNull();
    expect(speech.dataset.speechText).toBe("apples");
    expect(speech.dataset.speechLang).toBe("ja");
  });

  test("a fresh automatic-language draft receives the explicit safe fallback", async () => {
    await render({ text: "", enDict: "Bing" });
    const field = container.querySelector(".kt-popup-text-input");
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      field.focus();
      setValue.call(field, "new draft");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const speech = container.querySelector('button[title="read_source_aloud"]');
    expect(speech.dataset.speechText).toBe("new draft");
    expect(speech.dataset.speechLang).toBe("en-US");
  });

  test("keeps the default system voice when no speech service is configured", async () => {
    await render({ text: "apple", enDict: "Bing" });
    const speech = container.querySelector('button[title="read_source_aloud"]');
    expect(speech).not.toBeNull();
    expect(speech.dataset.speechService).toBe("");
  });
});
