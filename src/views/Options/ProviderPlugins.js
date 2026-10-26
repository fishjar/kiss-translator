import PluginDirectory from "./PluginDirectory";
import {
  downloadOfficialPlugin,
  newerPluginVersion,
  OFFICIAL_BASE,
} from "../../providers/pluginDirectory";
import { useProviderI18n } from "../../hooks/ProviderI18n";
import { useI18n } from "../../hooks/I18n";
import { useConfirm } from "../../hooks/Confirm";
import {
  packageDefinitions,
  summarizePackageNetwork,
} from "../../providers/packageNetwork";
import PluginNetworkDetails from "./PluginNetworkDetails";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";
import {
  downloadProviderSource,
  checkPackageReplacement,
} from "../../providers/packageSource";
import { packageFingerprint } from "../../providers/packageFingerprint";
import { packageServiceCatalog } from "../../providers/packageCatalog";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import PluginUpdatePreview from "./PluginUpdatePreview";
import { previewPackageUpdate } from "../../providers/updatePreview";
import {
  pluginCompatibilityFields,
  pluginCompatibilityError,
} from "../../providers/compatibility";
import PluginPromptPreview from "./PluginPromptPreview";
import { defaultPromptCapabilities } from "../../providers/defaultPrompts";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useSetting } from "../../hooks/Setting";
import {
  readProviderFile,
  readProviderDirectory,
} from "../../providers/package";
import {
  listProviderPackages,
  saveProviderPackage,
  removeProviderPackage,
  subscribeProviderPackageChanges,
} from "../../providers/packageStore";
function PluginServicesTable({ services = [], previewAvailable = true }) {
  const providerText = useProviderI18n();
  const i18n = useI18n();
  const [expanded, setExpanded] = useState({});
  const previewId = useId();
  if (!services.length) return null;
  return (
    <TableContainer
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        overflowX: "auto",
      }}
    >
      <Table
        size="small"
        aria-label={i18n("plugin_plugin_service_apis")}
        sx={{
          minWidth: 680,
          tableLayout: "fixed",
          // The page's Markdown table rule uses display:block; keep this data
          // table semantic and let its container own horizontal scrolling.
          "&.MuiTable-root": {
            display: "table",
            width: "100%",
            maxWidth: "none",
            overflow: "visible",
          },
          "& th, & td": {
            px: 2,
            py: 1.5,
            verticalAlign: "middle",
            overflowWrap: "anywhere",
          },
          "& th": { bgcolor: "action.hover", fontWeight: 600 },
          "& tbody tr:last-child td": { borderBottom: 0 },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: "28%" }}>
              {i18n("plugin_service_api")}
            </TableCell>
            <TableCell sx={{ width: "25%" }}>
              {i18n("plugin_supported_capabilities")}
            </TableCell>
            <TableCell sx={{ width: "18%" }}>
              {i18n("plugin_prompts")}
            </TableCell>
            <TableCell>{i18n("plugin_predefined_models")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {services.map((service) => (
            <Fragment key={service.id}>
              <TableRow>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {providerText(service.name, service.nameI18n)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack
                    direction="row"
                    useFlexGap
                    flexWrap="wrap"
                    spacing={0.75}
                  >
                    {Object.keys(service.capabilities).map((name) => (
                      <Chip
                        key={name}
                        size="small"
                        label={i18n(capabilityLabelKeys[name], name)}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  {previewAvailable &&
                  Object.values(defaultPromptCapabilities).some(
                    (capability) => service.capabilities[capability]
                  ) ? (
                    <Button
                      size="small"
                      sx={{ minHeight: 28, minWidth: 0, px: 1, py: 0.25 }}
                      aria-expanded={!!expanded[service.id]}
                      aria-controls={`${previewId}-${service.id}`}
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [service.id]: !current[service.id],
                        }))
                      }
                    >
                      {expanded[service.id]
                        ? i18n("local_ai_llm_collapse_prompt")
                        : i18n("plugin_preview_prompts")}
                    </Button>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {service.models?.length ? (
                    <Stack spacing={0.75}>
                      {service.models.map((model) => (
                        <Typography
                          key={model.id}
                          variant="body2"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {model.id}
                        </Typography>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
              {previewAvailable && expanded[service.id] && (
                <TableRow id={`${previewId}-${service.id}`}>
                  <TableCell colSpan={4}>
                    <PluginPromptPreview service={service} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function LocalPackageInput({ directory = false, disabled, children, onRead }) {
  return (
    <Button component="label" disabled={disabled} sx={{ flexShrink: 0 }}>
      {children}
      <input
        hidden
        type="file"
        accept={directory ? undefined : ".zip"}
        {...(directory ? { webkitdirectory: "", multiple: true } : {})}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length)
            onRead((signal) =>
              directory
                ? readProviderDirectory(files, signal)
                : readProviderFile(files[0], signal)
            );
        }}
      />
    </Button>
  );
}

const sourceLabel = (source, i18n) =>
  source?.repoUrl ||
  source?.url ||
  (source?.kind === "directory"
    ? i18n("plugin_local_folder")
    : i18n("plugin_local_zip"));

export default function ProviderPlugins() {
  const providerText = useProviderI18n();
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const confirm = useConfirm();
  const [packages, setPackages] = useState([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const downloadController = useRef(null);
  const [readingPackage, setReadingPackage] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listProviderPackages()
        .then((items) => {
          if (alive) setPackages(items);
        })
        .catch((err) => {
          if (alive) setError(err.message);
        });
    refresh();
    const unsubscribe = subscribeProviderPackageChanges(refresh);
    return () => {
      alive = false;
      unsubscribe();
      downloadController.current?.abort();
    };
  }, []);
  const install = async (read, expected, updating) => {
    const controller = new AbortController();
    downloadController.current = controller;
    setReadingPackage(true);
    setBusy(true);
    setError("");
    try {
      const pack = await read(controller.signal);
      pack.source ||= { kind: "file" };
      pack.integrity = await packageFingerprint(pack);
      const local = packages.find((item) => item.id === pack.manifest.id);
      const index = setting.providerPlugins?.find(
        (item) => item.pluginId === pack.manifest.id
      );
      // A missing local template does not erase the synced version/integrity policy.
      const previous =
        updating ||
        local ||
        (index && {
          manifest: { id: index.pluginId, version: index.version },
          integrity: index.integrity,
          source: index.source,
        });
      if (!expected && previous && !checkPackageReplacement(previous, pack)) {
        if (local) {
          setError(
            i18n("plugin_no_update_needed_version_and_content_are_unchanged")
          );
          return;
        }
        pack.source = index.source;
      }
      if (controller.signal.aborted)
        throw new Error(i18n("plugin_plugin_installation_cancelled"));
      if (
        expected &&
        (pack.manifest.id !== expected.pluginId ||
          pack.manifest.version !== expected.version ||
          pack.integrity !== expected.integrity)
      )
        throw new Error(
          i18n(
            "plugin_the_downloaded_version_or_fingerprint_differs_from_the_synced_index_us"
          )
        );
      // Cancellation covers reading/verification, not the storage transaction.
      downloadController.current = null;
      setReadingPackage(false);
      const summary = summarizePackageNetwork(packageDefinitions(pack));
      const installAction = previous
        ? i18n("plugin_update_plugin")
        : i18n("plugin_install_plugin");
      if (
        !(await confirm({
          title: `${installAction} ${providerText(pack.manifest.name, pack.manifest.nameI18n)}`,
          message: (
            <Stack spacing={2} useFlexGap>
              <Typography variant="body2">
                {previous ? `${previous.manifest.version} → ` : ""}
                {pack.manifest.version}
              </Typography>
              {previous && (
                <PluginUpdatePreview
                  preview={previewPackageUpdate(local || previous, pack)}
                />
              )}
              <PluginNetworkDetails summary={summary} />
              <Typography variant="caption" color="text.secondary">
                {i18n("plugin_existing_service_snapshots_retained")}
              </Typography>
            </Stack>
          ),
          confirmText: installAction,
        }))
      )
        return;
      await saveProviderPackage(pack);
      await updateSetting((prev) => ({
        ...prev,
        providerPlugins: [
          ...(prev.providerPlugins || []).filter(
            (item) => item.pluginId !== pack.manifest.id
          ),
          {
            ...pluginCompatibilityFields(pack.manifest),
            pluginId: pack.manifest.id,
            version: pack.manifest.version,
            source: pack.source,
            integrity: pack.integrity,
            name: pack.manifest.name,
            ...(pack.manifest.nameI18n && { nameI18n: pack.manifest.nameI18n }),
            services: packageServiceCatalog(pack.manifest),
          },
        ],
      }));
      setPackages(await listProviderPackages());
    } catch (err) {
      setError(err.message);
    } finally {
      downloadController.current = null;
      setReadingPackage(false);
      setBusy(false);
    }
  };
  const isOfficial = (id, source, entries) =>
    entries.some((entry) => entry.id === id) ||
    (source?.url?.startsWith(OFFICIAL_BASE) &&
      /^[a-f0-9]{64}$/.test(source.archiveSha256 || "")) === true;
  const officialAction = (id, version, entries, missingIndex) => {
    const entry = entries.find((item) => item.id === id);
    if (entry && missingIndex && entry.version === version)
      return (
        <Button
          disabled={busy || !!pluginCompatibilityError(entry)}
          onClick={() =>
            install(
              (signal) => downloadOfficialPlugin(entry, signal),
              missingIndex
            )
          }
        >
          {i18n("plugin_restore_template")}
        </Button>
      );
    if (!entry || !newerPluginVersion(entry.version, version)) return null;
    return (
      <Button
        disabled={busy || !!pluginCompatibilityError(entry)}
        onClick={() =>
          install((signal) => downloadOfficialPlugin(entry, signal))
        }
      >
        {i18n("plugin_update_plugin")} · {entry.version}
      </Button>
    );
  };
  const directoryStatus = (id, version, source, entries) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return null;
    if (pluginCompatibilityError(entry))
      return (
        <Alert severity="warning">
          {pluginCompatibilityError(entry).message}
        </Alert>
      );
    return (
      <>
        {newerPluginVersion(entry.version, version) && (
          <Chip
            size="small"
            color="info"
            label={`${i18n("plugin_directory_update_available")} · ${entry.version}`}
          />
        )}
        {!(
          source?.url === `${OFFICIAL_BASE}${id}/${version}.zip` &&
          source?.archiveSha256
        ) && (
          <Chip
            size="small"
            variant="outlined"
            label={i18n("plugin_directory_other_source")}
          />
        )}
      </>
    );
  };
  const renderInstalled = (entries, official) => {
    const installedPackages = packages.filter(
      (pack) => isOfficial(pack.id, pack.source, entries) === official
    );
    const missingPackages = (setting?.providerPlugins || []).filter(
      (index) =>
        !packages.some((pack) => pack.id === index.pluginId) &&
        isOfficial(index.pluginId, index.source, entries) === official
    );
    return (
      <Stack
        className="kt-provider-package-list"
        useFlexGap
        spacing={2}
        sx={{
          minWidth: 0,
          "&.kt-provider-package-list > .MuiAccordion-root:not(:last-child), &.kt-provider-package-list > .MuiAccordion-root.Mui-expanded":
            { mb: 0 },
        }}
      >
        {missingPackages.map((index) => (
          <Accordion key={index.pluginId} disableGutters sx={{ minWidth: 0 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction="row"
                spacing={1.5}
                useFlexGap
                flexWrap="wrap"
                alignItems="center"
                sx={{ minWidth: 0, width: "100%" }}
              >
                <ApiProviderIcon apiType="Plugin" size={36} imageSize={28} />
                <Typography
                  sx={{ flex: 1, minWidth: 160, overflowWrap: "anywhere" }}
                >
                  {providerText(index.name || index.pluginId, index.nameI18n)} ·{" "}
                  {index.version}
                </Typography>
                {directoryStatus(
                  index.pluginId,
                  index.version,
                  index.source,
                  entries
                )}
                <Chip
                  size="small"
                  label={i18n("api_local_model_not_installed")}
                />
              </Stack>
            </AccordionSummary>
            <AccordionDetails
              sx={{
                minWidth: 0,
                pt: 1,
                pb: 2,
                "& .MuiTypography-root": { overflowWrap: "anywhere" },
              }}
            >
              <Stack spacing={1}>
                {officialAction(index.pluginId, index.version, entries, index)}
                <Typography>
                  {i18n(
                    "plugin_local_template_missing_existing_instances_can_still_run"
                  )}
                </Typography>
                <Stack
                  useFlexGap
                  spacing={1}
                  sx={{
                    bgcolor: "action.hover",
                    p: 2,
                    borderRadius: 2,
                    minWidth: 0,
                  }}
                >
                  <Typography>
                    {i18n("plugin_source")}
                    {sourceLabel(index.source, i18n)}
                  </Typography>
                  {index.source?.commitSha && (
                    <Typography sx={{ overflowWrap: "anywhere" }}>
                      {i18n("plugin_github_commit")}
                      {index.source.commitSha}
                    </Typography>
                  )}
                  <Typography>
                    {i18n("plugin_linked_service_instances")}
                    {
                      (setting.transApis || []).filter(
                        (api) =>
                          api.provider?.source?.pluginId === index.pluginId
                      ).length
                    }
                  </Typography>
                </Stack>
                <PluginServicesTable
                  services={index.services}
                  previewAvailable={false}
                />
                {entries.some(
                  (entry) =>
                    entry.id === index.pluginId &&
                    entry.version === index.version
                ) ? null : ["github", "zip"].includes(index.source?.kind) ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      install(
                        (signal) =>
                          downloadProviderSource(index.source, undefined, {
                            signal,
                            restore: true,
                          }),
                        index
                      )
                    }
                  >
                    {i18n("plugin_restore_template")}
                  </Button>
                ) : (
                  <Typography>
                    {i18n(
                      "plugin_import_the_original_zip_package_or_plugin_folder_again"
                    )}
                  </Typography>
                )}
                <Button
                  disabled={busy}
                  color="error"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (
                        !(await confirm({
                          title: i18n("plugin_remove_plugin_index"),
                          message: i18n("plugin_remove_synced_plugin_index"),
                        }))
                      )
                        return;
                      await updateSetting((previous) => ({
                        ...previous,
                        providerPlugins: (
                          previous.providerPlugins || []
                        ).filter((item) => item.pluginId !== index.pluginId),
                      }));
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {i18n("plugin_remove_plugin_index")}
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
        {!official && !installedPackages.length && !missingPackages.length && (
          <Alert severity="info">
            {i18n(
              "plugin_no_external_plugins_installed_import_a_zip_or_local_folder_or_enter_a_"
            )}
          </Alert>
        )}
        {installedPackages.map((pack) => (
          <Accordion key={pack.id} disableGutters sx={{ minWidth: 0 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction="row"
                spacing={1.5}
                useFlexGap
                flexWrap="wrap"
                alignItems="center"
                sx={{ minWidth: 0, width: "100%" }}
              >
                <ApiProviderIcon
                  apiType="Plugin"
                  size={36}
                  imageSize={28}
                  provider={{
                    source: {
                      external: true,
                      pluginId: pack.id,
                      version: pack.manifest.version,
                    },
                  }}
                />
                <Typography
                  sx={{ flex: 1, minWidth: 160, overflowWrap: "anywhere" }}
                >
                  {providerText(pack.manifest.name, pack.manifest.nameI18n)} ·{" "}
                  {pack.manifest.version}
                </Typography>
                {directoryStatus(
                  pack.id,
                  pack.manifest.version,
                  pack.source,
                  entries
                )}
                <Chip
                  size="small"
                  label={i18n("plugin_installed_apis").replace(
                    "{0}",
                    () => pack.manifest.services.length
                  )}
                />
              </Stack>
            </AccordionSummary>
            <AccordionDetails
              sx={{
                minWidth: 0,
                pt: 1,
                pb: 2,
                "& .MuiTypography-root": { overflowWrap: "anywhere" },
              }}
            >
              <Stack spacing={2}>
                {officialAction(pack.id, pack.manifest.version, entries)}
                {pluginCompatibilityError(pack.manifest) && (
                  <Alert severity="warning">
                    {pluginCompatibilityError(pack.manifest).message}
                  </Alert>
                )}
                <Typography>
                  {providerText(
                    pack.manifest.description || "",
                    pack.manifest.descriptionI18n
                  )}
                </Typography>
                <Stack
                  useFlexGap
                  spacing={1}
                  sx={{
                    bgcolor: "action.hover",
                    p: 2,
                    borderRadius: 2,
                    minWidth: 0,
                  }}
                >
                  <Typography>
                    {i18n("plugin_plugin_id")}
                    {pack.id} · SDK：{pack.manifest.apiVersion}
                  </Typography>
                  <Typography>
                    {i18n("plugin_source")}
                    {sourceLabel(pack.source, i18n)}
                  </Typography>
                  {pack.source?.commitSha && (
                    <Typography sx={{ overflowWrap: "anywhere" }}>
                      {i18n("plugin_github_commit")}
                      {pack.source.commitSha}
                    </Typography>
                  )}
                  <PluginNetworkDetails
                    summary={summarizePackageNetwork(packageDefinitions(pack))}
                  />
                  <Typography>
                    {i18n("plugin_linked_service_instances")}
                    {
                      (setting.transApis || []).filter(
                        (api) => api.provider?.source?.pluginId === pack.id
                      ).length
                    }
                  </Typography>
                </Stack>
                <PluginServicesTable services={pack.manifest.services} />
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {entries.some((entry) => entry.id === pack.id) ? null : [
                      "github",
                      "zip",
                    ].includes(pack.source?.kind) ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        install(
                          (signal) =>
                            downloadProviderSource(pack.source, undefined, {
                              signal,
                            }),
                          undefined,
                          pack
                        )
                      }
                    >
                      {i18n("plugin_update_plugin")}
                    </Button>
                  ) : (
                    <>
                      <LocalPackageInput
                        disabled={busy}
                        onRead={(read) => install(read, undefined, pack)}
                      >
                        {i18n("plugin_choose_update_zip")}
                      </LocalPackageInput>
                      <LocalPackageInput
                        directory
                        disabled={busy}
                        onRead={(read) => install(read, undefined, pack)}
                      >
                        {i18n("plugin_choose_update_folder")}
                      </LocalPackageInput>
                    </>
                  )}
                  <Button
                    disabled={busy}
                    color="error"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const count = (setting.transApis || []).filter(
                          (api) => api.provider?.source?.pluginId === pack.id
                        ).length;
                        if (
                          !(await confirm({
                            title: i18n("plugin_uninstall_plugin"),
                            message: i18n(
                              "plugin_uninstall_and_remove_its_synced_index_existing_instances_and_their_sna"
                            )
                              .replace("{0}", () =>
                                providerText(
                                  pack.manifest.name,
                                  pack.manifest.nameI18n
                                )
                              )
                              .replace("{1}", () => count),
                          }))
                        )
                          return;
                        await removeProviderPackage(pack.id);
                        await updateSetting((previous) => ({
                          ...previous,
                          providerPlugins: (
                            previous.providerPlugins || []
                          ).filter((index) => index.pluginId !== pack.id),
                        }));
                        setPackages(await listProviderPackages());
                      } catch (err) {
                        setError(err.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {i18n("plugin_uninstall_plugin")}
                  </Button>
                </Stack>
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    );
  };
  return (
    <Stack
      className="kt-provider-plugins"
      useFlexGap
      spacing={3}
      sx={{ minWidth: 0 }}
    >
      {/* CSS gap survives the theme's expanded-accordion margin reset. */}
      {error && <Alert severity="error">{error}</Alert>}
      <PluginDirectory
        busy={busy}
        installed={[
          ...packages,
          ...(setting.providerPlugins || [])
            .filter(
              (index) => !packages.some((pack) => pack.id === index.pluginId)
            )
            .map((index) => ({ id: index.pluginId, source: index.source })),
        ]}
        onOfficialInstall={(entry) =>
          install((signal) => downloadOfficialPlugin(entry, signal))
        }
        onCommunityInstall={(address) =>
          install((signal) =>
            downloadProviderSource(address, undefined, { signal })
          )
        }
        renderInstalled={renderInstalled}
        importControls={
          <Box
            className="kt-provider-install"
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1.5,
            }}
          >
            <LocalPackageInput disabled={busy} onRead={install}>
              {i18n("plugin_import_zip")}
            </LocalPackageInput>
            <LocalPackageInput directory disabled={busy} onRead={install}>
              {i18n("plugin_import_folder")}
            </LocalPackageInput>
            <TextField
              fullWidth
              sx={{
                minWidth: 0,
                flex: { xs: "1 1 100%", sm: "1 1 0" },
                order: { xs: -1, sm: 0 },
              }}
              size="small"
              label={i18n("plugin_github_project_or_https_zip_url")}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            {readingPackage && (
              <Button onClick={() => downloadController.current?.abort()}>
                {i18n("plugin_cancel_installation")}
              </Button>
            )}
            <Button
              sx={{ flexShrink: 0, ml: { xs: "auto", sm: 0 } }}
              disabled={busy || !url}
              onClick={() =>
                install((signal) =>
                  downloadProviderSource(url, undefined, { signal })
                )
              }
            >
              {i18n("plugin_download_and_install")}
            </Button>
          </Box>
        }
      />
      <Button href="#/apis" sx={{ alignSelf: "center" }}>
        {i18n("plugin_view_service_configuration")}
      </Button>
    </Stack>
  );
}
