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
