import { act } from "react";
import { createRoot } from "react-dom/client";
import { css as mockCss } from "@emotion/css";
import StylesSetting, {
  StyleAccordion,
  buildHueSliderSx,
  HUE_PRESET_SNAP_TOLERANCE,
  ICON_HUE_SLIDER_MAX,
  matchPresetId,
} from "./StylesSetting";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import {
  ICON_COLOR_PRESETS,
  hslToHex,
  ICON_RING_S,
  ICON_RING_L,
  resolveIconHue,
} from "../../styles/m3";

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
  styleCycle: ["style_none", "fuzzy"],
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
  // 图标风格档位同样须真实回写：否则分段控件切换无反馈，
  // items 值域锁无法观测"归一后必有可见选中项"。
  if (patch && Object.prototype.hasOwnProperty.call(patch, "iconStyle")) {
    mockSetting.iconStyle = patch.iconStyle;
  }
  // 图标强调色同样须真实回写：否则提交后受控值无法回灌，
  // 滑轨读数与预设高亮的反馈行为不可观测。
  if (patch && Object.prototype.hasOwnProperty.call(patch, "iconColor")) {
    mockSetting.iconColor = patch.iconColor;
  }
});

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: mockUpdateSetting,
  }),
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

  const rerender = () => act(() => root.render(<StylesSetting />));
  rerender();

  return {
    container,
    rerender,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("shows selected styles in selection order and allows clearing the cycle", () => {
  mockUpdateSetting.mockImplementation((update) => {
    mockSetting.styleCycle = update(mockSetting).styleCycle;
  });
  const view = renderStylesSetting();
  try {
    const select = view.container.querySelector(
      '[aria-label="settings_style_cycle"]'
    );
    expect(select.textContent).toBe("style_none → fuzzy");
    select.parentElement.getBoundingClientRect = () => ({
      top: 100,
      bottom: 144,
      left: 100,
      right: 360,
      width: 260,
      height: 44,
    });
    act(() =>
      select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    );
    const toggle = (slug) => {
      act(() => document.querySelector(`[data-value="${slug}"]`).click());
      view.rerender();
    };

    act(() => {
      document.querySelector('[data-value="custom-dangerous"]').click();
      document.querySelector('[data-value="under_line"]').click();
    });
    view.rerender();
    expect(select.textContent).toBe(
      "style_none → fuzzy → Custom Dangerous → under_line"
    );

    for (const slug of [
      "style_none",
      "fuzzy",
      "custom-dangerous",
      "under_line",
    ])
      toggle(slug);
    expect(mockSetting.styleCycle).toEqual([]);
    expect(select.textContent).toBe("—");
  } finally {
    mockSetting.styleCycle = ["style_none", "fuzzy"];
    mockUpdateSetting.mockReset();
    view.cleanup();
  }
});

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
    // hidden）。注册表或选项数组单侧漂移时本断言失配，消除人工双写。
    const view = renderGripSection();
    await openGripSelect(view.container);
    const optionValues = [
      ...document.body.querySelectorAll('[role="option"]'),
    ].map((option) => option.getAttribute("data-value"));
    expect(optionValues).toEqual([...TEXTAREA_GRIP_STYLE_KEYS]);
    await act(async () => view.root.unmount());
    view.container.remove();
  });

  test("renders every grip style key as an option derived from the shared list", async () => {
    // 派生对账护栏：选项改由 TEXTAREA_GRIP_STYLE_KEYS.map 派生后，以
    // 渲染面取代源码正则（正则提取器已无提取对象，活性自检失去意义）。
    // 断言：下拉选项 value 集合与单一事实源恒等、顺序一致；MUI Menu 经
    // portal 挂载到 document.body，与同套件其余用例同取径。
    const view = renderGripSection();
    await openGripSelect(view.container);
    const values = [...document.body.querySelectorAll('[role="option"]')].map(
      (node) => node.getAttribute("data-value")
    );
    expect(values).toEqual([...TEXTAREA_GRIP_STYLE_KEYS]);
    // 派生式护栏：本套件 useI18n mock 直返键名，label 必须逐项等于
    // grip_style_<value 归一>（replace(/-/g,"_")），派生式被改坏即红；
    // 键的七语言/RU 完整性由 src/config/i18n.test.js:5-14/:26-39 守护。
    const derivedKeys = TEXTAREA_GRIP_STYLE_KEYS.map(
      (key) => `grip_style_${key.replace(/-/g, "_")}`
    );
    // 取 label 文本前剔除装饰节点（svg 与 aria-hidden 子树），避免断言与
    // 选项内部 DOM 形态耦合：未来图标带文字、MUI 勾选标记或视觉隐藏包装
    // 文本混入时，textContent 不被装饰内容污染。在克隆树上操作，不影响
    // 活 DOM 与同套件后续用例。
    const labels = [...document.body.querySelectorAll('[role="option"]')].map(
      (node) => {
        const clone = node.cloneNode(true);
        clone
          .querySelectorAll("svg, [aria-hidden='true']")
          .forEach((decor) => decor.remove());
        return clone.textContent.trim();
      }
    );
    expect(labels).toEqual(derivedKeys);
    await act(async () => view.root.unmount());
    view.container.remove();
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

describe("StylesSetting icon style row", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("marks the icon style control so the narrow-screen wrap rule can hit", () => {
    const view = renderStylesSetting();
    // 行根带 kt-settings-row--inline 修饰类（窄屏换行规则的父选择器）。
    const row = [...view.container.querySelectorAll(".kt-settings-row")].find(
      (element) => element.textContent.includes("settings_icon_style")
    );
    expect(row).not.toBeNull();
    expect(row.className).toContain("kt-settings-row--inline");
    // 控制区 Box 带 icon-style-control 类，命中
    // .kt-settings-row--inline .icon-style-control（Options/styles.js:19）。
    const control = row.querySelector(".kt-settings-row__control");
    expect(control).not.toBeNull();
    expect(control.querySelector(".icon-style-control")).not.toBeNull();
    view.cleanup();
  });

  test("icon style segmented keeps a valid selection for every stored value", () => {
    // items 值域锁：SettingsCard 对未命中项会给 tabbableIndex=-1 /
    // 全 false 选中态，用户可见"无选中档"。覆盖五域：缺省（存储值保持
    // 未设置）、旧档 md3、mui、lucide、非法——归一后（resolveIconStyle）
    // 恰有一个可见选中项，且选中项即该输入应对应的档位。
    const stored = [
      [undefined, "lucide"],
      ["md3", "lucide"],
      ["mui", "mui"],
      ["lucide", "lucide"],
      ["nope", "lucide"],
    ];
    try {
      for (const [value, expected] of stored) {
        mockSetting.iconStyle = value;
        const view = renderStylesSetting();
        const row = [
          ...view.container.querySelectorAll(".kt-settings-row"),
        ].find((element) =>
          element.textContent.includes("settings_icon_style")
        );
        expect(row).not.toBeNull();
        // 分段控件以 role=radio + aria-checked 表选中：恰一选中项，值档对齐。
        const radios = [...row.querySelectorAll('[role="radio"]')];
        const selected = radios.filter(
          (radio) => radio.getAttribute("aria-checked") === "true"
        );
        expect(selected).toHaveLength(1);
        expect(selected[0].querySelector("span")?.textContent).toBe(
          `settings_icon_style_${expected}`
        );
        view.cleanup();
      }
    } finally {
      mockSetting.iconStyle = undefined;
    }
  });

  test("icon style segmented exposes exactly the lucide and mui items", () => {
    // 选项值域锁：items 恰为 [lucide, mui] 两项——旧档 md3 值残留即红。
    // useI18n mock 直返键名，label 逐项等于 settings_icon_style_<value>。
    mockSetting.iconStyle = "lucide";
    const view = renderStylesSetting();
    const row = [...view.container.querySelectorAll(".kt-settings-row")].find(
      (element) => element.textContent.includes("settings_icon_style")
    );
    expect(row).not.toBeNull();
    const radios = [...row.querySelectorAll('[role="radio"]')];
    expect(
      radios.map((radio) => radio.querySelector("span")?.textContent)
    ).toEqual(["settings_icon_style_lucide", "settings_icon_style_mui"]);
    // 归一后默认档 lucide 必为选中项，md3 不得作为选项出现。
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(radios[0].value).toBe("lucide");
    expect(radios[1].value).toBe("mui");
    view.cleanup();
  });
});

describe("StylesSetting icon color hue entry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    delete mockSetting.iconColor;
  });

  // 护栏：滑轨读数确由 setting.iconColor 经 resolveIconHue 反解，而非回落
  // store/默认。既有 mockSetting 无 iconColor 键（undefined → 归一 #90b2ba
  // → 191.4°）；置非默认 #ba9090（hue 0），数据源若被误改即可判别。
  test("derives the slider hue from setting.iconColor via the shared resolver", () => {
    mockSetting.iconColor = "#ba9090";
    const view = renderStylesSetting();
    const row = view.container.querySelector(".kt-settings-icon-color");
    expect(row).not.toBeNull();
    expect(row.textContent).toContain("0.0°");
    expect(row.textContent).not.toContain("191.4°");
    view.cleanup();
  });

  test("snap tolerance covers the quantization drift window", () => {
    // 容差契约锁：距预设 0.25°–0.5° 的落点仍须命中预设
    //（旧 0.25° 严格小于窗时两断言皆红）。
    expect(matchPresetId(191.7)).toBe("lake");
    expect(matchPresetId(191.15)).toBe("lake");
  });

  test("snap boundary at exactly the tolerance is inclusive", () => {
    // 容差声明"覆盖量化误差上界"，实现须含上界本身。lake hue=191.4，
    // ±0.5° 端点（190.9/191.9）必须命中；旧实现 `< HUE_PRESET_SNAP_TOLERANCE`
    // 端点漏吸，本用例钉死端点语义。
    expect(matchPresetId(191.4 + HUE_PRESET_SNAP_TOLERANCE)).toBe("lake");
    expect(matchPresetId(191.4 - HUE_PRESET_SNAP_TOLERANCE)).toBe("lake");
    // 超出容差 0.01° 即不吸附。
    expect(matchPresetId(191.4 + HUE_PRESET_SNAP_TOLERANCE + 0.01)).toBeNull();
    // 退化语义：非数值输入无匹配。
    expect(matchPresetId(Number.NaN)).toBeNull();
    expect(matchPresetId(undefined)).toBeNull();
  });

  test("committing a preset-adjacent hue keeps the draft within 0.5° and the highlight does not rebound", () => {
    // 量化往返锁：提交 191.0° 后存储 Hex 反解 ≈191.43°——漂移大于旧 0.25°
    // 假设、落在 0.5° 新容差内。提交后外部值回灌：draft 读数即反解 hue
    //（不弹回），湖蓝预设高亮保持点亮且唯一。
    const committedHex = hslToHex(191.0, ICON_RING_S, ICON_RING_L);
    const resolvedHue = resolveIconHue(committedHex);
    expect(committedHex).toBe("#90b2ba");
    expect(Math.abs(resolvedHue - 191.0)).toBeGreaterThan(0.25);
    expect(Math.abs(resolvedHue - 191.0)).toBeLessThanOrEqual(0.5);
    mockSetting.iconColor = committedHex;
    const view = renderStylesSetting();
    const row = view.container.querySelector(".kt-settings-icon-color");
    expect(row.textContent).toContain(`${resolvedHue.toFixed(1)}°`);
    const highlighted = row.querySelectorAll(
      '.kt-settings-preset-chip[aria-pressed="true"]'
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain("settings_icon_preset_lake");
    view.cleanup();
  });

  test("committing the slider at a preset-adjacent hue preserves the preset highlight", () => {
    // handleSliderCommitted 内部先算 hex、再经 matchPresetId 同语义重匹配
    // 高亮，避免"提交同值预设高亮被清空"的回归（旧实现无条件
    // setActivePresetId(null)）。
    // 契约：lake hue=191.4，初始 iconColor "#90b2ba"→内部 draft≈191.4x；
    // 键盘 commit 到 191.0° 量化往返仍命中 lake（已知 Δ≤0.43）。
    mockSetting.iconColor = "#90b2ba";
    mockUpdateSetting.mockClear();
    const view = renderStylesSetting();
    const row = view.container.querySelector(".kt-settings-icon-color");
    const lakeChip = [...row.querySelectorAll(".kt-settings-preset-chip")].find(
      (chip) => chip.textContent.includes("settings_icon_preset_lake")
    );
    expect(lakeChip).toBeTruthy();
    expect(lakeChip.getAttribute("aria-pressed")).toBe("true");
    const slider = row.querySelector(".MuiSlider-root");
    const input = slider.querySelector('input[type="range"]');
    act(() => {
      // React 控制的 <input> 的 value 属性被 setter 拦截；须用底层
      // HTMLInputElement.prototype 的 value setter 绕开 React 的合成事件
      // 代理，再 dispatchEvent change，才能进入 MUI 的 onChange 处理器。
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input, "191.0");
      // React 17+ 事件委派须事件冒泡到根；默认 `new Event` 不冒泡，
      // MUI 的 onChange 处理器不会被触发，导致测试假绿。
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(lakeChip.getAttribute("aria-pressed")).toBe("true");
    // 提交回调真实执行：onChangeCommitted → handleSliderCommitted →
    // onChange(hex) → updateSetting({ iconColor })，且以预期 Hex 提交。
    expect(mockUpdateSetting).toHaveBeenCalledWith({ iconColor: "#90b2ba" });
    view.cleanup();
  });
});

describe("StylesSetting icon hue slider upper endpoint", () => {
  // 钉死组件真实上界常量：复刻松手提交→外部值回灌的完整往返，断言落点既不
  // 塌回 0°（滑块右端弹到左端），也不落进任一预设的 matchPresetId ±0.5° 吸附
  // 窗（误亮预设）。359.5 会因 8-bit Hex 量化命中红预设(hue 0)而在此转红，
  // 故本断言同时是「上界取值约束」的回归守卫——日后改回环缝端点即被咬。
  // 复用 StylesSetting.js 导出常量而非本地重定义，避免两端漂移；
  // 渲染完整 IconColorSlider 而非纯数值断言。

  test("committing the slider at the max submits the expected hex without collapsing to 0° nor snapping to a preset", () => {
    const committedHex = hslToHex(
      ICON_HUE_SLIDER_MAX,
      ICON_RING_S,
      ICON_RING_L
    );
    const resolvedHue = resolveIconHue(committedHex);

    // 反解后须仍停在右端附近，绝不塌回 0°。
    expect(resolvedHue).toBeGreaterThanOrEqual(0);
    expect(resolvedHue).toBeLessThan(360);
    expect(resolvedHue).toBeGreaterThanOrEqual(0.25);

    // 用组件真实吸附语义判定：落点不吸附到任何预设（提交后不会误亮/回弹）。
    // matchPresetId 为纯线性匹配，对落点在右端附近（hue 0 预设的线性距离
    // 恒宽）与逐预设线性距离检查等价，但直接复用组件判定避免两端漂移。
    expect(matchPresetId(resolvedHue)).toBeNull();
    // 非环缝预设仍保留线性距离检查，跳过 hue 0（其环缝距离须由环形语义判定）。
    for (const preset of ICON_COLOR_PRESETS) {
      if (preset.hue === 0) continue;
      expect(Math.abs(preset.hue - resolvedHue)).toBeGreaterThanOrEqual(
        HUE_PRESET_SNAP_TOLERANCE
      );
    }

    // 端到端提交验证：渲染真实滑块并把松手值推到上界，断言 updateSetting
    // 收到的正是 hslToHex(max) 的落点，而非仅做纯数值往返反演。
    mockSetting.iconColor = "#90b2ba";
    mockUpdateSetting.mockClear();
    const view = renderStylesSetting();
    const row = view.container.querySelector(".kt-settings-icon-color");
    const slider = row.querySelector(".MuiSlider-root");
    const input = slider.querySelector('input[type="range"]');
    act(() => {
      // React 控制的 <input> 的 value 属性被 setter 拦截；须用底层
      // HTMLInputElement.prototype 的 value setter 绕开 React 的合成事件
      // 代理，再 dispatchEvent change，才能进入 MUI 的 onChange 处理器。
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input, String(ICON_HUE_SLIDER_MAX));
      // React 17+ 事件委派须事件冒泡到根；默认 `new Event` 不冒泡，
      // MUI 的 onChange 处理器不会被触发，导致测试假绿。
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mockUpdateSetting).toHaveBeenCalledWith({ iconColor: committedHex });
    view.cleanup();
  });

  test("committed write-back feeds the controlled value so reading and highlight follow after rerender", () => {
    // 回灌闭环：提交后 updateSetting 回写受控值，重渲染后滑轨读数跟随新值
    // （量化落点 359.0°，不塌回 0°），且不吸附任何预设（matchPresetId 空）。
    const committedHex = hslToHex(
      ICON_HUE_SLIDER_MAX,
      ICON_RING_S,
      ICON_RING_L
    );
    mockSetting.iconColor = "#90b2ba";
    mockUpdateSetting.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderApp = () => root.render(<StylesSetting />);
    act(renderApp);
    const row = () => container.querySelector(".kt-settings-icon-color");
    const slider = () => row().querySelector(".MuiSlider-root");
    const input = () => slider().querySelector('input[type="range"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input(), String(ICON_HUE_SLIDER_MAX));
      input().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mockUpdateSetting).toHaveBeenCalledWith({ iconColor: committedHex });
    act(renderApp);
    expect(row().textContent).toContain("359.0°");
    expect(row().textContent).not.toContain("0.0°");
    const pressed = row().querySelectorAll(
      '.kt-settings-preset-chip[aria-pressed="true"]'
    );
    expect(pressed).toHaveLength(0);
    act(() => root.unmount());
    container.remove();
  });

  test("write-back with an unchanged hex keeps the reading and preset highlight stable", () => {
    // Hex 不变路径：提交量化后等值的 Hex（lake 邻域往返），回写值与存量
    // 一致；重渲染后读数稳定不跳，lake 高亮保持点亮且唯一。
    mockSetting.iconColor = "#90b2ba";
    mockUpdateSetting.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderApp = () => root.render(<StylesSetting />);
    act(renderApp);
    const row = () => container.querySelector(".kt-settings-icon-color");
    const slider = () => row().querySelector(".MuiSlider-root");
    const input = () => slider().querySelector('input[type="range"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input(), "191.0");
      input().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mockUpdateSetting).toHaveBeenCalledWith({ iconColor: "#90b2ba" });
    act(renderApp);
    // 等值回灌不产生漂移：draft 读数维持提交落点 191.0°（不回跳反解值
    // 191.4°），lake 高亮保持点亮且唯一。
    expect(row().textContent).toContain("191.0°");
    expect(row().textContent).not.toContain("191.4°");
    const highlighted = row().querySelectorAll(
      '.kt-settings-preset-chip[aria-pressed="true"]'
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain("settings_icon_preset_lake");
    act(() => root.unmount());
    container.remove();
  });

  test("clamps the slider reading to ICON_HUE_SLIDER_MAX when stored hue exceeds the ring seam", () => {
    // 非规范 hex 反解色相 > 359° 时，滑轨显示值须被上界钳制（读数和色块/
    // 拇指共用钳制值），存储 Hex 自身保持无损归一（resolveIconColorHex 不变）。
    // #ff0001 反解色相 ≈359.765°，钳制后 iconHue = 359 → 读数 "359.0°"。
    mockSetting.iconColor = "#ff0001";
    const view = renderStylesSetting();
    const row = view.container.querySelector(".kt-settings-icon-color");
    expect(row.textContent).toContain("359.0°");
    expect(row.textContent).not.toContain("359.8°");
    // 钉死 hidden input 的 max 属性（MUI Slider 实现细节回归守卫）。
    const slider = row.querySelector(".MuiSlider-root");
    const input = slider.querySelector('input[type="range"]');
    expect(input.getAttribute("max")).toBe(String(ICON_HUE_SLIDER_MAX));
    view.cleanup();
  });
});

describe("StylesSetting hue slider forced-colors rail fallback", () => {
  test("keeps the rail visible with a system color when forced colors discard the gradient", () => {
    // forced-colors 域丢弃 background 渐变，而 track 被组件样式永久
    // visibility:hidden——MUI 默认 rail 的 currentColor 在该域本可自然
    // 可见，被渐变覆盖后轨道不可辨。补系统色兜底（CanvasText：中性轨道
    // 语义，与 m3.js forcedColorsFocusRing 同色源；Highlight 属选中语义）。
    // opacity 须显式归一：MUI rail 基础样式自带 opacity: 0.38（Slider.js:144），
    // 该域不接管 opacity，38% alpha 下对比跌破非文本 3:1。
    const sx = buildHueSliderSx("#90b2ba 0%, #a590ba 100%");
    const forcedBlock = sx["@media (forced-colors: active)"];
    expect(forcedBlock).toBeTruthy();
    expect(forcedBlock["& .MuiSlider-rail"]).toEqual({
      background: "CanvasText",
      opacity: 1,
    });
    // 顺序守卫：兜底块须后置于基础 rail 规则（同选择器同特异性靠源序胜出）。
    const keys = Object.keys(sx);
    expect(keys.indexOf("& .MuiSlider-rail")).toBeLessThan(
      keys.indexOf("@media (forced-colors: active)")
    );
    // 基础形态零变化：渐变轨道、隐藏 track 与 thumb 形态逐字保持。
    expect(sx["& .MuiSlider-rail"]).toEqual({
      height: 14,
      borderRadius: 7,
      background: "linear-gradient(90deg, #90b2ba 0%, #a590ba 100%)",
    });
    expect(sx["& .MuiSlider-track"]).toEqual({ visibility: "hidden" });
  });
});

describe("StylesSetting icon hue slider drag stability", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("external value changes mid-drag do not reset the slider draft", () => {
    mockSetting.iconColor = "#90b2ba";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderApp = () => root.render(<StylesSetting />);
    act(renderApp);

    const row = () => container.querySelector(".kt-settings-icon-color");
    const sliderRoot = row().querySelector(".MuiSlider-root");
    // jsdom 矩形全零会把 MUI 的落点百分比算成 NaN，须桩化真实轨道矩形。
    jest.spyOn(sliderRoot, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 0,
      right: 300,
      bottom: 20,
      width: 200,
      height: 20,
      x: 100,
      y: 0,
      toJSON() {},
    });

    // 起拖：mousedown 落点 150 → 25% → hue 90.0；拖动到 250 → 75% → hue 269.5。
    const thumb = sliderRoot.querySelector(".MuiSlider-thumb");
    act(() => {
      thumb.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 150,
          clientY: 10,
        })
      );
    });
    const dragMove = (clientX) => {
      const move = new MouseEvent("mousemove", {
        bubbles: true,
        clientX,
        clientY: 10,
      });
      // MUI 对 buttons === 0 的 mousemove 直接取消拖动（useSlider 取消分支），
      // jsdom 构造器的 buttons 初值不保证生效，显式钉住按下态。
      Object.defineProperty(move, "buttons", { value: 1 });
      document.dispatchEvent(move);
    };
    act(() => dragMove(250));
    expect(row().textContent).toContain("269.5°");

    // 拖动进行中外部 value 变化（存储回写）：读数必须停在拖动位置，
    // 不得被外部同步重置造成滑轨跳动。
    mockSetting.iconColor = "#ff0001";
    act(renderApp);
    expect(row().textContent).toContain("269.5°");
    expect(row().textContent).not.toContain("359.0°");

    // 松手提交后钳制释放：下一次外部 value 变化照常回灌 draft。
    act(() => {
      const release = new MouseEvent("mouseup", {
        bubbles: true,
        clientX: 250,
        clientY: 10,
      });
      document.dispatchEvent(release);
    });
    mockSetting.iconColor = "#10b981";
    act(renderApp);
    expect(row().textContent).toContain(
      `${resolveIconHue("#10b981").toFixed(1)}°`
    );

    act(() => root.unmount());
    container.remove();
  });

  test("touchcancel mid-drag restores the controlled draft and unblocks external sync", () => {
    mockSetting.iconColor = "#90b2ba";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderApp = () => root.render(<StylesSetting />);
    act(renderApp);

    const row = () => container.querySelector(".kt-settings-icon-color");
    const sliderRoot = row().querySelector(".MuiSlider-root");
    jest.spyOn(sliderRoot, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 0,
      right: 300,
      bottom: 20,
      width: 200,
      height: 20,
      x: 100,
      y: 0,
      toJSON() {},
    });
    const thumb = sliderRoot.querySelector(".MuiSlider-thumb");
    act(() => {
      thumb.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 150,
          clientY: 10,
        })
      );
    });
    const dragMove = (clientX) => {
      const move = new MouseEvent("mousemove", {
        bubbles: true,
        clientX,
        clientY: 10,
      });
      Object.defineProperty(move, "buttons", { value: 1 });
      document.dispatchEvent(move);
    };
    act(() => dragMove(250));
    expect(row().textContent).toContain("269.5°");

    // 系统中断（touchcancel）不经 onChangeCommitted：拖动标记必须释放、
    // 草稿复位到受控值——既不提交拖动位置，也不再拦截外部同步。
    act(() => {
      sliderRoot.dispatchEvent(new Event("touchcancel", { bubbles: true }));
    });
    expect(row().textContent).toContain("191.4°");
    expect(row().textContent).not.toContain("269.5°");

    // 取消后外部 value 变化照常回灌（拖动标记未卡死）。
    mockSetting.iconColor = "#ff0001";
    act(renderApp);
    expect(row().textContent).toContain("359.0°");

    act(() => root.unmount());
    container.remove();
  });

  test("touchcancel terminates the residual slider session for a reused touch identifier", () => {
    // useSlider 无 touchcancel 分支：中断后 ownerDocument 上的 touchmove/
    // touchend 监听与 touchId 残留，后续手势复用同一 identifier 会继续驱动
    // onChange 并在 touchend 提交。取消处理必须以被中断触点合成 touchend
    // 终止内部会话（onChangeCommitted 由取消标记拦截），使复用手势零效果。
    class Touch {
      constructor(init) {
        this.identifier = init.identifier;
        this.target = init.target;
        this.clientX = init.clientX;
        this.clientY = init.clientY;
      }
    }
    class TouchEvent extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.touches = init.touches || [];
        this.targetTouches = init.targetTouches || [];
        this.changedTouches = init.changedTouches || [];
      }
    }
    // 生产守卫读的是全局构造器：polyfill 必须挂到 globalThis 才能穿过
    // handleSliderCancel 的特性闸；收尾还原避免泄漏给同文件其他用例。
    const originalTouch = globalThis.Touch;
    const originalTouchEvent = globalThis.TouchEvent;
    globalThis.Touch = Touch;
    globalThis.TouchEvent = TouchEvent;
    try {
      runSession();
    } finally {
      restorePolyfill();
    }

    function runSession() {
      mockSetting.iconColor = "#90b2ba";
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      const renderApp = () => root.render(<StylesSetting />);
      act(renderApp);

      const row = () => container.querySelector(".kt-settings-icon-color");
      const sliderRoot = row().querySelector(".MuiSlider-root");
      jest.spyOn(sliderRoot, "getBoundingClientRect").mockReturnValue({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON() {},
      });

      // 真实触摸会话：touchstart（identifier 7）落 25% → hue 90.0 起拖。
      const touchAt = (clientX) =>
        new Touch({
          identifier: 7,
          target: sliderRoot,
          clientX,
          clientY: 10,
        });
      const touchDispatch = (type, touch, target) =>
        act(() => {
          (target || sliderRoot).dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches:
                type === "touchend" || type === "touchcancel" ? [] : [touch],
              targetTouches:
                type === "touchend" || type === "touchcancel" ? [] : [touch],
              changedTouches: [touch],
            })
          );
        });

      touchDispatch("touchstart", touchAt(150));
      touchDispatch("touchmove", touchAt(250), document);
      expect(row().textContent).toContain("269.5°");

      // 中断：取消语义复位草稿，且派发合成 touchend 终止内部会话。
      touchDispatch("touchcancel", touchAt(250));
      expect(row().textContent).toContain("191.4°");

      // 复用同一 identifier 的后续手势必须零效果：残留监听会命中 trackFinger
      // 把读数拖走，且 touchend 会把拖动位置当提交值写回。
      mockUpdateSetting.mockClear();
      touchDispatch("touchmove", touchAt(250), document);
      expect(row().textContent).toContain("191.4°");
      expect(row().textContent).not.toContain("269.5°");
      touchDispatch("touchend", touchAt(250), document);
      expect(row().textContent).toContain("191.4°");
      // 取消会话已终止：touchend 不经 handleSliderCommitted，不提交 iconColor。
      expect(mockUpdateSetting).not.toHaveBeenCalled();

      // 取消后外部 value 变化照常回灌。
      mockSetting.iconColor = "#ff0001";
      act(renderApp);
      expect(row().textContent).toContain("359.0°");

      act(() => root.unmount());
      container.remove();
    }

    function restorePolyfill() {
      if (originalTouch === undefined) {
        delete globalThis.Touch;
      } else {
        globalThis.Touch = originalTouch;
      }
      if (originalTouchEvent === undefined) {
        delete globalThis.TouchEvent;
      } else {
        globalThis.TouchEvent = originalTouchEvent;
      }
    }
  });

  test("touchcancel terminates every cancelled touch session in multi-touch", () => {
    // useSlider 的 touchId 持末次触点：多点同时取消时只派 changedTouches[0]
    // 不命中 touchId，末触点会话残留继续驱动 onChange 并在 touchend 提交。
    // 取消处理必须逐触点合成 touchend 终止全部会话。
    class Touch {
      constructor(init) {
        this.identifier = init.identifier;
        this.target = init.target;
        this.clientX = init.clientX;
        this.clientY = init.clientY;
      }
    }
    class TouchEvent extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.touches = init.touches || [];
        this.targetTouches = init.targetTouches || [];
        this.changedTouches = init.changedTouches || [];
      }
    }
    const originalTouch = globalThis.Touch;
    const originalTouchEvent = globalThis.TouchEvent;
    globalThis.Touch = Touch;
    globalThis.TouchEvent = TouchEvent;
    try {
      runSession();
    } finally {
      restorePolyfill();
    }

    function runSession() {
      mockSetting.iconColor = "#90b2ba";
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      const renderApp = () => root.render(<StylesSetting />);
      act(renderApp);

      const row = () => container.querySelector(".kt-settings-icon-color");
      const sliderRoot = row().querySelector(".MuiSlider-root");
      jest.spyOn(sliderRoot, "getBoundingClientRect").mockReturnValue({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON() {},
      });

      const touchOf = (identifier, clientX) =>
        new Touch({
          identifier,
          target: sliderRoot,
          clientX,
          clientY: 10,
        });
      const dispatch = (type, changed, target, held) =>
        act(() => {
          (target || sliderRoot).dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches:
                type === "touchend" || type === "touchcancel" ? [] : held,
              targetTouches:
                type === "touchend" || type === "touchcancel" ? [] : held,
              changedTouches: changed,
            })
          );
        });

      // 双指会话：7 先落 25% 起拖，8 随后落点接管（useSlider touchId 持
      // 末次触点 8）。
      dispatch("touchstart", [touchOf(7, 150)], sliderRoot, [touchOf(7, 150)]);
      dispatch("touchmove", [touchOf(7, 250)], document, [touchOf(7, 250)]);
      expect(row().textContent).toContain("269.5°");
      dispatch("touchstart", [touchOf(8, 200)], sliderRoot, [
        touchOf(7, 250),
        touchOf(8, 200),
      ]);
      dispatch("touchmove", [touchOf(8, 200)], document, [
        touchOf(7, 250),
        touchOf(8, 200),
      ]);

      // 双指同时取消：changedTouches 逐触点合成终止。
      dispatch("touchcancel", [touchOf(7, 250), touchOf(8, 200)]);
      expect(row().textContent).toContain("191.4°");

      // 末触点会话已终止：复用 identifier 8 的手势零效果，不提交。
      mockUpdateSetting.mockClear();
      dispatch("touchmove", [touchOf(8, 250)], document, [touchOf(8, 250)]);
      expect(row().textContent).toContain("191.4°");
      expect(row().textContent).not.toContain("269.5°");
      dispatch("touchend", [touchOf(8, 250)], document, []);
      expect(row().textContent).toContain("191.4°");
      expect(mockUpdateSetting).not.toHaveBeenCalled();

      act(() => root.unmount());
      container.remove();
    }

    function restorePolyfill() {
      if (originalTouch === undefined) {
        delete globalThis.Touch;
      } else {
        globalThis.Touch = originalTouch;
      }
      if (originalTouchEvent === undefined) {
        delete globalThis.TouchEvent;
      } else {
        globalThis.TouchEvent = originalTouchEvent;
      }
    }
  });

  test("touchcancel without Touch constructors remounts the slider to end the session", () => {
    // 旧引擎的真实形态：会话已建立（模拟构造器下 start/move 完成），
    // 取消时刻构造器不可用——合成 touchend 终止会话的通道失效，兜底必须
    // 递增 key 重挂 Slider：DOM 节点换代即旧实例卸载、文档级会话监听随
    // 之摘除；重挂后复用同一触点标识的后续手势必须零效果，不驱动草稿、
    // 不提交设置。
    mockSetting.iconColor = "#90b2ba";
    class Touch {
      constructor(init) {
        this.identifier = init.identifier;
        this.target = init.target;
        this.clientX = init.clientX;
        this.clientY = init.clientY;
      }
    }
    class TouchEvent extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.touches = init.touches || [];
        this.targetTouches = init.targetTouches || [];
        this.changedTouches = init.changedTouches || [];
      }
    }
    // 生产守卫读的是全局构造器：polyfill 必须挂到 globalThis 才能穿过
    // handleSliderCancel 的特性闸；收尾还原避免泄漏给同文件其他用例。
    const originalTouch = globalThis.Touch;
    const originalTouchEvent = globalThis.TouchEvent;
    globalThis.Touch = Touch;
    globalThis.TouchEvent = TouchEvent;
    mockUpdateSetting.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderApp = () => root.render(<StylesSetting />);
    try {
      act(renderApp);

      const row = () => container.querySelector(".kt-settings-icon-color");
      const sliderRoot = row().querySelector(".MuiSlider-root");
      jest.spyOn(sliderRoot, "getBoundingClientRect").mockReturnValue({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON() {},
      });
      const touchAt = (clientX) =>
        new Touch({
          identifier: 7,
          target: sliderRoot,
          clientX,
          clientY: 10,
        });

      act(() => {
        sliderRoot.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [touchAt(150)],
            targetTouches: [touchAt(150)],
            changedTouches: [touchAt(150)],
          })
        );
      });
      act(() => {
        document.dispatchEvent(
          new TouchEvent("touchmove", {
            touches: [touchAt(250)],
            targetTouches: [touchAt(250)],
            changedTouches: [touchAt(250)],
          })
        );
      });
      expect(row().textContent).toContain("269.5°");

      // 构造器此刻撤除：取消事件虽携被中断触点（非空 changedTouches 腿），
      // 会话终止派发通道不可用，必须走重挂兜底。
      delete globalThis.Touch;
      delete globalThis.TouchEvent;
      const cancel = new Event("touchcancel", {
        bubbles: true,
        cancelable: true,
      });
      cancel.touches = [];
      cancel.targetTouches = [];
      cancel.changedTouches = [touchAt(250)];
      act(() => {
        sliderRoot.dispatchEvent(cancel);
      });

      const sliderAfter = row().querySelector(".MuiSlider-root");
      expect(sliderAfter).not.toBe(sliderRoot);
      expect(row().textContent).toContain("191.4°");

      // 同标识后续手势零效果：旧会话监听已随重挂摘除。
      const reuseTouch = {
        identifier: 7,
        target: sliderAfter,
        clientX: 250,
        clientY: 10,
      };
      const follow = (type) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const released = type === "touchend";
        event.touches = released ? [] : [reuseTouch];
        event.targetTouches = released ? [] : [reuseTouch];
        event.changedTouches = [reuseTouch];
        return event;
      };
      act(() => {
        document.dispatchEvent(follow("touchmove"));
      });
      act(() => {
        document.dispatchEvent(follow("touchend"));
      });
      expect(row().textContent).toContain("191.4°");
      expect(row().textContent).not.toContain("269.5°");
      expect(mockUpdateSetting).not.toHaveBeenCalled();

      mockSetting.iconColor = "#ff0001";
      act(renderApp);
      expect(row().textContent).toContain("359.0°");
    } finally {
      if (originalTouch === undefined) {
        delete globalThis.Touch;
      } else {
        globalThis.Touch = originalTouch;
      }
      if (originalTouchEvent === undefined) {
        delete globalThis.TouchEvent;
      } else {
        globalThis.TouchEvent = originalTouchEvent;
      }
      act(() => root.unmount());
      container.remove();
    }
  });
});
