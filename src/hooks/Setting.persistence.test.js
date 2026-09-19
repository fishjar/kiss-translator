/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CURRENT_SETTINGS_VERSION, DEFAULT_SETTING } from "../config";
import { SettingProvider, useSetting } from "./Setting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockUpdate = jest.fn();
let mockSetting;
jest.mock("./Storage", () => ({
  useStorage: () => ({
    data: mockSetting,
    isLoading: false,
    update: mockUpdate,
    reload: jest.fn(),
  }),
}));
jest.mock("../libs/client", () => ({ isExt: false }));
jest.mock("../libs/browser", () => ({}));
jest.mock("../libs/msg", () => ({ sendBgMsg: jest.fn() }));

describe("settings persistence results", () => {
  let container;
  let root;
  let settings;

  function Probe() {
    settings = useSetting();
    return null;
  }

  function mountProvider() {
    act(() =>
      root.render(
        <SettingProvider context="popup">
          <Probe />
        </SettingProvider>
      )
    );
  }

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ changed: true });
    mockSetting = { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mountProvider();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("returns the actual update promise and preserves a persistence rejection", async () => {
    const error = new Error("Settings could not be saved");
    const pending = Promise.reject(error);
    mockUpdate.mockReturnValueOnce(pending);

    const result = settings.updateSetting({ darkMode: "dark" });

    expect(result).toBe(pending);
    await expect(result).rejects.toBe(error);
  });

  test("returns the child update promise and rebases only the captured patch", () => {
    const pending = Promise.resolve({ changed: true });
    mockUpdate.mockReturnValueOnce(pending);
    const patch = { autoFavWord: true };

    expect(settings.updateChild("tranboxSetting")(patch)).toBe(pending);
    patch.autoFavWord = false;
    const reduce = mockUpdate.mock.calls[0][0];
    const previous = { tranboxSetting: { width: 600 }, uiLang: "en" };

    expect(reduce(previous)).toMatchObject({
      tranboxSetting: { width: 600, autoFavWord: true },
      uiLang: "en",
    });
    expect(previous.tranboxSetting).toEqual({ width: 600 });
  });

  test("normalizes a legacy theme without issuing a persistent update", () => {
    mockSetting = { ...mockSetting, darkMode: false };
    mountProvider();

    expect(settings.setting.darkMode).toBe("light");
    expect(mockSetting.darkMode).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
