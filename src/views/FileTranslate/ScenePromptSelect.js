import { useEffect, useRef } from "react";
import { supportsServiceFeature } from "../../providers/features";
import {
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_USER,
  PROMPT_CATEGORY_SUBTITLE,
  getPromptDisplayName,
} from "../../config";
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
  const translationPrompts = (Array.isArray(prompts) ? prompts : []).filter(
    (prompt) =>
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
