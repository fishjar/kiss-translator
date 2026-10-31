/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import TranslationPanelContent from "./Content";
import { speak } from "../../libs/speech";
import { tryDetectLang } from "../../libs/detect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../libs/detect", () => ({ tryDetectLang: jest.fn() }));
jest.mock("../../libs/speech", () => ({
  canSpeak: () => true,
  speak: jest.fn(() => true),
  stopSpeech: jest.fn(),
}));
jest.mock("../../hooks/Audio", () => ({ useAudio: jest.fn() }));
jest.mock("query-string", () => ({ stringify: jest.fn() }));
// useTextareaGripStyle 静态 import ./Setting；Setting→sync→webdav(ESM) 会被 jest
// 解析崩。最小 mock ./Setting 斩断链（与 interactions.test.js:27-33 同法）。
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: {} }),
}));
jest.mock("../../views/Selection/TranCont", () => () => null);
jest.mock("../../views/Selection/AiDictCont", () => () => null);
jest.mock("../../views/Selection/SugCont", () => () => null);
jest.mock("../../views/Selection/Zdic", () => () => null);
jest.mock("../../views/Selection/DictCont", () => {
  const React = require("react");
  return ({ text }) =>
    React.createElement("div", {
      "data-testid": "default-dict",
      "data-dict-text": text,
    });
});

const baseProps = {
  setText: jest.fn(),
  apiSlugs: ["openai"],
  fromLang: "auto",
  toLang: "zh-CN",
  toLang2: "-",
  transApis: [
    { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI", sortOrder: 1 },
  ],
  langDetector: "cloud",
  enSug: "-",
  autoFocusInput: false,
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Original text read aloud in the shared translation panel", () => {
  let container;
  let root;

  beforeEach(() => {
    speak.mockReset();
    speak.mockReturnValue(true);
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
      root.render(<TranslationPanelContent {...baseProps} {...overrides} />)
    );
    await flushEffects();
  };
  const speakButton = () =>
    container.querySelector('button[title="read_source_aloud"]');

  test("reads the committed original text in the detected source language", async () => {
    await render({ text: "hello there friend", enDict: "-" });
    expect(speakButton()).not.toBeNull();
    act(() =>
      speakButton().dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(speak).toHaveBeenCalledWith(
      "hello there friend",
      "ja",
      expect.any(Object)
    );
  });

  test("uses an explicit safe language when automatic detection has no result", async () => {
    tryDetectLang.mockResolvedValue("");
    await render({ text: "hello there friend", enDict: "-", fromLang: "auto" });
    act(() =>
      speakButton().dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(speak.mock.calls[0][1]).toBe("en-US");
  });

  test("a committed word keeps both the dictionary and the read-aloud icon", async () => {
    await render({ text: "apple", enDict: "Bing" });
    expect(
      container.querySelector('[data-testid="default-dict"]')
    ).not.toBeNull();
    expect(speakButton()).not.toBeNull();
  });

  test("an empty source row hides the read-aloud icon", async () => {
    await render({ text: "", enDict: "-" });
    expect(speakButton()).toBeNull();
  });

  test("committed source shows only copy then the fixed rightmost read-aloud action", async () => {
    await render({ text: "hello there friend", enDict: "-" });
    const titles = [
      ...container.querySelectorAll(".kt-translation-source button"),
    ].map((button) => button.getAttribute("title"));
    expect(titles).toEqual(["copy", "read_source_aloud"]);
    expect(speakButton()).toBe(
      container.querySelector(".kt-translation-source button:last-of-type")
    );
  });

  test("focus without editing keeps copy", async () => {
    await render({ text: "hello there friend", enDict: "-" });
    const field = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    act(() => field.focus());
    const titles = [
      ...container.querySelectorAll(".kt-translation-source button"),
    ].map((button) => button.getAttribute("title"));
    expect(titles).toEqual(["copy", "read_source_aloud"]);
  });

  test("a draft read-aloud pointer sequence preserves focus, speaks the draft, and commits nothing", async () => {
    await render({ text: "hello there friend", enDict: "-" });
    const field = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    const hasFocus = jest.spyOn(document, "hasFocus").mockReturnValue(true);

    try {
      baseProps.setText.mockClear();
      speak.mockClear();
      act(() => field.focus());
      act(() => {
        setValue.call(field, "hello there friend too");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const button = speakButton();
      const pointerDown = new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      act(() => button.dispatchEvent(pointerDown));
      expect(pointerDown.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(field);
      act(() =>
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      expect(speak).toHaveBeenCalledWith(
        "hello there friend too",
        "ja",
        expect.any(Object)
      );
      expect(baseProps.setText).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(field);
    } finally {
      hasFocus.mockRestore();
    }
  });

  test("clearing a committed draft to whitespace keeps submit so the empty commit can be sent", async () => {
    await render({ text: "", enDict: "-" });
    const field = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => field.focus());
    act(() => {
      setValue.call(field, "   ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const titles = [
      ...container.querySelectorAll(".kt-translation-source button"),
    ].map((button) => button.getAttribute("title"));
    expect(titles).toEqual(["submit"]);
    expect(speakButton()).toBeNull();
  });

  test("clearing a committed draft to an empty string keeps submit so the empty commit can be sent", async () => {
    await render({ text: "hello there friend", enDict: "-" });
    const field = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => field.focus());
    act(() => {
      setValue.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const titles = [
      ...container.querySelectorAll(".kt-translation-source button"),
    ].map((button) => button.getAttribute("title"));
    expect(titles).toEqual(["submit"]);
    expect(speakButton()).toBeNull();
  });

  test("non-Shift Enter submits and exits editing while Shift+Enter keeps the draft", async () => {
    await render({ text: "hello there friend", enDict: "-" });
    const field = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    const press = (options = {}) => {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      act(() => field.dispatchEvent(event));
      return event;
    };

    act(() => field.focus());
    act(() => {
      setValue.call(field, "updated source");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    baseProps.setText.mockClear();
    expect(press({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(baseProps.setText).not.toHaveBeenCalled();
    expect(field.value).toBe("updated source");
    expect(document.activeElement).toBe(field);
    expect(press().defaultPrevented).toBe(true);
    expect(baseProps.setText).toHaveBeenCalledWith("updated source");
    expect(document.activeElement).not.toBe(field);
  });
});
