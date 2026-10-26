import PluginUpdatePreview from "./PluginUpdatePreview";
import { previewServiceUpdate } from "../../providers/updatePreview";
import { pluginCompatibilityError } from "../../providers/compatibility";
import { useI18n } from "../../hooks/I18n";
import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
} from "@mui/material";
import { useProviderPackages } from "../../hooks/ProviderPackages";
import { DEFAULT_API_SETTING } from "../../config/api";
import {
  createServiceInstance,
  mergeSettingFields,
} from "../../providers/instances";
import {
  copyCompatibleConfig,
  serviceReferences,
} from "../../providers/upgrade";
import {
  enabledApiCapabilities,
  supportedApiCapabilities,
} from "../../config/serviceSelection";
import { getRules, getSettingWithDefault } from "../../libs/storage";
import { commitServiceReplacement } from "../../providers/upgradeStorage";

export function ServiceUpgradeAction({ api, onCreated }) {
  const i18n = useI18n();
  const { packages } = useProviderPackages();
  const [error, setError] = useState("");
  const pack = packages.find(
    (item) => item.id === api.provider.source?.pluginId
  );
  const service = pack?.manifest.services.find(
    (item) => item.id === api.provider.source.serviceId
  );
  const previousVersion =
    api.provider.source?.version?.split(".").map(Number) || [];
  const versionChange =
    pack?.manifest.version
      .split(".")
      .map((value, index) => Number(value) - previousVersion[index])
      .find((value) => value !== 0) || 0;
  if (!service || versionChange <= 0) return null;
  const incompatible = pluginCompatibilityError(pack.manifest);
  if (incompatible)
    return <Alert severity="warning">{incompatible.message}</Alert>;
  const preview = previewServiceUpdate(api, pack.manifest, service);
  return (
    <Stack spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}
      <PluginUpdatePreview preview={preview} />
      <Button
        onClick={async () => {
          try {
            const copied = copyCompatibleConfig(
              api,
              mergeSettingFields(pack.manifest.sharedSettings, service.settings)
            );
            const instance = {
              ...DEFAULT_API_SETTING,
              ...createServiceInstance(
                pack.manifest,
                service.id,
                pack.implementations[service.id],
                copied.values,
                `Plugin_${crypto.randomUUID()}`,
                pack.resources
              ),
            };
            instance.enabledCapabilities = enabledApiCapabilities(api).filter(
              (name) => supportedApiCapabilities(instance).includes(name)
            );
            // Explicit user choices survive upgrades; default transport settings belong to the new definition.
            if (api.useStream !== undefined) instance.useStream = api.useStream;
            for (const key of [
              "useBatchFetch",
              "batchPromptSlug",
              "nobatchPromptSlug",
              "dictPromptSlug",
              "subtitlePromptSlug",
              "vlmPromptSlug",
            ])
              if (api[key] !== undefined) instance[key] = api[key];
            await onCreated(instance, api.apiSlug);
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        {i18n("plugin_create_upgraded_instance_from_version").replace(
          "{0}",
          () => pack.manifest.version
        )}
      </Button>
    </Stack>
  );
}

export function ServiceReplacement({ upgrade, tested, onComplete }) {
  const i18n = useI18n();
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Stack spacing={1}>
      <Alert severity="info">
        {i18n(
          "plugin_upgraded_instance_created"
        )}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Button
        disabled={busy}
        onClick={async () => {
          try {
            const current = await getSettingWithDefault();
            const refs = serviceReferences(
              current,
              (await getRules()) || [],
              upgrade.oldSlug,
              current.transApis.find((api) => api.apiSlug === upgrade.newSlug)
            );
            setPreview(refs);
            setSelected(refs.map((entry) => entry.label));
            setError("");
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        {i18n("plugin_preview_scenario_references")}
      </Button>
      {preview?.map((entry) => (
        <FormControlLabel
          key={entry.label}
          label={`${entry.label} → ${entry.capability}`}
          control={
            <Checkbox
              checked={selected.includes(entry.label)}
              onChange={(event) =>
                setSelected((previous) =>
                  event.target.checked
                    ? [...previous, entry.label]
                    : previous.filter((label) => label !== entry.label)
                )
              }
            />
          }
        />
      ))}
      {preview && (
        <Button
          disabled={busy || !selected.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await commitServiceReplacement(
                upgrade.oldSlug,
                upgrade.newSlug,
                preview.filter((entry) => selected.includes(entry.label)),
                tested
              );
              onComplete();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {i18n("plugin_replace_selected_references_keep_old_instance")}
        </Button>
      )}
      <Button onClick={onComplete}>{i18n("plugin_finish_upgrade")}</Button>
    </Stack>
  );
}
