import { act } from "react";

const POPUP_MANAGER_KEY = Symbol.for("kiss-translator.popup-manager");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@emotion/cache", () => {
  const path = require("node:path");
  const packagePath = require.resolve("@emotion/cache/package.json");
  return require(
    path.join(
      path.dirname(packagePath),
      "dist/emotion-cache.development.cjs.js"
    )
  );
});

jest.mock("../views/Action", () => () => null);

const { APP_CONSTS } = require("../config");
const { PopupManager } = require("./popupManager");

describe("PopupManager Shadow DOM integration", () => {
  let manager;
  let hostileStyle;

  afterEach(() => {
    if (manager) {
      act(() => manager.destroy());
    }
    delete globalThis[POPUP_MANAGER_KEY];
    hostileStyle?.remove();
    hostileStyle = null;
    document.body.innerHTML = "";
  });

  test("uses a stable Emotion cache key when the host ID needs a numeric suffix", () => {
    const foreignElement = document.createElement("div");
    foreignElement.id = APP_CONSTS.popupID;
    document.body.appendChild(foreignElement);

    manager = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });

    act(() => manager.show());

    const popupHost = document.getElementById(`${APP_CONSTS.popupID}-1`);
    expect(manager.isVisible).toBe(true);
    expect(popupHost).not.toBeNull();
    expect(popupHost.shadowRoot).not.toBeNull();
    expect(document.getElementById(APP_CONSTS.popupID)).toBe(foreignElement);
  });

  test("isolates the light-DOM host from hostile page styles", () => {
    hostileStyle = document.createElement("style");
    hostileStyle.textContent = `
      div {
        display: inline !important;
        width: 600px !important;
        margin: 24px !important;
        padding: 16px !important;
        opacity: .8 !important;
        transform: translateX(100px) !important;
        filter: blur(2px) !important;
      }
    `;
    document.head.appendChild(hostileStyle);
    const unprotectedControl = document.createElement("div");
    document.body.appendChild(unprotectedControl);

    manager = new PopupManager({
      translator: {},
      processActions: jest.fn(),
    });

    act(() => manager.show());

    const popupHost = document.getElementById(APP_CONSTS.popupID);
    expect(window.getComputedStyle(unprotectedControl).opacity).toBe("0.8");
    expect(popupHost.style.getPropertyValue("all")).toBe("initial");
    expect(popupHost.style.getPropertyPriority("all")).toBe("important");
    expect(popupHost.style.getPropertyValue("display")).toBe("block");
    expect(popupHost.style.getPropertyPriority("display")).toBe("important");
    expect(popupHost.style.getPropertyValue("direction")).toBe("ltr");
    expect(popupHost.style.getPropertyPriority("direction")).toBe("important");
    expect(popupHost.style.getPropertyValue("unicode-bidi")).toBe("normal");
    expect(popupHost.style.getPropertyPriority("unicode-bidi")).toBe(
      "important"
    );

    act(() => manager.hide());
    expect(popupHost.style.getPropertyValue("display")).toBe("none");
    expect(popupHost.style.getPropertyPriority("display")).toBe("important");

    act(() => manager.show());
    expect(popupHost.style.getPropertyValue("display")).toBe("block");
    expect(popupHost.style.getPropertyPriority("display")).toBe("important");
  });
});
