import { act } from "react";
import styled from "@emotion/styled";
import Selection from "../views/Selection";
import { APP_CONSTS } from "../config";
import { TransboxManager } from "./tranbox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../views/Selection", () => {
  const React = require("react");
  return jest.fn(() =>
    React.createElement("input", { defaultValue: "selection" })
  );
});

beforeEach(() => {
  // CRA resets mock implementations between tests, including component mocks.
  Selection.mockImplementation(() =>
    require("react").createElement("input", { defaultValue: "selection" })
  );
});

function lastSelectionProps() {
  const calls = Selection.mock.calls;
  return calls[calls.length - 1]?.[0];
}

const SelectionInput = styled.input({ color: "red" });

describe("TransboxManager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Selection.mockClear();
  });

  test("rerenders the active selection box when settings update", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "select" },
      });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).not.toBeNull();
    const initialRenderCount = Selection.mock.calls.length;
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("select");

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });

    expect(Selection.mock.calls.length).toBeGreaterThan(initialRenderCount);
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");

    act(() => {
      manager.disable();
    });
  });

  test("isolates the selection box host from page styles", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "select" },
      });
    });

    const host = document.getElementById(APP_CONSTS.boxID);
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.style.getPropertyValue("all")).toBe("initial");
    expect(host.style.getPropertyPriority("all")).toBe("important");
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
    expect(host.style.getPropertyValue("direction")).toBe("ltr");
    expect(host.style.getPropertyPriority("direction")).toBe("important");
    expect(host.style.getPropertyValue("unicode-bidi")).toBe("normal");
    expect(host.style.getPropertyPriority("unicode-bidi")).toBe("important");

    act(() => {
      manager.disable();
    });
  });

  test("unmounts when transOpen is disabled", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });

    act(() => {
      manager.update({ tranboxSetting: { transOpen: false } });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).toBeNull();
  });

  test("mounts when a disabled manager is enabled by update", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: false, triggerMode: "click" },
      });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).toBeNull();

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });

    expect(document.getElementById(APP_CONSTS.boxID)).not.toBeNull();
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");

    act(() => {
      manager.disable();
    });
  });

  test("keeps API prompt resolution on update renders", () => {
    let manager;

    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "select" },
        transApis: [
          {
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPromptSlug: "dictionary-en-zh",
          },
        ],
      });
    });

    expect(lastSelectionProps().transApis[0].dictPrompt).toBeTruthy();

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
        transApis: [
          {
            apiSlug: "openai",
            apiType: "OpenAI",
            dictPromptSlug: "dictionary-en-zh",
          },
        ],
      });
    });

    expect(lastSelectionProps().transApis[0].dictPrompt).toBeTruthy();
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");

    act(() => {
      manager.disable();
    });
  });
});

describe("TransboxManager fullscreen lifecycle", () => {
  let manager;
  let fullscreenElement;
  let originalFullscreen;
  let pageElements;

  beforeEach(() => {
    manager = null;
    fullscreenElement = null;
    pageElements = [];
    originalFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement"
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Selection.mockClear();
  });

  afterEach(() => {
    act(() => manager?.disable());
    pageElements.forEach((element) => element.remove());
    if (originalFullscreen) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreen);
    } else {
      delete document.fullscreenElement;
    }
  });

  function enable() {
    act(() => {
      manager = new TransboxManager({
        tranboxSetting: { transOpen: true, triggerMode: "select" },
      });
    });
  }

  function addSection() {
    const section = document.createElement("section");
    document.body.appendChild(section);
    pageElements.push(section);
    return section;
  }

  function enterFullscreen(element) {
    fullscreenElement = element;
    act(() => document.dispatchEvent(new Event("fullscreenchange")));
  }

  test("keeps the live selection tree across fullscreen transitions", () => {
    enable();
    const host = document.getElementById(APP_CONSTS.boxID);
    const input = host.shadowRoot.querySelector("input");
    input.value = "unsaved translation";
    const renderCount = Selection.mock.calls.length;
    const section = addSection();

    for (const target of [
      document.body,
      section,
      document.documentElement,
      null,
    ]) {
      enterFullscreen(target);
      expect(host.parentElement).toBe(target || document.documentElement);
      expect(manager.isEnabled()).toBe(true);
      expect(host.shadowRoot.querySelector("input")).toBe(input);
      expect(input.value).toBe("unsaved translation");
      expect(Selection.mock.calls.length).toBe(renderCount);
    }
  });

  test("treats a host in shadow fullscreen as enabled and updates its props", () => {
    const section = addSection();
    const shadowRoot = section.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    shadowRoot.appendChild(inner);
    Object.defineProperty(shadowRoot, "fullscreenElement", { value: inner });
    enterFullscreen(section);
    enable();

    const host = inner.querySelector(`[id="${APP_CONSTS.boxID}"]`);
    expect(host).not.toBeNull();
    expect(manager.isEnabled()).toBe(true);

    act(() => {
      manager.update({
        tranboxSetting: { transOpen: true, triggerMode: "click" },
      });
    });
    expect(lastSelectionProps().tranboxSetting.triggerMode).toBe("click");
    expect(inner.querySelector(`[id="${APP_CONSTS.boxID}"]`)).toBe(host);

    enterFullscreen(null);
    expect(host.parentElement).toBe(document.documentElement);
    expect(manager.isEnabled()).toBe(true);
  });

  test("releases disconnected trees before enabling a replacement", () => {
    enable();
    const oldHost = document.getElementById(APP_CONSTS.boxID);
    oldHost.remove();
    expect(manager.isEnabled()).toBe(false);

    act(() => manager.enable());
    const newHost = document.getElementById(APP_CONSTS.boxID);
    expect(newHost).not.toBe(oldHost);
    expect(oldHost.shadowRoot.querySelector("input")).toBeNull();

    document.documentElement.appendChild(oldHost);
    pageElements.push(oldHost);
    enterFullscreen(document.body);
    expect(oldHost.parentElement).toBe(document.documentElement);
    expect(newHost.parentElement).toBe(document.body);
  });

  test.each(["contents", "ancestor"])(
    "recovers styles and unsaved input after fullscreen %s removal",
    (removedPart) => {
      Selection.mockImplementation(() => (
        <SelectionInput defaultValue="selection" />
      ));
      enable();
      const host = document.getElementById(APP_CONSTS.boxID);
      const input = host.shadowRoot.querySelector("input");
      input.value = "unsaved translation";
      const section = addSection();
      enterFullscreen(section);
      const oldStyles = Array.from(host.shadowRoot.querySelectorAll("style"));
      expect(oldStyles.length).toBeGreaterThan(0);

      if (removedPart === "contents") section.replaceChildren();
      else section.remove();
      enterFullscreen(null);

      expect(manager.isEnabled()).toBe(true);
      expect(host.parentNode).toBe(document.documentElement);
      expect(host.shadowRoot.querySelector("input")).toBe(input);
      expect(input.value).toBe("unsaved translation");
      expect(oldStyles.every((style) => !style.isConnected)).toBe(true);
      const restoredStyles = Array.from(
        host.shadowRoot.querySelectorAll("style")
      );
      expect(restoredStyles.length).toBeGreaterThan(0);
      expect(restoredStyles.every((style) => !oldStyles.includes(style))).toBe(
        true
      );
    }
  );

  test("disabling a detached box releases its React tree and fullscreen listener", () => {
    enable();
    const host = document.getElementById(APP_CONSTS.boxID);
    host.remove();

    act(() => manager.update({ tranboxSetting: { transOpen: false } }));
    expect(host.shadowRoot.querySelector("input")).toBeNull();
    expect(manager.isEnabled()).toBe(false);

    document.documentElement.appendChild(host);
    pageElements.push(host);
    enterFullscreen(document.body);
    expect(host.parentElement).toBe(document.documentElement);
  });
});
