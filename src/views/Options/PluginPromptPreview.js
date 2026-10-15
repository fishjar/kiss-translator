import { useI18n } from "../../hooks/I18n";
import { useState } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";

export default function PluginPromptPreview({ service }) {
  const i18n = useI18n();
  const slots = [
    ["nobatch", i18n("plugin_single_sentence_translation_prompt")],
    ["batch", i18n("batch_prompt")],
    ["dictionary", i18n("prompt_category_dictionary")],
    ["subtitle", i18n("prompt_category_subtitle")],
    ["vlm", i18n("plugin_image_recognition_prompt")],
  ];
  const [copyMessage, setCopyMessage] = useState("");
  const prompts = slots.filter(([slot]) => service.defaultPrompts?.[slot]);
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {i18n(
          "plugin_default_templates_in_the_current_package_existing_instances_may_use_di"
        )}
      </Typography>
      {copyMessage && <Alert severity="info">{copyMessage}</Alert>}
      {!prompts.length && (
        <Alert severity="info">
          {i18n("plugin_this_plugin_does_not_expose_default_prompts")}
        </Alert>
      )}
      {prompts.map(([slot, label]) => {
        const prompt = service.defaultPrompts[slot];
        return (
          <Stack key={slot} spacing={1}>
            <Typography variant="subtitle2">{label}</Typography>
            {[
              ["systemPrompt", i18n("plugin_system_prompt_read_only")],
              ["userPrompt", i18n("plugin_user_prompt_read_only")],
            ].map(([key, fieldLabel]) =>
              prompt[key] !== undefined ? (
                <TextField
                  key={key}
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={8}
                  label={fieldLabel}
                  value={prompt[key]}
                  InputProps={{ readOnly: true }}
                />
              ) : null
            )}
            <Button
              sx={{ alignSelf: "flex-start" }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    [prompt.systemPrompt, prompt.userPrompt]
                      .filter((text) => text !== undefined)
                      .join("\n\n")
                  );
                  setCopyMessage(
                    i18n("plugin_copied_create_a_prompt_in_prompt_management")
                  );
                } catch {
                  setCopyMessage(
                    i18n(
                      "plugin_copy_failed_copy_manually_from_the_read_only_field"
                    )
                  );
                }
              }}
            >
              {i18n("plugin_copy_prompt")}
            </Button>
          </Stack>
        );
      })}
    </Stack>
  );
}
