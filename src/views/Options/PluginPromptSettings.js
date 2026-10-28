import { Fragment } from "react";
import { useI18n } from "../../hooks/I18n";
import { MenuItem, Stack, TextField } from "@mui/material";
import {
  getBatchPromptOptions,
  getNobatchPromptOptions,
  getDictionaryPromptOptions,
  getSubtitlePromptOptions,
  getVlmPromptOptions,
  getPromptDisplayName,
} from "../../config/prompt";
import { enabledApiCapabilities } from "../../config/serviceSelection";
import { getPluginPromptOptions } from "../../providers/defaultPrompts";

export default function PluginPromptSettings({
  api,
  prompts,
  onChange,
  inline = false,
}) {
  const Container = inline ? Fragment : Stack;
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
  const visibleSlots = slots.filter(([cap]) => enabled.includes(cap));
  if (!visibleSlots.length) return null;
  return (
    <Container {...(!inline && { spacing: 2 })}>
      {visibleSlots.map(([, slot, key, label, options]) => {
        const slug = api[key] || "";
        const choices = [
          ...getPluginPromptOptions(api, slot),
          ...options(prompts),
        ];
        const unavailable = Boolean(
          slug && !choices.some((item) => item.slug === slug)
        );
        return (
          <Stack key={key} spacing={1}>
            <TextField
              select
              fullWidth
              size="small"
              name={key}
              label={label}
              value={unavailable ? "" : slug}
              helperText={
                unavailable ? i18n("plugin_prompt_unavailable") : undefined
              }
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
                renderValue: (value) =>
                  value
                    ? getPromptDisplayName(
                        choices.find((item) => item.slug === value) || {
                          slug: value,
                        },
                        i18n
                      )
                    : i18n("plugin_plugin_default"),
              }}
              onChange={(event) => onChange(key, event.target.value)}
            >
              <MenuItem
                value=""
                disabled={!api.provider.defaultPrompts?.[slot]?.length}
              >
                {i18n("plugin_plugin_default")}
              </MenuItem>
              {choices.map((item) => (
                <MenuItem key={item.slug} value={item.slug}>
                  {getPromptDisplayName(item, i18n)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        );
      })}
    </Container>
  );
}
