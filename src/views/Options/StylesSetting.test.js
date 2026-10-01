import { act } from "react";
import { createRoot } from "react-dom/client";
import { css as mockCss } from "@emotion/css";
import StylesSetting, { StyleAccordion } from "./StylesSetting";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import fs from "fs";
import path from "path";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DANGEROUS_STYLE_CODE = "position: fixed; inset: 0; z-index: 2147483647;";
const CUSTOM_STYLE = {
  styleSlug: "custom-dangerous",
  styleName: "Custom Dangerous",
  styleCode: DANGEROUS_STYLE_CODE,
  source: "custom",
  isBuiltin: false,
};
const BUILTIN_STYLE = {
  styleSlug: "under_line",
  styleName: "Underline",
  styleCode: "text-decoration: underline;",
  source: "builtin",
  isBuiltin: true,
};

jest.mock("@emotion/css", () => ({
  css: jest.fn(() => "mock-preview-class"),
  keyframes: jest.fn(() => "mock-keyframes"),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

// 稳定的 setting 引用避免 useAllTextStyles 抖动；textareaGripStyle 可被
// updateSetting（字符串契约）或测试直接改写，驱动预览切换。mock 前缀变量
// 供 jest.mock 工厂引用（babel-plugin-jest-hoist 允许）。
const mockSetting = {
  uiLang: "en",
  darkMode: "auto",
  textareaGripStyle: "concentric-smooth",
  customStyles: [
    {
      styleSlug: "custom-dangerous",
      styleName: "Custom Dangerous",
      styleCode: "position: fixed; inset: 0; z-index: 2147483647;",
    },
  ],
};
const mockUpdateSetting = jest.fn((patch) => {
  if (
    patch &&
    Object.prototype.hasOwnProperty.call(patch, "textareaGripStyle")
  ) {
    mockSetting.textareaGripStyle = patch.textareaGripStyle;
  }
});

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: mockSetting, updateSetting: mockUpdateSetting }),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(async () => true),
}));

function renderStyleAccordion(customStyle) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = (nextStyle) => {
    root.render(
      <StyleAccordion
        customStyle={nextStyle}
        deleteStyle={jest.fn()}
        updateStyle={jest.fn()}
      />
    );
  };

  act(() => {
    render(customStyle);
  });

  return {
    container,
    rerender(nextStyle) {
      act(() => {
        render(nextStyle);
      });
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderStylesSetting() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<StylesSetting />);
  });

  return {
    container,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function getCompiledStyleCode() {
  return mockCss.mock.calls.flatMap((call) => call.slice(1)).join("\n");
}

function getSummaryTranslation(container) {
  return Array.from(
    container.querySelectorAll(".kt-style-card__summary span")
  ).find((span) => span.textContent === "style_preview_translation");
}

describe("StylesSetting style previews", () => {
  beforeEach(() => {
    mockCss.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("keeps custom CSS out of compact summaries while previewing built-ins", () => {
    const customView = renderStyleAccordion(CUSTOM_STYLE);

    expect(getCompiledStyleCode()).not.toContain(DANGEROUS_STYLE_CODE);
    expect(getSummaryTranslation(customView.container).className).toBe("");
    customView.cleanup();

    mockCss.mockClear();
    const builtinView = renderStyleAccordion(BUILTIN_STYLE);

    expect(getCompiledStyleCode()).toContain(BUILTIN_STYLE.styleCode);
    expect(mockCss).toHaveBeenCalledTimes(1);
    builtinView.cleanup();
  });

  test("retains full custom CSS in the expanded editor", () => {
    const view = renderStyleAccordion(CUSTOM_STYLE);

    expect(getCompiledStyleCode()).not.toContain(DANGEROUS_STYLE_CODE);
    act(() => {
      view.container.querySelector(".MuiAccordionSummary-root").click();
    });
    expect(getCompiledStyleCode()).toContain(DANGEROUS_STYLE_CODE);
    view.cleanup();
  });

  test("keeps a local draft until the persisted style changes", () => {
    const view = renderStyleAccordion(CUSTOM_STYLE);
    act(() => {
      view.container.querySelector(".MuiAccordionSummary-root").click();
    });

    const nameInput = view.container.querySelector('input[name="styleName"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    view.rerender(CUSTOM_STYLE);
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Local style draft"
    );

    const persistedUpdate = {
      ...CUSTOM_STYLE,
      styleName: "Persisted style",
      styleCode: "color: rebeccapurple;",
    };
    view.rerender(persistedUpdate);
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Persisted style"
    );
    const saveButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    expect(saveButton.disabled).toBe(true);

    view.cleanup();
  });

  test("keeps a dirty draft when only the style object identity changes", () => {
    const view = renderStyleAccordion(CUSTOM_STYLE);
    act(() => {
      view.container.querySelector(".MuiAccordionSummary-root").click();
    });

    const nameInput = view.container.querySelector('input[name="styleName"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // useAllTextStyles 在 customStyles 每次写入时都会 .map() 出全新的样式对象：
    // 引用是新的、内容一个字没变。这种身份抖动不得冲掉未保存的草稿。
    view.rerender({ ...CUSTOM_STYLE });
    expect(view.container.querySelector('input[name="styleName"]').value).toBe(
      "Local style draft"
    );

    view.cleanup();
  });

  test("keeps an expanded style draft mounted while the manager is hidden", () => {
    const view = renderStylesSetting();

    expect(view.container.querySelector(".kt-style-manager")).toBeNull();

    const openButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "edit");
    act(() => openButton.click());

    const manager = view.container.querySelector(".kt-style-manager");
    expect(manager).not.toBeNull();
    expect(manager.hidden).toBe(false);

    act(() => {
      manager.querySelector(".MuiAccordionSummary-root").click();
    });

    const nameInput = manager.querySelector('input[name="styleName"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Unsaved style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const hideButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "hide");
    act(() => hideButton.click());

    expect(view.container.querySelector(".kt-style-manager")).toBe(manager);
    expect(manager.hidden).toBe(true);

    const reopenButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "edit");
    act(() => reopenButton.click());

    expect(manager.hidden).toBe(false);
    expect(manager.querySelector('input[name="styleName"]')).toBe(nameInput);
    expect(nameInput.value).toBe("Unsaved style draft");

    view.cleanup();
  });
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("StylesSetting textarea grip section", () => {
  function renderGripSection() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = () => {
      act(() => {
        root.render(<StylesSetting />);
      });
    };
    render();
    return {
      container,
      root,
      rerender: render,
      async cleanup() {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  }

  async function openGripSelect(container) {
    const select = container.querySelector(
      ".kt-settings-select [role='combobox']"
    );
    expect(select).not.toBeNull();
    await act(async () => {
      select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
    });
    return select;
  }

  beforeEach(() => {
    mockUpdateSetting.mockClear();
    mockSetting.textareaGripStyle = "concentric-smooth";
  });

  afterEach(async () => {
    await flushMicrotasks();
    document.body.innerHTML = "";
  });

  test("renders the grip section select with exactly 14 options", async () => {
    const view = renderGripSection();
    await openGripSelect(view.container);
    const options = document.body.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(14);
    await act(async () => view.root.unmount());
    view.container.remove();
  });

  test("keeps the grip option value set identical to the grip registry keys", async () => {
    // 单源护栏：下拉选项 value 集合必须逐项等于注册表 key 集合（含
    // hidden）。注册表或选项数组单侧漂移时本断言必红，消除人工双写。
    const view = renderGripSection();
    await openGripSelect(view.container);
    const optionValues = [
      ...document.body.querySelectorAll('[role="option"]'),
    ].map((option) => option.getAttribute("data-value"));
    expect(optionValues).toEqual([...TEXTAREA_GRIP_STYLE_KEYS]);
    await act(async () => view.root.unmount());
    view.container.remove();
  });

  test("keeps every grip_style_* i18n key used by options derived from the shared list", () => {
    // i18n 键对账护栏：StylesSetting 选项 JSX 内联硬编码的 i18n("grip_style_*")
    // 字面量集合必须与单一事实源派生集合恒等（下划线形态归一回连字符）。
    // 方法论：选项内联在 JSX 中无法直接 import 数据结构，故以源文本正则提取；
    // 局限＝与 i18n("...") 书写形态耦合，调用形式变更时提取器需同步。
    const source = fs.readFileSync(
      path.join(__dirname, "StylesSetting.js"),
      "utf8"
    );
    const used = [...source.matchAll(/i18n\("grip_style_([a-z_]+)"\)/g)].map(
      (m) => m[1].replace(/_/g, "-")
    );
    // 提取器活性自检：必须命中 14 处，防正则失配导致集合为空而恒绿。
    expect(used).toHaveLength(14);
    expect(new Set(used).size).toBe(used.length);
    // 判红能力自检：截短集必须判不等，防比较自身退化为恒真。
    expect(used.sort()).not.toEqual(
      [...TEXTAREA_GRIP_STYLE_KEYS].slice(0, 13).sort()
    );
    expect(used.sort()).toEqual([...TEXTAREA_GRIP_STYLE_KEYS].sort());
  });

  test("persists the selected grip style as a plain string value", async () => {
    const view = renderGripSection();
    await openGripSelect(view.container);
    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "corner-pill")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    // SettingsSelect onChange 契约：收到的是解包字符串，非 event 对象。
    expect(mockUpdateSetting).toHaveBeenCalledWith({
      textareaGripStyle: "corner-pill",
    });
    await act(async () => view.root.unmount());
    view.container.remove();
  });

  test("embeds a grip glyph in every grip style option", async () => {
    const view = renderGripSection();
    await openGripSelect(view.container);
    const options = [...document.body.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(14);

    // 每个样式项内嵌纯展示 svg（18×18 viewBox、aria-hidden）；hidden 项的
    // svg 为空占位（无图形子元素）。
    options.forEach((option) => {
      const svg = option.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg.getAttribute("viewBox")).toBe("0 0 18 18");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    });

    await act(async () => view.root.unmount());
    view.container.remove();
  });
});