import { Chip, Tooltip } from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import { freeTierLabelKeys, isFreeTier } from "../../providers/freeTier";

export default function PluginFreeBadge({ freeTier }) {
  const i18n = useI18n();
  return isFreeTier(freeTier) ? (
    <Tooltip title={i18n("plugin_free_hint")}>
      <Chip
        component="span"
        size="small"
        color="success"
        sx={{ ml: 1, verticalAlign: "middle" }}
        label={i18n(freeTierLabelKeys[freeTier])}
      />
    </Tooltip>
  ) : null;
}
