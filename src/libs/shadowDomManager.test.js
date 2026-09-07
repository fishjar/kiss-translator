import React, { act, useState } from "react";
import styled from "@emotion/styled";
import ShadowDomManager from "./shadowDomManager";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CounterButton = styled.button({ color: "red" });

function CounterPanel({ label = "" }) {
  const [count, setCount] = useState(0);
  return (
    <CounterButton onClick={() => setCount(count + 1)}>
      {label}
      {count}
    </CounterButton>
  );
}

describe("ShadowDomManager fullscreen lifecycle", () => {
  let fullscreenElement;
  let originalFullscreen;
  let managers;
  let pageElements;

  beforeEach(() => {
    fullscreenElement = null;
    originalFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement"
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    managers = [];
    pageElements = [];
  });

  afterEach(() => {
    act(() => managers.forEach((manager) => manager.destroy()));
    pageElements.forEach((element) => element.remove());
    if (originalFullscreen) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreen);
    } else {
      delete document.fullscreenElement;
    }
  });

  function createManager(options = {}) {
    const manager = new ShadowDomManager({
      id: "fullscreen-panel",
      reactComponent: CounterPanel,
      ...options,
    });
    managers.push(manager);
    act(() => manager.show());
    return manager;
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

  test("preserves rendered state and hidden state while changing fullscreen roots", () => {
    const manager = createManager();
    const host = document.getElementById("fullscreen-panel");
    const button = host.shadowRoot.querySelector("button");
    act(() => button.click());
    expect(button.textContent).toBe("1");

    const section = addSection();
    for (const target of [document.body, section, null]) {
      enterFullscreen(target);
      expect(host.parentElement).toBe(target || document.documentElement);
      expect(host.shadowRoot.querySelector("button")).toBe(button);
      expect(button.textContent).toBe("1");
      expect(manager.isVisible).toBe(true);
    }

    act(() => manager.hide());
    enterFullscreen(section);
    expect(manager.isVisible).toBe(false);
    expect(host.style.getPropertyValue("display")).toBe("none");
    act(() => manager.show());
    expect(manager.isVisible).toBe(true);
    expect(button.textContent).toBe("1");
    expect(host.style.getPropertyValue("display")).toBe("block");
  });

  test("mounts in current shadow fullscreen and reports a connected host", () => {
    const section = addSection();
    const shadowRoot = section.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    shadowRoot.appendChild(inner);
    Object.defineProperty(shadowRoot, "fullscreenElement", { value: inner });
    enterFullscreen(section);

    const manager = createManager();
    const host = inner.querySelector("#fullscreen-panel");
    expect(host).not.toBeNull();
    expect(manager.isVisible).toBe(true);
    expect(host.shadowRoot.querySelector("button").textContent).toBe("0");

    enterFullscreen(null);
    expect(host.parentElement).toBe(document.documentElement);
    expect(manager.isVisible).toBe(true);
  });

  test("honors an explicit root even when fullscreen changes", () => {
    const explicitRoot = addSection();
    const manager = createManager({ rootElement: explicitRoot });
    const host = document.getElementById("fullscreen-panel");

    enterFullscreen(document.body);
    expect(host.parentElement).toBe(explicitRoot);
    expect(manager.isVisible).toBe(true);
  });

  test.each(["contents", "ancestor"])(
    "restores styles and panel state after the fullscreen %s are removed",
    (removedPart) => {
      const manager = createManager();
      const host = document.getElementById("fullscreen-panel");
      const button = host.shadowRoot.querySelector("button");
      act(() => button.click());
      const section = addSection();
      enterFullscreen(section);
      const oldStyles = Array.from(host.shadowRoot.querySelectorAll("style"));
      expect(oldStyles.length).toBeGreaterThan(0);

      if (removedPart === "contents") section.replaceChildren();
      else section.remove();
      enterFullscreen(null);

      expect(manager.isVisible).toBe(true);
      expect(host.parentNode).toBe(document.documentElement);
      expect(host.shadowRoot.querySelector("button")).toBe(button);
      expect(button.textContent).toBe("1");
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

  test("keeps hidden visibility and the last mounted props during style recovery", () => {
    const manager = new ShadowDomManager({
      id: "fullscreen-panel",
      reactComponent: CounterPanel,
      props: { label: "initial " },
    });
    managers.push(manager);
    act(() => manager.show({ label: "custom " }));
    const host = document.getElementById("fullscreen-panel");
    const button = host.shadowRoot.querySelector("button");
    act(() => button.click());
    const section = addSection();
    enterFullscreen(section);
    act(() => manager.hide());
    section.remove();
    enterFullscreen(null);

    expect(manager.isVisible).toBe(false);
    expect(host.style.display).toBe("none");
    expect(button.textContent).toBe("custom 1");
    act(() => manager.show());
    expect(host.shadowRoot.querySelector("button")).toBe(button);
    expect(button.textContent).toBe("custom 1");
  });

  test("replaces a removed host and does not retain listeners for old hosts", () => {
    const manager = createManager();
    const oldHost = document.getElementById("fullscreen-panel");
    oldHost.remove();
    expect(manager.isVisible).toBe(false);

    act(() => manager.show());
    const newHost = document.getElementById("fullscreen-panel");
    expect(newHost).not.toBe(oldHost);
    expect(manager.isVisible).toBe(true);

    document.documentElement.appendChild(oldHost);
    pageElements.push(oldHost);
    enterFullscreen(document.body);
    expect(oldHost.parentElement).toBe(document.documentElement);
    expect(newHost.parentElement).toBe(document.body);
    expect(oldHost.shadowRoot.querySelector("button")).toBeNull();
  });

  test("destroy releases the React root and fullscreen listener while detached", () => {
    const manager = createManager();
    const host = document.getElementById("fullscreen-panel");
    host.remove();

    act(() => manager.destroy());
    expect(manager.isVisible).toBe(false);
    expect(host.shadowRoot.querySelector("button")).toBeNull();

    document.documentElement.appendChild(host);
    pageElements.push(host);
    enterFullscreen(document.body);
    expect(host.parentElement).toBe(document.documentElement);
  });
});
