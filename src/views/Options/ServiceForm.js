import ValidationInput from "../../hooks/ValidationInput";
import { DEFAULT_HTTP_TIMEOUT } from "../../config/apiConstants";
import {
  isLocalAsrService,
  declaredAsrTimestampSupport,
  asrChunkDurationSeconds,
} from "../../subtitle/asr/timing";
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
  asrMaxDurationSeconds,
  DEFAULT_ASR_MAX_DURATION_SECONDS,
} from "../../providers/asrLimits";
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

export function AsrDurationSetting({ api, onChange, onTimestampChange }) {
  const i18n = useI18n();
  if (!enabledApiCapabilities(api).includes("transcribe")) return null;
  const value =
    api.asrMaxDurationSeconds === undefined
      ? DEFAULT_ASR_MAX_DURATION_SECONDS
      : api.asrMaxDurationSeconds;
  let invalid = false;
  try {
    asrMaxDurationSeconds(value);
  } catch {
    invalid = true;
  }
  const local = isLocalAsrService(api);
  const declared = declaredAsrTimestampSupport(api);
  const support = local
    ? declared === true
      ? "supported"
      : declared === false
        ? "unsupported"
        : "unknown"
    : api.asrTimestampSupport || "auto";
  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          size="small"
          fullWidth
          type="number"
          name="asrMaxDurationSeconds"
          label={i18n("service_asr_max_duration")}
          value={value ?? ""}
          error={invalid}
          helperText={i18n("service_asr_max_duration_hint")}
          inputProps={{ min: 1, max: 300, step: 1 }}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? "" : Number(event.target.value)
            )
          }
        />
        <TextField
          select
          fullWidth
          size="small"
          name="asrTimestampSupport"
          label={i18n("service_asr_timestamp_support")}
          value={support}
          disabled={local}
          SelectProps={{ native: true }}
          inputProps={{ "aria-label": i18n("service_asr_timestamp_support") }}
          helperText={
            local
              ? i18n("service_asr_timestamp_local")
              : i18n("service_asr_timestamp_external")
          }
          onChange={(event) => {
            if (!local) onTimestampChange?.(event.target.value);
          }}
        >
          {!local && (
            <option value="auto">{i18n("service_asr_timestamp_auto")}</option>
          )}
          <option value="supported">
            {i18n("service_asr_timestamp_supported")}
          </option>
          <option value="unsupported">
            {i18n("service_asr_timestamp_unsupported")}
          </option>
          {local && support === "unknown" && (
            <option value="unknown">
              {i18n("service_asr_timestamp_unknown")}
            </option>
          )}
        </TextField>
      </Stack>
      {!invalid && (
        <Typography variant="caption">
          {i18n("service_asr_effective_limit").replace(
            "{seconds}",
            String(asrChunkDurationSeconds(api))
          )}
        </Typography>
      )}
    </Stack>
  );
}

export function ServiceTimeoutSetting({ api, onChange }) {
  const i18n = useI18n();
  return (
    <ValidationInput
      validateOnBlur={false}
      size="small"
      fullWidth
      label={i18n("http_timeout")}
      type="number"
      name="httpTimeout"
      value={api.httpTimeout ?? DEFAULT_HTTP_TIMEOUT}
      min={1}
      max={600}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
