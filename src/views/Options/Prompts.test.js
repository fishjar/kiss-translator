import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_USER,
} from "../../config";
import Prompts from "./Prompts";
import { __resetSessionHeightMapForTests } from "../../hooks/useTextareaHeightLock";
import { I18N } from "../../config/i18n";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollTo = jest.fn();

const mockUsePromptList = jest.fn();
const mockConfirm = jest.fn();

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => mockUsePromptList(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

// 手柄样式：部分 mock（requireActual 保留真实默认导出 useTextareaHeightLock），
// 只替换 useTextareaGripStyle 以驱动 corner-pill 等自绘样式行为。
// 同时 mock ./Setting：requireActual 加载真实 hook 会静态 import ./Setting，进而
// 拉入 Storage→apis→query-string(ESM) 整条持久化链，本测试未转译 query-string 会
// 解析失败。Setting 用最小 mock 斩断该链；真实默认导出不调用 useSetting，零影响。
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: {} }),
}));
const mockUseTextareaGripStyle = jest.fn(() => "concentric-smooth");
jest.mock("../../hooks/useTextareaHeightLock", () => {
  const actual = jest.requireActual("../../hooks/useTextareaHeightLock");
  // 必须显式回补 __esModule：requireActual 的 __esModule 为非枚举属性，
  // 纯 {...actual} 展开会丢失它，导致消费方对 hook 的默认导入被 Babel 的
  // _interopRequireDefault 重新包一层而拿不到函数本体。
  return {
    ...actual,
    __esModule: true,
    useTextareaGripStyle: () => mockUseTextareaGripStyle(),
  };
});

function createPrompt(category, overrides = {}) {
  return {
    slug: `prompt_${category.replaceAll(" ", "_")}`,
    category,
    name: category,
    systemPrompt: "system prompt",
    userPrompt: "user prompt",
    ...overrides,
  };
}

function renderPrompts(promptsOrCategory, options = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let prompts = Array.isArray(promptsOrCategory)
    ? promptsOrCategory
    : [createPrompt(promptsOrCategory)];
  const promptListValue = {
    addPrompt: jest.fn(),
    updatePrompt: jest.fn(),
    deletePrompt: jest.fn(),
    copyPrompt: jest.fn(),
    isPresetPromptSlug: options.isPresetPromptSlug || (() => false),
  };

  const setPrompts = (nextPrompts) => {
    prompts = nextPrompts;
    mockUsePromptList.mockReturnValue({
      prompts,
      ...promptListValue,
    });
  };

  setPrompts(prompts);

  act(() => {
    root.render(<Prompts />);
  });

  return {
    container,
    promptListValue,
    rerender(nextPrompts) {
      setPrompts(nextPrompts);
      act(() => {
        root.render(<Prompts />);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Prompts", () => {
  afterEach(() => {
    mockUsePromptList.mockReset();
    mockConfirm.mockReset();
    document.body.innerHTML = "";
  });

  test("shows system and user prompt fields for dictionary prompts", () => {
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);

    expect(container.textContent).toContain("系统提示词");
    expect(container.textContent).toContain("用户提示词");
    const resizableTextareas = container.querySelectorAll(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    expect(resizableTextareas).toHaveLength(2);
    resizableTextareas.forEach((textarea) => {
      expect(textarea.closest(".kt-resizable-text-field")).not.toBeNull();
      expect(
        getComputedStyle(textarea.closest(".MuiInputBase-root")).overflow
      ).toBe("visible");
      expect(getComputedStyle(textarea).resize).toBe("none");
      const fieldRoot = textarea.closest(".MuiInputBase-root");
      // 内容门控（有内容 → 在场）：夹具提示词非空。
      const grip = fieldRoot.querySelector('[role="slider"]');
      expect(grip).not.toBeNull();
      // 清空内容 → 手柄不在场；回填 → 重新在场（字段 onChange 经
      // CodeField rest 透传，CodeField.js:15 `{...rest}`；原生 setter
      // 先例同 TranForm.test.js 900-907）。
      const setTextareaValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      act(() => {
        setTextareaValue.call(textarea, "");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(fieldRoot.querySelector('[role="slider"]')).toBeNull();
      act(() => {
        setTextareaValue.call(textarea, "filled");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(fieldRoot.querySelector('[role="slider"]')).not.toBeNull();
      // 键盘锁定锚。
      act(() => {
        fieldRoot
          .querySelector('[role="slider"]')
          .dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
          );
      });
      expect(fieldRoot.classList).toContain("kt-height-locked");
      expect(fieldRoot.style.height).toBe("40px");
    });

    unmount();
  });

  test("clearing a locked prompt field releases the height lock completely", () => {
    __resetSessionHeightMapForTests();
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);

    const textarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    // 先制造锁定态（手柄仅在锁定态存在期间常驻）。
    act(() => {
      fieldRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
        );
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");

    // 清空内容 → 彻底解锁：手柄消失、root 类与内联高度还原。
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      setTextareaValue.call(textarea, "");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(fieldRoot.querySelector('[role="slider"]')).toBeNull();
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("");

    // 回填 → 手柄重新在场且高度从默认重新开始（锁定已被清除）。
    act(() => {
      setTextareaValue.call(textarea, "filled");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(fieldRoot.querySelector('[role="slider"]')).not.toBeNull();
    expect(fieldRoot.classList).not.toContain("kt-height-locked");

    unmount();
  });

  // B3：双击手柄显式解锁——内容非空时手柄保持在场（门控分支存续态：
  // formData.systemPrompt.trim() || lockedHeight != null 的前半支），但
  // 锁定态整体回原（kt-height-locked 类与内联高度由受管属性一并撤销）。
  test("releases the height on grip double-click while keeping the grip mounted for non-empty content", () => {
    __resetSessionHeightMapForTests();
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);

    const textarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    // 双击解锁提示已并入 title（i18n mock 返回 key 名，验证真实接线）。
    expect(
      fieldRoot.querySelector('[role="slider"]').getAttribute("title")
    ).toBe("field_resize_heightfield_resize_unlock_hint");
    // 先制造锁定态。
    act(() => {
      fieldRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
        );
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("40px");

    // 双击 → 显式解锁：手柄仍在场（内容 "system prompt" 非空），锁定回原。
    act(() => {
      fieldRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(fieldRoot.querySelector('[role="slider"]')).not.toBeNull();
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("");

    unmount();
  });

  // B3 七语言完整性：新增的 field_resize_unlock_hint 必须在主 I18N 字典
  // 具备全部 7 种语言的非空字段，且语言集合与相邻的 field_resize_height
  // 完全一致（真实字典遍历断言，非 key 名 mock）。
  test("ships the unlock hint key with all seven non-empty language fields", () => {
    const languages = ["zh", "en", "zh_TW", "ja", "ko", "tr", "vi"];
    for (const key of ["field_resize_height", "field_resize_unlock_hint"]) {
      const entry = I18N[key];
      expect(entry).toBeDefined();
      languages.forEach((lang) => {
        expect(typeof entry[lang]).toBe("string");
        expect(entry[lang].length).toBeGreaterThan(0);
      });
    }
    expect(Object.keys(I18N.field_resize_unlock_hint).sort()).toEqual(
      Object.keys(I18N.field_resize_height).sort()
    );
  });

  // B5：PromptFields 不得以 slug 作 key——保存/列表重建触发整块重挂载
  // 会丢焦点、丢滚动与输入法合成态。prompt 变更重置由既有
  // lastSyncedPromptRef 快照比对承担，高度记忆隔离由 hook lockKey（含
  // slug）承担，key 属纯有害冗余（红：现实现切换后编辑器 DOM 节点易主）。
  test("keeps the PromptFields editor DOM alive across prompt selection switches", async () => {
    const promptA = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "prompt_aaa",
      name: "Prompt A",
    });
    const promptB = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "prompt_bbb",
      name: "Prompt B",
    });
    const { container, unmount } = renderPrompts([promptA, promptB]);

    const textareaBefore = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    expect(textareaBefore).not.toBeNull();
    const promptBButton = Array.from(
      container.querySelectorAll('[role="button"]')
    ).find((button) => button.textContent === "Prompt B");
    await act(async () => promptBButton.click());
    const textareaAfter = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    // 同一 DOM 节点仍存活：切换提示词不得重挂载编辑器。
    expect(textareaAfter).toBe(textareaBefore);
    unmount();
  });

  test("keeps user prompt field visibility scoped to prompt categories that use it", () => {
    const visibleCategories = [
      PROMPT_CATEGORY_USER,
      PROMPT_CATEGORY_DICTIONARY,
      PROMPT_CATEGORY_BATCH_SYSTEM,
    ];
    const hiddenCategories = [PROMPT_CATEGORY_SUBTITLE];

    for (const category of visibleCategories) {
      const { container, unmount } = renderPrompts(category);
      expect(container.textContent).toContain("用户提示词");
      unmount();
    }

    for (const category of hiddenCategories) {
      const { container, unmount } = renderPrompts(category);
      expect(container.textContent).not.toContain("用户提示词");
      unmount();
    }
  });

  test("marks the editor as container responsive and caps the stacked list", () => {
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_USER);
    const editor = container.querySelector(".kt-prompt-editor");

    expect(editor.classList).toContain(
      "kt-prompt-editor--container-responsive"
    );
    expect(
      container.querySelector(".kt-prompt-editor__list-panel")
    ).not.toBeNull();
    expect(
      container.querySelector(".kt-prompt-editor__detail-panel")
    ).not.toBeNull();

    expect(
      getComputedStyle(container.querySelector(".kt-prompt-editor__list-panel"))
        .maxHeight
    ).toBe("min(40vh, 360px)");
    expect(
      getComputedStyle(
        container.querySelector(".kt-prompt-editor__detail-panel")
      ).overscrollBehavior
    ).not.toBe("contain");
    unmount();
  });

  test("exposes selection while preserving keyboard and mouse behavior", async () => {
    const firstPrompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "first_prompt",
      name: "First prompt",
    });
    const secondPrompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "second_prompt",
      name: "Second prompt",
    });
    const { container, unmount } = renderPrompts([firstPrompt, secondPrompt]);
    const promptList = container.querySelector(".kt-prompt-editor__list");
    const promptButtons = Array.from(
      promptList.querySelectorAll('[role="button"]')
    );

    expect(promptList.classList).not.toContain("MuiList-padding");
    expect(getComputedStyle(promptList).width).toBe("100%");
    expect(getComputedStyle(promptList).boxSizing).toBe("border-box");
    expect(promptButtons).toHaveLength(2);
    expect(promptButtons[0].getAttribute("aria-pressed")).toBe("true");
    expect(promptButtons[1].getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      promptButtons[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });

    expect(promptButtons[0].getAttribute("aria-pressed")).toBe("false");
    expect(promptButtons[1].getAttribute("aria-pressed")).toBe("true");

    await act(async () => promptButtons[0].click());

    expect(promptButtons[0].getAttribute("aria-pressed")).toBe("true");
    expect(promptButtons[1].getAttribute("aria-pressed")).toBe("false");
    unmount();
  });

  test("confirms before switching away from unsaved changes", async () => {
    const firstPrompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "first_prompt",
      name: "First prompt",
    });
    const secondPrompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "second_prompt",
      name: "Second prompt",
    });
    const { container, unmount } = renderPrompts([firstPrompt, secondPrompt]);
    const nameInput = container.querySelector('input[name="name"]');

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Changed prompt");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    mockConfirm.mockResolvedValueOnce(false);
    const secondPromptButton = Array.from(
      container.querySelectorAll('[role="button"]')
    ).find((button) => button.textContent === "Second prompt");
    await act(async () => secondPromptButton.click());
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "discard_prompt_changes_confirm",
      })
    );
    expect(container.querySelector('input[name="name"]').value).toBe(
      "Changed prompt"
    );

    mockConfirm.mockResolvedValueOnce(true);
    await act(async () => secondPromptButton.click());
    expect(container.querySelector('input[name="name"]').value).toBe(
      "Second prompt"
    );
    unmount();
  });

  test("keeps a dirty draft when only the prompt object identity changes", () => {
    const prompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "first_prompt",
      name: "First prompt",
    });
    const { container, rerender, unmount } = renderPrompts([prompt]);
    const nameInput = container.querySelector('input[name="name"]');

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Changed prompt");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Preserve the unsaved draft when list rebuilding produces an equivalent object.
    rerender([{ ...prompt }]);
    expect(container.querySelector('input[name="name"]').value).toBe(
      "Changed prompt"
    );

    unmount();
  });

  test("confirms before creating a prompt from a template", async () => {
    const customPrompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "custom_prompt",
      name: "Custom prompt",
    });
    const presetPrompt = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "preset_prompt",
      name: "Preset prompt",
    });
    const { container, promptListValue, unmount } = renderPrompts(
      [customPrompt, presetPrompt],
      {
        isPresetPromptSlug: (slug) => slug === "preset_prompt",
      }
    );
    promptListValue.addPrompt.mockReturnValue("new_prompt");
    const nameInput = container.querySelector('input[name="name"]');

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Changed prompt");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "新增提示词"
    );
    await act(async () => addButton.click());
    const templateMenuItem = Array.from(
      document.body.querySelectorAll('[role="menuitem"]')
    ).find((item) => item.textContent === "Preset prompt");

    mockConfirm.mockResolvedValueOnce(false);
    await act(async () => templateMenuItem.click());
    expect(promptListValue.addPrompt).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValueOnce(true);
    await act(async () => templateMenuItem.click());
    expect(promptListValue.addPrompt).toHaveBeenCalledWith(
      presetPrompt,
      "Preset prompt"
    );
    unmount();
  });

  // 会话高度记忆按提示词 slug 隔离：切换选中提示词后字段不得继承上一份
  // 提示词的锁定态（key={slug} remount + lockKey 随 slug），切回时恢复
  // 各自记忆。
  test("scopes prompt height memories per prompt slug across selection switches", async () => {
    __resetSessionHeightMapForTests();
    const promptA = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "prompt_aaa",
      name: "Prompt A",
    });
    const promptB = createPrompt(PROMPT_CATEGORY_USER, {
      slug: "prompt_bbb",
      name: "Prompt B",
    });
    const { container, unmount } = renderPrompts([promptA, promptB]);

    const systemTextarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    const systemRoot = systemTextarea.closest(".MuiInputBase-root");
    act(() => {
      systemRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
        );
    });
    expect(systemRoot.classList).toContain("kt-height-locked");

    // 切到提示词 B：system 字段不得继承 A 的锁定。
    const promptBButton = Array.from(
      container.querySelectorAll('[role="button"]')
    ).find((button) => button.textContent === "Prompt B");
    await act(async () => promptBButton.click());
    const promptBRoot = container
      .querySelector('textarea.kt-resizable-textarea:not([aria-hidden="true"])')
      .closest(".MuiInputBase-root");
    expect(promptBRoot.classList).not.toContain("kt-height-locked");
    expect(promptBRoot.style.height).toBe("");

    // 切回提示词 A：恢复 A 自己的记忆高度。
    const promptAButton = Array.from(
      container.querySelectorAll('[role="button"]')
    ).find((button) => button.textContent === "Prompt A");
    await act(async () => promptAButton.click());
    const restoredRoot = container
      .querySelector('textarea.kt-resizable-textarea:not([aria-hidden="true"])')
      .closest(".MuiInputBase-root");
    expect(restoredRoot.classList).toContain("kt-height-locked");
    expect(restoredRoot.style.height).toBe("40px");

    unmount();
  });
});

describe("Prompts textarea grip style", () => {
  afterEach(() => {
    mockUseTextareaGripStyle.mockReset();
    mockUseTextareaGripStyle.mockReturnValue("concentric-smooth");
    mockUsePromptList.mockReset();
    mockConfirm.mockReset();
    document.body.innerHTML = "";
  });

  test("keeps the height lock across focus and blur re-renders", () => {
    __resetSessionHeightMapForTests();
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);

    const textarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    act(() => {
      fieldRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
        );
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");
    const lockedHeight = fieldRoot.style.height;
    expect(lockedHeight).not.toBe("");

    // 聚焦触发 InputBase 聚焦重渲染，锁定类与内联高必须存活。
    act(() => {
      textarea.focus();
    });
    expect(fieldRoot.classList).toContain("Mui-focused");
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe(lockedHeight);

    act(() => {
      textarea.blur();
    });
    expect(fieldRoot.classList).not.toContain("Mui-focused");
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe(lockedHeight);

    unmount();
  });

  test("keeps the lock and focus while dragging the grip of a focused field", () => {
    __resetSessionHeightMapForTests();
    // jsdom 无 pointer capture：沿用 TextareaResizeGrip.test.js 先例，
    // 用例内直接赋值 stub，用毕删除还原（组件在 capture 缺失时不启动会话）。
    HTMLElement.prototype.setPointerCapture = jest.fn();
    HTMLElement.prototype.releasePointerCapture = jest.fn();
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);

    const textarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    act(() => {
      textarea.focus();
    });
    const grip = fieldRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();

    act(() => {
      grip.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientY: 100,
        })
      );
    });
    expect(document.activeElement).toBe(textarea);

    act(() => {
      grip.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientY: 160 })
      );
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).not.toBe("");

    act(() => {
      grip.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    expect(document.activeElement).toBe(textarea);
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).not.toBe("");

    unmount();
    delete HTMLElement.prototype.setPointerCapture;
    delete HTMLElement.prototype.releasePointerCapture;
  });

  test("corner-pill renders the grip with the selected variant and locks resize", () => {
    mockUseTextareaGripStyle.mockReturnValue("corner-pill");
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);
    const textarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    const grip = fieldRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();
    expect(getComputedStyle(textarea).resize).toBe("none");
    expect(grip.querySelector("svg path").getAttribute("d")).toBe(
      "M14 6V9.5C14 11.985 11.985 14 9.5 14H6"
    );
    unmount();
  });

  // B1：hidden = 完全不渲染手柄 + textarea 原生 resize 回退（红：现实现
  // 渲染空图形手柄且 resize 压成 none——不可见却可拖是隐蔽交互面）。
  test("hidden variant renders no grip and restores native resize", () => {
    mockUseTextareaGripStyle.mockReturnValue("hidden");
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);
    const textarea = container.querySelector(
      'textarea.kt-resizable-textarea:not([aria-hidden="true"])'
    );
    expect(textarea.style.resize).toBe("vertical");
    expect(
      textarea.closest(".MuiInputBase-root").querySelector('[role="slider"]')
    ).toBeNull();
    unmount();
  });
});
