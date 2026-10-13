import {
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_VLM,
  getPromptDisplayName,
} from "../../config";
import { SettingsSelect } from "../Options/SettingsCard";

export default function ScenePromptSelect({
  i18n,
  prompts = [],
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

  const translationPrompts = (Array.isArray(prompts) ? prompts : []).filter(
    (prompt) =>
      category
        ? prompt?.category === category
        : prompt?.category !== PROMPT_CATEGORY_DICTIONARY &&
          prompt?.category !== PROMPT_CATEGORY_VLM
  );

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
      value={value || ""}
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
