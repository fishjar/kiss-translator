/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useEffect, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { CURRENT_SETTINGS_VERSION, DEFAULT_SETTING } from "../config";
import { ExpandMoreIcon } from "../components/icons";
import {
  DEFAULT_ICON_STYLE,
  getIconStyleSnapshot,
  setIconStyleSnapshot,
} from "../styles/iconStyleStore";
import * as iconStyleStore from "../styles/iconStyleStore";
import * as m3Module from "../styles/m3";
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

  // 时序探针：layout/passive 双标记，配合 store 写入标记定位同步阶段。
  function PassiveProbe({ markers }) {
    useLayoutEffect(() => {
      markers.push("layout");
    }, []);
    useEffect(() => {
      markers.push("passive");
    }, []);
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

  test("persists selection button appearance without changing the page FAB or other selection settings", () => {
    settings.updateChild("tranboxSetting")({ btnSize: 64, btnOpacity: 0.2 });
    const reduce = mockUpdate.mock.calls[0][0];
    const previous = {
      ...mockSetting,
      fab: { ...mockSetting.fab, size: 56, opacity: 0.8 },
      tranboxSetting: { triggerMode: "hover", btnOffsetX: 12 },
    };
    const saved = reduce(previous);
    expect(saved.tranboxSetting).toMatchObject({
      triggerMode: "hover",
      btnOffsetX: 12,
      btnSize: 64,
      btnOpacity: 0.2,
    });
    expect(saved.fab).toEqual(previous.fab);
    mockSetting = saved;
    mountProvider();
    expect(settings.setting.tranboxSetting).toMatchObject({
      btnSize: 64,
      btnOpacity: 0.2,
    });
  });

  test("persists reading size and restores it without modifying button preferences", () => {
    settings.updateChild("tranboxSetting")({ fontSize: 24 });
    const reduce = mockUpdate.mock.calls[0][0];
    const previous = {
      ...mockSetting,
      tranboxSetting: {
        ...mockSetting.tranboxSetting,
        btnSize: 32,
        btnOpacity: 0.5,
      },
    };
    const saved = reduce(previous);
    expect(saved.tranboxSetting).toEqual({
      ...previous.tranboxSetting,
      fontSize: 24,
    });
    mockSetting = saved;
    mountProvider();
    expect(settings.setting.tranboxSetting.fontSize).toBe(24);
  });

  test("normalizes a legacy theme without issuing a persistent update", () => {
    mockSetting = { ...mockSetting, darkMode: false };
    mountProvider();

    expect(settings.setting.darkMode).toBe("light");
    expect(mockSetting.darkMode).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("corrects the icon snapshot and DOM before paint after mount", () => {
    mockSetting = { ...mockSetting, iconStyle: "mui" };
    const localContainer = document.createElement("div");
    document.body.appendChild(localContainer);
    const localRoot = createRoot(localContainer);
    try {
      act(() =>
        localRoot.render(
          <SettingProvider context="popup">
            <ExpandMoreIcon />
          </SettingProvider>
        )
      );

      // 提交后、绘制前：Provider 的 useLayoutEffect 已把真实档写进共享快照，
      // 订阅分发器的组件在绘制前重渲染完成。
      expect(getIconStyleSnapshot()).toBe("mui");
      // 最终提交 DOM 为真实档：Lucide 字形以 <g stroke-width="2"> 包裹，
      // MUI 经典为裸 path；存 mui 时最终 DOM 不得出现 Lucide 包裹特征。
      // Lucide 包裹特征的真实存在性由 Setting.snapshot.test.js 的
      // lucide 正向自证用例承担，确保本负向断言不会空转永真。
      expect(localContainer.innerHTML).not.toBe("");
      expect(localContainer.innerHTML).not.toContain('stroke-width="2"');
    } finally {
      act(() => localRoot.unmount());
      localContainer.remove();
      setIconStyleSnapshot(DEFAULT_ICON_STYLE);
    }
  });

  test("writes the icon style snapshot in the layout phase before passive effects", () => {
    mockSetting = { ...mockSetting, iconStyle: "mui" };
    const markers = [];
    const realSetIconStyleSnapshot = iconStyleStore.setIconStyleSnapshot;
    const styleSpy = jest
      .spyOn(iconStyleStore, "setIconStyleSnapshot")
      .mockImplementation((value) => {
        markers.push(`snapshot:${value}`);
        realSetIconStyleSnapshot(value);
      });
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <PassiveProbe markers={markers} />
            <ExpandMoreIcon />
          </SettingProvider>
        )
      );

      // 目标值写入必须夹在子探针 layout 与 passive 标记之间：早于 layout
      // 即渲染期副作用，晚于 passive 即同步退到 useEffect，两侧各转红；
      // 拦截自证由目标标记在场承担（缺失则 indexOf 为 -1 时下方界断言
      // 先红）。passive 缺失时 indexOf 为 -1，>written 同样转红。
      expect(styleSpy).toHaveBeenCalled();
      const written = markers.indexOf("snapshot:mui");
      expect(written).toBeGreaterThanOrEqual(0);
      const layoutAt = markers.indexOf("layout");
      expect(layoutAt).toBeGreaterThanOrEqual(0);
      expect(layoutAt).toBeLessThan(written);
      expect(written).toBeLessThan(markers.indexOf("passive"));
    } finally {
      styleSpy.mockRestore();
    }
  });

  test("writes the icon color snapshot in the layout phase before passive effects", () => {
    mockSetting = { ...mockSetting, iconColor: "#3a6ea5" };
    m3Module.setIconColorSnapshot("#88aa66");
    const markers = [];
    const realSetIconColorSnapshot = m3Module.setIconColorSnapshot;
    const colorSpy = jest
      .spyOn(m3Module, "setIconColorSnapshot")
      .mockImplementation((value) => {
        markers.push(`snapshot:${value}`);
        realSetIconColorSnapshot(value);
      });
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <PassiveProbe markers={markers} />
            <ExpandMoreIcon />
          </SettingProvider>
        )
      );

      expect(colorSpy).toHaveBeenCalled();
      expect(m3Module.getIconColorSnapshot()).toBe("#3a6ea5");
      const written = markers.indexOf("snapshot:#3a6ea5");
      expect(written).toBeGreaterThanOrEqual(0);
      const layoutAt = markers.indexOf("layout");
      expect(layoutAt).toBeGreaterThanOrEqual(0);
      expect(layoutAt).toBeLessThan(written);
      expect(written).toBeLessThan(markers.indexOf("passive"));
    } finally {
      colorSpy.mockRestore();
      m3Module.setIconColorSnapshot(m3Module.DEFAULT_ICON_COLOR);
    }
  });
});
