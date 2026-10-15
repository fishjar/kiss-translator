import { localizeServiceName } from "../../providers/localization";
import { useProviderI18n } from "../../hooks/ProviderI18n";
import {
  Box,
  Stack,
  Typography,
  FormControlLabel,
  Switch,
  TextField,
  MenuItem,
} from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import { useSetting } from "../../hooks/Setting";
import {
  enabledApiCapabilities,
  supportedApiFeature,
  normalizeApiCapabilities,
} from "../../config/serviceSelection";

/** Both implementations keep test inputs and their actions in a separate card. */
export function ServiceTestCard({ children, actions }) {
  const i18n = useI18n();
  return (
    <Stack className="kt-service-card kt-service-test" spacing={2}>
      <Typography component="h3" variant="subtitle1" fontWeight={700}>
        {i18n("plugin_capability_test")}
      </Typography>
      {children}
      <Stack
        className="kt-service-test__actions"
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
      >
        {actions}
      </Stack>
    </Stack>
  );
}

export function ServiceFormHeader({ api, onChange }) {
  const providerText = useProviderI18n();
  const i18n = useI18n();
  const { setting } = useSetting();
  const source = api.provider?.source?.external
    ? i18n("plugin_external_plugin")
    : {
        builtin: i18n("api_source_type_builtin"),
        local: i18n("api_source_type_local"),
        network: i18n("api_source_type_network"),
      }[normalizeApiCapabilities(api).sourceType];
  const type = api.provider?.source?.external
    ? api.provider.source.pluginName ||
      setting?.providerPlugins?.find(
        (plugin) => plugin.pluginId === api.provider.source.pluginId
      )?.name ||
      api.provider.source.pluginId
    : api.apiType;
  return (
    <Stack
      className="kt-api-detail__header"
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={2}
      useFlexGap
      flexWrap="wrap"
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h2"
          sx={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.3,
            overflowWrap: "anywhere",
          }}
        >
          {localizeServiceName(api, providerText) || type}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }}>
          {source} · {providerText(type, api.provider?.source?.pluginNameI18n)}
        </Typography>
      </Box>
      <Stack
        className="kt-api-detail__status-actions"
        direction="row"
        alignItems="center"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
      >
        <FormControlLabel
          label={i18n("is_disabled", "是否禁用")}
          control={
            <Switch
              size="small"
              name="isDisabled"
              checked={Boolean(api.isDisabled)}
              onChange={(_, checked) => onChange("isDisabled", checked)}
            />
          }
        />
        <FormControlLabel
          label={i18n("is_pinned", "是否置顶")}
          control={
            <Switch
              size="small"
              name="isPinned"
              checked={api.sortOrder === -1}
              disabled={api.isDisabled}
              onChange={(_, checked) => onChange("sortOrder", checked ? -1 : 0)}
            />
          }
        />
      </Stack>
    </Stack>
  );
}

export function BooleanServiceOption({ name, label, value, onChange }) {
  const i18n = useI18n();
  return (
    <TextField
      select
      fullWidth
      size="small"
      name={name}
      label={label}
      value={Boolean(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      <MenuItem value={false}>{i18n("disable", "禁用")}</MenuItem>
      <MenuItem value={true}>{i18n("enable", "启用")}</MenuItem>
    </TextField>
  );
}

export function serviceTransportFeatures(api) {
  const enabled = enabledApiCapabilities(api);
  return {
    batch:
      enabled.includes("translate") &&
      Boolean(supportedApiFeature(api, "translate")?.batch?.supported),
    stream: enabled.some((name) =>
      supportedApiFeature(api, name)?.outputModes?.includes("stream")
    ),
  };
}
