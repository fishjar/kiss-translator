import PluginUpdatePreview from "./PluginUpdatePreview";
import { previewServiceUpdate } from "../../providers/updatePreview";
import { pluginCompatibilityError } from "../../providers/compatibility";
import { isServiceUpgradeAvailable } from "../../providers/upgrade";
import { commitServiceUpgrade } from "../../providers/upgradeStorage";
import { useI18n } from "../../hooks/I18n";
import { useSetting } from "../../hooks/Setting";
import { useRef, useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useProviderPackages } from "../../hooks/ProviderPackages";

export function ServiceUpgradeAction({
  api,
  dirty = false,
  disabled = false,
  onUpgraded,
}) {
  const i18n = useI18n();
  const { packages } = useProviderPackages();
  const { reloadSetting } = useSetting();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const pack = packages.find(
    (item) => item.id === api.provider.source?.pluginId
  );
  if (!isServiceUpgradeAvailable(api, pack)) return null;
  const incompatible = pluginCompatibilityError(pack.manifest);
  if (incompatible)
    return <Alert severity="warning">{incompatible.message}</Alert>;
  const service = pack.manifest.services.find(
    (item) => item.id === api.provider.source.serviceId
  );
  const preview = previewServiceUpdate(api, pack.manifest, service);
  return (
    <Stack spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}
      <PluginUpdatePreview preview={preview} />
      {dirty && (
        <Typography variant="caption">
          {i18n("plugin_save_changes_first")}
        </Typography>
      )}
      <Button
        disabled={dirty || disabled || busy}
        onClick={async () => {
          if (pending.current || dirty || disabled) return;
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            await commitServiceUpgrade(api.apiSlug, pack);
            await reloadSetting();
            onUpgraded?.();
          } catch (err) {
            setError(err.message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        {i18n("plugin_upgrade_to_version").replace(
          "{0}",
          () => pack.manifest.version
        )}
      </Button>
    </Stack>
  );
}
