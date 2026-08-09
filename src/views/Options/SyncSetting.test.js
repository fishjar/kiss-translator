import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  OPT_SYNCTYPE_ALL,
  OPT_SYNCTYPE_GIST,
  OPT_SYNCTYPE_WEBDAV,
  OPT_SYNCTYPE_WORKER,
} from "../../config";
import SyncSetting from "./SyncSetting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockInitialSyncType = OPT_SYNCTYPE_WORKER;
const mockUpdateSync = jest.fn();

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Sync", () => {
  const React = require("react");

  return {
    useSync: () => {
      const [sync, setSync] = React.useState(() => ({
        syncType: mockInitialSyncType,
        syncUrl: "",
        syncUser: "",
        syncKey: "",
        syncEncryptKey: "",
      }));
      const updateSync = async (patch) => {
        mockUpdateSync(patch);
        setSync((current) => ({ ...current, ...patch }));
      };

      return { sync, updateSync };
    },
  };
});

jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({
    error: jest.fn(),
    success: jest.fn(),
  }),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(async () => true),
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ reloadSetting: jest.fn() }),
}));

jest.mock("../../libs/sync", () => ({
  changeSyncEncryptKey: jest.fn(),
  syncSettingAndRules: jest.fn(),
}));

jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
  LogLevel: { INFO: { value: 1 } },
}));

function renderSyncSetting(initialSyncType) {
  mockInitialSyncType = initialSyncType;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SyncSetting />));

  const radios = () => [
    ...container.querySelectorAll('.kt-sync-method[role="radio"]'),
  ];
  const radioFor = (syncType) =>
    radios().find((radio) => radio.textContent.includes(syncType));

  return {
    container,
    radioFor,
    radios,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pressKey(element, key) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("SyncSetting method selection", () => {
  beforeEach(() => {
    mockUpdateSync.mockReset();
  });

  test("keeps only the selected method in the tab order", () => {
    const view = renderSyncSetting(OPT_SYNCTYPE_WEBDAV);

    expect(view.radios()).toHaveLength(OPT_SYNCTYPE_ALL.length);
    expect(view.radioFor(OPT_SYNCTYPE_WEBDAV).tabIndex).toBe(0);
    expect(view.radioFor(OPT_SYNCTYPE_WORKER).tabIndex).toBe(-1);
    expect(view.radioFor(OPT_SYNCTYPE_GIST).tabIndex).toBe(-1);

    view.unmount();
  });

  test.each([
    ["ArrowRight", OPT_SYNCTYPE_WEBDAV, OPT_SYNCTYPE_GIST],
    ["ArrowRight", OPT_SYNCTYPE_GIST, OPT_SYNCTYPE_WORKER],
    ["ArrowDown", OPT_SYNCTYPE_WEBDAV, OPT_SYNCTYPE_GIST],
    ["ArrowLeft", OPT_SYNCTYPE_WEBDAV, OPT_SYNCTYPE_WORKER],
    ["ArrowLeft", OPT_SYNCTYPE_WORKER, OPT_SYNCTYPE_GIST],
    ["ArrowUp", OPT_SYNCTYPE_WEBDAV, OPT_SYNCTYPE_WORKER],
    ["Home", OPT_SYNCTYPE_GIST, OPT_SYNCTYPE_WORKER],
    ["End", OPT_SYNCTYPE_WORKER, OPT_SYNCTYPE_GIST],
  ])(
    "%s focuses and selects the target method",
    (key, initialSyncType, expectedSyncType) => {
      const view = renderSyncSetting(initialSyncType);
      const initialRadio = view.radioFor(initialSyncType);

      act(() => initialRadio.focus());
      pressKey(initialRadio, key);

      const expectedRadio = view.radioFor(expectedSyncType);
      expect(document.activeElement).toBe(expectedRadio);
      expect(expectedRadio.getAttribute("aria-checked")).toBe("true");
      expect(expectedRadio.tabIndex).toBe(0);
      expect(initialRadio.tabIndex).toBe(-1);
      expect(mockUpdateSync).toHaveBeenCalledTimes(1);
      expect(mockUpdateSync).toHaveBeenCalledWith({
        syncType: expectedSyncType,
      });

      view.unmount();
    }
  );

  test("does not write when the selected method is clicked again", () => {
    const view = renderSyncSetting(OPT_SYNCTYPE_WORKER);

    act(() => view.radioFor(OPT_SYNCTYPE_WORKER).click());

    expect(mockUpdateSync).not.toHaveBeenCalled();
    view.unmount();
  });
});
