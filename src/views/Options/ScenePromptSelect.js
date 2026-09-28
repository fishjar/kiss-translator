import {
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_CATEGORY_SUBTITLE,
  getPromptDisplayName,
} from "../../config";
import { usePromptList } from "../../hooks/Prompt";
import { useI18n } from "../../hooks/I18n";
import { SettingsSelect } from "./SettingsCard";

export default function ScenePromptSelect({
  value,
  onChange,
  disabled = false,
  label,
  fullWidth = false,
  hiddenLabel,
  sx,
  variant,
  ...rest
}) {
  const i18n = useI18n();
  const { prompts } = usePromptList();
  const displayLabel = label || i18n("translation_prompt", "翻译提示词");
  const isHiddenLabel = hiddenLabel !== undefined ? hiddenLabel : !fullWidth;

  const translationPrompts = (Array.isArray(prompts) ? prompts : []).filter(
    (prompt) => prompt?.category !== PROMPT_CATEGORY_DICTIONARY
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
