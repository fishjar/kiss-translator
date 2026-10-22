import { act } from "react";
import { FabManager } from "./fabManager";
import { APP_CONSTS } from "../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../views/Action/ContentFab", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ onClose }) =>
      React.createElement("button", { onClick: onClose }, "Close FAB"),
  };
});

describe("FabManager temporary shortcut", () => {
  let manager;

  afterEach(() => {
    act(() => manager?.destroy());
  });

  function createManager(fabConfig) {
    act(() => {
      manager = new FabManager({ processActions: jest.fn(), fabConfig });
    });
  }

  function pressShortcut(codes = ["AltLeft", "KeyB"]) {
    act(() => {
      for (const code of codes) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      }
      for (const code of [...codes].reverse()) {
        window.dispatchEvent(new KeyboardEvent("keyup", { code }));
      }
    });
  }

  test("shows a hidden FAB without changing its configuration", () => {
    const fabConfig = { isHide: true, size: 72, hideExceptionList: "example" };
    createManager(fabConfig);
    expect(manager.isVisible).toBe(false);
    expect(document.getElementById(APP_CONSTS.fabID)).toBeNull();

    pressShortcut();

    expect(manager.isVisible).toBe(true);
    expect(fabConfig).toEqual({
      isHide: true,
      size: 72,
      hideExceptionList: "example",
    });
    const host = document.getElementById(APP_CONSTS.fabID);
    act(() => host.shadowRoot.querySelector("button").click());
    expect(manager.isVisible).toBe(false);
    pressShortcut();
    expect(manager.isVisible).toBe(true);
    expect(document.getElementById(APP_CONSTS.fabID)).toBe(host);
  });

  test("leaves an already visible FAB shown without remounting", () => {
    createManager({ isHide: false });
    const host = document.getElementById(APP_CONSTS.fabID);

    pressShortcut();
    pressShortcut();

    expect(manager.isVisible).toBe(true);
    expect(document.getElementById(APP_CONSTS.fabID)).toBe(host);
  });

  test("suspends the entire host and ignores display requests until resumed", () => {
    const config = { isHide: false, x: 10, y: 250, size: 64 };
    createManager(config);
    const host = document.getElementById(APP_CONSTS.fabID);
    const menu = document.createElement("div");
    menu.className = "kt-content-fab-menu";
    host.shadowRoot.appendChild(menu);
    act(() => manager.suspend());
    expect(host.style.getPropertyValue("display")).toBe("none");
    expect(host.style.getPropertyPriority("display")).toBe("important");
    expect(manager.isVisible).toBe(false);
    pressShortcut();
    act(() => { manager.show(); manager.suspend(); });
    expect(host.style.display).toBe("none");
    act(() => manager.resume());
    expect(manager.isVisible).toBe(true);
    expect(document.getElementById(APP_CONSTS.fabID)).toBe(host);
    expect(config).toEqual({ isHide: false, x: 10, y: 250, size: 64 });
    menu.remove();
  });

  test.each([true, false])("keeps an originally hidden FAB hidden (persisted hide: %s)", (isHide) => {
    createManager({ isHide });
    act(() => { manager.hide(); manager.suspend(); });
    pressShortcut();
    act(() => manager.resume());
    expect(manager.isVisible).toBe(false);
  });

  test("destroying a suspended FAB prevents late resume from remounting it", () => {
    createManager({ isHide: false });
    act(() => { manager.suspend(); manager.destroy(); manager.resume(); });
    expect(document.getElementById(APP_CONSTS.fabID)).toBeNull();
  });

  test.each([["KeyB"], ["AltLeft", "KeyC"], ["AltLeft", "ShiftLeft", "KeyB"]])(
    "ignores a different key combination: %j",
    (...codes) => {
      createManager({ isHide: true });
      pressShortcut(codes);
      expect(manager.isVisible).toBe(false);
    }
  );

  test("cleans up the shortcut and keeps a new page load hidden", () => {
    createManager({ isHide: true });
    pressShortcut();
    act(() => manager.destroy());
    pressShortcut();
    expect(document.getElementById(APP_CONSTS.fabID)).toBeNull();

    createManager({ isHide: true });
    expect(manager.isVisible).toBe(false);
    pressShortcut();
    expect(manager.isVisible).toBe(true);
  });
});
