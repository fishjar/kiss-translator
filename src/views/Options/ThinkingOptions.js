import { Fragment } from "react";
import { useProviderI18n } from "../../hooks/ProviderI18n";
import { Box, MenuItem, TextField } from "@mui/material";
import { useI18n } from "../../hooks/I18n";

export default function ThinkingOptions({
  inline = false,
  mode,
  effort,
  efforts,
  onChange,
  helperText,
  error = false,
  showEffort = false,
  allowDefaultEffort = true,
}) {
  const Container = inline ? Fragment : Box;
  const i18n = useI18n();
  const providerText = useProviderI18n();
  return (
    <Container
      {...(!inline && {
        sx: {
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 2,
          "@container api-detail (min-width: 480px)": {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          },
          "& > *": { minWidth: 0 },
        },
      })}
    >
      <TextField
        select
        fullWidth
        size="small"
        name="thinkingMode"
        value={mode}
        label={i18n("thinking_mode", "思考模式")}
        onChange={(event) => onChange("thinkingMode", event.target.value)}
        error={error}
        helperText={helperText}
      >
        <MenuItem value="auto">
          {i18n("thinking_mode_default", "接口默认")}
        </MenuItem>
        <MenuItem value="enabled">
          {i18n("thinking_mode_enabled", "开启思考")}
        </MenuItem>
        <MenuItem value="disabled">
          {i18n("thinking_mode_disabled", "关闭思考")}
        </MenuItem>
      </TextField>
      {(mode === "enabled" || showEffort) && efforts && (
        <TextField
          select
          fullWidth
          size="small"
          name="thinkingEffort"
          value={effort}
          label={i18n("thinking_effort", "思考强度")}
          onChange={(event) => onChange("thinkingEffort", event.target.value)}
        >
          {efforts
            .filter((option) => option.value !== "_default")
            .map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {providerText(option.label, option.labelI18n)}
              </MenuItem>
            ))}
          {allowDefaultEffort && (
            <MenuItem value="_default">
              {i18n("thinking_effort_default", "接口默认")}
            </MenuItem>
          )}
        </TextField>
      )}
    </Container>
  );
}
