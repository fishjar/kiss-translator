import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import { useProviderI18n } from "../../hooks/ProviderI18n";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";
import {
  COMMUNITY_PAGE_SIZE,
  loadCommunityPluginMetadata,
  loadPluginDirectory,
  pluginDirectoryCacheKey,
  readDirectoryCache,
  validateOfficialDirectory,
  validateCommunityDirectory,
} from "../../providers/pluginDirectory";

import { pluginCompatibilityError } from "../../providers/compatibility";

function initial(kind) {
  try {
    const data = readDirectoryCache(pluginDirectoryCacheKey(kind))?.data;
    return kind === "official"
      ? validateOfficialDirectory(data)
      : validateCommunityDirectory(data);
  } catch {
    return null;
  }
}

function PluginCapabilityChips({ capabilities, i18n }) {
  if (!capabilities?.length) return null;
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      sx={{ mt: 1 }}
    >
      {capabilities.map((name) => (
        <Chip
          key={name}
          size="small"
          label={i18n(capabilityLabelKeys[name], name)}
        />
      ))}
    </Stack>
  );
}

function CommunityPluginCard({
  repo,
  busy,
  onInstall,
  loadMetadata,
  refreshVersion,
}) {
  const i18n = useI18n();
  const providerText = useProviderI18n();
  const [metadata, setMetadata] = useState();
  const fullName = repo.full_name;
  useEffect(() => {
    if (!loadMetadata) return;
    let ignore = false;
    loadCommunityPluginMetadata(fullName, { force: refreshVersion > 0 }).then(
      (summary) => {
        if (!ignore) setMetadata(summary);
      }
    );
    return () => {
      ignore = true;
    };
  }, [fullName, loadMetadata, refreshVersion]);

  const description =
    (metadata &&
      providerText(metadata.description, metadata.descriptionI18n)) ||
    repo.description;
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography sx={{ flex: 1, overflowWrap: "anywhere" }}>
          <Link
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            {metadata
              ? providerText(metadata.name, metadata.nameI18n)
              : fullName}
          </Link>
          {metadata && ` · ${metadata.version}`}
        </Typography>
        <Button disabled={busy} onClick={() => onInstall(repo.html_url)}>
          {i18n("plugin_download_and_install")}
        </Button>
      </Stack>
      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ overflowWrap: "anywhere" }}
        >
          {description}
        </Typography>
      )}
      {metadata === null && (
        <Typography component="p" variant="caption" color="text.secondary">
          {i18n("plugin_directory_metadata_failed")}
        </Typography>
      )}
      <PluginCapabilityChips
        capabilities={metadata?.capabilities}
        i18n={i18n}
      />
    </Box>
  );
}

export default function PluginDirectory({
  installed,
  busy,
  onOfficialInstall,
  onCommunityInstall,
  renderInstalled,
  importControls,
}) {
  const i18n = useI18n();
  const providerText = useProviderI18n();
  const [official, setOfficial] = useState(() => initial("official"));
  const [community, setCommunity] = useState(() => initial("community"));
  const [communityReady, setCommunityReady] = useState(false);
  const [communityRefresh, setCommunityRefresh] = useState({ version: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const alive = useRef(false);
  const active = useRef(new Set());

  const refresh = async (kind, force = false, nextPage = 1) => {
    if (active.current.has(kind)) return;
    active.current.add(kind);
    setLoading((previous) => ({ ...previous, [kind]: true }));
    setErrors((previous) => ({ ...previous, [kind]: "" }));
    try {
      const data = await loadPluginDirectory(kind, { force, page: nextPage });
      if (!alive.current) return;
      if (kind === "official") setOfficial(data);
      else {
        setCommunity((previous) =>
          nextPage === 1
            ? data
            : {
                ...data,
                items: [
                  ...new Map(
                    [...(previous?.items || []), ...data.items].map((item) => [
                      item.full_name.toLowerCase(),
                      item,
                    ])
                  ).values(),
                ],
              }
        );
        if (force)
          setCommunityRefresh(({ version }) => ({
            version: version + 1,
            repos: new Set(
              data.items.map((repo) => repo.full_name.toLowerCase())
            ),
          }));
        setPage(nextPage);
      }
    } catch (error) {
      if (alive.current)
        setErrors((previous) => ({ ...previous, [kind]: error.message }));
    } finally {
      active.current.delete(kind);
      if (alive.current) {
        if (kind === "community") setCommunityReady(true);
        setLoading((previous) => ({ ...previous, [kind]: false }));
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    refresh("official");
    refresh("community");
    return () => {
      alive.current = false;
    };
    // Each mounted page refreshes once; further requests are explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = official?.plugins || [];
  const installedIds = new Set(installed.map((item) => item.id));
  const installedRepos = new Set(
    installed.map((item) => item.source?.repoUrl?.toLowerCase()).filter(Boolean)
  );
  const header = (kind, label) => (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={2}
    >
      <Typography variant="h6" component="h2">
        {label}
      </Typography>
      <Button disabled={loading[kind]} onClick={() => refresh(kind, true)}>
        {loading[kind]
          ? i18n("plugin_directory_loading")
          : i18n("plugin_directory_refresh")}
      </Button>
    </Stack>
  );
  const status = (kind) =>
    errors[kind] && (
      <Alert severity="warning">
        {i18n("plugin_directory_failed")} {errors[kind]}
      </Alert>
    );
  return (
    <>
      <Stack
        spacing={2}
        useFlexGap
        component="section"
        aria-label={i18n("plugin_directory_official")}
      >
        {header("official", i18n("plugin_directory_official"))}
        {status("official")}
        {entries
          .filter((entry) => !installedIds.has(entry.id))
          .map((entry) => (
            <Box
              key={entry.id}
              sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}
            >
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ flex: 1, overflowWrap: "anywhere" }}>
                  {providerText(entry.name, entry.nameI18n)} · {entry.version}
                </Typography>
                <Button
                  disabled={busy || !!pluginCompatibilityError(entry)}
                  onClick={() => onOfficialInstall(entry)}
                >
                  {i18n("plugin_install_plugin")}
                </Button>
              </Stack>
              {pluginCompatibilityError(entry) && (
                <Alert severity="warning">
                  {pluginCompatibilityError(entry).message}
                </Alert>
              )}
              <Typography variant="body2" color="text.secondary">
                {providerText(entry.description || "", entry.descriptionI18n)}
              </Typography>
              <PluginCapabilityChips
                capabilities={entry.capabilities}
                i18n={i18n}
              />
            </Box>
          ))}
        {renderInstalled(entries, true)}
        {official && !entries.length && (
          <Typography color="text.secondary">
            {i18n("plugin_directory_empty")}
          </Typography>
        )}
      </Stack>
      <Stack
        spacing={2}
        useFlexGap
        component="section"
        aria-label={i18n("plugin_directory_community")}
      >
        {header("community", i18n("plugin_directory_community"))}
        <Typography variant="body2" color="text.secondary">
          {i18n("plugin_directory_community_description")}
        </Typography>
        {importControls}
        {status("community")}
        {renderInstalled(entries, false)}
        {(community?.items || [])
          .filter((repo) => !installedRepos.has(repo.html_url.toLowerCase()))
          .map((repo) => (
            <CommunityPluginCard
              key={repo.full_name}
              repo={repo}
              busy={busy}
              onInstall={onCommunityInstall}
              loadMetadata={communityReady}
              refreshVersion={
                communityRefresh.repos?.has(repo.full_name.toLowerCase())
                  ? communityRefresh.version
                  : 0
              }
            />
          ))}
        {community?.incomplete_results && (
          <Alert severity="info">{i18n("plugin_directory_incomplete")}</Alert>
        )}
        {community && page * COMMUNITY_PAGE_SIZE < community.total_count && (
          <Button
            disabled={loading.community}
            onClick={() => refresh("community", false, page + 1)}
          >
            {i18n("plugin_directory_more")}
          </Button>
        )}
      </Stack>
    </>
  );
}
