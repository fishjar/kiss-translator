import { useI18n } from "../../hooks/I18n";
import { Alert, TextField, MenuItem, Chip, Stack } from "@mui/material";
import {
  supportedApiCapabilities,
  enabledApiCapabilities,
} from "../../config/serviceSelection";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";

/** Users narrow the service contract; this control can never add a handler. */
export default function CapabilityOptions({ api, onChange }) {
  const i18n = useI18n();
  const supported = supportedApiCapabilities(api);
  const enabled = enabledApiCapabilities(api);
  return (
    <Stack spacing={1}>
      <TextField
        select
        fullWidth
        size="small"
        name="enabledCapabilities"
        label={i18n("plugin_enabled_capabilities")}
        value={enabled}
        disabled={!supported.length}
        SelectProps={{
          multiple: true,
          displayEmpty: true,
          renderValue: (selected) =>
            selected.length ? (
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75}>
                {selected.map((name) => (
                  <Chip
                    key={name}
                    size="small"
                    label={i18n(capabilityLabelKeys[name], name)}
                  />
                ))}
              </Stack>
            ) : (
              i18n("plugin_no_capabilities_enabled")
            ),
        }}
        InputLabelProps={{ shrink: true }}
        onChange={(event) =>
          onChange(
            typeof event.target.value === "string"
              ? event.target.value.split(",")
              : event.target.value
          )
        }
      >
        {supported.map((name) => (
          <MenuItem key={name} value={name}>
            {i18n(capabilityLabelKeys[name], name)}
          </MenuItem>
        ))}
      </TextField>
      {!supported.length ? (
        <Alert severity="info">
          {i18n("plugin_select_a_supported_model_and_runtime_backend_first")}
        </Alert>
      ) : (
        !enabled.length && (
          <Alert severity="info">
            {i18n(
              "plugin_no_capabilities_enabled_this_instance_will_not_appear_in_scenario_cand"
            )}
          </Alert>
        )
      )}
    </Stack>
  );
}
