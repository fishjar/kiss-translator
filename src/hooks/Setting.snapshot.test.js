/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
// ③ 回归守卫：SettingProvider 不得在 useStorage 的 isLoading 阶段把
// DEFAULT_SETTING 写进 m3.js 共享快照——否则同一 JS 上下文里已挂载并填充
// 的其它根会被临时打回默认档（lucide/默认色）。门控后，快照同步发生在
// Provider 的 useLayoutEffect（提交后、浏览器绘制前）：首次提交 DOM 允许
// 仍是旧档，绘制前必须完成修正，最终提交 DOM 为真实档。
import { act, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CURRENT_SETTINGS_VERSION, DEFAULT_SETTING } from "../config";
import { ExpandMoreIcon } from "../components/icons";
import {
  DEFAULT_ICON_STYLE,
  getIconStyleSnapshot,
  setIconStyleSnapshot,
} from "../styles/m3";
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

describe("icon snapshot sync gates on isLoading", () => {
  afterEach(() => {
    setIconStyleSnapshot(DEFAULT_ICON_STYLE);
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
    // PR #17 评审 Nitpick #6：既有用例只覆盖 default→mui 与
    // default→lucide 两个方向；补 mui→lucide 反向切换的订阅响应缺口。
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
});
