import { useProviderI18n } from "../../hooks/ProviderI18n";
import { useI18n } from "../../hooks/I18n";
import { useState } from "react";
import { Menu, MenuItem, Box } from "@mui/material";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useProviderPackages } from "../../hooks/ProviderPackages";
import { useSetting } from "../../hooks/Setting";
import {
  DEFAULT_API_SETTING,
  OPT_ALL_TRANS_TYPES,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_SYSTEM_TTS,
} from "../../config/api";
import { createServiceInstance } from "../../providers/instances";

export default function AddServiceMenu({ anchorEl, onClose, onSelect }) {
  const providerText = useProviderI18n();
  const i18n = useI18n();
  const systemServices = [
    { type: OPT_TRANS_BUILTINAI, label: i18n("plugin_built_in_ai") },
    { type: OPT_TRANS_LOCALAI, label: i18n("local_ai_title") },
    { type: OPT_TRANS_SYSTEM_TTS, label: i18n("plugin_system_tts") },
  ];
  const { setting } = useSetting();
  const { packages, error } = useProviderPackages();
  const [submenu, setSubmenu] = useState(null);
  const external = packages.flatMap((pack) =>
    pack.manifest.services.map((service) => ({
      pack,
      service,
      label: `${providerText(pack.manifest.name, pack.manifest.nameI18n)} · ${providerText(service.name, service.nameI18n)}`,
    }))
  );
  for (const index of setting?.providerPlugins || []) {
    if (packages.some((pack) => pack.id === index.pluginId)) continue;
    for (const service of index.services || [])
      external.push({
        service,
        label: i18n("plugin_restore_plugin_to_add")
          .replace("{0}", () =>
            providerText(index.name || index.pluginId, index.nameI18n)
          )
          .replace("{1}", () => providerText(service.name, service.nameI18n)),
        missing: true,
      });
  }
  external.sort((a, b) => a.label.localeCompare(b.label));
  const categories = [
    {
      label: i18n("plugin_system_services"),
      entries: systemServices.filter((entry) =>
        OPT_ALL_TRANS_TYPES.includes(entry.type)
      ),
    },
    {
      label: i18n("plugin_network_apis"),
      entries: OPT_ALL_TRANS_TYPES.filter(
        (type) => !systemServices.some((entry) => entry.type === type)
      ).map((type) => ({ type, label: type })),
    },
    { label: i18n("plugin_external_plugin"), entries: external },
  ];
  const close = () => {
    setSubmenu(null);
    onClose();
  };
  const back = () => {
    const parent = submenu?.anchor;
    setSubmenu(null);
    requestAnimationFrame(() => parent?.focus());
  };
  const select = async (entry) => {
    // The same parent callback handles unsaved edits and selects the added card.
    const value = entry.pack
      ? {
          ...DEFAULT_API_SETTING,
          ...createServiceInstance(
            entry.pack.manifest,
            entry.service.id,
            entry.pack.implementations[entry.service.id],
            {},
            `Plugin_${crypto.randomUUID()}`,
            entry.pack.resources
          ),
        }
      : entry.type;
    await onSelect(value);
    close();
  };
  if (!anchorEl) return null;
  return (
    <>
      <Menu
        id="add-api-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={close}
        container={() => anchorEl?.closest(".kt-m3-root")}
        disableScrollLock
        MenuListProps={{ "aria-labelledby": "add-api-button" }}
      >
        {categories.map((category) => (
          <MenuItem
            key={category.label}
            aria-haspopup="menu"
            aria-expanded={submenu?.label === category.label}
            onClick={(event) =>
              setSubmenu({ ...category, anchor: event.currentTarget })
            }
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setSubmenu({ ...category, anchor: event.currentTarget });
              }
            }}
          >
            <Box sx={{ flex: 1 }}>{category.label}</Box>
            <ChevronRightIcon />
          </MenuItem>
        ))}
      </Menu>
      <Menu
        anchorEl={submenu?.anchor}
        open={Boolean(anchorEl && submenu)}
        onClose={(_, reason) => (reason === "escapeKeyDown" ? back() : close())}
        container={() => anchorEl?.closest(".kt-m3-root")}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        disableScrollLock
        MenuListProps={{
          "aria-label": submenu?.label,
          onKeyDown: (event) => {
            if (["ArrowLeft", "Escape"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              back();
            }
          },
        }}
      >
        {submenu?.entries.map((entry) => (
          <MenuItem
            key={entry.type || entry.label}
            disabled={entry.missing}
            onClick={() => select(entry)}
            sx={{ gap: 1 }}
          >
            <ApiProviderIcon
              apiType={entry.type || "Plugin"}
              provider={
                entry.pack
                  ? {
                      source: {
                        external: true,
                        pluginId: entry.pack.id,
                        version: entry.pack.manifest.version,
                      },
                    }
                  : undefined
              }
            />
            {entry.label}
          </MenuItem>
        ))}
        {!submenu?.entries.length && (
          <MenuItem disabled>
            {error || i18n("plugin_no_services_available")}
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
