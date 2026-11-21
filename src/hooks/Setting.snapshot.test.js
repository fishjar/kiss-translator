/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
// ③ 回归守卫：SettingProvider 不得在 useStorage 的 isLoading 阶段把
// DEFAULT_SETTING 写进 m3.js 共享快照——否则同一 JS 上下文里已挂载并填充
// 的其它根会被临时打回默认档（lucide/默认色）。门控后，快照同步发生在
// Provider 的 useLayoutEffect（提交后、浏览器绘制前）：首次提交 DOM 允许
// 仍是旧档，绘制前必须完成修正，最终提交 DOM 为真实档。
import { act, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CURRENT_SETTINGS_VERSION, DEFAULT_SETTING } from "../config";
import { ExpandMoreIcon } from "../components/icons";
import {
  DEFAULT_ICON_STYLE,
  getIconStyleSnapshot,
  setIconStyleSnapshot,
} from "../styles/iconStyleStore";
import {
  DEFAULT_ICON_COLOR,
  getIconColorSnapshot,
  setIconColorSnapshot,
} from "../styles/m3";
import * as iconStyleStore from "../styles/iconStyleStore";
import * as m3Module from "../styles/m3";
import { SettingProvider } from "./Setting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 可控 storage 桩：逐轮切换 data / isLoading，模拟冷启动 -> 读盘完成。
let mockStorage;
jest.mock("./Storage", () => ({
  useStorage: () => ({
    data: mockStorage.data,
    isLoading: mockStorage.isLoading,
    update: jest.fn().mockResolvedValue({ changed: true }),
    reload: jest.fn(),
  }),
}));
jest.mock("../libs/client", () => ({ isExt: false }));
jest.mock("../libs/browser", () => ({}));
jest.mock("../libs/msg", () => ({ sendBgMsg: jest.fn() }));

const loadedSetting = (patch = {}) => ({
  data: { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION, ...patch },
  isLoading: false,
});

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

describe("icon snapshot sync gates on isLoading", () => {
  afterEach(() => {
    setIconStyleSnapshot(DEFAULT_ICON_STYLE);
    setIconColorSnapshot(DEFAULT_ICON_COLOR);
    document.body.innerHTML = "";
  });

  test("does not clobber the shared snapshot while storage is still loading", () => {
    // 另一根已把共享 store 置为非默认档。
    setIconStyleSnapshot("mui");
    mockStorage = {
      data: { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION },
      isLoading: true,
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      // 加载期本根不得把 store 打回默认档。
      expect(getIconStyleSnapshot()).toBe("mui");
    } finally {
      act(() => root.unmount());
    }
  });

  test("does not clobber the shared icon color snapshot while storage is still loading", () => {
    // 另一根已把共享颜色 store 置为非默认档；加载期本根不得写快照，
    // 否则同上下文已挂载根的颜色档被临时打回默认。
    setIconColorSnapshot("#3a6ea5");
    mockStorage = {
      data: { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION },
      isLoading: true,
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      expect(getIconColorSnapshot()).toBe("#3a6ea5");
    } finally {
      act(() => root.unmount());
    }
  });

  test("does not reset the shared snapshot when storage resolves empty", () => {
    // 读盘失败/空档（data 为 null）不得把共享图标样式快照重置回默认档：
    // 预置非默认档后渲染空档 Provider，快照值必须原样保留。
    setIconStyleSnapshot("mui");
    mockStorage = { data: null, isLoading: false };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      expect(getIconStyleSnapshot()).toBe("mui");
    } finally {
      act(() => root.unmount());
    }
  });

  test("does not reset the shared icon color snapshot when storage resolves empty", () => {
    // 读盘失败/空档（data 为 null）不得把共享图标颜色快照打回默认档：
    // 预置非默认色后渲染空档 Provider，快照值必须原样保留。
    setIconColorSnapshot("#3a6ea5");
    mockStorage = { data: null, isLoading: false };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      expect(getIconColorSnapshot()).toBe("#3a6ea5");
    } finally {
      act(() => root.unmount());
    }
  });

  test("corrects the icon snapshot and DOM before paint after load", () => {
    mockStorage = {
      data: { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION },
      isLoading: true,
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      // 加载期：children 未渲染，本根不得写共享快照。
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      // 读盘完成，且真实档为非默认 mui。
      mockStorage = loadedSetting({ iconStyle: "mui" });
      act(() =>
        root.render(
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
      expect(container.innerHTML).not.toBe("");
      expect(container.innerHTML).not.toContain('stroke-width="2"');
      // 正向自证：下方 lucide 用例确认 Lucide 包裹特征真实存在，
      // 否则本负向断言会在 MD3 bundle 删除后永真（空转失守）。
    } finally {
      act(() => root.unmount());
    }
  });

  test("first committed DOM carries the lucide wrapper when stored style is lucide", () => {
    mockStorage = {
      data: {
        ...DEFAULT_SETTING,
        version: CURRENT_SETTINGS_VERSION,
        iconStyle: "lucide",
      },
      isLoading: false,
    };
    let firstCommitHtml = "";
    function LucideProbe() {
      const iconRef = useRef(null);
      useLayoutEffect(() => {
        firstCommitHtml = iconRef.current?.outerHTML ?? "";
      }, []);
      return <ExpandMoreIcon ref={iconRef} />;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <LucideProbe />
          </SettingProvider>
        )
      );
      expect(firstCommitHtml).toContain('stroke-width="2"');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  test("switches the icon snapshot from mui to lucide when stored style changes", () => {
    // 既有用例只覆盖 default→mui 与 default→lucide 两个方向；
    // 补 mui→lucide 反向切换的订阅响应缺口。
    setIconStyleSnapshot("mui");
    mockStorage = {
      data: {
        ...DEFAULT_SETTING,
        version: CURRENT_SETTINGS_VERSION,
        iconStyle: "lucide",
      },
      isLoading: false,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <ExpandMoreIcon />
          </SettingProvider>
        )
      );
      expect(getIconStyleSnapshot()).toBe("lucide");
      // Lucide 包裹特征：<g stroke-width="2">；mui 档为裸 path 不含此特征。
      expect(container.innerHTML).toContain('stroke-width="2"');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  test("writes the icon style snapshot in the layout phase when loading completes", () => {
    setIconStyleSnapshot("lucide");
    mockStorage = {
      data: { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION },
      isLoading: true,
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const markers = [];
    const realSetIconStyleSnapshot = iconStyleStore.setIconStyleSnapshot;
    const styleSpy = jest
      .spyOn(iconStyleStore, "setIconStyleSnapshot")
      .mockImplementation((value) => {
        markers.push(`snapshot:${value}`);
        realSetIconStyleSnapshot(value);
      });
    try {
      // 加载期：children 未渲染，本根不得写共享快照——加载阶段残留的写入
      // 标记会污染下方窗口序断言，先按标记面自证零写入。
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      expect(getIconStyleSnapshot()).toBe("lucide");
      expect(
        markers.filter((marker) => marker.startsWith("snapshot:"))
      ).toHaveLength(0);

      // 读盘完成，真实档为非当前快照的 mui；写入必须落在 layout 与
      // passive 标记之间：早于 layout 即渲染期副作用，晚于 passive 即
      // 同步退到 useEffect。目标值绑定令加载期回写冒充不得通过。
      mockStorage = loadedSetting({ iconStyle: "mui" });
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <PassiveProbe markers={markers} />
            <ExpandMoreIcon />
          </SettingProvider>
        )
      );

      expect(styleSpy).toHaveBeenCalled();
      expect(getIconStyleSnapshot()).toBe("mui");
      const written = markers.indexOf("snapshot:mui");
      expect(written).toBeGreaterThanOrEqual(0);
      const layoutAt = markers.indexOf("layout");
      expect(layoutAt).toBeGreaterThanOrEqual(0);
      expect(layoutAt).toBeLessThan(written);
      expect(written).toBeLessThan(markers.indexOf("passive"));
    } finally {
      styleSpy.mockRestore();
      act(() => root.unmount());
    }
  });

  test("writes the icon color snapshot in the layout phase when loading completes", () => {
    setIconColorSnapshot("#88aa66");
    mockStorage = {
      data: { ...DEFAULT_SETTING, version: CURRENT_SETTINGS_VERSION },
      isLoading: true,
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
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
            <span>placeholder</span>
          </SettingProvider>
        )
      );
      expect(getIconColorSnapshot()).toBe("#88aa66");
      expect(
        markers.filter((marker) => marker.startsWith("snapshot:"))
      ).toHaveLength(0);

      mockStorage = loadedSetting({ iconColor: "#3a6ea5" });
      act(() =>
        root.render(
          <SettingProvider context="popup">
            <PassiveProbe markers={markers} />
            <ExpandMoreIcon />
          </SettingProvider>
        )
      );

      expect(colorSpy).toHaveBeenCalled();
      expect(getIconColorSnapshot()).toBe("#3a6ea5");
      const written = markers.indexOf("snapshot:#3a6ea5");
      expect(written).toBeGreaterThanOrEqual(0);
      const layoutAt = markers.indexOf("layout");
      expect(layoutAt).toBeGreaterThanOrEqual(0);
      expect(layoutAt).toBeLessThan(written);
      expect(written).toBeLessThan(markers.indexOf("passive"));
    } finally {
      colorSpy.mockRestore();
      act(() => root.unmount());
    }
  });
});
