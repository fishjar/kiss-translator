import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import StylesSetting, {
  buildHueSliderSx,
  HUE_PRESET_SNAP_TOLERANCE,
  ICON_HUE_SLIDER_MAX,
  matchPresetId,
} from "./StylesSetting";
import SettingsSearchTarget from "./SettingsSearchTarget";
import { builtinStylesMap } from "../../libs/style";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../../config/textareaGripStyles";
import { I18N, UI_LANGS } from "../../config/i18n";
import { OPTIONS_STYLES } from "./styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";
import {
  ICON_COLOR_PRESETS,
  hslToHex,
  ICON_RING_S,
  ICON_RING_L,
  resolveIconHue,
} from "../../styles/m3";
import {
  getIconStyleSnapshot,
  setIconStyleSnapshot,
} from "../../styles/iconStyleStore";

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
// 实现体，而置顶/预填/自动展开断言依赖实现体真实落盘。故用普通函数承载
// 变更 + 手工调用日志对齐 jest 断言语义。
const mockSetting = {
  uiLang: "en",
  darkMode: "auto",
  textareaGripStyle: "concentric-smooth",
  styleCycle: ["style_none", "fuzzy"],
  customStyles: [],
};
const mockUpdateSettingCalls = [];
function mockApplyUpdateSetting(patch) {
  mockUpdateSettingCalls.push(patch);
  // 延迟拒绝模式：返回挂起 Promise，拒因由用例按序注入——模拟「旧请求
  // 的失败晚于新请求登记到达」的真实竞态
  if (mockUpdateSettingDeferredRejections) {
    let rejectFn;
    const pending = new Promise((_, reject) => {
      rejectFn = reject;
    });
    mockUpdateSettingPendingRejects.push(rejectFn);
    return pending;
  }
  // 失败模式：对齐真实存储链的乐观发布语义——submit 先行落盘（发布成功）
  // 再返回拒绝 Promise 模拟写失败；纯拒绝形态没有乐观 echo 与回滚 base，
  // 消费侧「echo 消费标记/清稿」与失败路径的交互在该形态下不可观测
  if (mockUpdateSettingFailure) {
    const resolved = typeof patch === "function" ? patch(mockSetting) : patch;
    if (resolved && typeof resolved === "object") {
      Object.assign(mockSetting, resolved);
    }
    return Promise.reject(mockUpdateSettingFailure);
  }
  // 迟到回显模式：仅记录更新器不改写持久设置，返回挂起 Promise，由
  // applyDeferredUpdateSetting 回放时统一 resolve（写确认随写落地到达）
  if (mockUpdateSettingDeferred) {
    let resolveFn;
    const pending = new Promise((resolve) => {
      resolveFn = resolve;
    });
    mockUpdateSettingPendingResolves.push(resolveFn);
    return pending;
  }
  const resolved = typeof patch === "function" ? patch(mockSetting) : patch;
  if (resolved && typeof resolved === "object") {
    Object.assign(mockSetting, resolved);
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
}
function resetUpdateSettingCalls() {
  mockUpdateSettingCalls.length = 0;
}

// 迟到回显模式开关与回放：模拟保存 echo 晚于后续键入到达的真实时序。
// 挂起 Promise 形态对齐真实存储链的确认语义：写确认随写完成（回放）到
// 达，而非返回 undefined 让确认在首次微任务冲洗时过早落地——过早确认会
// 在「旧请求失败迟到」场景提前释放新提交标记、外部快照持稿失效
let mockUpdateSettingDeferred = false;
// 失败模式载荷：非 null 时 updateSetting 先乐观落盘再返回以它为拒因的
// 拒绝 Promise
let mockUpdateSettingFailure = null;
// 延迟拒绝模式开关与拒因注入队列：非 null 时每次 updateSetting 返回
// 挂起 Promise，rejectFn 依序入队供用例按序触发
let mockUpdateSettingDeferredRejections = null;
const mockUpdateSettingPendingRejects = [];
const mockUpdateSettingPendingResolves = [];
function applyDeferredUpdateSetting() {
  mockUpdateSettingDeferred = false;
  mockUpdateSettingCalls.forEach((patch) => {
    const resolved = typeof patch === "function" ? patch(mockSetting) : patch;
    if (resolved && typeof resolved === "object") {
      Object.assign(mockSetting, resolved);
    }
  });
  while (mockUpdateSettingPendingResolves.length > 0) {
    mockUpdateSettingPendingResolves.shift()();
  }
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
  // 与生产拓扑同构：焦点恢复守卫读 #root 的 aria-hidden（Modal 卸载提交
  // 清除），夹具容器必须持 id=root 才会接收 ModalManager 的 aria-hidden
  container.id = "root";
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
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
      const idx = mountedRoots.indexOf(root);
      if (idx !== -1) mountedRoots.splice(idx, 1);
      container.remove();
    },
  };
}

// 图标设置区（iconStyle 分段 / hue 滑轨）用裸渲染：无需搜索导航包装，
// 行定位直接按文案匹配 .kt-settings-row。
function renderStylesSetting() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  const rerender = () => act(() => root.render(<StylesSetting />));
  rerender();

  return {
    container,
    rerender,
    cleanup() {
      act(() => root.unmount());
      const idx = mountedRoots.indexOf(root);
      if (idx !== -1) mountedRoots.splice(idx, 1);
      container.remove();
    },
  };
}

const mountedRoots = [];

test("shows selected styles in selection order and allows clearing the cycle", () => {
  // 上游轮换行并入样式卡设计后的行为锁：选择序展示与轮换集清空
  mockSetting.customStyles = [
    makeCustomStyle(
      "custom-dangerous",
      "Custom Dangerous",
      DANGEROUS_STYLE_CODE
    ),
  ];
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
    mockSetting.customStyles = [];
    view.cleanup();
  }
});

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
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
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
    const libraryRow = getSettingsRow(view.container, "settings_style_library");
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
    mockSetting.customStyles = [makeCustomStyle("custom-a", "Style A", "")];
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
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
    // 模拟模式复位：迟到回显/失败/延迟拒绝不得泄漏进后续用例
    mockUpdateSettingDeferred = false;
    mockUpdateSettingFailure = null;
    mockUpdateSettingDeferredRejections = null;
    mockUpdateSettingPendingRejects.length = 0;
    mockUpdateSettingPendingResolves.length = 0;
    document.body.innerHTML = "";
  });

  test("expands only from the arrow toggle (negative lock on name and demo areas)", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    const card = getCards(manager)[0];

    // 结构在位：名字纯文本、演示容器、箭头钮
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
    expect(card.querySelector(".kt-style-card__demo").className).toContain(
      "is-invalid"
    );
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
    expect(card.querySelector(".kt-style-card__demo").className).toContain(
      "is-invalid"
    );
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
      customStyles: [
        makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
      ],
    });
    expect(next.customStyles[0]).toEqual({
      styleSlug: "custom-a",
      styleName: "Renamed Style",
      styleCode: DANGEROUS_STYLE_CODE,
    });

    view.cleanup();
  });

  test("allows rename-only save when the existing style code fails to compile", () => {
    // 保存闸只拦「内容变更且语法无效」：既有样式内容不过编译器时仅改名
    // 仍可保存（改名不落新内容，译文渲染器照常消费原文）
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "& + { color: red }"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const getSaveButton = () =>
      Array.from(getCards(manager)[0].querySelectorAll("button")).find(
        (button) => button.textContent === "save"
      );

    act(() => {
      const nameInput = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
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
    expect(mockUpdateSettingCalls).toHaveLength(1);
    const next = mockUpdateSettingCalls[0]({
      customStyles: [
        makeCustomStyle("custom-a", "Style A", "& + { color: red }"),
      ],
    });
    expect(next.customStyles[0]).toEqual({
      styleSlug: "custom-a",
      styleName: "Renamed Style",
      styleCode: "& + { color: red }",
    });

    view.cleanup();
  });

  test("allows saving content the previewer cannot scope", () => {
    // 选择器列表属预览作用域策略拒绝（unsupported）：译文侧按原文注入
    // 原生嵌套类壳、隐式 & 前缀作用域安全——保存不被预览闸拦截
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "color: red;"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
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
    const getSaveButton = () =>
      Array.from(getCards(manager)[0].querySelectorAll("button")).find(
        (button) => button.textContent === "save"
      );

    setCode("& , body { color: red }");
    expect(getSaveButton().disabled).toBe(false);
    // 保存路径实锚：禁用解除之外，点击确实落库且载荷保留 unsupported 原文
    act(() => {
      getSaveButton().click();
    });
    expect(mockUpdateSettingCalls).toHaveLength(1);
    const next = mockUpdateSettingCalls[0]({
      customStyles: [makeCustomStyle("custom-a", "Style A", "color: red;")],
    });
    expect(next.customStyles[0].styleCode).toBe("& , body { color: red }");

    view.cleanup();
  });

  test("still blocks saving newly typed syntax-invalid content", () => {
    // 真语法错误（尾组合符）的内容变更仍被拦：保存闸收窄只放行 unsupported
    // 与仅改名（防回归锁）
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "color: red;"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const area = getCards(manager)[0].querySelector(
      'textarea[name="styleCode"]'
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set.call(area, "& + { color: red }");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const saveButton = Array.from(
      getCards(manager)[0].querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    expect(saveButton.disabled).toBe(true);

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
      getCards(manager).some(
        (node) =>
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

  test("associates the invalid-css reason with the editor input", () => {
    // 无效 CSS 的失败原因必须就近可达：仅靠预览 title（悬停才显）与禁用
    // 保存钮，键盘/读屏用户拿不到失败原因——错误文本经 MUI helperText
    // 渲染在编辑器旁并以 aria-describedby 关联输入框
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "& , body { color: red }"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });

    const card = getCards(manager)[0];
    const helper = card.querySelector(".MuiFormHelperText-root");
    expect(helper).not.toBeNull();
    // 选择器列表夹具属作用域策略拒绝 → unsupported 文案（真语法错误仍走
    // css_invalid，见 selector-list scope guard 与上方括号失衡用例）
    expect(helper.textContent).toBe("css_unsupported");
    const textarea = card.querySelector('textarea[name="styleCode"]');
    const describedBy = textarea.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy)).toBe(helper);
    // unsupported 可保存（保存闸收窄）：aria-invalid 仅属真语法错误——
    // 可保存形态不得标记输入框无效
    expect(textarea.getAttribute("aria-invalid")).not.toBe("true");

    view.cleanup();
  });

  test("keeps aria-invalid for genuinely invalid css", () => {
    // 真语法错误不可保存：error/aria-invalid 语义保留
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "& + { color: red }"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const card = getCards(manager)[0];
    const textarea = card.querySelector('textarea[name="styleCode"]');
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(card.querySelector(".MuiFormHelperText-root").textContent).toBe(
      "css_invalid"
    );

    view.cleanup();
  });

  test("keeps the editor free of error text while the draft compiles", () => {
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "color: red;"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });

    expect(
      getCards(manager)[0].querySelector(".MuiFormHelperText-root")
    ).toBeNull();

    view.cleanup();
  });

  test("gives the card demo padding margin headroom against the paint clip", () => {
    // overflow+contain 双裁剪下 demo 盒缘零余量会切掉 text-shadow/描边：
    // 少量 padding 外扩裁剪边界、等量负 margin 保占位几何不变（不扩大
    // 45% 限宽的预览占用）
    expect(compactCss(OPTIONS_STYLES)).toContain("padding:2px6px");
    expect(compactCss(OPTIONS_STYLES)).toContain("margin:-2px-6px");
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
      customStyles: [
        makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
      ],
    });
    expect(next.customStyles).toEqual([]);

    view.cleanup();
  });

  test("keeps the local draft when the delete write fails", async () => {
    // 删除持久化失败回滚后卡片复现：本地未保存草稿必须保留。同步清稿
    // 不等写结果，会把删除失败的卡连同其未保存编辑一并静默丢弃
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);

    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const nameInput = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Delete me not");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    mockUpdateSettingFailure = new Error("storage write failed");
    mockConfirm.mockResolvedValueOnce(true);
    act(() => {
      Array.from(getCards(manager)[0].querySelectorAll("button"))
        .find((button) => button.textContent === "delete")
        .click();
    });
    await flushMicrotasks();
    mockUpdateSettingFailure = null;
    // 存储基座回滚 base 并重发布：卡片复现且保持激活展开，草稿完整
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    const card = getCards(manager)[0];
    expect(card).toBeTruthy();
    expect(isCardExpanded(card)).toBe(true);
    expect(card.querySelector(".kt-style-card__name-input input").value).toBe(
      "Delete me not"
    );

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

  test("labels the toggle with the style name and drops aria-controls while collapsed", () => {
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);

    // 折叠态：aria-label 含操作名与样式名（多卡可区分），受控体未渲染，
    // aria-controls 悬空引用必须移除
    const collapsedToggle = getToggle(getCards(manager)[0]);
    // aria-label 表达点击后将执行的动作：折叠态钮将展开
    expect(collapsedToggle.getAttribute("aria-label")).toBe(
      "style_card_expand: Style A"
    );
    expect(collapsedToggle.getAttribute("aria-controls")).toBeNull();

    // 展开态：aria-controls 指向实际渲染的受控体 id
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const expandedToggle = getToggle(getCards(manager)[0]);
    expect(expandedToggle.getAttribute("aria-label")).toBe(
      "style_card_collapse: Style A"
    );
    const bodyId = expandedToggle.getAttribute("aria-controls");
    expect(bodyId).toBe("kt-style-body-custom-a");
    expect(document.getElementById(bodyId)).not.toBeNull();

    view.cleanup();
  });

  test("keeps post-save typing when the persisted echo arrives late", () => {
    // 保存 echo 窗口内的后续键入不属提交版本：迟到回写触发的清稿只针对
    // 提交瞬间的草稿版本（引用不等即新键入），新草稿保留
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });

    const typeName = (value) => {
      const input = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    typeName("Submitted draft");
    const saveButton = Array.from(
      getCards(manager)[0].querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    act(() => {
      saveButton.click();
    });

    // echo 落库前的新键入：草稿对象已换引用
    typeName("Newer typing");

    // 迟到的持久化回写（快照对比命中）不得清掉新键入
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Submitted draft", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Newer typing");

    view.cleanup();
  });

  test("consumes the submitted marker once its matching writeback lands", async () => {
    // 回写与提交内容匹配即消费标记：此后外部变更可正常传播进编辑器——
    // 标记残存会让该 slug 的草稿对外部同步永久粘滞（设备同步改名不可见）。
    // 消费由写确认回调承载：回写落库后冲洗微任务（标记释放），再驱动
    // 外部变更传播
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const typeName = (value) => {
      const input = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    mockUpdateSettingDeferred = true;
    typeName("Submitted draft");
    const saveButton = Array.from(
      getCards(manager)[0].querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    act(() => {
      saveButton.click();
    });
    // echo 落库前的新键入：草稿对象已换引用
    typeName("Newer typing");
    // 匹配提交内容的回写到达
    applyDeferredUpdateSetting();
    view.rerender();
    // 提交后的新键入保留（echo 不覆盖新草稿）
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Newer typing");
    await flushMicrotasks();
    // 后续外部变更正常传播（标记已随写确认释放，不再粘滞）
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Device rename", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Device rename");

    mockUpdateSettingDeferred = false;
    view.cleanup();
  });

  test("keeps an untouched draft when a same-value writeback reorders keys", () => {
    // 快照序列化须与回写比对同口径（固定三字段序）：持久化对象键序漂移
    // 不是内容变更，不得清掉未提交草稿
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const input = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, "Typed draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // 同值异键序的持久化对象到达（键序＝styleName/styleCode/styleSlug）
    mockSetting.customStyles = [
      {
        styleName: "Style A",
        styleCode: DANGEROUS_STYLE_CODE,
        styleSlug: "custom-a",
      },
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Typed draft");

    view.cleanup();
  });

  test("holds the draft while a pending submission waits for its own writeback", () => {
    // 提交在途期间到达的非匹配快照（外部写入/迟到旧值）不得清稿——否则
    // D2 提交后 D1 的迟到回写会清掉 D2 草稿、内容丢失
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const typeName = (value) => {
      const input = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    mockUpdateSettingDeferred = true;
    typeName("Draft B");
    const saveButton = Array.from(
      getCards(manager)[0].querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    act(() => {
      saveButton.click();
    });
    // 非匹配快照（外部内容，非本次提交的回写）
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Foreign Edit", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    // 待确认提交的草稿保持不动
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Draft B");
    // 本提交的回写到达 → 消费标记、无新键入 → 草稿转正
    applyDeferredUpdateSetting();
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Draft B");

    mockUpdateSettingDeferred = false;
    view.cleanup();
  });

  test("keeps the newest submission marker when an older save fails late", async () => {
    // 失败释放按标记身份匹配：旧请求的拒绝迟到到达时不得删除较新提交
    // 的标记（否则新提交的回写保护与外部同步持稿一并失效）
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const typeName = (value) => {
      const input = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const clickSave = () => {
      const saveButton = Array.from(
        getCards(manager)[0].querySelectorAll("button")
      ).find((button) => button.textContent === "save");
      act(() => {
        saveButton.click();
      });
    };

    // 旧请求 A：拒绝挂起未到达
    mockUpdateSettingDeferredRejections = [];
    typeName("Draft A");
    clickSave();
    // 新请求 B：更新器登记待回放（deferred 模式）
    mockUpdateSettingDeferredRejections = null;
    mockUpdateSettingDeferred = true;
    typeName("Draft B");
    clickSave();
    // 旧请求 A 的拒绝迟到到达
    mockUpdateSettingPendingRejects[0](new Error("older save failed"));
    await flushMicrotasks();
    // 外部快照：新提交 B 的标记仍在 → 持稿
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Foreign Edit", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Draft B");
    // B 的回写到达：消费标记、无新键入 → 草稿转正
    applyDeferredUpdateSetting();
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Draft B");

    mockUpdateSettingDeferred = false;
    view.cleanup();
  });

  test("releases the pending marker when the save write fails", async () => {
    // 存储写失败：标记若不释放，其后的外部同步被陈旧提交版本永久拦下
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const typeName = (value) => {
      const input = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    mockUpdateSettingFailure = new Error("storage write failed");
    typeName("Draft");
    const saveButton = Array.from(
      getCards(manager)[0].querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    act(() => {
      saveButton.click();
    });
    await flushMicrotasks();
    mockUpdateSettingFailure = null;
    // 失败后的键入
    typeName("Typed after fail");
    // 外部变更：标记已释放 → 传播进编辑器；未释放则草稿粘滞
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Foreign Edit", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Foreign Edit");

    view.cleanup();
  });

  test("keeps the unsaved draft when the save write fails and rolls back", async () => {
    // 乐观 echo 在途期间不得消费提交标记或清稿：echo 是投机状态，写失败
    // 回滚 base 后未保存草稿必须保留可重试——echo 先消费会让失败路径的
    // 释放守卫失效，未保存编辑随回滚静默丢失
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const typeName = (value) => {
      const input = getCards(manager)[0].querySelector(
        ".kt-style-card__name-input input"
      );
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const getSaveButton = () =>
      Array.from(getCards(manager)[0].querySelectorAll("button")).find(
        (button) => button.textContent === "save"
      );

    typeName("Unsaved work");
    mockUpdateSettingFailure = new Error("storage write failed");
    act(() => {
      getSaveButton().click();
    });
    // 乐观 echo 渲染：提交在途，草稿不动
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Unsaved work");
    await flushMicrotasks();
    mockUpdateSettingFailure = null;
    // 存储基座回滚 base 并重发布：草稿保留可重试
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Unsaved work");

    // 重试成功：写确认到达后草稿转正，其后外部变更恢复传播（标记无粘滞）
    act(() => {
      getSaveButton().click();
    });
    await flushMicrotasks();
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Renamed elsewhere", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Renamed elsewhere");

    view.cleanup();
  });

  test("keeps a prototype-named slug inert in draft tracking", () => {
    // 同步数据可携带 styleSlug:"constructor"（存储链零验证）：草稿读取
    // 与 in 判定必须走自有属性——继承属性不得充当草稿对象或触发误清稿
    mockSetting.customStyles = [
      makeCustomStyle("constructor", "Style C", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    expect(
      getCards(manager)[0].querySelector(".kt-style-card__name-input input")
        .value
    ).toBe("Style C");

    view.cleanup();
  });

  test("anchors prototype-named slug drafts to the style base on typing", () => {
    // 键入触发的草稿写入同样走自有属性：updater 入参不得把继承属性当草
    // 稿起点——函数对象被展开后基础字段（styleCode）丢失，代码编辑框被
    // 清空
    mockSetting.customStyles = [
      makeCustomStyle("constructor", "Style C", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const input = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, "Renamed C");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("Renamed C");
    // 草稿须从 customStyle 起步：styleCode 基础字段保留在代码编辑框
    expect(
      getCards(manager)[0].querySelector('textarea[name="styleCode"]').value
    ).toBe(DANGEROUS_STYLE_CODE);

    view.cleanup();
  });

  test("clears prototype-named slug drafts on external sync without a submit", () => {
    // 提交标记字典直索引读不得把继承属性当在途提交标记：恒真的非匹配
    // 比对会让「持稿不动」分支永久早退，无提交在途的外部同步（设备改名）
    // 也清不掉该卡草稿
    mockSetting.customStyles = [
      makeCustomStyle("constructor", "Style C", DANGEROUS_STYLE_CODE),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    act(() => {
      getToggle(getCards(manager)[0]).click();
    });
    const input = getCards(manager)[0].querySelector(
      ".kt-style-card__name-input input"
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, "Local draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("Local draft");
    // 无提交在途：外部同步照常清草稿回落 customStyle
    mockSetting.customStyles = [
      makeCustomStyle("constructor", "Device rename", DANGEROUS_STYLE_CODE),
    ];
    view.rerender();
    expect(input.value).toBe("Device rename");

    view.cleanup();
  });

  test("reveals the drawer when the leading add button is clicked before any open", () => {
    // 空库退化语义：customStyles.length===0 时 leading 仍可点，
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

    const libraryRow = getSettingsRow(view.container, "settings_style_library");
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
    const docOrder = Array.from(manager.querySelectorAll(".kt-style-card")).map(
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
    expect(card.querySelector('textarea[name="styleCode"]').style.resize).toBe(
      "vertical"
    );

    view.cleanup();
  });

  test("keeps the resize grip for an NBSP-only draft (NBSP is not CSS whitespace)", () => {
    // 空白口径与编译器对齐：U+00A0 非 CSS 空白，纯 NBSP 草稿不是空草稿，
    // 手柄必须在场（trim() 剥 NBSP 的旧口径会把草稿误判为空、手柄早退）
    mockSetting.customStyles = [
      makeCustomStyle("custom-a", "Style A", "\u00A0"),
    ];
    const view = renderStylesSettingView();
    const manager = openStyleManager(view);
    let card = getCards(manager)[0];

    act(() => {
      getToggle(card).click();
    });
    card = getCards(manager)[0];
    expect(card.querySelector(".kt-resize-grip")).not.toBeNull();

    // 护栏：纯 CSS 空白草稿仍是空草稿，手柄早退不渲染
    mockSetting.customStyles = [makeCustomStyle("custom-a", "Style A", " ")];
    view.rerender();
    card = getCards(manager)[0];
    expect(card.querySelector(".kt-resize-grip")).toBeNull();

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
      expect(card.querySelector(".kt-style-card__toggle svg > g")).toBeNull();

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
      card.querySelector(".kt-style-card__name-input .MuiFilledInput-root")
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
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
    document.body.innerHTML = "";
  });

  // compileCss 为模块内私有函数，只能经卡片演示区 <style> 与 is-invalid
  // 降级态间接断言；scopeClass 由 customStyle.styleSlug 派生。
  function renderCardWithCode(code) {
    mockSetting.customStyles = [makeCustomStyle("custom-a", "Style A", code)];
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
    // 选择器列表＝合法 CSS 但作用域策略不接受 → unsupported 文案
    expect(demo.getAttribute("title")).toBe("css_unsupported");
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
    // 证伪：坏规则前置 + 后续合法无逗号规则；若标志位被写成逐次覆写
    // hasSelectorList = sel.includes(",")，末条合法规则会把 true 覆回 false，
    // 整份草稿被误判有效并残留合法规则。此用例钉住「单调置真」不变量。
    const { view, demo, css } = renderCardWithCode(
      "&, body { position: fixed; } &:hover { color: blue; }"
    );
    expect(css).toBe("");
    expect(demo.className).toContain("is-invalid");
    expect(demo.getAttribute("title")).toBe("css_unsupported");
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
    const { view, demo, css } = renderCardWithCode("&:hover { color: blue; }");
    expect(demo.className).not.toContain("is-invalid");
    expect(css).toBe(
      ".kt-scope-custom-a .kt-style-demo:hover { color: blue; }"
    );
    view.cleanup();
  });

  test("keeps a bare & descendant selector scoped (builtin template shape)", () => {
    // 保真：内置模板 uses "& *"；sel 仅裁剪末尾空白、保留 & 后前导
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
    // 注释占位是可越过的非边界填充：占位后的顶层 &:hover 按规则边界平铺
    // 提取（占位冲刷为独立 rest 行），不再以中缀 & 落入原生嵌套
    expect(css).toBe(
      '.kt-scope-custom-a .kt-style-demo { content: "{" }\n' +
        ".kt-scope-custom-a .kt-style-demo { /**/ }\n" +
        '.kt-scope-custom-a .kt-style-demo:hover { color: "}" }'
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
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
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
    let result;
    try {
      view = renderStylesSettingView();
      result = run(view);
    } finally {
      if (result && typeof result.finally === "function") {
        // 异步 run：假计时器与视图存活至 run 结算，随后复原并清理——
        // 关闭改由写结果回调承载后，弹窗过渡断言需要跨微任务冲洗推进
        result.finally(() => {
          jest.useRealTimers();
          view?.cleanup();
        });
      } else {
        jest.useRealTimers();
        view?.cleanup();
      }
    }
    return result;
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

  test("creates a prefilled card on top from a builtin template item", async () => {
    await withFakeTimers(async (view) => {
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
      // 关闭由创建写入确认回调承载：先冲洗微任务（回调置关闭态），再推进
      // Dialog 退出过渡
      await flushMicrotasks();
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
      // 保存写入单独鉴别：mockUpdateSettingCalls[0] 已被「选模板即创建」
      // 的 addStyle 写入占据，整组长度断言（toBeGreaterThan(0)）会被该
      // 先前写入恒真满足、对保存路径零鉴别——记录点击前基线，断言保存
      // 恰新增一次写入且载荷为改名 + 模板预填代码
      const callsBeforeSave = mockUpdateSettingCalls.length;
      act(() => {
        getTopSaveButton().click();
      });
      expect(mockUpdateSettingCalls).toHaveLength(callsBeforeSave + 1);
      const created = mockUpdateSettingCalls[0]({ customStyles: [] });
      const savedNext = mockUpdateSettingCalls[callsBeforeSave]({
        customStyles: [created.customStyles[0]],
      });
      expect(savedNext.customStyles[0].styleName).toBe("Renamed Prefill");
      expect(savedNext.customStyles[0].styleCode).toBe(
        created.customStyles[0].styleCode
      );
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

  test("rejects a template click during the close transition after cancel", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      act(() => {
        Simulate.keyDown(dialog, { key: "Escape" });
      });

      // 取消（未消费）后的关闭过渡期 menuitem 仍在 DOM 可点：Escape/遮罩
      // 仅关闭不创建契约要求过渡期激活被拒绝——消费守卫只拦「已选择后再
      // 激活」，未消费的取消路径须由关闭态闸兜住
      const item = Array.from(
        document.body.querySelectorAll('[role="menuitem"]')
      ).find(
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

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      // 过渡期点击不得产生任何设置写入（幽灵卡）
      expect(mockUpdateSettingCalls).toHaveLength(0);

      // 重开周期复位后正常选择仍可用
      const { dialog: reopened } = openTemplateModal(view);
      const reopenedItem = Array.from(
        reopened.querySelectorAll('[role="menuitem"]')
      ).find(
        (node) =>
          node.querySelector(".kt-template-item__name")?.textContent ===
          "under_line"
      );
      act(() => {
        Simulate.click(reopenedItem);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(mockUpdateSettingCalls).toHaveLength(1);
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

      // 夹具同构锁：容器持 id=root 后 ModalManager 真实对其施加
      // aria-hidden（守卫重试腿的前置条件在场）。夹具缺 id 时守卫读
      // root 落空、重试腿不可达（空真形态），本断言随之恒假
      expect(
        document.getElementById("root")?.getAttribute("aria-hidden")
      ).toBeTruthy();

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

  test("operates the template menu from the keyboard (arrows and enter)", async () => {
    await withFakeTimers(async (view) => {
      const { dialog, manager } = openTemplateModal(view);

      // role="menu" 模式：打开即聚焦首个 menuitem（首项=空白样式），
      // ArrowDown 从首项继续巡航
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
      await flushMicrotasks();
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

  test("ignores repeated template activation during the closing transition", async () => {
    await withFakeTimers(async (view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      const firstItem = document.body.querySelectorAll('[role="menuitem"]')[0];
      act(() => {
        Simulate.click(firstItem);
      });
      // 关闭由创建写入确认回调承载：微任务冲洗置关闭态后 Dialog 进入异步
      // 过渡，二次点击（快速双击/Enter+点击同款时序）必须被一次性消费闸
      // 拒绝，否则重复 addStyle 产生两张脏卡
      act(() => {
        Simulate.click(firstItem);
      });
      await flushMicrotasks();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(mockUpdateSettingCalls).toHaveLength(1);
      const next = mockUpdateSettingCalls[0]({ customStyles: [] });
      expect(next.customStyles[0].styleCode).toBe("");
    });
  });

  test("keeps the template modal open when the create write fails", async () => {
    await withFakeTimers(async (view) => {
      openTemplateModal(view);
      const item = Array.from(
        document.body.querySelectorAll('[role="menuitem"]')
      ).find(
        (node) =>
          node.querySelector(".kt-template-item__name")?.textContent ===
          "under_line"
      );
      mockUpdateSettingFailure = new Error("storage write failed");
      act(() => {
        Simulate.click(item);
      });
      // 写失败：落库结果未知前不得关闭创建入口——弹窗保留供重试
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
      await flushMicrotasks();
      mockUpdateSettingFailure = null;
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
      // 重试路径：一次性消费标记已复位，同弹窗内重选模板再次创建并关闭
      act(() => {
        Simulate.click(item);
      });
      await flushMicrotasks();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(mockUpdateSettingCalls).toHaveLength(2);
    });
  });

  test("does not let a stale create confirmation close a reopened template modal", async () => {
    await withFakeTimers(async (view) => {
      // 会话 1：抽屉展开 + 模板弹窗打开
      openTemplateModal(view);
      const item = Array.from(
        document.body.querySelectorAll('[role="menuitem"]')
      ).find(
        (node) =>
          node.querySelector(".kt-template-item__name")?.textContent ===
          "under_line"
      );
      // 创建写入挂起：确认回调停在 pending，落库结果未知前弹窗保持打开
      mockUpdateSettingDeferred = true;
      act(() => {
        Simulate.click(item);
      });
      // 用户在写确认到达前主动关闭弹窗，随后重新打开模板弹窗（会话 2）。
      // 重开只点常驻 leading 钮（抽屉已展开，不得再 toggle 收起）
      act(() => {
        Simulate.keyDown(document.body.querySelector('[role="dialog"]'), {
          key: "Escape",
        });
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const addButton = view.container.querySelector("#add-style-button");
      act(() => {
        Simulate.click(addButton);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
      // 会话 1 的旧写确认此刻才落地：旧周期回调不得关闭会话 2 重开的弹窗
      applyDeferredUpdateSetting();
      await flushMicrotasks();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });
  });

  test("gives up opener focus when aria-hidden persists past the retry cap", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      // 模拟异常场景：aria-hidden 永不被卸载提交清除（守卫重试逐轮读到
      // 在场）——重试封顶后必须放弃聚焦，不得兜底聚焦进 aria-hidden 子树
      const realGetElementById = document.getElementById.bind(document);
      const persistHiddenRoot = document.createElement("div");
      persistHiddenRoot.setAttribute("aria-hidden", "true");
      // 守卫轮询计数＝重试次数的直接观测量（封顶停止断言的判据）
      let rootLookups = 0;
      const getByIdSpy = jest
        .spyOn(document, "getElementById")
        .mockImplementation((id) => {
          if (id === "root") rootLookups += 1;
          return id === "root" ? persistHiddenRoot : realGetElementById(id);
        });

      act(() => {
        Simulate.keyDown(dialog, { key: "Escape" });
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      // 封顶点：重试链已耗尽封顶次数（守卫轮询计数为重试次数的直接观测量）
      const lookupsAtCap = rootLookups;
      expect(lookupsAtCap).toBeGreaterThan(0);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      // 封顶后重试已停止：无新排程，守卫轮询计数不再增长（重试计时与
      // MUI 过渡计时经第三段 advance 空窗自然分离）
      expect(rootLookups).toBe(lookupsAtCap);
      getByIdSpy.mockRestore();

      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).not.toBe(
        view.container.querySelector("#add-style-button")
      );
    });
  });

  test("keeps stale retry chains inert after the view unmounts", () => {
    withFakeTimers((view) => {
      const { dialog } = openTemplateModal(view);
      expect(dialog).not.toBeNull();

      // 关闭即卸载视图：未走完的重试链在卸载后不得写入焦点或抛错。
      // 重试链须真实在途：aria-hidden 常驻 stub 使守卫首轮咨询即排程重试，
      // 单步计时原语只跑一枚定时器——退出过渡完成、重试 #1 已排程但未
      // 执行，0ms 级联不被一次性耗尽；守卫轮询计数为链已在途的直接观测量
      const realGetElementById = document.getElementById.bind(document);
      const persistHiddenRoot = document.createElement("div");
      persistHiddenRoot.setAttribute("aria-hidden", "true");
      let rootLookups = 0;
      const getByIdSpy = jest
        .spyOn(document, "getElementById")
        .mockImplementation((id) => {
          if (id === "root") rootLookups += 1;
          return id === "root" ? persistHiddenRoot : realGetElementById(id);
        });
      act(() => {
        Simulate.keyDown(dialog, { key: "Escape" });
      });
      act(() => {
        jest.advanceTimersToNextTimer();
      });
      expect(rootLookups).toBeGreaterThan(0);
      // 摘除 stub：此后 aria-hidden 由真实 Modal 卸载提交清除，陈旧链的
      // 每一轮重试只剩周期令牌守卫可拦——卸载清理递增纪元，链失配即终止
      getByIdSpy.mockRestore();
      const focusTargets = [];
      const focusSpy = jest
        .spyOn(HTMLElement.prototype, "focus")
        .mockImplementation(function focusRecorder() {
          focusTargets.push(this);
        });
      view.cleanup();
      // 同 ID 替代按钮（负向锁）：卸载后推进计时器不得对任何节点写入焦点
      //（live getElementById 形态含新挂的同 ID 元素）
      const replacement = document.createElement("button");
      replacement.id = "add-style-button";
      document.body.appendChild(replacement);
      act(() => {
        jest.advanceTimersToNextTimer();
      });
      act(() => {
        jest.advanceTimersToNextTimer();
      });
      focusSpy.mockRestore();

      const opener = view.container.querySelector("#add-style-button");
      expect(focusTargets).not.toContain(opener);
      expect(focusTargets).not.toContain(replacement);
      expect(document.activeElement).not.toBe(opener);
      expect(document.activeElement).not.toBe(replacement);
      replacement.remove();
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
      // 专属规则按弹窗各元素自身的 emotion css-* 类定位：全稿级子串断言
      // 会被其他规则的同值声明或 max-width:440px 子串穿透，逐元素限定后
      // 只认弹窗本体与内容壳的完整声明
      const ruleFor = (el, fallbackHint) => {
        expect(el).not.toBeNull();
        const classes = Array.from(el.className.split(/\s+/)).filter((name) =>
          name.startsWith("css-")
        );
        expect(classes.length).toBeGreaterThan(0);
        const rule =
          classes
            .map(
              (cls) =>
                headCss.match(
                  new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{([^}]*)\\}`)
                )?.[1] ?? null
            )
            .find((found) => found !== null) ?? null;
        if (rule === null) {
          const block = headCss
            .split("}")
            .find((chunk) => chunk.includes(fallbackHint));
          if (block === undefined) return null;
          // 兜底命中块含选择器前缀，剥至 { 后返回纯规则体（与主路径同口径）
          return block.slice(block.indexOf("{") + 1);
        }
        return rule;
      };
      const paperRule = ruleFor(
        // MUI Dialog 的 role="dialog" 挂在 Paper 本体：[role="dialog"] 即
        // .MuiPaper-root，优先取自身、兜底查后代
        dialog.classList.contains("MuiPaper-root")
          ? dialog
          : dialog.querySelector(".MuiPaper-root"),
        "max-height:72vh"
      );
      expect(paperRule).not.toBeNull();
      expect(paperRule).toMatch(/(?:^|\{|\;)width:440px(?=;|$)/);
      expect(paperRule).toContain("max-height:72vh");
      expect(paperRule).toContain("border-radius:12px");
      const contentRule = ruleFor(
        dialog.querySelector(".MuiDialogContent-root")
      );
      expect(contentRule).not.toBeNull();
      expect(contentRule).toMatch(/(?:^|\{|\;)overflow-x:hidden(?=;|$)/);
      // 兜底分支独立锁：类规则未命中（伪造未知 css-* 类）时经 fallbackHint
      // 定位纯规则体，断言与主路径同口径
      const fallbackRule = ruleFor(
        { className: "css-nonexistent" },
        "max-height:72vh"
      );
      expect(fallbackRule).not.toBeNull();
      expect(fallbackRule).toMatch(/(?:^|\{|\;)width:440px(?=;|$)/);
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
  test("registers style card labels and drops retired preview keys", () => {
    // 样式卡标签九键：键在位 + 七语言齐全（ru 经 i18n.js 合并段由
    // RU_I18N/en 兜底）
    const keys = [
      "choose_style_template",
      "blank_style",
      "style_active",
      "css_invalid",
      "css_unsupported",
      "style_card_expand",
      "style_card_collapse",
      "style_library_expand",
      "style_library_collapse",
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
        /\.kt-template-item:focus-visible\s*\{[^}]*box-shadow: none/.test(body)
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

describe("StylesSetting icon style row", () => {
  afterEach(() => {
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
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
    //（两落点均在 0.25° 之外，可鉴别容差窗的覆盖面）。
    expect(matchPresetId(191.7)).toBe("lake");
    expect(matchPresetId(191.15)).toBe("lake");
  });

  test("snap boundary at exactly the tolerance is inclusive", () => {
    // 容差声明"覆盖量化误差上界"，实现须含上界本身。lake hue=191.4，
    // ±0.5° 端点（190.9/191.9）必须命中，本用例钉死端点语义。
    expect(matchPresetId(191.4 + HUE_PRESET_SNAP_TOLERANCE)).toBe("lake");
    expect(matchPresetId(191.4 - HUE_PRESET_SNAP_TOLERANCE)).toBe("lake");
    // 超出容差 0.01° 即不吸附。
    expect(matchPresetId(191.4 + HUE_PRESET_SNAP_TOLERANCE + 0.01)).toBeNull();
    // 退化语义：非数值输入无匹配。
    expect(matchPresetId(Number.NaN)).toBeNull();
    expect(matchPresetId(undefined)).toBeNull();
  });

  test("committing a preset-adjacent hue keeps the draft within 0.5° and the highlight does not rebound", () => {
    // 量化往返锁：提交 191.0° 后存储 Hex 反解 ≈191.43°——漂移大于 0.25°、
    // 落在 0.5° 容差内。提交后外部值回灌：draft 读数即反解 hue
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
    // 高亮，避免"提交同值预设高亮被清空"的回归。
    // 契约：lake hue=191.4，初始 iconColor "#90b2ba"→内部 draft≈191.4x；
    // 键盘 commit 到 191.0° 量化往返仍命中 lake（已知 Δ≤0.43）。
    mockSetting.iconColor = "#90b2ba";
    resetUpdateSettingCalls();
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
    expect(mockUpdateSettingCalls).toContainEqual({ iconColor: "#90b2ba" });
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
    resetUpdateSettingCalls();
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
    expect(mockUpdateSettingCalls).toContainEqual({ iconColor: committedHex });
    view.cleanup();
  });

  test("committed write-back feeds the controlled value so reading and highlight follow after rerender", () => {
    // 回灌闭环：提交后 updateSetting 真实回写受控值，重渲染后滑轨读数跟随
    // 反解稳态：359° 经 8-bit Hex 量化为 #ba9091，反解 ≈358.6°（设计注释
    // 声明的量化往返落点），读数稳定停在右端邻域、不塌回 0°，且不吸附任何
    // 预设（matchPresetId 空）。
    const committedHex = hslToHex(
      ICON_HUE_SLIDER_MAX,
      ICON_RING_S,
      ICON_RING_L
    );
    mockSetting.iconColor = "#90b2ba";
    resetUpdateSettingCalls();
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
    expect(mockUpdateSettingCalls).toContainEqual({ iconColor: committedHex });
    act(renderApp);
    // 期望值 358.6° 为量化往返的独立算得结果（359° 经 8-bit Hex 量化为
    // #ba9091 再反解）；不从 resolveIconHue 运行时派生——否则与被测组件的
    // draft.toFixed(1) 取自同一函数，读数即便回绕到 0° 断言仍会通过。
    expect(row().textContent).toContain("358.6°");
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
    resetUpdateSettingCalls();
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
    expect(mockUpdateSettingCalls).toContainEqual({ iconColor: "#90b2ba" });
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
    // 期望值 160.1° 按 HSL 反解独立算得：#10b981 = R16/G185/B129，
    // max=g → h=60×(2+(129−16)/169)=160.118…° → toFixed(1)="160.1°"。
    // 不从 resolveIconHue 运行时派生——与被测组件同源时，读数回绕或吸附
    // 出错断言仍会通过。
    expect(row().textContent).toContain("160.1°");

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
      resetUpdateSettingCalls();
      touchDispatch("touchmove", touchAt(250), document);
      expect(row().textContent).toContain("191.4°");
      expect(row().textContent).not.toContain("269.5°");
      touchDispatch("touchend", touchAt(250), document);
      expect(row().textContent).toContain("191.4°");
      // 取消会话已终止：touchend 不经 handleSliderCommitted，不提交 iconColor。
      expect(mockUpdateSettingCalls).toHaveLength(0);

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
      resetUpdateSettingCalls();
      dispatch("touchmove", [touchOf(8, 250)], document, [touchOf(8, 250)]);
      expect(row().textContent).toContain("191.4°");
      expect(row().textContent).not.toContain("269.5°");
      dispatch("touchend", [touchOf(8, 250)], document, []);
      expect(row().textContent).toContain("191.4°");
      expect(mockUpdateSettingCalls).toHaveLength(0);

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
    resetUpdateSettingCalls();
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
      expect(mockUpdateSettingCalls).toHaveLength(0);

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
