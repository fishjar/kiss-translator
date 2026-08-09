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

function createPrompt(category) {
  return {
    slug: `prompt_${category.replaceAll(" ", "_")}`,
    category,
    name: category,
    systemPrompt: "system prompt",
    userPrompt: "user prompt",
  };
}

function renderPrompts(category) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let prompt = createPrompt(category);
  const promptListValue = {
    addPrompt: jest.fn(),
    updatePrompt: jest.fn(),
    deletePrompt: jest.fn(),
    copyPrompt: jest.fn(),
    isPresetPromptSlug: () => false,
  };

  const setPrompt = (nextPrompt) => {
    prompt = nextPrompt;
    mockUsePromptList.mockReturnValue({
      prompts: [prompt],
      ...promptListValue,
    });
  };

  setPrompt(prompt);

  act(() => {
    root.render(<Prompts />);
  });

  return {
    container,
    prompt,
    rerender(nextPrompt) {
      setPrompt(nextPrompt);
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

async function openPromptEditor(container) {
  const editButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "edit" && !button.disabled
  );
  expect(editButton).toBeDefined();
  await act(async () => {
    editButton.click();
    await Promise.resolve();
  });
}

describe("Prompts", () => {
  afterEach(() => {
    mockUsePromptList.mockReset();
    mockConfirm.mockReset();
    document.body.innerHTML = "";
  });

  test("shows system and user prompt fields for dictionary prompts", async () => {
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_DICTIONARY);
    await openPromptEditor(container);

    expect(container.textContent).toContain("系统提示词");
    expect(container.textContent).toContain("用户提示词");

    unmount();
  });

  test("keeps user prompt field visibility scoped to prompt categories that use it", async () => {
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
      await openPromptEditor(container);
      expect(container.textContent).toContain("用户提示词");
      unmount();
    }

    for (const category of hiddenCategories) {
      const { container, unmount } = renderPrompts(category);
      await openPromptEditor(container);
      expect(container.textContent).not.toContain("用户提示词");
      unmount();
    }
  });

  test("confirms before leaving an editor with unsaved changes", async () => {
    const { container, unmount } = renderPrompts(PROMPT_CATEGORY_USER);
    await openPromptEditor(container);
    const nameInput = container.querySelector('input[name="name"]');

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Changed prompt");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    mockConfirm.mockResolvedValueOnce(false);
    const backButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "back"
    );
    await act(async () => backButton.click());
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "discard_prompt_changes_confirm",
      })
    );
    expect(container.querySelector('input[name="name"]')).not.toBeNull();

    mockConfirm.mockResolvedValueOnce(true);
    await act(async () => backButton.click());
    expect(container.querySelector('input[name="name"]')).toBeNull();
    unmount();
  });

  test("accepts clean updates without discarding a dirty prompt draft", async () => {
    const view = renderPrompts(PROMPT_CATEGORY_USER);
    await openPromptEditor(view.container);
    const cleanUpdate = {
      ...view.prompt,
      name: "Remote clean prompt",
    };

    view.rerender(cleanUpdate);
    expect(view.container.querySelector('input[name="name"]').value).toBe(
      "Remote clean prompt"
    );

    const nameInput = view.container.querySelector('input[name="name"]');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(nameInput, "Local prompt draft");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    view.rerender({ ...cleanUpdate });
    expect(view.container.querySelector('input[name="name"]').value).toBe(
      "Local prompt draft"
    );

    view.rerender({
      ...cleanUpdate,
      systemPrompt: "remote conflicting system prompt",
    });
    expect(view.container.querySelector('input[name="name"]').value).toBe(
      "Local prompt draft"
    );
    const saveButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent === "save");
    expect(saveButton.disabled).toBe(false);

    view.unmount();
  });
});
