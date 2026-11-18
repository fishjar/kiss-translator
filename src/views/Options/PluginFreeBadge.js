import { Chip, Tooltip } from "@mui/material";
import { useI18n } from "../../hooks/I18n";

export default function PluginFreeBadge({ isFree }) {
  const i18n = useI18n();
  return isFree === true ? (
    <Tooltip title={i18n("plugin_free_hint")}>
      <Chip
        component="span"
        size="small"
        color="success"
        sx={{ ml: 1, verticalAlign: "middle" }}
        label={i18n("plugin_free")}
      />
    </Tooltip>
  ) : null;
}
