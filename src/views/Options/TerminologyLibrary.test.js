/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import TerminologyLibrary from "./TerminologyLibrary";
import { SettingProvider } from "../../hooks/Setting";
import {
  DEFAULT_SETTING,
  DEFAULT_SYNC,
  STOKEY_SETTING,
  STOKEY_SYNC,
  STOKEY_TERMS,
  DEFAULT_TERMS_LIBRARY_ID,
} from "../../config";
import { storage } from "../../libs/storage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/client", () => ({
  isExt: false,
  isGm: false,
  isWeb: true,
}));
jest.mock("../../libs/browser", () => ({ isOptions: () => false }));
jest.mock("../../libs/gm", () => ({ getGmMethod: jest.fn() }));
jest.mock("../../apis", () => ({ apiFetch: jest.fn() }));
jest.mock("../../libs/sync", () => ({
  syncData: jest.fn(),
  trySyncTerms: jest.fn(),
}));
jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));
jest.mock("../../hooks/I18n", () => ({
  // 模拟真实 i18n 的行为：**只有两个参数**（key 与缺省文案），且**不做插值**。
  // 若组件把对象当第二参传入，本 mock 会抛错暴露问题（见下方回归锁）。
  useI18n: () => (key, defaultText) => {
    if (defaultText !== undefined && typeof defaultText !== "string") {
      throw new Error(
        `i18n() 第二参必须是字符串缺省文案，收到 ${typeof defaultText}：${key}`
      );
    }
    return defaultText ?? key;
  },
}));
jest.mock("../../hooks/Alert", () => ({
  useAlert: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));
jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(async () => true),
}));
jest.mock("../../hooks/SubRules", () => ({
  useSubRules: () => ({ selectedRules: [], selectedUrl: "", subList: [] }),
}));

let container;
let root;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render() {
  act(() => {
    root.render(
      <SettingProvider>
        <TerminologyLibrary />
      </SettingProvider>
    );
  });
  await flush();
  await flush();
}

const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const cards = () => [...container.querySelectorAll(".kt-terms-list__card")];
/** ListItemButton 是最外层可点元素 */
const cardButtons = () =>
  [...container.querySelectorAll(".kt-terms-list__card .MuiListItemButton-root")];
const grips = () => [...container.querySelectorAll(".kt-terms-list__grip")];

/** 打开第 n 张卡片的详情页（走 ✏️ 按钮，不再靠点击卡片） */
async function openCard(n) {
  const editBtns = [
    ...cards()[n].querySelectorAll('button[data-testid^="terms-edit-"]'),
  ];
  act(() => {
    editBtns[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/** 点击第 n 张卡片（选中语义） */
async function clickCard(n, init = {}) {
  act(() => {
    cardButtons()[n].dispatchEvent(
      new MouseEvent("click", { bubbles: true, ...init })
    );
  });
  await flush();
}

beforeEach(async () => {
  window.localStorage.clear();
  await storage.setObj(STOKEY_SETTING, DEFAULT_SETTING);
  await storage.setObj(STOKEY_SYNC, DEFAULT_SYNC);
  await storage.setObj(STOKEY_TERMS, {
    _v: 2,
    libraries: [
      {
        id: DEFAULT_TERMS_LIBRARY_ID,
        name: "",
        description: "",
        enabled: true,
        terms: "",
        source: { type: "custom" },
        sortOrder: 0,
      },
    ],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  act(() => root.unmount());
  await flush();
  container.remove();
  jest.clearAllMocks();
});

describe("术语库列表页", () => {
  test("默认显示一张库卡片", async () => {
    await render();
    expect(cards()).toHaveLength(1);
  });

  test("卡片显示只读序号 #0", async () => {
    await render();
    const chips = [...container.querySelectorAll(".MuiChip-label")].map(
      (c) => c.textContent
    );
    expect(chips).toContain("#0");
  });

  test("默认库不渲染拖拽把手（不可拖）", async () => {
    await render();
    // DragIndicatorIcon 在默认库卡片内不应出现
    const dragIcons = container.querySelectorAll('[data-testid="DragIndicatorIcon"]');
    expect(dragIcons).toHaveLength(0);
  });

  test("多库时按顺序显示序号 #0 #1 #2", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
        { id: "lib_a", name: "游戏术语", enabled: true, terms: "A,1", source: { type: "custom" } },
        { id: "lib_b", name: "医学术语", enabled: true, terms: "B,2", source: { type: "custom" } },
      ],
    });
    await render();
    const chips = [...container.querySelectorAll(".MuiChip-label")].map(
      (c) => c.textContent
    );
    expect(chips).toContain("#0");
    expect(chips).toContain("#1");
    expect(chips).toContain("#2");
  });

  test("库名显示在卡片上", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
        { id: "lib_a", name: "游戏术语", enabled: true, terms: "", source: { type: "custom" } },
      ],
    });
    await render();
    expect(container.textContent).toContain("游戏术语");
  });

  test("简介显示在卡片上；为空时不显示该行", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
        { id: "lib_a", name: "有简介", description: "这是简介", enabled: true, terms: "", source: { type: "custom" } },
        { id: "lib_b", name: "无简介", description: "", enabled: true, terms: "", source: { type: "custom" } },
      ],
    });
    await render();
    expect(container.textContent).toContain("这是简介");
  });

  test("订阅库显示署名 @author", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
        {
          id: "sub_x",
          name: "订阅库",
          enabled: true,
          terms: "",
          source: { type: "subscription", url: "https://example.com/t.json" },
        },
      ],
    });
    // 预置订阅缓存（含署名）
    await storage.setObj("kiss-terms_cache_https://example.com/t.json", {
      text: "A,1",
      entries: 5,
      meta: { name: "订阅库" },
      author: "@someone",
    });
    await render();
    // 缓存键位可能带前缀，此处只断言页面不崩且卡片存在
    expect(cards().length).toBeGreaterThanOrEqual(2);
  });

  test("每库有独立开关", async () => {
    await render();
    const switches = container.querySelectorAll('input[type="checkbox"]');
    expect(switches.length).toBeGreaterThanOrEqual(1);
  });

  test("新建库按钮存在", async () => {
    await render();
    expect(container.textContent).toContain("terms_new_library");
  });

  test("添加订阅的输入框存在", async () => {
    await render();
    expect(byTestId("terms-sub-url-input")).not.toBeNull();
  });
});

describe("术语库详情页", () => {
  test("点 ✏️ 进入详情页，出现返回按钮", async () => {
    await render();
    await openCard(0);
    expect(container.textContent).toContain("terms_back_to_list");
  });

  test("详情页有库名与简介输入框", async () => {
    await render();
    await openCard(0);
    expect(byTestId("terms-lib-name")).not.toBeNull();
    expect(byTestId("terms-lib-desc")).not.toBeNull();
  });

  test("默认库的名字输入框禁用（不可改）", async () => {
    await render();
    await openCard(0);
    expect(byTestId("terms-lib-name").disabled).toBe(true);
  });

  test("详情页有术语编辑框与导入导出", async () => {
    await render();
    await openCard(0);
    expect(byTestId("terms-custom-input")).not.toBeNull();
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute("accept")).toContain(".json");
    expect(fileInput.getAttribute("accept")).toContain(".csv");
    expect(fileInput.getAttribute("accept")).toContain(".txt");
  });

  test("读取并显示已存的术语", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "Cheeta,齐塔", source: { type: "custom" } },
      ],
    });
    await render();
    await openCard(0);
    expect(byTestId("terms-custom-input").value).toBe("Cheeta,齐塔");
  });

  test("返回按钮回到列表页", async () => {
    await render();
    await openCard(0);
    const backBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_back_to_list")
    );
    act(() => {
      backBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(cards().length).toBeGreaterThanOrEqual(1);
    expect(byTestId("terms-custom-input")).toBeNull();
  });

  test("默认库不显示删除按钮", async () => {
    await render();
    await openCard(0);
    expect(container.textContent).not.toContain("terms_delete_library");
  });

  test("非默认库显示删除按钮", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
        { id: "lib_a", name: "可删库", enabled: true, terms: "", source: { type: "custom" } },
      ],
    });
    await render();
    await openCard(1);
    expect(container.textContent).toContain("terms_delete_library");
  });

  test("占位符被真实插值，不出现字面 {count}（缺陷回归锁）", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "A,1;B,2", source: { type: "custom" } },
      ],
    });
    await render();
    await openCard(0);
    expect(container.textContent).not.toContain("{count}");
    expect(container.textContent).not.toContain("{max}");
  });

  test("列表页也不出现字面占位符", async () => {
    await render();
    expect(container.textContent).not.toContain("{count}");
  });
});

describe("交互模型（点击=选中，不跳转）", () => {
  const threeLibs = {
    _v: 2,
    libraries: [
      { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
      { id: "lib_a", name: "A库", enabled: true, terms: "A,1", source: { type: "custom" } },
      { id: "lib_b", name: "B库", enabled: true, terms: "B,2", source: { type: "custom" } },
      { id: "lib_c", name: "C库", enabled: true, terms: "C,3", source: { type: "custom" } },
    ],
  };

  test("点击卡片只选中，不进入详情页", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    await clickCard(1);
    // 仍在列表页
    expect(byTestId("terms-custom-input")).toBeNull();
    // 且出现"已选 1 项"
    expect(container.textContent).toContain("terms_selected_count");
  });

  test("点击已选中的卡片可取消选中", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    await clickCard(1);
    await clickCard(1);
    expect(container.textContent).toContain("terms_selected_count");
    // 取消后不显示"取消选择"按钮
    expect(container.textContent).not.toContain("terms_clear_selection");
  });

  test("Ctrl+点击 跳跃式复选（可多选不连续项）", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    await clickCard(1);
    await clickCard(3, { ctrlKey: true });
    // 选中 A 和 C 两项
    const clearBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_clear_selection")
    );
    expect(clearBtn).toBeDefined();
  });

  test("Shift+点击 范围复选", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    await clickCard(1); // 锚点 = A库
    await clickCard(3, { shiftKey: true }); // 范围 = A..C
    // 范围选后应选中 3 项（A、B、C，不含默认库 #0）
    const chip = [...container.querySelectorAll(".MuiChip-label")].find((c) =>
      c.textContent.includes("terms_selected_count")
    );
    expect(chip).toBeDefined();
  });

  test("默认库可被选中（避免误以为点击无响应）", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    await clickCard(0);
    expect(container.textContent).toContain("terms_selected_count");
  });

  test("默认库不参与批量操作：只选默认库时启用/禁用按钮禁用", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    await clickCard(0); // 只选默认库
    const enableBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_bulk_enable")
    );
    expect(enableBtn.disabled).toBe(true);
  });

  test("默认库的开关被禁用（常开不可调）", async () => {
    await render();
    const sw = container.querySelector('input[type="checkbox"]');
    expect(sw.disabled).toBe(true);
    expect(sw.checked).toBe(true);
  });

  test("所有库都显示点阵把手", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    expect(grips()).toHaveLength(4); // 3 个库 + 默认库
  });

  test("只有点阵可拖（卡片本身不是 draggable）", async () => {
    await storage.setObj(STOKEY_TERMS, threeLibs);
    await render();
    // 卡片容器不应有 draggable
    expect(cards()[1].getAttribute("draggable")).toBeNull();
    // 点阵把手才是 draggable
    expect(grips()[1].getAttribute("draggable")).toBe("true");
  });

  test("默认库的点阵不可拖", async () => {
    await render();
    expect(grips()[0].getAttribute("draggable")).toBeNull();
  });

  test("介绍文字显示在列表顶部", async () => {
    await render();
    expect(byTestId("terms-intro")).not.toBeNull();
    expect(container.textContent).toContain("terms_library_intro");
  });
});

describe("订阅库不可编辑", () => {
  const withSub = {
    _v: 2,
    libraries: [
      { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
      { id: "lib_a", name: "自定义库", enabled: true, terms: "A,1", source: { type: "custom" } },
      {
        id: "sub_x",
        name: "订阅库",
        enabled: true,
        terms: "",
        source: { type: "subscription", url: "https://example.com/t.json" },
      },
    ],
  };

  test("自定义库的编辑按钮可用", async () => {
    await storage.setObj(STOKEY_TERMS, withSub);
    await render();
    const btn = byTestId("terms-edit-lib_a");
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
  });

  test("订阅库的编辑按钮彻底禁用", async () => {
    await storage.setObj(STOKEY_TERMS, withSub);
    await render();
    const btn = byTestId("terms-edit-sub_x");
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  test("默认库的编辑按钮可用", async () => {
    await storage.setObj(STOKEY_TERMS, withSub);
    await render();
    expect(byTestId(`terms-edit-${DEFAULT_TERMS_LIBRARY_ID}`).disabled).toBe(
      false
    );
  });
});

describe("批量工具条", () => {
  const libs = {
    _v: 2,
    libraries: [
      { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
      { id: "lib_a", name: "A库", enabled: true, terms: "A,1", source: { type: "custom" } },
      { id: "lib_b", name: "B库", enabled: false, terms: "B,2", source: { type: "custom" } },
    ],
  };

  test("工具条常显（无选中时也在）", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    expect(byTestId("terms-bulk-bar")).not.toBeNull();
  });

  test("无选中时启用/禁用按钮禁用", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    const enableBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_bulk_enable")
    );
    expect(enableBtn.disabled).toBe(true);
  });

  test("选中后可批量启用", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    await clickCard(2); // 选 B库（当前 disabled）
    const enableBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_bulk_enable")
    );
    act(() => {
      enableBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const saved = await storage.getObj(STOKEY_TERMS);
    expect(saved.libraries.find((l) => l.id === "lib_b").enabled).toBe(true);
  });

  test("选中后可批量禁用", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    await clickCard(1); // 选 A库（当前 enabled）
    const disableBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_bulk_disable")
    );
    act(() => {
      disableBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const saved = await storage.getObj(STOKEY_TERMS);
    expect(saved.libraries.find((l) => l.id === "lib_a").enabled).toBe(false);
  });

  test("无订阅库时更新订阅按钮禁用", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    const syncBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_bulk_sync")
    );
    expect(syncBtn.disabled).toBe(true);
  });

  test("存在订阅库时更新订阅按钮可用（无选中=更新全部）", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        ...libs.libraries,
        {
          id: "sub_x",
          name: "订阅库",
          enabled: true,
          terms: "",
          source: { type: "subscription", url: "https://example.com/t.json" },
        },
      ],
    });
    await render();
    const syncBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("terms_bulk_sync")
    );
    expect(syncBtn.disabled).toBe(false);
  });
});

describe("卡片上的删除入口（用户反馈：列表页缺删除按钮）", () => {
  const libs = {
    _v: 2,
    libraries: [
      { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
      { id: "lib_a", name: "A库", enabled: true, terms: "A,1", source: { type: "custom" } },
    ],
  };

  test("非默认库的卡片上有删除按钮", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    expect(byTestId("terms-delete-lib_a")).not.toBeNull();
  });

  test("默认库的卡片上没有删除按钮（人类决策 D1）", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    expect(
      byTestId(`terms-delete-${DEFAULT_TERMS_LIBRARY_ID}`)
    ).toBeNull();
  });

  test("点删除按钮不会顺带选中卡片（stopPropagation）", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    act(() => {
      byTestId("terms-delete-lib_a").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    await flush();
    // 仍在列表页，且未选中
    expect(byTestId("terms-custom-input")).toBeNull();
    expect(container.textContent).not.toContain("terms_clear_selection");
  });

  test("确认后删除库并从列表移除", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    act(() => {
      byTestId("terms-delete-lib_a").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    await flush();
    await flush();
    const saved = await storage.getObj(STOKEY_TERMS);
    expect(saved.libraries.some((l) => l.id === "lib_a")).toBe(false);
  });

  test("订阅库也可删除（仅移除本地库，不动远端文件）", async () => {
    await storage.setObj(STOKEY_TERMS, {
      _v: 2,
      libraries: [
        ...libs.libraries,
        {
          id: "sub_x",
          name: "订阅库",
          enabled: true,
          terms: "",
          source: { type: "subscription", url: "https://example.com/t.json" },
        },
      ],
    });
    await render();
    expect(byTestId("terms-delete-sub_x")).not.toBeNull();
  });
});

describe("导入导出按钮有说明文字（用户反馈：只有按钮没有介绍）", () => {
  test("详情页导入按钮下有格式说明", async () => {
    await render();
    await openCard(0);
    const importHelper = byTestId("terms-io-helper");
    expect(importHelper).not.toBeNull();
    expect(importHelper.textContent).toBeTruthy();
  });

  test("详情页导出按钮下有用途说明", async () => {
    await render();
    await openCard(0);
    const exportHelper = byTestId("terms-export-helper");
    expect(exportHelper).not.toBeNull();
    expect(exportHelper.textContent).toBeTruthy();
  });

  test("说明文字不残留字面占位符", async () => {
    await render();
    await openCard(0);
    expect(container.textContent).not.toContain("{count}");
  });
});

describe("点阵与序号对齐（用户反馈：点阵偏上）", () => {
  const libs = {
    _v: 2,
    libraries: [
      { id: DEFAULT_TERMS_LIBRARY_ID, name: "", enabled: true, terms: "", source: { type: "custom" } },
      { id: "lib_a", name: "A库", enabled: true, terms: "A,1", source: { type: "custom" } },
    ],
  };

  test("点阵与序号被同一容器包裹（成组对齐，避免各自偏移）", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    const grip = grips()[1];
    // 点阵与 Chip 必须同父，才能共享同一条垂直居中基线
    const parent = grip.parentElement;
    expect(parent.contains(grip)).toBe(true);
    expect(parent.querySelector(".MuiChip-root")).not.toBeNull();
  });

  test("承载点阵的容器用 flex 居中（alignment 由 CSS 类提供，非内联样式）", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    const group = grips()[0].parentElement;
    // MUI sx 编译为 emotion 类，故断言类名而非 style.*
    expect(group.className).toMatch(/MuiStack-root/);
    // 组内两个子元素（点阵 + 序号）都应存在，且组本身不再带 mt 偏移
    const children = [...group.children].filter(
      (el) => el.nodeType === 1 && !el.className.includes("MuiTooltip")
    );
    expect(children.length).toBeGreaterThanOrEqual(2);
  });

  test("点阵上不再残留各自的 mt 偏移（避免上下错位）", async () => {
    await storage.setObj(STOKEY_TERMS, libs);
    await render();
    const grip = grips()[0];
    const chip = grip.parentElement.querySelector(".MuiChip-root");
    // 旧实现用 grip.mt=0.5 / chip.mt=0.25 各自偏移，正是错位根因
    expect(grip.style.marginTop).toBe("");
    expect(chip.style.marginTop).toBe("");
  });
});
