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

  afterEach(() => {
    if (manager) {
      act(() => manager.destroy());
    }
    delete globalThis[POPUP_MANAGER_KEY];
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
});
