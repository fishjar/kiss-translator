import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import StylesSetting from "./StylesSetting";
import SettingsSearchTarget from "./SettingsSearchTarget";
import { builtinStylesMap } from "../../libs/style";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import { I18N, UI_LANGS } from "../../config/i18n";
import { OPTIONS_STYLES } from "./styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";
import { setIconStyleSnapshot, getIconStyleSnapshot } from "../../styles/m3";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DANGEROUS_STYLE_CODE = "position: fixed; inset: 0; z-index: 2147483647;";

// @emotion/react 不 mock（repo 先例：PopupStylePreview.test.js 走真实
// emotion 断言编译产物；jest.mock 整体替换会掀掉 @mui/styled-engine 依赖
// 的 withEmotionCache，模块加载期自崩）。弹窗演示断言直接读 emotion 落进
// document.head 的产物：speedy 模式下 style 标签 textContent 为空，规则
// 在 CSSOM（styleSheets.cssRules）里，两路合并后压缩空白做包含断言。
function getHeadCssText() {
  const tagText = [...document.head.querySelectorAll("style[data-emotion]")]
    .map((style) => style.textContent)
    .join("\n");
  const sheetText = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch (error) {
        return [];
      }
    })
    .join("\n");
  return `${tagText}\n${sheetText}`;
}

function compactCss(text) {
  return text.replace(/\s+/g, "");
}

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

// 稳定的 setting 引用避免 useAllTextStyles 抖动；updateSetting 同时支持
// 对象补丁（SettingsSegmented 契约）与函数更新器（useStyleList 全走函数
// 形态），落盘到 mockSetting 供 rerender 驱动卡片列表变化。
// 注意：updateSetting 必须是普通函数而非 jest.fn——本仓库 jest 环境下
// 「被 jest.mock 工厂引用的 jest.fn」在组件事件链路里会记录调用但跳过
// 实现体（已实证），而置顶/预填/自动展开断言依赖
// 实现体真实落盘。故用普通函数承载变更 + 手工调用日志对齐 jest 断言语义。
const mockSetting = {
  uiLang: "en",
  darkMode: "auto",
  textareaGripStyle: "concentric-smooth",
  customStyles: [],
};
const mockUpdateSettingCalls = [];
function mockApplyUpdateSetting(patch) {
  mockUpdateSettingCalls.push(patch);
  const resolved = typeof patch === "function" ? patch(mockSetting) : patch;
  if (resolved && typeof resolved === "object") {
    Object.assign(mockSetting, resolved);
  }
}
function resetUpdateSettingCalls() {
  mockUpdateSettingCalls.length = 0;
}

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: mockApplyUpdateSetting,
  }),
}));

const mockConfirm = jest.fn();

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

const makeCustomStyle = (styleSlug, styleName, styleCode) => ({
  styleSlug,
  styleName,
  styleCode,
});

function renderStylesSettingView(searchNavigation = {}) {
  let navigation = searchNavigation;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => (
    <SettingsSearchTarget
      target={navigation.target}
      label={navigation.target}
      navigationKey={navigation.navigationKey}
    >
      <StylesSetting />
    </SettingsSearchTarget>
  );

  act(() => {
    root.render(render());
  });

  return {
    container,
    rerender(next = navigation) {
      navigation = next;
      act(() => {
        root.render(render());
      });
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getSettingsRow(container, labelText) {
  return (
    Array.from(container.querySelectorAll(".kt-settings-row")).find(
      (row) =>
        row.querySelector(".kt-settings-row__copy strong")?.textContent ===
        labelText
    ) || null
  );
}

function getTrailingToggle(container) {
  return container.querySelector(
    '.kt-style-split-group__trailing[aria-controls="kt-style-manager-panel"]'
  );
}

function openStyleManager(view) {
  const libraryRow = getSettingsRow(view.container, "settings_style_library");
  // 首个 button 现为 leading（新建弹窗），抽屉开关恒为 trailing chevron。
  act(() => {
    getTrailingToggle(libraryRow).click();
  });
  return view.container.querySelector(".kt-style-manager");
}

function getCards(manager) {
  return Array.from(manager.querySelectorAll(".kt-style-card"));
}

function getToggle(card) {
  return card.querySelector(".kt-style-card__toggle");
}

function isCardExpanded(card) {
  return getToggle(card)?.getAttribute("aria-expanded") === "true";
}

describe("StylesSetting custom css entry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("keeps exactly one style library row and drops the standalone custom css row", () => {
    const view = renderStylesSettingView();

    expect(getSettingsRow(view.container, "settings_custom_css")).toBeNull();
    expect(
      getSettingsRow(view.container, "settings_style_library")
    ).not.toBeNull();
    expect(
      Array.from(view.container.querySelectorAll(".kt-settings-row")).filter(
        (row) =>
          row.querySelector(".kt-settings-row__copy strong")?.textContent ===
          "settings_style_library"
      )
    ).toHaveLength(1);

    view.cleanup();
  });

  test("labels the leading add button with the custom css entry name", () => {
    const view = renderStylesSettingView();
    // leading 恒在样式库行的胶囊组内（抽屉外），无需先开抽屉即可定位。
    const addButton = view.container.querySelector("#add-style-button");
    expect(addButton).not.toBeNull();
    expect(addButton.textContent).toBe("settings_custom_css");
    expect(addButton.getAttribute("aria-haspopup")).toBe("dialog");
    // 窄屏 icon-only 护栏：文案节点 display:none 不进可及名计算、图标缺省
    // aria-hidden ⇒ leading 必须显式携带 aria-label（WCAG 4.1.2）。
    expect(addButton.getAttribute("aria-label")).toBe("settings_custom_css");
    // 该反向断言须落在「已开抽屉」的用例（见下一 test）——此处抽屉未开，
    // manager 恒 null，条件断言会空转。
    view.cleanup();
  });

  test("renders the style library control as an accessible split-button group", () => {
    const view = renderStylesSettingView();
    const libraryRow = getSettingsRow(
      view.container,
      "settings_style_library"
    );
    const group = libraryRow.querySelector(".kt-style-split-group");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("settings_style_library");
    const trailing = getTrailingToggle(libraryRow);
    expect(trailing.getAttribute("aria-expanded")).toBe("false");
    expect(trailing.getAttribute("aria-label")).toBe("style_library_expand");
    // 胶囊贴合前提：两成员同 variant（描边可见），text 形态无描边则「两枚
    // 按钮贴合成一枚胶囊」结构性不成立。
    const leading = libraryRow.querySelector(".kt-style-split-group__leading");
    expect(leading.getAttribute("class")).toContain("MuiButton-outlined");
    expect(trailing.getAttribute("class")).toContain("MuiButton-outlined");
    // 折叠面板不得携带 aria-hidden（hidden + display:none 已足够，冗余即
    // Chrome「Blocked aria-hidden…descendant retained focus」报错源）。
    act(() => {
      trailing.click();
    });
    const manager = view.container.querySelector(".kt-style-manager");
    expect(manager.hidden).toBe(false);
    expect(manager.hasAttribute("aria-hidden")).toBe(false);
    // 反向断言（无条件执行）：抽屉已开，其内不得再含 #add-style-button
    // （新建钮已迁入行内胶囊组）。
    expect(manager.querySelector("#add-style-button")).toBeNull();
    const reopenedTrailing = getTrailingToggle(libraryRow);
    expect(reopenedTrailing.getAttribute("aria-expanded")).toBe("true");
    expect(reopenedTrailing.getAttribute("aria-label")).toBe(
      "style_library_collapse"
    );
    view.cleanup();
  });

  test("reveals the style manager when search targets settings_custom_css", async () => {
    const view = renderStylesSettingView({ target: "settings_custom_css" });
    await flushMicrotasks();

    const manager = view.container.querySelector(".kt-style-manager");
    expect(manager).not.toBeNull();
    expect(manager.hidden).toBe(false);

    view.cleanup();
  });

  test("drops the builtin styles section from the style manager", () => {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", ""),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    const sectionTitles = Array.from(manager.querySelectorAll("h2")).map(
      (node) => node.textContent
    );

    expect(sectionTitles).not.toContain("builtin_styles");
    // mock 下 builtinStyles 来自 OPT_STYLE_ALL×builtinStylesMap（18 项）：
    // 删除前卡片总数 19（18 内置 + 1 自定义 mock），删除后仅剩自定义 1 张。
    expect(manager.querySelectorAll(".kt-style-card")).toHaveLength(1);

    view.cleanup();
  });
});

describe("StylesSetting style cards", () => {
  beforeEach(() => {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    // 统一重置：个别用例会改 textareaGripStyle 驱动 rerender，未恢复也不
    // 得泄漏到后续用例（成功/失败路径均由 beforeEach 自愈）
    mockSetting.textareaGripStyle = "concentric-smooth";
    resetUpdateSettingCalls();
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("expands only from the arrow toggle (negative lock on name and demo areas)", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    const card = getCards(manager)[0];

    // v2 结构在位：名字纯文本、演示容器、箭头钮
    expect(card.querySelector(".kt-style-card__name-text").textContent).toBe(
      "Style A"
    );
    expect(card.querySelector(".kt-style-card__demo")).not.toBeNull();
    expect(getToggle(card)).not.toBeNull();
    expect(isCardExpanded(card)).toBe(false);

    // 反向断言：点击名字区不触发展开
    act(() => {
      card.querySelector(".kt-style-card__name-text").click();
    });
    expect(isCardExpanded(getCards(manager)[0])).toBe(false);

    // 反向断言：点击演示区不触发展开
    act(() => {
      getCards(manager)[0].querySelector(".kt-style-card__demo").click();
    });
    expect(isCardExpanded(getCards(manager)[0])).toBe(false);

    // 仅箭头钮触发展开；is-expanded 类随 aria-expanded 同步（180° 旋转
    // 规则挂该类，jsdom 以类断言承载，旋转视效须在真实浏览器核对）
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    expect(isCardExpanded(getCards(manager)[0])).toBe(true);
    expect(getCards(manager)[0].className).toContain("is-expanded");

    // 再次点击同卡收起（全收起态 activeEditSlug=null）
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    expect(isCardExpanded(getCards(manager)[0])).toBe(false);
    expect(getCards(manager)[0].className).not.toContain("is-expanded");

    view.cleanup();
  });

  test("keeps a single expanded card across the list (mutual exclusion)", () => {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", ""),
      makeCustomStyle("custom-b", "Style B", ""),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);

    expect(getCards(manager)).toHaveLength(2);

    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    expect(isCardExpanded(getCards(manager)[0])).toBe(true);
    expect(isCardExpanded(getCards(manager)[1])).toBe(false);

    // 展开第二张：第一张被 activeEditSlug 覆盖自动收起
    act(() => {
      getToggle(getCards(manager)[1]).click();
    });
    expect(isCardExpanded(getCards(manager)[0])).toBe(false);
    expect(isCardExpanded(getCards(manager)[1])).toBe(true);

    view.cleanup();
  });

  test("edits the name in place while expanded and keeps no name field in the body", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    // 折叠态：纯文本名字，无输入框
    expect(card.querySelector(".kt-style-card__name-text").textContent).toBe(
      "Style A"
    );
    expect(card.querySelector(".kt-style-card__name-input")).toBeNull();

    act(() => {
      getToggle(card).click();
    });

    card = getCards(manager)[0];
    const nameInput = card.querySelector(
      ".kt-style-card__header .kt-style-card__name-input input"
    );
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe("Style A");

    const body = card.querySelector(".kt-style-card__body");
    expect(body).not.toBeNull();
    // body 内不再有名称字段（原地名称编辑唯一入口在 header）
    expect(body.querySelector('input[name="styleName"]')).toBeNull();
    expect(body.querySelector('textarea[name="styleCode"]')).not.toBeNull();

    view.cleanup();
  });

  test("compiles the draft into the scoped demo and degrades gracefully on invalid css", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    card = getCards(manager)[0];
    const getDemo = () => card.querySelector(".kt-style-card__demo");

    // 危险 CSS 被编译进卡片作用域（.kt-scope-<slug> .kt-style-demo 后代
    // 选择器），不以全局类名形式落进编译产物；contain:paint 裁剪由
    // styles.js 的样式注入承载；jsdom 只能断言样式表产物文本，实际裁剪
    // 效果须在真实浏览器人工核对。
    expect(card.querySelector(".kt-style-card__demo style").textContent).toBe(
      `.kt-scope-custom-a .kt-style-demo { ${DANGEROUS_STYLE_CODE} }`
    );
    expect(getDemo().className).not.toContain("is-invalid");
    expect(getDemo().getAttribute("title")).toBe("style_active");

    // 括号不配对 → is-invalid 优雅降级，页面不崩
    const codeArea = card.querySelector('textarea[name="styleCode"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set.call(codeArea, "position: fixed; {");
      codeArea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    card = getCards(manager)[0];
    expect(
      card.querySelector(".kt-style-card__demo").className
    ).toContain("is-invalid");
    expect(
      card.querySelector(".kt-style-card__demo").getAttribute("title")
    ).toBe("css_invalid");
    expect(card.querySelector(".kt-style-card__demo style").textContent).toBe(
      ""
    );
    // 页面不崩：演示 span 仍在渲染面
    expect(card.querySelector(".kt-style-demo").textContent).toBe(
      "translated_text"
    );

    // 乱序括号（右先于左，纯计数法下误判有效）→ is-invalid 优雅降级
    act(() => {
      const area = getCards(manager)[0].querySelector(
        'textarea[name="styleCode"]'
      );
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set.call(area, "} color: red {");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });

    card = getCards(manager)[0];
    expect(
      card.querySelector(".kt-style-card__demo").className
    ).toContain("is-invalid");
    expect(card.querySelector(".kt-style-card__demo style").textContent).toBe(
      ""
    );
    // contain:paint 沙箱声明回归防护（OPTIONS_STYLES 产物文本承载；
    // position:fixed 的实际裁剪效果须在真实浏览器人工核对）
    expect(compactCss(OPTIONS_STYLES)).toContain("contain:paint");

    view.cleanup();
  });

  test("gates saving behind a dirty draft", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    const getSaveButton = () =>
      Array.from(getCards(manager)[0].querySelectorAll("button")).find(
        (button) => button.textContent === "save"
      );

    // isModified=0：保存禁用
    expect(getSaveButton().disabled).toBe(true);

    const nameInput = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Renamed Style");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(getSaveButton().disabled).toBe(false);

    act(() => {
      getSaveButton().click();
    });

    // 保存调 onUpdate → useStyleList().updateStyle（函数更新器形态落
    // updateSetting），持久化三字段经 toPersistedCustomStyle 收敛
    expect(mockUpdateSettingCalls).toHaveLength(1);
    const next = mockUpdateSettingCalls[0]({
      customStyles: [makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE)],
    });
    expect(next.customStyles[0]).toEqual({
      styleSlug: "custom-a",
      styleName: "Renamed Style",
      styleCode: DANGEROUS_STYLE_CODE,
    });

    view.cleanup();
  });

  test("does not claim style_active for a blank style draft", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    card = getCards(manager)[0];
    // 清空代码：编译 valid 但无任何 CSS 产物——空白样式不是"样式生效中"
    const codeArea = card.querySelector('textarea[name="styleCode"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set.call(codeArea, "");
      codeArea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    card = getCards(manager)[0];
    const demo = card.querySelector(".kt-style-card__demo");
    // 空白样式非 invalid 形态（valid:true），但不得再挂"样式生效中"提示
    expect(demo.className).not.toContain("is-invalid");
    expect(demo.getAttribute("title")).toBe(null);
    // 演示文本仍在渲染面
    expect(card.querySelector(".kt-style-demo").textContent).toBe(
      "translated_text"
    );

    view.cleanup();
  });

  test("clears drafts and snapshots for styles removed by external sync", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    // 未保存草稿
    const nameInput = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // 外部同步删除该样式：草稿与快照必须一并清除
    mockSetting.customStyles = [
      makeCustomStyle("custom-b", "Style B", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager).some((node) =>
        node.textContent.includes("custom-b") ||
        node.querySelector(".kt-style-card__name-text")?.textContent ===
          "Style B"
      )
    ).toBe(true);

    // 同 slug 以原内容恢复：不得复现陈稿（快照残留会让恢复场景误判
    // "快照一致"跳过清稿），回落持久化内容
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
      makeCustomStyle("custom-b", "Style B", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();

    const expanded = getCards(manager).find((node) => isCardExpanded(node));
    expect(expanded).toBeDefined();
    expect(
      expanded.querySelector(".kt-style-card__name-input input").value
    ).toBe("Style A");

    view.cleanup();
  });

  test("renders a non-string styleCode safely in the editor", () => {
    // 导入通道可能注入非字符串 styleCode（123/null）：编辑框必须用安全
    // 字符串显示值渲染，不得在展开卡片时抛 TypeError；编译仍按原值——
    // 非字符串判 invalid，用户修正前保持无效形态
    mockSetting.customStyles = [
      { styleSlug: "custom-a", styleName: "Style A", styleCode: 123 },
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    card = getCards(manager)[0];
    const codeArea = card.querySelector('textarea[name="styleCode"]');
    expect(codeArea).not.toBeNull();
    expect(codeArea.value).toBe("");
    // 编译按原值（非字符串 → invalid）：演示框进入 is-invalid 形态
    expect(card.querySelector(".kt-style-card__demo").className).toContain(
      "is-invalid"
    );
    // 保存闸（compiled invalid）阻断落库
    const saveButton = Array.from(
      getCards(manager)[0].querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    expect(saveButton.disabled).toBe(true);

    view.cleanup();
  });

  test("blocks saving an invalid draft", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    const getSaveButton = () =>
      Array.from(getCards(manager)[0].querySelectorAll("button")).find(
        (button) => button.textContent === "save"
      );
    const setCode = (value) => {
      act(() => {
        const area = getCards(manager)[0].querySelector(
          'textarea[name="styleCode"]'
        );
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set.call(area, value);
        area.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    // 语法合法的草稿修改：保存可用（闸只拦 invalid，不拦合法修改）
    setCode("color: red;");
    expect(getSaveButton().disabled).toBe(false);

    // 括号不配对 → invalid：保存钮禁用，点击不落库（updateStyle 链路零调用）
    setCode("position: fixed; {");
    expect(getSaveButton().disabled).toBe(true);
    act(() => {
      getSaveButton().click();
    });
    expect(mockUpdateSettingCalls).toHaveLength(0);

    view.cleanup();
  });

  test("deletes only after the confirm dialog resolves", async () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    const getDeleteButton = () =>
      Array.from(getCards(manager)[0].querySelectorAll("button")).find(
        (button) => button.textContent === "delete"
      );

    // 拒绝路径：confirm 返回 false → 不删
    mockConfirm.mockResolvedValueOnce(false);
    act(() => {
      getDeleteButton().click();
    });
    await flushMicrotasks();
    expect(mockConfirm).toHaveBeenCalledWith({
      confirmText: "delete",
      cancelText: "cancel",
    });
    expect(mockUpdateSettingCalls).toHaveLength(0);

    // 确认路径：confirm 返回 true → 调 deleteStyle（filter 更新器）
    act(() => {
      getDeleteButton().click();
    });
    await flushMicrotasks();
    expect(mockUpdateSettingCalls).toHaveLength(1);
    const next = mockUpdateSettingCalls[0]({
      customStyles: [makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE)],
    });
    expect(next.customStyles).toEqual([]);

    view.cleanup();
  });

  test("keeps a local draft across identity shake and resets on persisted change", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    let nameInput = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // useAllTextStyles 每次写入都 .map() 出全新样式对象：引用是新的、内容
    // 一字未变。这种身份抖动不得冲掉未保存草稿（lastSyncedStyleRef 快照对比）。
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Local style draft");

    // 持久化内容真实变更 → 快照对比命中 → 草稿重置
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Persisted style", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Persisted style");

    view.cleanup();
  });

  test("reveals the drawer when the leading add button is clicked before any open", () => {
    // 空库退化语义（C1）：customStyles.length===0 时 leading 仍可点，
    // 揭示的是空抽屉，不报错、不堆脏卡。
    mockSetting.customStyles = [];
    const view = renderStylesSettingView();
    // leading #add-style-button 现常驻行内（不受挂载门 hasOpenedStyleManager 约束）
    expect(view.container.querySelector(".kt-style-manager")).toBeNull();
    const addButton = view.container.querySelector("#add-style-button");
    act(() => {
      addButton.click();
    });
    // 点击须同时揭示抽屉，否则首屏新建的卡渲染进未挂载面板、静默不可见、重试堆脏卡。
    const manager = view.container.querySelector(".kt-style-manager");
    expect(manager).not.toBeNull();
    expect(manager.hidden).toBe(false);
    expect(manager.querySelectorAll(".kt-style-card")).toHaveLength(0);
    view.cleanup();
  });

  test("keeps an expanded draft mounted while the manager is hidden", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    const nameInput = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Unsaved style draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const libraryRow = getSettingsRow(
      view.container,
      "settings_style_library"
    );
    act(() => {
      getTrailingToggle(libraryRow).click();
    });

    expect(view.container.querySelector(".kt-style-manager")).toBe(manager);
    expect(manager.hidden).toBe(true);
    expect(manager.hasAttribute("aria-hidden")).toBe(false);

    act(() => {
      getTrailingToggle(libraryRow).click();
    });

    expect(manager.hidden).toBe(false);
    // 面板隐藏期间卡片保持挂载：草稿与输入框元素身份都保留
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
    ).toBe(nameInput);
    expect(nameInput.value).toBe("Unsaved style draft");

    view.cleanup();
  });

  test("reveals exactly one card when search targets style keys", async () => {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", ""),
      makeCustomStyle("custom-b", "Style B", ""),
    ];
    const view = renderStylesSettingView({ target: "style_code" });
    await flushMicrotasks();

    const manager = view.container.querySelector(".kt-style-manager");
    // per-card reveal 接线：锚键命中上抛激活，互斥单开下恰一张展开
    const expandedCards = getCards(manager).filter(isCardExpanded);
    expect(expandedCards).toHaveLength(1);
    // 激活对象必须为数据序第一张（Style A / kt-scope-custom-a）——双列
    // 瀑布流的树序（列分布）不得决定激活结果（树序 3 卡时为 a,c,b，
    // "最后上抛者胜"会激活数据序中间卡）。展开卡名称区是 TextField（无
    // name-text），以卡片上的 scope 类定位身份
    expect(expandedCards[0].className).toContain("kt-scope-custom-a");

    view.cleanup();
  });

  test("distributes cards across two deterministic waterfall columns", () => {
    // CSS 多列平衡在 ≤2 项时退化为顺序堆叠（用户实测 2 项全堆左列），
    // 瀑布流改为显式双列按数据序对半切分：前 ⌈n/2⌉ 入左列、余入右列，
    // 确定性成立且窄屏展平后文档序＝数据序。
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", ""),
      makeCustomStyle("custom-b", "Style B", ""),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);

    let columns = manager.querySelectorAll(".kt-style-grid__column");
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelectorAll(".kt-style-card")).toHaveLength(1);
    expect(columns[1].querySelectorAll(".kt-style-card")).toHaveLength(1);

    mockSetting.customStyles = [
      ...mockSetting.customStyles,
      makeCustomStyle("custom-c", "Style C", ""),
    ];
    view.rerender();
    columns = manager.querySelectorAll(".kt-style-grid__column");
    expect(columns[0].querySelectorAll(".kt-style-card")).toHaveLength(2);
    expect(columns[1].querySelectorAll(".kt-style-card")).toHaveLength(1);

    // 阅读序＝逻辑序（文档序而非 CSS order）：分布改为按数据序对半切分后，
    // 卡片 DOM 文档序＝Tab 序＝读屏序＝customStyles 数据序 [a,b,c]。
    const docOrder = Array.from(
      manager.querySelectorAll(".kt-style-card")
    ).map(
      (card) =>
        [...card.classList].find((cls) => cls.startsWith("kt-scope-")) || ""
    );
    expect(docOrder).toEqual([
      "kt-scope-custom-a",
      "kt-scope-custom-b",
      "kt-scope-custom-c",
    ]);

    view.cleanup();
  });

  test("wires the shared resize grip onto the style code editor", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    card = getCards(manager)[0];
    const textarea = card.querySelector('textarea[name="styleCode"]');
    // 通用手柄（TextareaResizeGrip）在位（非 hidden 样式），原生 resize
    // 被接管为 resize:none（inline style 断言，jsdom 可承载）
    expect(card.querySelector(".kt-resize-grip")).not.toBeNull();
    expect(textarea.style.resize).toBe("none");

    // hidden 手柄样式：手柄早退不渲染，textarea 回退原生 resize:vertical
    mockSetting.textareaGripStyle = "hidden";
    view.rerender();
    card = getCards(manager)[0];
    expect(card.querySelector(".kt-resize-grip")).toBeNull();
    expect(
      card.querySelector('textarea[name="styleCode"]').style.resize
    ).toBe("vertical");

    view.cleanup();
  });

  test("dispatches card icons through the shared icon style store", () => {
    // 图标分发端到端锁（与 src/components/icons 组件库同口径）：store 切 mui → MUI 形态
    // （svg 直下 path，无 g 包裹层）；切回缺省 lucide → 描边形态（svg >
    // g[fill="none"] 包裹层）。store 经 setIconStyleSnapshot 直接驱动，
    // 还原由 finally 兜底。
    const previousStyle = getIconStyleSnapshot();
    try {
      act(() => {
        setIconStyleSnapshot("mui");
      });
      const view = renderStylesSettingView();
      const manager = openStyleManager(view);
      let card = getCards(manager)[0];
      expect(
        card.querySelector(".kt-style-card__toggle svg > g")
      ).toBeNull();

      act(() => {
        setIconStyleSnapshot("lucide");
      });
      view.rerender();
      card = getCards(manager)[0];
      expect(
        card.querySelector(".kt-style-card__toggle svg > g")
      ).not.toBeNull();

      view.cleanup();
    } finally {
      act(() => {
        setIconStyleSnapshot(previousStyle);
      });
    }
  });

  test("keeps the unsaved draft when adding a card flips column parity", () => {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", ""),
      makeCustomStyle("custom-b", "Style B", ""),
      makeCustomStyle("custom-c", "Style C", ""),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    // 文档序 [a,b,c]（col0=[a,b]、col1=[c]）；展开下标 1 的 custom-b（在 col0）
    let card = getCards(manager)[1];

    act(() => {
      getToggle(card).click();
    });

    let nameInput = getCards(manager)[1].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // 头部 unshift 新卡：列表 3→4、mid 仍 2，custom-b 文档下标 1→2 跨过列边界
    // （col0→col1）→ 卸载重挂（对半切分下唯一翻列序列，钉住跨列草稿存活）
    mockSetting.customStyles = [
      makeCustomStyle("custom-new", "Style New", ""),
      ...mockSetting.customStyles,
    ];
    view.rerender();

    // 激活态随主组件 activeEditSlug 存活：仍是 custom-b 的卡
    card = getCards(manager).find(isCardExpanded);
    // find 未命中返回 undefined，not.toBeNull 会真空通过——toBeDefined
    // 在后续 card.querySelector 解引用之前明确失败。
    expect(card).toBeDefined();
    nameInput = card.querySelector(".kt-style-card__name-input input");
    expect(nameInput.value).toBe("Local draft");

    view.cleanup();
  });

  test("renders the expanded name field with the project name-field convention", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });

    card = getCards(manager)[0];
    // 名称类字段家族（同 Apis apiName / Prompts prompt_name）：filled
    // 缺省形态 + size=small + label 上浮；非自定几何的 Outlined 变体
    expect(
      card.querySelector(".kt-style-card__name-input .MuiFilledInput-root")
    ).not.toBeNull();
    expect(
      card
        .querySelector(".kt-style-card__name-input .MuiFilledInput-root")
        .className
    ).toContain("MuiInputBase-sizeSmall");
    expect(
      card.querySelector(".kt-style-card__name-input .MuiOutlinedInput-root")
    ).toBeNull();
    expect(
      card.querySelector(".kt-style-card__name-input .MuiInputLabel-root")
        ?.textContent
    ).toBe("style_name");
    // 自定几何禁令：styles.js 不得对名称框做高度/圆角覆写（家族形态单源）
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-style-card__name-input \.MuiOutlinedInput-root/
    );
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-style-card__name-input[^{]*\{[^}]*height: 56px/
    );

    view.cleanup();
  });
});

describe("compileCss selector-list scope guard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // compileCss 为模块内私有函数，只能经卡片演示区 <style> 与 is-invalid
  // 降级态间接断言；scopeClass 由 customStyle.styleSlug 派生。
  function renderCardWithCode(code) {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", code),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    const card = getCards(manager)[0];
    const demo = card.querySelector(".kt-style-card__demo");
    return {
      view,
      demo,
      css: card.querySelector(".kt-style-card__demo style").textContent,
    };
  }

  test("rejects a selector list in an & rule and emits no rules", () => {
    const { view, demo, css } = renderCardWithCode(
      "&, body { position: fixed; }"
    );
    // 契约：整份草稿判无效、不输出任何规则、优雅降级、页面不崩
    expect(css).toBe("");
    expect(demo.className).toContain("is-invalid");
    expect(demo.getAttribute("title")).toBe("css_invalid");
    expect(view.container.querySelector(".kt-style-demo").textContent).toBe(
      "translated_text"
    );
    view.cleanup();
  });

  test("rejects the whole draft with no partial rules when any & rule has a selector list", () => {
    const { view, css } = renderCardWithCode(
      "color: red; &:hover { color: blue } &, body { position: fixed }"
    );
    // 契约：整份判无效，连合法规则也不得残留（防「只跳过坏规则」的错修）
    expect(css).toBe("");
    expect(css).not.toContain("color: red");
    view.cleanup();
  });

  test("rejects a selector list after a compound & suffix", () => {
    const { view, demo, css } = renderCardWithCode(
      "&:hover, body { color: red; }"
    );
    expect(css).toBe("");
    expect(demo.className).toContain("is-invalid");
    view.cleanup();
  });

  test("rejects the whole draft when a bad rule precedes a later valid rule", () => {
    // A-5 证伪：坏规则前置 + 后续合法无逗号规则；若标志位被写成逐次覆写
    // hasSelectorList = sel.includes(",")，末条合法规则会把 true 覆回 false，
    // 整份草稿被误判有效并残留合法规则。此用例钉住「单调置真」不变量。
    const { view, demo, css } = renderCardWithCode(
      "&, body { position: fixed; } &:hover { color: blue; }"
    );
    expect(css).toBe("");
    expect(demo.className).toContain("is-invalid");
    expect(demo.getAttribute("title")).toBe("css_invalid");
    view.cleanup();
  });

  test("keeps declaration-value commas inside an & body scoped and valid", () => {
    const { view, demo, css } = renderCardWithCode(
      "& { background: linear-gradient(red, blue); }"
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo { background: linear-gradient(red, blue); }"
    );
    view.cleanup();
  });

  test("keeps declaration-value commas without & scoped and valid", () => {
    const { view, demo, css } = renderCardWithCode(
      "background: linear-gradient(red, blue);"
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo { background: linear-gradient(red, blue); }"
    );
    view.cleanup();
  });

  test("keeps valid & selectors scoped and valid", () => {
    const { view, demo, css } = renderCardWithCode(
      "&:hover { color: blue; }"
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo:hover { color: blue; }"
    );
    view.cleanup();
  });

  test("keeps a bare & descendant selector scoped (builtin template shape)", () => {
    // C3 保真：内置模板 uses "& *"；sel 仅裁剪末尾空白、保留 & 后前导
    // 空格——生成合法的后代选择器 ".kt-style-demo *"（trim() 会拼出无效
    // 的 ".kt-style-demo*"，规则被浏览器丢弃）。
    const { view, demo, css } = renderCardWithCode(
      "& * { background-color: transparent; }"
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo * { background-color: transparent; }"
    );
    view.cleanup();
  });

  test("keeps rest-level nested selector commas scoped (no over-rejection)", () => {
    // rest 兜底里的逗号位于花括号内，不构成顶层选择器列表。
    // 完整输出钉死：body, html 作为嵌套规则整体落在 .kt-style-demo { … } 块
    // 内，两种选择器都在卡片作用域之下（原生 CSS 嵌套解析为后代），不泄漏为
    // 全局选择器；反向断言无任何以裸 body/html 起始的顶层选择器行逃出作用域。
    const { view, demo, css } = renderCardWithCode(
      "& x { color:red } body, html { color:blue }"
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo x { color:red }\n" +
        ".kt-scope-custom-a .kt-style-demo { body, html { color:blue } }"
    );
    expect(css).not.toMatch(/^[ \t]*(?:body|html)[ \t]*[,{]/m);
    view.cleanup();
  });

  test("keeps an empty draft valid with no rules", () => {
    // 空串短路不被门控误伤（valid:true、无规则输出）；空白样式不挂
    // "样式生效中"提示（无 CSS 产物不构成生效态）
    const { view, demo, css } = renderCardWithCode("");
    expect(demo.className).not.toContain("is-invalid");
    expect(demo.getAttribute("title")).toBe(null);
    expect(css).toBe("");
    view.cleanup();
  });

  test("keeps string/comment braces from desyncing the scan", () => {
    // 字符串/注释内的花括号不参与深度计数、不被 & 正则误捕：① "{"/"}"
    // 不造成误判无效且字符串原样进输出；② 注释内的伪 & 规则不被发射；
    // ③ 注释以 /**/ 占位保留（token 分隔），不并入相邻 token。
    const { view, demo, css } = renderCardWithCode(
      '& { content: "{" } /* & x { y } */ &:hover { color: "}" }'
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      '.kt-scope-custom-a .kt-style-demo { content: "{" }\n' +
        '.kt-scope-custom-a .kt-style-demo { /**/ &:hover { color: "}" } }'
    );
    expect(css).not.toContain("& x");
    view.cleanup();
  });

  test("rejects unterminated comments and strings as unsafe input", () => {
    for (const code of [
      "& { color: red } /* 未闭合",
      '& { content: "未闭合 }',
    ]) {
      const { view, demo, css } = renderCardWithCode(code);
      expect(demo.className).toContain("is-invalid");
      expect(css).toBe("");
      view.cleanup();
    }
  });

  test("keeps a nested-open-brace rule scoped as a nested rule", () => {
    // sel/body 捕获组均排除花括号（[^{}]*）：体内嵌套 { 的 & 规则不再被
    // 匹配（匹配不可能跨越规则边界），整体落入 rest 作为嵌套规则留在作用
    // 域块内——原生嵌套把 & 解析为作用域选择器，不逃逸、也无需判无效。
    const { view, demo, css } = renderCardWithCode("& x { a { b } }");
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(".kt-scope-custom-a .kt-style-demo { & x { a { b } } }");
    view.cleanup();
  });

  test("never lets a boundary-crossing & match leak a top-level body rule", () => {
    // 跨边界回归锁："{ & a } body { color:blue }" 曾使 sel 吞进边界上的
    // }，发射的游离 } 提前闭合作用域块、其后的 body 规则逃逸为全局选择
    // 器。捕获组排除花括号后不发生匹配，全部内容留在作用域块内。
    const { view, demo, css } = renderCardWithCode(
      "{ & a } body { color:blue }"
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo { { & a } body { color:blue } }"
    );
    expect(css).not.toMatch(/^[ \t]*body[ \t]*[,{]/m);
    view.cleanup();
  });

  test("keeps a selector-string comma from tripping the list guard", () => {
    // 选择器内字符串的逗号不是列表分隔符（属性选择器串值），掩码后不触发
    // 作用域闸——既不误拒，输出仍整体落在卡片作用域内。
    const { view, demo, css } = renderCardWithCode(
      '&[title="a,b"] { color: red }'
    );
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      '.kt-scope-custom-a .kt-style-demo[title="a,b"] { color: red }'
    );
    view.cleanup();
  });
});

describe("StylesSetting template select modal", () => {
  let uuidCounter;
  let originalCryptoDescriptor;

  beforeEach(() => {
    mockSetting.customStyles = [makeCustomStyle("custom-a", "Style A", "")];
    resetUpdateSettingCalls();
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
    // jsdom 环境不注入 webcrypto：addStyle 依赖 crypto.randomUUID（与
    // CustomStyles.test.js 同款确定性 stub）。Node 18+ 的 globalThis.crypto
    // 是 getter-only 访问器——裸赋值在严格模块内抛错、宽松模块内静默无效
    // （stub 从未生效、确定性被真实 crypto 顶掉），必须走 defineProperty；
    // afterEach 还原原始描述符（原不存在才 delete），不污染同文件其他用例。
    uuidCounter = 0;
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
    document.body.innerHTML = "";
  });

  function withFakeTimers(run) {
    jest.useFakeTimers();
    let view;
    try {
      view = renderStylesSettingView();
      return run(view);
    } finally {
      jest.useRealTimers();
      view?.cleanup();
    }
  }

  function openTemplateModal(view) {
    const manager = openStyleManager(view);
    const addButton = view.container.querySelector("#add-style-button");
    act(() => {
      Simulate.click(addButton);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    return { manager, dialog: document.body.querySelector('[role="dialog"]') };
  }

  test("opens the centered dialog with labelled title and trapped focus", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);

      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe(
        "kt-template-modal-title"
      );
      const title = document.getElementById("kt-template-modal-title");
      expect(title.textContent).toContain("choose_style_template");
      // MUI 焦点圈闭：打开后初始焦点入内
      expect(dialog.contains(document.activeElement)).toBe(true);
      // 动作菜单容器语义（role=menu，无选中染色）
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
      // ✕ 关闭钮复用 close 键
      const closeButton = Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.getAttribute("aria-label") === "close"
      );
      expect(closeButton).not.toBeNull();
    });
  });

  test("offers exactly 18 action items led by the blank style", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);

      const items = [...dialog.querySelectorAll('[role="menuitem"]')];
      // 18 = 空白样式 + 17 内置：style_none（无样式）的内置代码为空串，
      // 与空白样式同语义，属重复项——从模板清单剔除。
      expect(items).toHaveLength(18);
      expect(
        items[0].querySelector(".kt-template-item__name").textContent
      ).toBe("blank_style");
      // 反向断言：style_none 不得作为选项出现（与空白样式重复）
      expect(
        items.find(
          (item) =>
            item.querySelector(".kt-template-item__name")?.textContent ===
            "style_none"
        )
      ).toBeUndefined();
      // 反向断言：动作菜单项无选中语义与勾选/单选形态
      items.forEach((item) => {
        expect(item.getAttribute("aria-selected")).toBeNull();
        expect(
          item.querySelector(
            '[role="menuitemcheckbox"], [role="menuitemradio"], input[type="checkbox"], input[type="radio"]'
          )
        ).toBeNull();
      });
    });
  });

  test("creates a prefilled card on top from a builtin template item", () => {
    withFakeTimers((view) => {
      const { manager } = openTemplateModal(view);

      const item = [
        ...document.body.querySelectorAll('[role="menuitem"]'),
      ].find(
        (node) =>
          node.querySelector(".kt-template-item__name")?.textContent ===
          "under_line"
      );
      act(() => {
        Simulate.click(item);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // 弹窗关闭
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      // addStyle 以该模板 compact 代码调用（单一事实源 builtinStylesMap）
      expect(mockUpdateSettingCalls).toHaveLength(1);
      const next = mockUpdateSettingCalls[0]({
        customStyles: [makeCustomStyle("custom-a", "Style A", "")],
      });
      expect(next.customStyles[0].styleCode).toBe(builtinStylesMap.under_line);
      expect(next.customStyles[0].styleName).toMatch(/^Style_[0-9a-f]{8}$/);
      expect(next.customStyles[1].styleSlug).toBe("custom-a");
      // 新卡置顶 + 预填 + 自动展开，旧卡自动收起
      const cards = getCards(manager);
      expect(cards[0].querySelector('textarea[name="styleCode"]').value).toBe(
        builtinStylesMap.under_line
      );
      expect(isCardExpanded(cards[0])).toBe(true);
      expect(isCardExpanded(cards[1])).toBe(false);
    });
  });

  test("keeps template prefilled cards savable under the invalid-save gate", () => {
    withFakeTimers((view) => {
      const { manager } = openTemplateModal(view);

      const item = [
        ...document.body.querySelectorAll('[role="menuitem"]'),
      ].find(
        (node) =>
          node.querySelector(".kt-template-item__name")?.textContent ===
          "under_line"
      );
      act(() => {
        Simulate.click(item);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // 预填代码恒为合法语法（builtinStylesMap compact 产物）：保存闸不得
      // 把合法预填卡误锁死——未修改时 disabled 由 isModified 承载，改名后
      // 保存必须可用
      const getTopSaveButton = () =>
        Array.from(getCards(manager)[0].querySelectorAll("button")).find(
          (button) => button.textContent === "save"
        );
      expect(getTopSaveButton().disabled).toBe(true);

      const topNameInput = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(topNameInput, "Renamed Prefill");
        topNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(getTopSaveButton().disabled).toBe(false);
      act(() => {
        getTopSaveButton().click();
      });
      expect(mockUpdateSettingCalls.length).toBeGreaterThan(0);
    });
  });

  test("creates a blank card with auto generated name from the first item", () => {
    withFakeTimers((view) => {
      const { manager } = openTemplateModal(view);

      const firstItem = document.body.querySelector('[role="menuitem"]');
      act(() => {
        Simulate.click(firstItem);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const next = mockUpdateSettingCalls[0]({ customStyles: [] });
      expect(next.customStyles[0].styleCode).toBe("");
      // 确定性钉：首张卡名 = stub 首个 randomUUID 的前 8 位。裸赋值在
      // getter-only 的 globalThis.crypto 上静默无效时，真实 crypto 顶掉
      // stub → 名称随机 → 本断言红（stub 生效性验证器）
      expect(next.customStyles[0].styleName).toBe("Style_00000000");
      expect(isCardExpanded(getCards(manager)[0])).toBe(true);
    });
  });

  test("returns focus to the add button after Escape close", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      act(() => {
        Simulate.keyDown(dialog, { key: "Escape" });
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      // 回退帧观测点：焦点回退带 aria-hidden 守卫（等 Modal 卸载提交清除
      // aria-hidden 后才聚焦 opener，防止 chrome Blocked aria-hidden 告警），
      // 第二次 advance 驱动守卫通过并聚焦
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(view.container.querySelector("#add-style-button")).toBe(
        document.activeElement
      );
      // Escape 关闭不得误建样式
      expect(mockUpdateSettingCalls).toHaveLength(0);
    });
  });

  test("delays opener focus restore until the dialog unmounts", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      act(() => {
        Simulate.keyDown(dialog, { key: "Escape" });
      });

      // 卸载窗口期（Modal 未卸载、aria-hidden 未清除）不得聚焦 opener——
      // 契约：焦点回退不落入 aria-hidden 窗口期。失效形态：handleClose 在
      // onClose 同 tick 同步聚焦 → 本断言失败
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.getElementById("add-style-button")).not.toBe(
        document.activeElement
      );

      // 过渡 exited → Modal 卸载（aria-hidden 清除）之后回退：两段式
      // advance——第一段完成卸载提交，
      // 第二段驱动 aria-hidden 守卫通过并聚焦；断言以卸载后的实时查询
      // 为准（重渲染可能重建按钮节点，卸载前捕获的引用可能是游离旧
      // 节点，focus 到游离节点对读屏无效）
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(view.container.querySelector("#add-style-button")).toBe(
        document.activeElement
      );
    });
  });

  test("closes on backdrop click without creating a style", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      act(() => {
        Simulate.click(document.body.querySelector(".MuiBackdrop-root"));
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(mockUpdateSettingCalls).toHaveLength(0);
    });
  });

  test("operates the template menu from the keyboard (arrows and enter)", () => {
    withFakeTimers((view) => {
      const { dialog, manager } = openTemplateModal(view);

      // 初始焦点在对话框本体（Paper）：ArrowDown 进入菜单首项
      act(() => {
        Simulate.keyDown(dialog, { key: "ArrowDown" });
      });
      let items = [...document.body.querySelectorAll('[role="menuitem"]')];
      expect(document.activeElement).toBe(items[0]);

      // ArrowDown/ArrowUp 在选项间循环巡航
      act(() => {
        Simulate.keyDown(items[0], { key: "ArrowDown" });
      });
      items = [...document.body.querySelectorAll('[role="menuitem"]')];
      expect(document.activeElement).toBe(items[1]);
      act(() => {
        Simulate.keyDown(items[1], { key: "ArrowUp" });
      });
      items = [...document.body.querySelectorAll('[role="menuitem"]')];
      expect(document.activeElement).toBe(items[0]);

      // Enter 激活聚焦项（首项=空白样式）→ 建卡 + 自动展开 + 弹窗关闭
      act(() => {
        Simulate.keyDown(document.activeElement, { key: "Enter" });
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(mockUpdateSettingCalls).toHaveLength(1);
      const next = mockUpdateSettingCalls[0]({ customStyles: [] });
      expect(next.customStyles[0].styleCode).toBe("");
      expect(isCardExpanded(getCards(manager)[0])).toBe(true);
    });
  });

  test("locks modal geometry and scroll containment in the emitted css", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      // jsdom 环境边界：样式事实以 emotion 落进 document.head 的产物
      // （speedy 模式走 CSSOM）承载（几何=440px/72vh/12px 圆角；滚动物理
      // 隔离=overscroll-behavior:contain），瀑布流类布局事实须在真实浏览器
      // 人工核对。
      const headCss = compactCss(getHeadCssText());
      expect(headCss).toContain("width:440px");
      expect(headCss).toContain("max-height:72vh");
      expect(headCss).toContain("border-radius:12px");
      // 内容壳横向溢出钳制（杜绝 9 字内容出横向滚动条）
      expect(headCss).toContain("overflow-x:hidden");
      // Portal 变量重定作用域（口径对齐 OptionsTheme 的 dropdownPaper：
      // Portal 落在 .kt-m3-root 之外，kt 变量不可解析——Paper 根以 theme
      // 解析值重挂模板项所需变量，值随主题、断言只锁重挂在场）
      expect(headCss).toContain("--kt-pri:");
      expect(headCss).toContain("--kt-on:");
      // 长数据列表框纪律（N>5）：滚动权收归列表本体——max-height 280
      // + 纵向滚动 + overscroll contain（列表样式在 OPTIONS_STYLES，
      // 测试环境不注入 head，直接断言样式表产物文本）
      const listCss = compactCss(OPTIONS_STYLES);
      expect(listCss).toContain("max-height:280px");
      expect(listCss).toContain("overflow-y:auto");
      expect(listCss).toContain("overflow-x:hidden");
      expect(listCss).toContain("overscroll-behavior:contain");
    });
  });
});

describe("StylesSetting i18n keys", () => {
  test("registers v2 style card labels and drops retired preview keys", () => {
    // 样式卡标签六键：键在位 + 七语言齐全（ru 经 i18n.js 合并段由
    // RU_I18N/en 兜底）
    const keys = [
      "choose_style_template",
      "blank_style",
      "style_active",
      "css_invalid",
      "style_card_expand",
      "style_card_collapse",
    ];
    const locales = UI_LANGS.map(([locale]) => locale);
    keys.forEach((key) => {
      expect(I18N[key]).toBeDefined();
      locales.forEach((locale) => {
        expect(I18N[key][locale]).toBeTruthy();
      });
    });
    // 退役键不再注册：旧预览结构三键的消费方已随结构重写归零（全仓零引用）
    expect(I18N.builtin_styles).toBeUndefined();
    expect(I18N.style_preview_source).toBeUndefined();
    expect(I18N.style_preview_translation).toBeUndefined();
  });
});

describe("StylesSetting card face focus ring pairing", () => {
  test("grants focus rings only to semantic controls on the card face", () => {
    // 焦点环配对法则·有语义必有环：箭头钮与模板行（键盘语义节点）
    // 挂 :focus-visible 键盘语境焦点环——环语法对齐自绘控件范式
    // （kt-settings-preset-chip）：outline:none + box-shadow
    // 0 0 0 2px 主色环
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-style-card__toggle:focus-visible\s*\{[^}]*outline: none/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-style-card__toggle:focus-visible\s*\{[^}]*box-shadow: 0 0 0 2px var\(--kt-pri\)/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-template-item:focus-visible\s*\{[^}]*outline: none/
    );
    // 模板行环为内嵌口径（inset）：行彼此贴邻且列表/Paper overflow 裁剪
    // 外扩环——外环上下被邻行压住、左右被容器缘裁掉（浏览器实测），
    // inset 贴边完整可见（范式先例 m3.js 手柄内嵌环）
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-template-item:focus-visible\s*\{[^}]*box-shadow: inset 0 0 0 2px var\(--kt-pri\)/
    );
    // forced-colors 模式 outline 兜底（不写颜色，描边色交强制引擎），
    // box-shadow 环被 UA 丢弃需显式清零
    const forcedColorBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@media (forced-colors: active)"
    );
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-style-card__toggle:focus-visible\s*\{[^}]*outline: 3px solid/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-style-card__toggle:focus-visible\s*\{[^}]*box-shadow: none/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-template-item:focus-visible\s*\{[^}]*outline: 3px solid/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-template-item:focus-visible\s*\{[^}]*box-shadow: none/.test(
          body
        )
      )
    ).toBe(true);

    // 旧内核兜底：模板行与 ✕ 关闭钮在 Dialog Portal 内（.kt-m3-root
    // 之外）——旧内核既无基格 :focus 环可依赖，:focus-visible 规则又因未知
    // 伪类整条丢弃 → 零指示。@supports not selector(:focus-visible) 包裹的
    // :focus 兜底必须在场（范式对齐 m3.js Select 触发元兜底）：模板行内嵌、
    // 关闭钮外扩，各对齐自身现代形态。块未落即红。
    const legacyBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@supports not selector(:focus-visible)"
    );
    expect(
      legacyBodies.some((body) =>
        /\.kt-template-item:focus\s*\{[^}]*box-shadow: inset 0 0 0 2px var\(--kt-pri\)/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      legacyBodies.some((body) =>
        /\.kt-template-modal__close:focus\s*\{[^}]*box-shadow: 0 0 0 2px var\(--kt-pri\)/.test(
          body
        )
      )
    ).toBe(true);

    // 焦点环配对·有语义必有环：模板弹窗 ✕ 关闭钮（Portal 在 .kt-m3-root 外，
    // 全局环规则不可达；Paper 根已重定 --kt-pri）挂专属类 :focus-visible
    // 环 + forced-colors 内嵌兜底——类与规则未落即红
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-template-modal__close:focus-visible\s*\{[^}]*outline: none/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-template-modal__close:focus-visible\s*\{[^}]*box-shadow: 0 0 0 2px var\(--kt-pri\)/
    );
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-template-modal__close:focus-visible\s*\{[^}]*outline: 3px solid/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-template-modal__close:focus-visible\s*\{[^}]*box-shadow: none/.test(
          body
        )
      )
    ).toBe(true);

    // 图标主体色口径（src/components/icons 组件库 --kt-icon accent 系统）：自绘
    // 控件内的图标着色消费 --kt-icon，变量缺失时回退 --kt-onv
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-style-card__toggle\s*\{[^}]*color: var\(--kt-icon, var\(--kt-onv\)\)/
    );

    // 焦点环配对·无语义必无环：名字折叠纯文本与演示 span 无键盘导航语义，
    // 断言其选择器上不存在任何焦点环样式键（反向断言，outline/box-shadow 双查）
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-style-card__name-text[^{]*\{[^}]*(outline|box-shadow)/
    );
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-style-card__demo[^{]*\{[^}]*(outline|box-shadow)/
    );
  });
});

describe("SettingsSelect dropdown menu geometry (menu wiring)", () => {
  test("locks menu row geometry to 48/16/inline gap 12/radius 4 on the menu item rule", () => {
    // 清单「真下拉 MenuItem 通用几何」：行高 48 / padding 16 / 行内间距 12 /
    // 圆角 4dp，四件套全落 .MuiMenuItem-root 行本体（同在仓先例
    // .kt-template-item；菜单行彼此贴邻、容器无行间 gap）。挂载路径＝主题层
    // MuiSelect.defaultProps.MenuProps.MenuListProps（实例 MenuProps 会经
    // resolveProps 浅合并整体覆写主题层，挂载标记锁在 OptionsTheme.test），
    // 几何本体落 OPTIONS_STYLES 专属类——规则未落即红
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-select__menu\s*\{[^}]*display: flex/
    );
    // 容器反向断言：容器规则体内不得再出现 gap（\s*\{ 不会命中后代选择器行，
    // 因 `.kt-settings-select__menu .MuiMenuItem-root {` 类名与 { 之间隔了
    // .MuiMenuItem-root，非纯空白）
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-settings-select__menu\s*\{[^}]*gap/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-select__menu\s+\.MuiMenuItem-root\s*\{[^}]*min-height: 48px/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-select__menu\s+\.MuiMenuItem-root\s*\{[^}]*gap: 12px/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-select__menu\s+\.MuiMenuItem-root\s*\{[^}]*padding: 0 16px/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-select__menu\s+\.MuiMenuItem-root\s*\{[^}]*border-radius: 4px/
    );
  });
});

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
    resetUpdateSettingCalls();
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
    // 派生一致性护栏：选项由 TEXTAREA_GRIP_STYLE_KEYS.map 派生，以
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
    expect(mockUpdateSettingCalls).toContainEqual({
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
