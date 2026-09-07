import { buildOverviewShortcutMap } from "./Commands";

jest.mock("../libs/client", () => ({ isExt: false }));
jest.mock("../libs/msg", () => ({ sendBgMsg: jest.fn() }));

describe("buildOverviewShortcutMap", () => {
  const setting = {
    shortcuts: {
      toggleTranslate: ["AltLeft", "KeyQ"],
      togglePopup: ["AltLeft", "KeyK"],
      toggleStyle: ["AltLeft", "KeyC"],
      openSetting: ["AltLeft", "KeyO"],
    },
    tranboxSetting: { tranboxShortcut: ["AltLeft", "KeyS"] },
    inputRule: { triggerShortcut: ["AltLeft", "KeyI"] },
  };

  test("uses stored shortcuts outside the extension command API", () => {
    expect(buildOverviewShortcutMap(setting)).toEqual({
      page: ["Left Alt", "Q"],
      popup: ["Left Alt", "K"],
      style: ["Left Alt", "C"],
      selection: ["Left Alt", "S"],
      input: ["Left Alt", "I"],
      settings: ["Left Alt", "O"],
    });
  });

  test("prefers browser command overrides", () => {
    expect(
      buildOverviewShortcutMap(setting, [
        { name: "toggleTranslate", shortcut: "Ctrl+Shift+Y" },
        { name: "_execute_action", shortcut: "Ctrl+Shift+K" },
      ])
    ).toEqual(
      expect.objectContaining({
        page: ["Ctrl", "Shift", "Y"],
        popup: ["Ctrl", "Shift", "K"],
      })
    );
  });

  test("preserves intentionally unassigned browser commands", () => {
    expect(
      buildOverviewShortcutMap(setting, [
        { name: "toggleTranslate", shortcut: "" },
        { name: "openTranbox", shortcut: "" },
      ])
    ).toEqual(
      expect.objectContaining({
        page: [],
        selection: [],
      })
    );
  });

  test("reads the Firefox and Thunderbird browser-action command", () => {
    expect(
      buildOverviewShortcutMap(setting, [
        { name: "_execute_browser_action", shortcut: "Ctrl+Alt+K" },
      ])
    ).toEqual(
      expect.objectContaining({
        popup: ["Ctrl", "Alt", "K"],
      })
    );
  });
});
