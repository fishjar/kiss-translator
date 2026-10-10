/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { APP_CONSTS } from "../../config";
import useSelectionController from "../../hooks/useSelectionController";
import TranBox from "./TranBox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light", toggleDarkMode: jest.fn() }),
}));
jest.mock("../../libs/client", () => ({ isExt: false }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../libs/mobile", () => ({ isMobile: false }));
jest.mock("../../libs/detectFast", () => ({
  detectLangFast: jest.fn(async () => "en"),
  quickDetectLang: () => "en",
  normalizeZhLang: (lang) => lang,
  isPureNumberText: () => false,
}));
jest.mock("../../components/Logo", () => () => null);
jest.mock("../../components/TranslationPanel/styles", () => ({
  TRANSLATION_PANEL_STYLES: "",
}));
jest.mock("../../components/TranslationPanel/Content", () => {
  const React = require("react");
  return function Content({ simpleStyle }) {
    const inputRef = React.useRef(null);
    React.useEffect(() => {
      if (!simpleStyle) inputRef.current?.focus();
    }, [simpleStyle]);
    return React.createElement(
      "div",
      { className: "kt-tranbox-content" },
      !simpleStyle &&
        React.createElement("input", { ref: inputRef, "aria-label": "Source" }),
      React.createElement(
        "button",
        { onClick: () => inputRef.current?.blur() },
        "Submit"
      ),
      React.createElement("p", null, "Translated result")
    );
  };
});

function Panel({ onState, initiallyPinned = false, simpleStyle = false }) {
  const [hideClickAway, setHideClickAway] = useState(!initiallyPinned);
  const themeRef = useRef(null);
  const controller = useSelectionController({
    tranboxSetting: { triggerMode: "select", skipLangs: [] },
    followSelection: false,
    boxSize: { w: 300, h: 250 },
    setBoxPosition: () => {},
  });
  useEffect(() => {
    onState({ ...controller, hideClickAway });
  });
  return (
    <div ref={themeRef} className="kt-m3-root">
      <TranBox
        {...controller}
        hideClickAway={hideClickAway}
        setHideClickAway={setHideClickAway}
        simpleStyle={simpleStyle}
        tranboxSetting={{ apiSlugs: [] }}
        boxSize={{ w: 300, h: 250 }}
        setBoxSize={() => {}}
        setBoxPosition={() => {}}
      />
      {controller.showBox &&
        themeRef.current &&
        createPortal(
          <button aria-label="Portaled option">Option</button>,
          themeRef.current
        )}
    </div>
  );
}

describe.each(["document", "shadow"])(
  "selection panel focus boundary in %s",
  (scope) => {
    let host;
    let container;
    let root;
    let state;
    let outside;
    let blank;
    let source;

    const panel = () => container.querySelector(".kt-translation-panel");
    const input = () => container.querySelector('input[aria-label="Source"]');
    const pin = () =>
      container.querySelector('button[title="btn_tip_click_away"]');
    const pointer = (target, type = "pointerdown") =>
      act(() =>
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            composed: true,
            cancelable: true,
            button: 0,
          })
        )
      );
    const flush = async (delay = 0) => {
      await act(async () => {
        jest.advanceTimersByTime(delay);
        await Promise.resolve();
      });
    };
    const render = (props = {}) => {
      act(() =>
        root.render(<Panel onState={(next) => (state = next)} {...props} />)
      );
      act(() => state.handleOpenTranbox("Selected source"));
      expect(panel()).not.toBeNull();
    };

    beforeEach(() => {
      jest.useFakeTimers();
      host = document.createElement("div");
      if (scope === "shadow") host.id = APP_CONSTS.boxID;
      const mount =
        scope === "shadow" ? host.attachShadow({ mode: "open" }) : host;
      container = document.createElement("div");
      mount.append(container);
      outside = document.createElement("input");
      blank = document.createElement("div");
      source = document.createElement("p");
      source.textContent = "Selected source";
      document.body.append(host, outside, blank, source);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => root.unmount());
      host.remove();
      outside.remove();
      blank.remove();
      source.remove();
      window.getSelection().removeAllRanges();
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    test.each([false, true])(
      "focuses the opened panel (minimal: %s)",
      (simpleStyle) => {
        render({ simpleStyle });
        expect(container.getRootNode().activeElement).toBe(
          simpleStyle ? panel() : input()
        );
      }
    );

    test("hides when keyboard focus leaves, while internal and portaled controls stay open", () => {
      render();
      act(() => pin().focus());
      expect(panel()).not.toBeNull();
      act(() =>
        container.querySelector('[aria-label="Portaled option"]').focus()
      );
      expect(panel()).not.toBeNull();
      act(() => outside.focus());
      expect(panel()).toBeNull();
      expect(document.activeElement).toBe(outside);
    });

    test("hides on an intercepted outside press even with a retained selection", async () => {
      render();
      const range = document.createRange();
      range.selectNodeContents(source);
      window.getSelection().addRange(range);
      blank.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      pointer(blank);
      expect(panel()).toBeNull();
      act(() =>
        blank.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      await flush(200);
      expect(panel()).toBeNull();
      expect(state.showBtn).toBe(false);
    });

    test("internal pointer blur restores panel focus after source submission", async () => {
      render();
      const submit = container.querySelector(".kt-tranbox-content button");
      pointer(submit);
      pointer(submit, "pointerup");
      act(() => submit.click());
      await flush();
      expect(panel()).not.toBeNull();
      expect(container.getRootNode().activeElement).toBe(panel());
    });

    test.each(["window blur", "hidden document"])(
      "hides on %s",
      (departure) => {
        render();
        if (departure === "window blur") {
          act(() => window.dispatchEvent(new Event("blur")));
        } else {
          jest.spyOn(document, "hidden", "get").mockReturnValue(true);
          act(() => document.dispatchEvent(new Event("visibilitychange")));
        }
        expect(panel()).toBeNull();
      }
    );

    test("pinning preserves the panel across focus loss and unpinning reactivates hiding", () => {
      render();
      act(() => {
        pin().focus();
        pin().click();
      });
      expect(pin().getAttribute("aria-pressed")).toBe("true");
      pointer(blank);
      act(() => {
        outside.focus();
        window.dispatchEvent(new Event("blur"));
      });
      expect(panel()).not.toBeNull();
      act(() => pin().click());
      expect(pin().getAttribute("aria-pressed")).toBe("false");
      expect(panel().contains(container.getRootNode().activeElement)).toBe(
        true
      );
      act(() => outside.focus());
      expect(panel()).toBeNull();
    });

    test("the selection trigger does not dismiss the opened panel", () => {
      render();
      const trigger = document.createElement("button");
      trigger.className = "KT-tranbtn";
      blank.append(trigger);
      pointer(trigger);
      expect(panel()).not.toBeNull();
    });

    test("a later press cancels a pending selection instead of reopening the dismissed panel", async () => {
      render();
      const range = document.createRange();
      range.selectNodeContents(source);
      window.getSelection().addRange(range);
      act(() =>
        source.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      pointer(blank);
      await flush(200);
      expect(panel()).toBeNull();
    });

    test("a new page selection still opens the panel after it loses focus", async () => {
      render();
      pointer(source);
      expect(panel()).toBeNull();
      const range = document.createRange();
      range.selectNodeContents(source);
      window.getSelection().addRange(range);
      act(() =>
        source.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      await flush(200);
      expect(panel()).not.toBeNull();
      expect(state.text).toBe("Selected source");
    });

    test("keyboard dismissal cancels a pending selection before its delay finishes", async () => {
      render();
      const range = document.createRange();
      range.selectNodeContents(source);
      window.getSelection().addRange(range);
      act(() =>
        source.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      act(() => outside.focus());
      await flush(200);
      expect(panel()).toBeNull();
    });

    test("reselecting the same text remains a new selection after the old range clears", async () => {
      render();
      const range = document.createRange();
      range.selectNodeContents(source);
      window.getSelection().addRange(range);
      pointer(source);
      expect(panel()).toBeNull();
      window.getSelection().removeAllRanges();
      act(() => document.dispatchEvent(new Event("selectionchange")));
      window.getSelection().addRange(range);
      act(() =>
        source.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      );
      await flush(200);
      expect(panel()).not.toBeNull();
    });
  }
);
