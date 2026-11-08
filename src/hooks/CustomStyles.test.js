import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  STYLE_SOURCE_BUILTIN,
  STYLE_SOURCE_CUSTOM,
  toPersistedCustomStyle,
  useAllTextStyles,
  useStyleList,
} from "./CustomStyles";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockStoredStyles = [
  {
    styleSlug: "custom-forged",
    styleName: "Custom Forged",
    styleCode: "position: fixed; inset: 0; z-index: 2147483647;",
    source: STYLE_SOURCE_BUILTIN,
    isBuiltin: true,
  },
];

const mockUpdateSetting = jest.fn();

jest.mock("./Setting", () => ({
  useSetting: () => ({
    setting: { customStyles: mockStoredStyles },
    updateSetting: mockUpdateSetting,
  }),
}));

jest.mock("./I18n", () => ({
  useI18n: () => (key) => key,
}));

describe("custom style provenance", () => {
  test("normalizes stored styles as custom and trusts only built-in previews", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let styles;

    function Probe() {
      styles = useAllTextStyles();
      return null;
    }

    act(() => root.render(<Probe />));

    expect(styles.builtinStyles[0]).toMatchObject({
      source: STYLE_SOURCE_BUILTIN,
      isBuiltin: true,
    });
    expect(styles.customStyles[0]).toMatchObject({
      source: STYLE_SOURCE_CUSTOM,
      isBuiltin: false,
    });

    act(() => root.unmount());
  });

  test("removes UI-only provenance before persistence", () => {
    expect(toPersistedCustomStyle(mockStoredStyles[0])).toEqual({
      styleSlug: "custom-forged",
      styleName: "Custom Forged",
      styleCode: "position: fixed; inset: 0; z-index: 2147483647;",
    });
  });
});

function renderStyleListProbe() {
  const container = document.createElement("div");
  const root = createRoot(container);
  let styleList;

  function Probe() {
    styleList = useStyleList();
    return null;
  }

  act(() => root.render(<Probe />));

  return {
    styleList,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useStyleList.addStyle contract", () => {
  // jsdom 环境不注入 webcrypto：addStyle 依赖 crypto.randomUUID（真实
  // 浏览器在位）。夹具注入确定性序列 stub，使 slug/styleName 断言可精确
  // 定形；实现侧不引入任何环境探测。
  let uuidCounter;
  let originalCryptoDescriptor;

  beforeEach(() => {
    mockUpdateSetting.mockClear();
    uuidCounter = 0;
    // Node 18+ 的 globalThis.crypto 是 getter-only 访问器——裸赋值在严格
    // 模块内抛错、宽松模块内静默无效（stub 从未生效），必须走
    // defineProperty；afterEach 还原原始描述符（原不存在才 delete），
    // 不污染同文件其他用例。
    const randomUUID = () =>
      `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;
    originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto"
    );
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID },
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
      originalCryptoDescriptor = undefined;
    } else {
      delete globalThis.crypto;
    }
  });

  test("prepends a blank style to the top and returns its slug", () => {
    const view = renderStyleListProbe();

    const returnedSlug = view.styleList.addStyle();

    expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
    const updater = mockUpdateSetting.mock.calls[0][0];
    const next = updater({ customStyles: mockStoredStyles });
    const [newStyle, ...rest] = next.customStyles;

    // 返回值＝新增 slug（同步计算后返回，不依赖 updateSetting 回调时序）
    expect(newStyle.styleSlug).toBe(returnedSlug);
    expect(returnedSlug).toMatch(/^custom_/);
    // 空参调用等价空白样式（initialCode 默认 ""）
    expect(newStyle.styleCode).toBe("");
    expect(newStyle.styleName).toMatch(/^Style_[0-9a-f]{8}$/);
    // 置顶语义＝数组首位：原列表项顺序保持在新项之后
    expect(rest).toEqual(mockStoredStyles);
    expect(next.customStyles).toHaveLength(2);

    view.cleanup();
  });

  test("prefills the chosen template code when an initial code is passed", () => {
    const view = renderStyleListProbe();

    const returnedSlug = view.styleList.addStyle("color: red;");

    const updater = mockUpdateSetting.mock.calls[0][0];
    const next = updater({ customStyles: mockStoredStyles });

    expect(next.customStyles[0].styleSlug).toBe(returnedSlug);
    expect(next.customStyles[0].styleCode).toBe("color: red;");
    // 持久化结构不变：styleSlug/styleName/styleCode 三字段
    expect(Object.keys(next.customStyles[0]).sort()).toEqual([
      "styleCode",
      "styleName",
      "styleSlug",
    ]);

    view.cleanup();
  });
});
