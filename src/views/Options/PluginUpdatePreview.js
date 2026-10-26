import { Alert, Box, Stack, Typography } from "@mui/material";
import { useI18n } from "../../hooks/I18n";

export default function PluginUpdatePreview({ preview }) {
  const i18n = useI18n();
  const sourceLabel = (value) =>
    value === "file"
      ? i18n("plugin_local_zip")
      : value === "directory"
        ? i18n("plugin_local_folder")
        : value;
  const fieldDescription = (field) =>
    field
      ? [
          `${i18n("plugin_diff_type")}: ${field.type}`,
          `${i18n("plugin_diff_secret")}: ${i18n(field.secret ? "plugin_diff_yes" : "plugin_diff_no")}`,
          `${i18n("plugin_diff_required")}: ${i18n(field.required ? "plugin_diff_yes" : "plugin_diff_no")}`,
          ...(field.min !== undefined || field.max !== undefined
            ? [`${field.min ?? "−∞"} … ${field.max ?? "∞"}`]
            : []),
        ].join(" · ")
      : "—";
  const changes = (key, values) =>
    values && (
      <Box key={key} sx={{ overflowWrap: "anywhere" }}>
        <Typography component="span" variant="subtitle2">
          {i18n(`plugin_diff_${key}`)}
        </Typography>
        {"： "}
        {["added", "removed", "changed"].map((action) =>
          values[action]?.length ? (
            <Typography
              key={action}
              component="span"
              variant="body2"
              sx={{ mr: 1 }}
            >
              {i18n(`plugin_diff_${action}`)}: {values[action].join(", ")}
            </Typography>
          ) : null
        )}
        {!Object.values(values).some((items) => items.length) && (
          <Typography component="span" variant="body2">
            {i18n("plugin_diff_unchanged")}
          </Typography>
        )}
      </Box>
    );
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{i18n("plugin_diff_title")}</Typography>
      {preview.source && (
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          {i18n("plugin_source")} {sourceLabel(preview.source[0])} →{" "}
          {sourceLabel(preview.source[1])}
        </Typography>
      )}
      {preview.incomplete ? (
        <Alert severity="warning">{i18n("plugin_diff_incomplete")}</Alert>
      ) : (
        <>
          {[
            "network",
            "endpoints",
            "services",
            "capabilities",
            "fields",
            "models",
          ].map((key) => changes(key, preview[key]))}
          {preview.fieldDetails?.map((field) => (
            <Typography
              key={field.key}
              variant="body2"
              sx={{ overflowWrap: "anywhere" }}
            >
              {field.key}: {fieldDescription(field.before)} →{" "}
              {fieldDescription(field.after)}
            </Typography>
          ))}
          {!!preview.skipped?.length && (
            <Alert severity="warning">
              {i18n("plugin_diff_skipped")}: {preview.skipped.join(", ")}
            </Alert>
          )}
          {preview.prompts?.map((prompt) => (
            <Box component="details" key={prompt.slot}>
              <Box component="summary" sx={{ cursor: "pointer" }}>
                {i18n("plugin_diff_prompts")}: {prompt.slot}
              </Box>
              {["before", "after"].map((side) => (
                <Box key={side}>
                  <Typography variant="caption">
                    {i18n(`plugin_diff_${side}`)}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      maxHeight: 240,
                      overflow: "auto",
                    }}
                  >
                    {prompt[side]}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
        </>
      )}
    </Stack>
  );
}
