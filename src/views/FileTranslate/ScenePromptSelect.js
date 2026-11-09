import { useEffect, useRef } from "react";
import { supportsServiceFeature } from "../../providers/features";
import {
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_USER,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_VLM,
  getVlmPromptOptions,
  getPromptDisplayName,
} from "../../config";
import { getPluginPromptOptions } from "../../providers/defaultPrompts";
import { SettingsSelect } from "../Options/SettingsCard";

export default function ScenePromptSelect({
  i18n,
  prompts = [],
  scene,
  apis = [],
  value,
  onChange,
  disabled = false,
  category,
  label,
  fullWidth = false,
  hiddenLabel,
  sx,
  variant,
  recognitionApi,
  ...rest
}) {
  const displayLabel = label || i18n("translation_prompt", "翻译提示词");
  const isHiddenLabel = hiddenLabel !== undefined ? hiddenLabel : !fullWidth;

  const selectedSlugs = scene?.apiSlugs || [scene?.apiSlug || ""];
  const services = selectedSlugs.map((slug) =>
    apis.find((api) => api.apiSlug === slug)
  );
  const knownServices =
    selectedSlugs.length > 0 &&
    selectedSlugs.every(
      (slug, index) => slug && slug !== "*" && services[index]
    );
  const allowBatch =
    !knownServices ||
    services.some((api) => supportsServiceFeature(api, "batch"));
  const translationApi = services.length === 1 ? services[0] : undefined;
  const translationPrompts =
    category === PROMPT_CATEGORY_VLM
      ? getVlmPromptOptions(prompts, recognitionApi)
      : [
          ...(!category
            ? [
                ...getPluginPromptOptions(translationApi, "nobatch").map(
                  (p) => ({ ...p, category: PROMPT_CATEGORY_USER })
                ),
                ...getPluginPromptOptions(translationApi, "batch").map((p) => ({
                  ...p,
                  category: PROMPT_CATEGORY_BATCH_SYSTEM,
                })),
              ]
            : []),
          ...(Array.isArray(prompts) ? prompts : []),
        ].filter((prompt) =>
          category
            ? prompt?.category === category
            : prompt?.category === PROMPT_CATEGORY_USER ||
              (prompt?.category === PROMPT_CATEGORY_BATCH_SYSTEM && allowBatch)
        );
  const selectionKey = JSON.stringify(selectedSlugs);
  const previousSelection = useRef(selectionKey);
  useEffect(() => {
    const changed = previousSelection.current !== selectionKey;
    previousSelection.current = selectionKey;
    if (
      changed &&
      !category &&
      !disabled &&
      knownServices &&
      !allowBatch &&
      prompts.some(
        (prompt) =>
          prompt.slug === value &&
          prompt.category === PROMPT_CATEGORY_BATCH_SYSTEM
      )
    ) {
      onChange?.("");
    }
  }, [
    selectionKey,
    category,
    disabled,
    knownServices,
    allowBatch,
    prompts,
    value,
    onChange,
  ]);

  const getLabel = (prompt) => {
    const name = getPromptDisplayName(prompt, i18n);
    if (prompt.category === PROMPT_CATEGORY_BATCH_SYSTEM) {
      return `[聚合] ${name}`;
    }
    if (prompt.category === PROMPT_CATEGORY_SUBTITLE) {
      return `[字幕] ${name}`;
    }
    return name;
  };

  return (
    <SettingsSelect
      fullWidth={fullWidth}
      hiddenLabel={isHiddenLabel}
      label={displayLabel}
      value={
        translationPrompts.some((prompt) => prompt.slug === value) ? value : ""
      }
      disabled={disabled}
      helperText={
        value && !translationPrompts.some((prompt) => prompt.slug === value)
          ? i18n("plugin_prompt_unavailable", "原提示词不可用，已跟随默认")
          : undefined
      }
      onChange={onChange}
      sx={sx}
      variant={variant}
      {...rest}
      options={[
        { value: "", label: i18n("scene_prompt_follow_api", "跟随接口") },
        ...translationPrompts.map((prompt) => ({
          value: prompt.slug,
          label: getLabel(prompt),
        })),
      ]}
    />
  );
}
