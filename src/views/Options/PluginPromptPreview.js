import { useI18n } from "../../hooks/I18n";
import { useAlert } from "../../hooks/Alert";
import {
  Alert,
  Box,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ContentCopyIcon } from "../../components/icons";
import { getPromptDisplayName } from "../../config/prompt";
import { defaultPromptCapabilities } from "../../providers/defaultPrompts";

export default function PluginPromptPreview({ service }) {
  const i18n = useI18n();
  const alert = useAlert();
  const slots = [
    ["nobatch", i18n("plugin_single_sentence_translation_prompt")],
    ["batch", i18n("batch_prompt")],
    ["dictionary", i18n("prompt_category_dictionary")],
    ["subtitle", i18n("prompt_category_subtitle")],
    ["vlm", i18n("plugin_image_recognition_prompt")],
    ...Object.entries(defaultPromptCapabilities)
      .filter(
        ([slot]) =>
          !["nobatch", "batch", "dictionary", "subtitle", "vlm"].includes(slot)
      )
      .map(([slot, capability]) => [
        slot,
        i18n(`capability_${capability}`, slot),
      ]),
  ];
  const prompts = slots.filter(([slot]) => service.defaultPrompts?.[slot]);
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {i18n(
          "plugin_default_templates_in_the_current_package_existing_instances_may_use_di"
        )}
      </Typography>
      {!prompts.length && (
        <Alert severity="info">
          {i18n("plugin_this_plugin_does_not_expose_default_prompts")}
        </Alert>
      )}
      {prompts.flatMap(([slot, label]) =>
        service.defaultPrompts[slot].map((prompt, index) => {
          return (
            <Stack key={`${slot}-${prompt.id}`} spacing={1}>
              <Typography variant="subtitle2">
                {label} · {getPromptDisplayName(prompt, i18n)}
                {index === 0
                  ? ` · ${i18n("default_prompt", "默认提示词")}`
                  : ""}
              </Typography>
              {prompt.description && (
                <Typography variant="body2" color="text.secondary">
                  {prompt.descriptionI18n?.[i18n.language] ??
                    prompt.descriptionI18n?.en ??
                    prompt.description}
                </Typography>
              )}
              {prompt.protocol && (
                <Typography variant="caption">
                  {i18n("plugin_prompt_protocol", "解析协议")}:{" "}
                  {prompt.protocol}
                </Typography>
              )}
              {[
                ["systemPrompt", i18n("plugin_system_prompt")],
                ["userPrompt", i18n("plugin_user_prompt")],
              ].map(([key, fieldLabel]) =>
                prompt[key] !== undefined ? (
                  <Box key={key} sx={{ position: "relative" }}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      maxRows={8}
                      label={fieldLabel}
                      value={prompt[key]}
                      InputProps={{ readOnly: true }}
                    />
                    <Tooltip title={i18n("plugin_copy_prompt")}>
                      <IconButton
                        size="small"
                        aria-label={i18n("plugin_copy_prompt")}
                        sx={{ position: "absolute", top: 8, right: 8 }}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(prompt[key]);
                            alert.success(
                              i18n(
                                "plugin_copied_create_a_prompt_in_prompt_management"
                              )
                            );
                          } catch {
                            alert.error(
                              i18n(
                                "plugin_copy_failed_copy_manually_from_the_read_only_field"
                              )
                            );
                          }
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : null
              )}
            </Stack>
          );
        })
      )}
    </Stack>
  );
}
