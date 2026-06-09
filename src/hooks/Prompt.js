import { useCallback, useMemo } from "react";
import { getAllPrompts, isPresetPromptId, normalizePrompt } from "../config";
import { useSetting } from "./Setting";

function createPromptId() {
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
        id: createPromptId(),
        // 自定义提示词副本要保存当次生成的显示名称，不继承预设提示词的 i18n key。
        nameKey: "",
        name: createPromptName(source, sourcePromptName),
      };

      updateSetting((prev) => ({
        ...prev,
        prompts: [...(prev?.prompts || []), prompt],
      }));

      return prompt.id;
    },
    [updateSetting]
  );

  const updatePrompt = useCallback(
    (promptId, updateData) => {
      if (!promptId || isPresetPromptId(promptId)) {
        return;
      }

      const patch = normalizePrompt({ ...updateData, id: promptId });
      updateSetting((prev) => ({
        ...prev,
        prompts: (prev?.prompts || []).map((prompt) =>
          prompt.id === promptId
            ? { ...prompt, ...patch, id: promptId }
            : prompt
        ),
      }));
    },
    [updateSetting]
  );

  const deletePrompt = useCallback(
    (promptId) => {
      if (!promptId || isPresetPromptId(promptId)) {
        return;
      }

      updateSetting((prev) => ({
        ...prev,
        prompts: (prev?.prompts || []).filter(
          (prompt) => prompt.id !== promptId
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
    isPresetPromptId,
  };
}

export function usePromptItem(promptId) {
  const { prompts, updatePrompt, deletePrompt, copyPrompt, isPresetPromptId } =
    usePromptList();

  const prompt = useMemo(
    () => prompts.find((item) => item.id === promptId),
    [prompts, promptId]
  );

  return {
    prompt,
    updatePrompt,
    deletePrompt,
    copyPrompt,
    isPreset: isPresetPromptId(promptId),
  };
}
