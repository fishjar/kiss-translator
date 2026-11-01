import { act } from "react";
import { createRoot } from "react-dom/client";
import { css as mockCss } from "@emotion/css";
import StylesSetting, {
  StyleAccordion,
  HUE_PRESET_SNAP_TOLERANCE,
  ICON_HUE_SLIDER_MAX,
  matchPresetId,
} from "./StylesSetting";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import { ICON_COLOR_PRESETS, hslToHex, resolveIconHue } from "../../styles/m3";

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
  // 图标风格档位同样须真实回写：否则分段控件切换无反馈，
  // items 值域锁无法观测"归一后必有可见选中项"。
  if (patch && Object.prototype.hasOwnProperty.call(patch, "iconStyle")) {
    mockSetting.iconStyle = patch.iconStyle;
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
    // items 值域锁（影子 A1）：SettingsCard 对未命中项会给 tabbableIndex=-1 /
    // 全 false 选中态，用户可见"无选中档"。覆盖五域：缺省、旧档 md3、mui、
    // lucide、非法——归一后（resolveIconStyle）必有可见选中项。
    const stored = [undefined, "md3", "mui", "lucide", "nope"];
    try {
      for (const value of stored) {
        mockSetting.iconStyle = value;
        const view = renderStylesSetting();
        const row = [
          ...view.container.querySelectorAll(".kt-settings-row"),
        ].find((element) =>
          element.textContent.includes("settings_icon_style")
        );
        expect(row).not.toBeNull();
        // 分段控件选中态：MUI ToggleButton 以 aria-pressed 表选中，
        // 自定义分段实现以 aria-checked / data-selected 表选中。
        const selected = row.querySelectorAll(
          '[aria-checked="true"], [data-selected="true"], .Mui-selected, [aria-pressed="true"]'
        );
        expect(selected.length).toBeGreaterThan(0);
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
    // PR #17 评审 SUGGESTION：注释声明容差"覆盖量化误差上界"，实现须含
    // 上界本身。lake hue=191.4，±0.5° 端点（190.9/191.9）必须命中。
    // 旧实现 `< HUE_PRESET_SNAP_TOLERANCE` 端点漏吸 → 本用例红。
    expect(matchPresetId(191.4 + HUE_PRESET_SNAP_TOLERANCE)).toBe("lake");
    expect(matchPresetId(191.4 - HUE_PRESET_SNAP_TOLERANCE)).toBe("lake");
    // 不该触发域：超出容差 0.01° 即不吸附。
    expect(matchPresetId(191.4 + HUE_PRESET_SNAP_TOLERANCE + 0.01)).toBeNull();
    // 退化语义：非数值输入无匹配。
    expect(matchPresetId(Number.NaN)).toBeNull();
    expect(matchPresetId(undefined)).toBeNull();
  });

  test("committing a preset-adjacent hue keeps the draft within 0.5° and the highlight does not rebound", () => {
    // 量化往返锁：提交 191.0° 后存储 Hex 反解 ≈191.43°——漂移大于旧 0.25°
    // 假设、落在 0.5° 新容差内。提交后外部值回灌：draft 读数即反解 hue
    //（不弹回），湖蓝预设高亮保持点亮且唯一。
    const committedHex = hslToHex(191.0, 23.3, 64.7);
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
    // PR #17 评审 Minor #327：handleSliderCommitted 内部先算 hex、再经
    // matchPresetId 同语义重匹配高亮，避免"提交同值预设高亮被清空"的回归。
    // 旧实现无条件 setActivePresetId(null)，本用例红。
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
    // After fix: matchPresetId(re-resolved hue) = "lake" → pressed=true.
    // Before fix: setActivePresetId(null) → pressed=false → RED.
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
  // PR #17 评审 Nitpick #4：删除本地 PRESET_TOLERANCE 常量，复用 StylesSetting.js
  // 导出常量，避免两端漂移；渲染完整 IconColorSlider 而非纯数值断言。

  test("committing at the max does not collapse to 0° nor snap to a preset", () => {
    const committedHex = hslToHex(ICON_HUE_SLIDER_MAX, 23.3, 64.7);
    const resolvedHue = resolveIconHue(committedHex);

    // 反解后须仍停在右端附近，绝不塌回 0°。
    expect(resolvedHue).toBeGreaterThanOrEqual(0);
    expect(resolvedHue).toBeLessThan(360);
    expect(resolvedHue).toBeGreaterThanOrEqual(0.25);

    // 距任一预设（含红预设 hue 0）都超出吸附容差，提交后不会误亮/回弹。
    for (const preset of ICON_COLOR_PRESETS) {
      expect(Math.abs(preset.hue - resolvedHue)).toBeGreaterThanOrEqual(
        HUE_PRESET_SNAP_TOLERANCE
      );
    }
  });

  test("clamps the slider reading to ICON_HUE_SLIDER_MAX when stored hue exceeds the ring seam", () => {
    // PR #17 评审 Minor #358：非规范 hex 反解色相 > 359° 时，滑轨显示值须
    // 被上界钳制（读数和色块/拇指共用钳制值），存储 Hex 自身保持无损归一
    // （resolveIconColorHex 不变）。
    // #ff0001 反解色相 ≈359.765°；旧实现 iconHue=359.765 → 读数 "359.8°" → RED。
    // 新实现 iconHue = Math.min(359.765, 359) = 359 → 读数 "359.0°" → GREEN。
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
