const POPUP_MANAGER_KEY = Symbol.for("kiss-translator.popup-manager");
const POPUP_MANAGER_BRAND = Symbol.for("kiss-translator.popup-manager.brand");

jest.mock(
  "./shadowDomManager",
  () =>
    class MockShadowDomManager {
      constructor(options) {
        this.options = options;
        this._id = options.id;
        this.hostElement = null;
      }

      get isVisible() {
        return Boolean(this.hostElement?.isConnected);
      }

      show() {
        if (!this.hostElement) {
          this.hostElement = globalThis.document.createElement("div");
          this.hostElement.id = this._id;
          globalThis.document.body.appendChild(this.hostElement);
        }
      }

      destroy() {
        this.hostElement?.remove();
        this.hostElement = null;
      }
    }
);

jest.mock("../views/Action", () => () => null);

jest.mock("../config", () => ({
  APP_CONSTS: { popupID: "kiss-translator-popup" },
  EVENT_KISS_INNER: "kiss-inner",
  MSG_POPUP_TOGGLE: "popup-toggle",
}));

const { PopupManager } = require("./popupManager");

describe("PopupManager singleton", () => {
  afterEach(() => {
    delete globalThis[POPUP_MANAGER_KEY];
    document.body.innerHTML = "";
  });

  test("keeps only one popup manager in the current window", () => {
    const first = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    const destroyFirst = jest.spyOn(first, "destroy");

    const second = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });

    expect(destroyFirst).toHaveBeenCalledTimes(1);
    expect(globalThis[POPUP_MANAGER_KEY]).toBe(second);

    second.destroy();
    expect(globalThis[POPUP_MANAGER_KEY]).toBeUndefined();
  });

  test("does not destroy an unowned value stored under the singleton key", () => {
    const destroy = jest.fn();
    globalThis[POPUP_MANAGER_KEY] = { destroy };

    const manager = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });

    expect(destroy).not.toHaveBeenCalled();
    expect(globalThis[POPUP_MANAGER_KEY]).toBe(manager);
  });

  test("destroys a branded manager created by a previous module instance", () => {
    const destroy = jest.fn();
    const legacyManager = Object.create(null);
    legacyManager[POPUP_MANAGER_BRAND] = true;
    legacyManager.destroy = destroy;
    globalThis[POPUP_MANAGER_KEY] = legacyManager;

    const manager = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });

    expect(legacyManager).not.toBeInstanceOf(PopupManager);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(globalThis[POPUP_MANAGER_KEY]).toBe(manager);
  });

  test("preserves a foreign element that uses the configured popup ID", () => {
    const foreignElement = document.createElement("div");
    foreignElement.id = "kiss-translator-popup";
    document.body.appendChild(foreignElement);

    const manager = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    manager.show();

    expect(document.getElementById("kiss-translator-popup")).toBe(
      foreignElement
    );
    expect(manager.hostElement).not.toBe(foreignElement);
    expect(manager.hostElement.id).toBe("kiss-translator-popup-1");
  });

  test("avoids an ID claimed by a foreign element before the first mount", () => {
    const manager = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    const foreignElement = document.createElement("div");
    foreignElement.id = "kiss-translator-popup";
    document.body.appendChild(foreignElement);

    manager.show();

    expect(foreignElement.isConnected).toBe(true);
    expect(manager.hostElement.id).toBe("kiss-translator-popup-1");
  });

  test("removes the previous manager host without removing a foreign host", () => {
    const foreignElement = document.createElement("div");
    foreignElement.id = "kiss-translator-popup";
    document.body.appendChild(foreignElement);

    const first = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    first.show();
    const firstHost = first.hostElement;
    const destroyFirst = jest.spyOn(first, "destroy");

    const second = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    second.show();

    expect(destroyFirst).toHaveBeenCalledTimes(1);
    expect(firstHost.isConnected).toBe(false);
    expect(foreignElement.isConnected).toBe(true);
    expect(second.hostElement.id).toBe("kiss-translator-popup-1");
  });

  test("does not let a replaced manager remount from a stale callback", () => {
    const first = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    first.show();

    const second = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });
    second.show();

    first.show();
    first.toggle();

    expect(document.querySelectorAll("#kiss-translator-popup")).toHaveLength(1);
    expect(globalThis[POPUP_MANAGER_KEY]).toBe(second);
  });
});
