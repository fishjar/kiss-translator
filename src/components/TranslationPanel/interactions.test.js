/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiTranslate } from "../../apis";
import { speak } from "../../libs/speech";
import TranslationPanelContent from "./Content";
import TranslationPanelHeader from "./Header";
import TranslationPanelSurface from "./Surface";
import TranBox from "../../views/Selection/TranBox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light", toggleDarkMode: jest.fn() }),
}));
jest.mock("../../libs/detect", () => ({
  tryDetectLang: jest.fn(async () => "en"),
}));
jest.mock("../../libs/speech", () => ({
  canSpeak: () => true,
  speak: jest.fn(() => true),
}));
jest.mock("../../hooks/Audio", () => ({ useAudio: jest.fn() }));
jest.mock("query-string", () => ({ stringify: jest.fn() }));
jest.mock("../../views/Selection/DictCont", () => () => null);
jest.mock("../../views/Selection/AiDictCont", () => () => null);
jest.mock("../../views/Selection/SugCont", () => () => null);
jest.mock("../../views/Selection/Zdic", () => () => null);
jest.mock("../Logo", () => () => null);
// jsdom does not parse container queries; layout is covered in browser checks.
jest.mock("./styles", () => ({ TRANSLATION_PANEL_STYLES: "" }));

const formProps = {
  apiSlugs: ["openai"],
  fromLang: "en",
  toLang: "zh-CN",
  toLang2: "-",
  transApis: [
    {
      apiSlug: "openai",
      apiName: "OpenAI",
      apiType: "OpenAI",
      useStream: true,
      streamRenderMode: "realtime",
    },
  ],
  langDetector: "-",
  enDict: "-",
  enSug: "-",
  aiDictApiSlug: "-",
  autoFocusInput: false,
};

function Panel({
  initialSimpleStyle = false,
  initialText = "First source",
  externalText,
  formOverrides,
  selectionHost = false,
}) {
  const [text, setText] = useState(initialText);
  const [simpleStyle, setSimpleStyle] = useState(initialSimpleStyle);
  useEffect(() => {
    if (externalText !== undefined) setText(externalText);
  }, [externalText]);
  if (selectionHost) {
    return (
      <TranBox
        showBox
        text={text}
        setText={setText}
        simpleStyle={simpleStyle}
        setSimpleStyle={setSimpleStyle}
        tranboxSetting={formProps}
        transApis={formProps.transApis}
        langDetector={formProps.langDetector}
        setBoxPosition={() => {}}
        setBoxSize={() => {}}
      />
    );
  }
  return (
    <TranslationPanelSurface
      header={
        <TranslationPanelHeader
          simpleStyle={simpleStyle}
          setSimpleStyle={setSimpleStyle}
        />
      }
    >
      <TranslationPanelContent
        {...formProps}
        {...formOverrides}
        text={text}
        setText={setText}
        simpleStyle={simpleStyle}
      />
    </TranslationPanelSurface>
  );
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe.each(["document", "shadow"])(
  "Shared translation panel interactions in %s",
  (scope) => {
    let host;
    let container;
    let root;
    let outside;
    let clipboardDescriptor;

    const input = (panel = container) =>
      panel.querySelector(
        '.kt-translation-source textarea:not([aria-hidden="true"])'
      );
    const result = (panel = container) =>
      panel.querySelector(
        '.kt-translation-result textarea:not([aria-hidden="true"])'
      );
    const resultAction = (name, panel = container) =>
      panel.querySelector(`.kt-translation-result button[title="${name}"]`);
    const activeElement = () => container.getRootNode().activeElement;

    beforeEach(() => {
      host = document.createElement("div");
      document.body.appendChild(host);
      const mount =
        scope === "shadow" ? host.attachShadow({ mode: "open" }) : host;
      container = document.createElement("div");
      outside = document.createElement("button");
      mount.append(container, outside);
      root = createRoot(container);
      clipboardDescriptor = Object.getOwnPropertyDescriptor(
        navigator,
        "clipboard"
      );
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
      });
      apiTranslate.mockReset().mockResolvedValue({ trText: "First result" });
      speak.mockReset().mockReturnValue(true);
    });

    afterEach(() => {
      act(() => root.unmount());
      host.remove();
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        delete navigator.clipboard;
      }
    });

    const renderPanel = async (props = {}) => {
      act(() => root.render(<Panel {...props} />));
      await flushEffects();
    };
    const editDraft = (value, panel = container) => {
      act(() => {
        const source = input(panel);
        source.focus();
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set.call(source, value);
        source.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const pointerClick = async (button) => {
      const event = new MouseEvent("pointerdown", {
        button: 0,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      act(() => (button.querySelector("svg") || button).dispatchEvent(event));
      // jsdom has no pointer focus default; reproduce it only when not canceled.
      if (!event.defaultPrevented) act(() => button.focus());
      await flushEffects();
      if (button.isConnected) await act(async () => button.click());
      return event;
    };

    test("dismisses the mode menu before transferring focus on expansion", async () => {
      await renderPanel({ initialSimpleStyle: true });
      const trigger = container.querySelector('button[title="more"]');
      act(() => {
        trigger.focus();
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
            cancelable: true,
          })
        );
      });
      const toggle = container.querySelector('[role="menuitemcheckbox"]');
      expect(activeElement()).toBe(toggle);
      await act(async () => toggle.click());

      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(activeElement()).toBe(input());
      expect(input().selectionStart).toBe(input().value.length);

      act(() => trigger.click());
      await act(async () =>
        container.querySelector('[role="menuitemcheckbox"]').click()
      );
      expect(input()).toBeNull();
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(activeElement()).toBe(trigger);
    });

    test.each(["copy", "read_aloud"])(
      "uses the old result with pointer %s while preserving the new draft",
      async (action) => {
        await renderPanel();
        apiTranslate.mockReturnValue(new Promise(() => {}));
        editDraft("Second source draft");
        const button = resultAction(action);
        const event = await pointerClick(button);

        expect(event.defaultPrevented).toBe(true);
        expect(button.isConnected).toBe(true);
        expect(activeElement()).toBe(input());
        expect(input().value).toBe("Second source draft");
        expect(result().value).toBe("First result");
        expect(apiTranslate).toHaveBeenCalledTimes(1);
        if (action === "copy") {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "First result"
          );
        } else {
          expect(speak).toHaveBeenCalledWith(
            "First result",
            "zh-CN",
            expect.any(Object)
          );
        }

        act(() => outside.focus());
        await flushEffects();
        expect(apiTranslate).toHaveBeenCalledTimes(2);
        expect(apiTranslate.mock.calls[1][0].text).toBe("Second source draft");
      }
    );

    test.each(["pointer", "keyboard"])(
      "keeps pasted source text after leaving the form with %s activation",
      async (activation) => {
        navigator.clipboard.readText = jest
          .fn()
          .mockResolvedValue("  Clipboard source  ");
        await renderPanel({ initialText: "" });
        act(() => input().focus());
        const paste = container.querySelector('button[title="paste"]');

        if (activation === "pointer") {
          await pointerClick(paste);
        } else {
          act(() => paste.focus());
          await act(async () => paste.click());
        }
        await flushEffects();

        expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
        expect(input().value).toBe("Clipboard source");
        expect(apiTranslate).toHaveBeenCalledTimes(1);
        expect(apiTranslate.mock.calls[0][0].text).toBe("Clipboard source");
        expect(result().value).toBe("First result");

        act(() => outside.focus());
        await flushEffects();
        expect(input().value).toBe("Clipboard source");
        expect(result().value).toBe("First result");
        expect(apiTranslate).toHaveBeenCalledTimes(1);

        await renderPanel({ externalText: "Next selected text" });
        expect(input().value).toBe("Next selected text");
        expect(apiTranslate).toHaveBeenCalledTimes(2);
        expect(apiTranslate.mock.calls[1][0].text).toBe("Next selected text");
      }
    );

    test.each(["copy", "read_aloud"])(
      "commits the draft when a focused streaming %s action disappears",
      async (action) => {
        let finishTranslation;
        apiTranslate.mockReturnValueOnce(
          new Promise((resolve) => {
            finishTranslation = resolve;
          })
        );
        await renderPanel({
          formOverrides: { fromLang: "auto", toLang: "en" },
        });
        act(() =>
          apiTranslate.mock.calls[0][0].onStreamChunk({
            text: "Partial result",
          })
        );
        editDraft("Next source draft");
        const button = resultAction(action);
        act(() => button.focus());
        expect(activeElement()).toBe(button);
        expect(apiTranslate).toHaveBeenCalledTimes(1);

        await act(async () => {
          finishTranslation({ trText: "Same language result", isSame: true });
        });
        await flushEffects();

        expect(button.isConnected).toBe(false);
        expect(input().value).toBe("Next source draft");
        expect(apiTranslate).toHaveBeenCalledTimes(2);
        expect(apiTranslate.mock.calls[1][0].text).toBe("Next source draft");

        await renderPanel({
          externalText: "Next selected text",
          formOverrides: { fromLang: "auto", toLang: "en" },
        });
        expect(input().value).toBe("Next selected text");
        expect(apiTranslate).toHaveBeenCalledTimes(3);
        expect(apiTranslate.mock.calls[2][0].text).toBe("Next selected text");
      }
    );

    test("keeps new panel selections when the result textarea retains focus", async () => {
      await renderPanel({ selectionHost: true });
      editDraft("Unsubmitted draft");
      act(() => result().focus());
      expect(apiTranslate).toHaveBeenCalledTimes(1);

      await renderPanel({
        selectionHost: true,
        externalText: "New panel selection",
      });
      expect(activeElement()).toBe(result());
      expect(input().value).toBe("New panel selection");
      expect(apiTranslate).toHaveBeenCalledTimes(2);
      expect(apiTranslate.mock.calls[1][0].text).toBe("New panel selection");

      act(() => outside.focus());
      await flushEffects();
      expect(input().value).toBe("New panel selection");
      expect(apiTranslate).toHaveBeenCalledTimes(2);
    });

    test("keeps native focus traversal through source actions and the old result", async () => {
      await renderPanel();
      apiTranslate.mockReturnValue(new Promise(() => {}));
      editDraft("Keyboard draft");
      const submit = container.querySelector('button[title="submit"]');
      const copy = resultAction("copy");
      // Native focus emits the same blur/relatedTarget transitions as Tab.
      for (const control of [submit, result(), copy]) {
        act(() => control.focus());
        await flushEffects();
        expect(activeElement()).toBe(control);
        expect(control.isConnected).toBe(true);
        expect(apiTranslate).toHaveBeenCalledTimes(1);
      }
      await act(async () => copy.click());
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "First result"
      );
      expect(input().value).toBe("Keyboard draft");

      const speech = resultAction("read_aloud");
      act(() => {
        speech.focus();
        speech.click();
        speech.click();
      });
      expect(activeElement()).toBe(speech);
      expect(speech.disabled).toBe(false);
      expect(speech.getAttribute("aria-disabled")).toBe("true");
      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak.mock.calls[0][0]).toBe("First result");
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      act(() => speak.mock.calls[0][2].onEnd());
      expect(activeElement()).toBe(speech);
      expect(speech.getAttribute("aria-disabled")).toBe("false");

      const language = container.querySelector('[role="combobox"]');
      act(() => language.focus());
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(2);
      expect(apiTranslate.mock.calls[1][0].text).toBe("Keyboard draft");
    });

    test("does not share draft focus protection between forms", async () => {
      act(() =>
        root.render(
          <>
            <Panel />
            <Panel initialText="Another source" />
          </>
        )
      );
      await flushEffects();
      const panels = container.querySelectorAll(".kt-translation-panel");
      editDraft("First form draft", panels[0]);
      const secondCopy = resultAction("copy", panels[1]);
      const event = await pointerClick(secondCopy);

      expect(event.defaultPrevented).toBe(false);
      expect(activeElement()).toBe(secondCopy);
      expect(apiTranslate).toHaveBeenCalledTimes(3);
      expect(apiTranslate.mock.calls[2][0].text).toBe("First form draft");
    });

    test("copying a partial result does not cancel its active stream", async () => {
      apiTranslate.mockReturnValue(new Promise(() => {}));
      await renderPanel();
      const request = apiTranslate.mock.calls[0][0];
      act(() => request.onStreamChunk({ text: "Partial result" }));
      editDraft("Next source draft");
      await pointerClick(resultAction("copy"));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Partial result"
      );
      expect(request.signal.aborted).toBe(false);
      expect(apiTranslate).toHaveBeenCalledTimes(1);
    });
  }
);
