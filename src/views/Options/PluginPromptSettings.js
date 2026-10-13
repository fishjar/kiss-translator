import { useI18n } from "../../hooks/I18n";
import { MenuItem, Stack, TextField } from "@mui/material";
import {
  getBatchPromptOptions,
  getNobatchPromptOptions,
  getDictionaryPromptOptions,
  getSubtitlePromptOptions,
  getVlmPromptOptions,
} from "../../config/prompt";
import { enabledApiCapabilities } from "../../config/serviceSelection";

export default function PluginPromptSettings({ api, prompts, onChange }) {
  const i18n = useI18n();
  const enabled = enabledApiCapabilities(api);
  const slots = [
    [
      "translate",
      api.useBatchFetch ? "batch" : "nobatch",
      api.useBatchFetch ? "batchPromptSlug" : "nobatchPromptSlug",
      api.useBatchFetch
        ? i18n("batch_prompt")
        : i18n("plugin_single_sentence_translation_prompt"),
      api.useBatchFetch ? getBatchPromptOptions : getNobatchPromptOptions,
    ],
    [
      "dictionary",
      "dictionary",
      "dictPromptSlug",
      i18n("prompt_category_dictionary"),
      getDictionaryPromptOptions,
    ],
    [
      "segmentSubtitle",
      "subtitle",
      "subtitlePromptSlug",
      i18n("prompt_category_subtitle"),
      getSubtitlePromptOptions,
    ],
    [
      "parseImage",
      "vlm",
      "vlmPromptSlug",
      i18n("plugin_image_recognition_prompt"),
      getVlmPromptOptions,
    ],
  ];
  return (
    <Stack spacing={2}>
      {slots
        .filter(([cap]) => enabled.includes(cap))
        .map(([, slot, key, label, options]) => {
          const slug = api[key] || "";
          return (
            <Stack key={key} spacing={1}>
              <TextField
                select
                fullWidth
                size="small"
                name={key}
                label={label}
                value={slug}
                InputLabelProps={{ shrink: true }}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (value) =>
                    value
                      ? options(prompts).find((item) => item.slug === value)
                          ?.name ||
                        i18n(
                          options(prompts).find((item) => item.slug === value)
                            ?.nameKey,
                          value
                        )
                      : i18n("plugin_plugin_default"),
                }}
                onChange={(event) => onChange(key, event.target.value)}
              >
                <MenuItem
                  value=""
                  disabled={!api.provider.defaultPrompts?.[slot]}
                >
                  {i18n("plugin_plugin_default")}
                </MenuItem>
                {options(prompts).map((item) => (
                  <MenuItem key={item.slug} value={item.slug}>
                    {item.name || i18n(item.nameKey, item.slug)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          );
        })}
    </Stack>
  );
}
