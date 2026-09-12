import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_USER,
} from "../../config";
import Prompts from "./Prompts";

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
      expect(getComputedStyle(textarea).resize).toBe("vertical");
    });

    unmount();
  });

  test("keeps user prompt field visibility scoped to prompt categories that use it", () => {
    const visibleCategories = [
      PROMPT_CATEGORY_USER,
      PROMPT_CATEGORY_DICTIONARY,
    ];
    const hiddenCategories = [
      PROMPT_CATEGORY_BATCH_SYSTEM,
      PROMPT_CATEGORY_SUBTITLE,
    ];

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
});
