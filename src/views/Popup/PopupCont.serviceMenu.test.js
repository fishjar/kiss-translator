/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
// 服务菜单单选语义闸：role=menuitemradio + aria-checked + 行首 radio 字形交换。
// 独立于 PopupCont.test.js：后者 client mock getter 在变量声明前被装载期读取会抛错，
// 本文件 client mock 为工厂内常量对象，杜绝同族问题。
import { act } from "react";
import { createRoot } from "react-dom/client";
import PopupCont from "./PopupCont";
import { getRulesWithDefault } from "../../libs/storage";
import { isCurrentPopupDocument } from "../../libs/popupDocument";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockStyles = Array.from({ length: 7 }, (_, index) => ({
  styleSlug: `style_${index}`,
  styleName: `Style ${index}`,
  styleCode: `color: rgb(${index}, 0, 0);`,
  source: index < 5 ? "builtin" : "custom",
  isBuiltin: index < 5,
}));
const mockUpdateSetting = jest.fn();
const mockSendBgMsg = jest.fn(async () => []);

jest.mock("../../hooks/MouseHover", () => ({
  useMouseHoverSetting: () => ({ updateMouseHoverSetting: jest.fn() }),
}));
jest.mock("../../components/TouchTranslateControl", () => () => null);
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: { blacklist: "" },
    updateSetting: mockUpdateSetting,
  }),
}));
jest.mock("../../hooks/CustomStyles", () => ({
  ...jest.requireActual("../../hooks/CustomStyles"),
  useAllTextStyles: () => ({ allTextStyles: mockStyles }),
}));
jest.mock("@emotion/react", () => ({
  ...jest.requireActual("@emotion/react"),
  ClassNames: ({ children }) => children({ css: () => "mock-preview-class" }),
}));
jest.mock("../../libs/msg", () => ({
  getCurTab: jest.fn(async () => ({ url: "https://example.com/page" })),
  sendBgMsg: (...args) => mockSendBgMsg(...args),
  sendTabMsg: jest.fn(async () => undefined),
  sendTopFrameMsg: jest.fn(async () => undefined),
}));
jest.mock("../../libs/client", () => ({ isExt: false }));
jest.mock("../../libs/cache", () => ({ tryClearCaches: jest.fn() }));
jest.mock("../../libs/log", () =>
  jest.requireActual("../../testUtils/scopedLogMock").withScopedLogMock(
    (() => ({
      ...jest.requireActual("../../libs/log"),
      kissLog: jest.fn(),
    }))()
  )
);
jest.mock("../../libs/rules", () => ({ saveRule: jest.fn() }));
jest.mock("../../libs/storage", () => ({
  getRulesWithDefault: jest.fn(async () => []),
}));
jest.mock("../../libs/popupDocument", () => ({
  isCurrentPopupDocument: jest.fn(async () => true),
}));

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// CRA jest 配置先 resetMocks 清空工厂内实现，与其他 Popup 测试同法在每个
// 用例前显式复位；否则 getRulesWithDefault() 返回 undefined 在装载期炸
// （假红，非本闸目标）。
beforeEach(() => {
  getRulesWithDefault.mockReset();
  getRulesWithDefault.mockResolvedValue([]);
  isCurrentPopupDocument.mockReset();
  isCurrentPopupDocument.mockResolvedValue(true);
  mockSendBgMsg.mockReset();
  mockSendBgMsg.mockResolvedValue([]);
});

function renderPopupCont(selectedSlug = "google") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const setting = {
    transApis: ["google", "second", "third", "fourth"].map((apiSlug) => ({
      apiSlug,
      apiName: apiSlug,
      apiType: "Google",
    })),
    tranboxSetting: { transOpen: true },
    mouseHoverSetting: { useMouseHover: false },
    inputRule: { transOpen: true },
    shortcuts: { toggleTranslate: ["AltLeft", "KeyQ"] },
  };
  const rule = {
    transOpen: "true",
    apiSlug: selectedSlug,
    fromLang: "auto",
    toLang: "zh-CN",
    textStyle: "style_0",
    autoScan: "true",
    transOnly: "false",
    hasRichText: "true",
    scanAll: "false",
    isPlainText: false,
  };
  act(() => {
    root.render(
      <PopupCont rule={rule} setting={setting} setRule={jest.fn()} />
    );
  });
  return {
    host,
    openServiceMenu() {
      act(() => host.querySelector(".kt-popup-more-service").click());
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("PopupCont service menu single-select semantics", () => {
  test("service rows carry radio semantics with exactly one checked row", async () => {
    const view = renderPopupCont();
    try {
      await flushEffects();
      view.openServiceMenu();
      const rows = [
        ...document.body.querySelectorAll(".kt-popup-service-option"),
      ];
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.getAttribute("role")).toBe("menuitemradio");
        expect(["true", "false"]).toContain(row.getAttribute("aria-checked"));
      }
      const checked = rows.filter(
        (row) => row.getAttribute("aria-checked") === "true"
      );
      expect(checked).toHaveLength(1);
      expect(checked[0].textContent).toContain("google");
      expect(
        document.body.querySelectorAll(
          '.kt-popup-service-option[role="menuitemradio"][aria-checked="true"]'
        )
      ).toHaveLength(1);
    } finally {
      view.cleanup();
    }
  });

  test("every service row leads with the dispatcher radio glyph", async () => {
    const view = renderPopupCont();
    try {
      await flushEffects();
      view.openServiceMenu();
      const rows = [
        ...document.body.querySelectorAll(".kt-popup-service-option"),
      ];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.querySelector("svg")).not.toBeNull();
      }
      const checked = document.body.querySelector(
        '.kt-popup-service-option[aria-checked="true"]'
      );
      // 选中行内圆实心（lucide radio-checked 的 fill=currentColor 内点）；
      // 未选行无实心内点。
      expect(
        checked.querySelector("svg circle[fill='currentColor']")
      ).not.toBeNull();
      const unchecked = document.body.querySelector(
        '.kt-popup-service-option[aria-checked="false"]'
      );
      expect(
        unchecked.querySelector("svg circle[fill='currentColor']")
      ).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test("menu open hands focus to the checked row via the shared menu candidates", async () => {
    // 以末行 "fourth" 为选中项：焦点交接若只落首行（google）则无法检出该缺陷，
    // 杜绝「选中项恰是首行」的同位恒真。
    const view = renderPopupCont("fourth");
    try {
      await flushEffects();
      view.openServiceMenu();
      // 等一帧 rAF（PopupMenu.open 期交接挂在 requestAnimationFrame）。
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const focusRoot = document;
      expect(focusRoot.activeElement.textContent).toContain("fourth");
      expect(focusRoot.activeElement.getAttribute("aria-checked")).toBe("true");
      expect(focusRoot.activeElement.getAttribute("role")).toBe(
        "menuitemradio"
      );
    } finally {
      view.cleanup();
    }
  });

  test("an apiSlug absent from services yields zero checked rows (documented boundary)", async () => {
    // 刻画现状：菜单按 rule.apiSlug 原值比较，不归一化。0-checked 的
    // radio 组合规兜底由上游 resolveApiSelection 回落承担（apiSelection.js:20-23），
    // 不在本菜单渲染层。若未来在此归一，须同步改此用例。
    const view = renderPopupCont("does-not-exist");
    try {
      await flushEffects();
      view.openServiceMenu();
      const rows = [
        ...document.body.querySelectorAll(".kt-popup-service-option"),
      ];
      expect(rows).toHaveLength(4);
      expect(
        rows.filter((row) => row.getAttribute("aria-checked") === "true")
      ).toHaveLength(0);
    } finally {
      view.cleanup();
    }
  });

  test("service rows expose exactly one selection state (no aria-selected alongside)", async () => {
    const view = renderPopupCont();
    try {
      await flushEffects();
      view.openServiceMenu();
      const rows = [
        ...document.body.querySelectorAll(".kt-popup-service-option"),
      ];
      for (const row of rows) {
        expect(row.getAttribute("aria-selected")).toBeNull();
        expect(["true", "false"]).toContain(row.getAttribute("aria-checked"));
      }
    } finally {
      view.cleanup();
    }
  });
});
