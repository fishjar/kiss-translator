import { useCallback, useMemo } from "react";
import {
  getAllPrompts,
  isPresetPromptSlug,
  normalizePrompt,
  removePromptReferences,
} from "../config";
import { useSetting } from "./Setting";

function createPromptSlug() {
  return `prompt_${crypto.randomUUID()}`;
}

function createPromptName(sourcePrompt, sourcePromptName = "") {
  const uuid = crypto.randomUUID();
  const baseName = sourcePromptName || sourcePrompt?.name || "Custom Prompt";
  return `${baseName}_${uuid.slice(0, 8)}`;
}

/**
 * 管理提示词列表的 Hook。
 * 预设提示词只来自 config/prompt.js，用户列表只保存可编辑副本，避免误把预设写入本地配置。
 */
export function usePromptList() {
  const { setting, updateSetting } = useSetting();
  const customPrompts = useMemo(
    () => setting?.prompts || [],
    [setting?.prompts]
  );

  const prompts = useMemo(() => getAllPrompts(customPrompts), [customPrompts]);

  const addPrompt = useCallback(
    (sourcePrompt = {}, sourcePromptName = "") => {
      const source = normalizePrompt(sourcePrompt);
      const prompt = {
        ...source,
        slug: createPromptSlug(),
        // 自定义提示词副本要保存当次生成的显示名称，不继承预设提示词的 i18n key。
        nameKey: "",
        name: createPromptName(source, sourcePromptName),
      };

      updateSetting((prev) => ({
        ...prev,
        prompts: [...(prev?.prompts || []), prompt],
      }));

      return prompt.slug;
    },
    [updateSetting]
  );

  const updatePrompt = useCallback(
    (promptSlug, updateData) => {
      if (!promptSlug || isPresetPromptSlug(promptSlug)) {
        return;
      }

      const patch = normalizePrompt({ ...updateData, slug: promptSlug });
      updateSetting((prev) => ({
        ...prev,
        prompts: (prev?.prompts || []).map((prompt) => {
          if (normalizePrompt(prompt).slug !== promptSlug) {
            return prompt;
          }

          return normalizePrompt({ ...prompt, ...patch, slug: promptSlug });
        }),
      }));
    },
    [updateSetting]
  );

  const deletePrompt = useCallback(
    (promptSlug) => {
      if (!promptSlug || isPresetPromptSlug(promptSlug)) {
        return;
      }

      updateSetting((prev) => ({
        ...removePromptReferences(prev || {}, promptSlug),
        prompts: (prev?.prompts || []).filter(
          (prompt) => normalizePrompt(prompt).slug !== promptSlug
        ),
      }));
    },
    [updateSetting]
  );

  const copyPrompt = useCallback(
    (sourcePrompt, sourcePromptName = "") =>
      addPrompt(sourcePrompt, sourcePromptName),
    [addPrompt]
  );

  return {
    prompts,
    customPrompts,
    addPrompt,
    updatePrompt,
    deletePrompt,
    copyPrompt,
    isPresetPromptSlug,
  };
}

export function usePromptItem(promptSlug) {
  const {
    prompts,
    updatePrompt,
    deletePrompt,
    copyPrompt,
    isPresetPromptSlug,
  } = usePromptList();

  const prompt = useMemo(
    () => prompts.find((item) => normalizePrompt(item).slug === promptSlug),
    [prompts, promptSlug]
  );

  return {
    prompt,
    updatePrompt,
    deletePrompt,
    copyPrompt,
    isPreset: isPresetPromptSlug(promptSlug),
  };
}
