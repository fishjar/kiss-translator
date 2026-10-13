import { useProviderI18n } from "../../hooks/ProviderI18n";
import { useI18n } from "../../hooks/I18n";
import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Button,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import { useConfirm } from "../../hooks/Confirm";
import { browser } from "../../libs/browser";
import { authorizationGroups } from "../../providers/authorizationDefinitions";
import {
  PLUGIN_GRANT_PREFIX,
  readPluginGrant,
  approvePlugin,
  revokePlugin,
} from "../../providers/grants";
import PluginAuthorizationDetails from "./PluginAuthorizationDetails";

export default function PluginAuthorization({ packages, instances }) {
  const providerText = useProviderI18n();
  const i18n = useI18n();
  const confirm = useConfirm();
  const [groups, setGroups] = useState([]);
  const [grants, setGrants] = useState(new Map());
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      try {
        const items = authorizationGroups(packages, instances);
        const records = new Map(
          await Promise.all(
            items.map(async (group) => [
              group.id,
              await readPluginGrant(group.id),
            ])
          )
        );
        if (!alive || current !== revision) return;
        setGroups(items);
        setGrants(records);
        const target = new URLSearchParams(
          window.location.hash.split("?")[1]
        ).get("plugin");
        if (items.some((item) => item.id === target)) {
          setExpanded((previous) => ({ ...previous, [target]: true }));
          requestAnimationFrame(() => {
            if (alive)
              document
                .getElementById(`plugin-authorization-${target}`)
                ?.scrollIntoView({ block: "center" });
          });
        }
      } catch (err) {
        if (alive && current === revision) setError(err.message);
      }
    };
    const changed = (changes, area) => {
      if (
        area === "local" &&
        Object.keys(changes).some((key) => key.startsWith(PLUGIN_GRANT_PREFIX))
      )
        refresh();
    };
    refresh();
    browser.storage.onChanged?.addListener(changed);
    return () => {
      alive = false;
      browser.storage.onChanged?.removeListener(changed);
    };
  }, [packages, instances]);
  const act = async (group, revoke) => {
    setBusy(true);
    setError("");
    try {
      if (
        !(await confirm({
          title: `${revoke ? i18n("plugin_revoke_authorization") : i18n("plugin_authorize_plugin")}：${providerText(group.name, group.nameI18n)}`,
          message: revoke ? (
            i18n(
              "plugin_revoking_authorization_prevents_all_linked_instances_across_all_versio"
            ).replace("{0}", () => group.instanceCount)
          ) : (
            <PluginAuthorizationDetails
              summary={group}
              grant={grants.get(group.id)}
            />
          ),
          confirmText: revoke
            ? i18n("plugin_revoke_authorization")
            : i18n("plugin_authorize_plugin"),
        }))
      )
        return;
      if (revoke) await revokePlugin(group.id);
      else await approvePlugin(group.id, group.origins);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (!groups.length && !error) return null;
  return (
    <Stack spacing={2} useFlexGap sx={{ minWidth: 0 }}>
      <Typography variant="h6">
        {i18n("plugin_plugin_authorization")}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {groups.map((group) => {
        const grant = grants.get(group.id);
        const complete =
          grant &&
          group.origins.every((origin) => grant.origins.includes(origin));
        return (
          <Accordion
            id={`plugin-authorization-${group.id}`}
            key={group.id}
            expanded={!!expanded[group.id]}
            onChange={(_, value) =>
              setExpanded((previous) => ({ ...previous, [group.id]: value }))
            }
            sx={{ minWidth: 0 }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ "& .MuiAccordionSummary-content": { minWidth: 0 } }}
            >
              <Stack
                direction="row"
                spacing={1.5}
                useFlexGap
                flexWrap="wrap"
                alignItems="center"
                sx={{ width: "100%", minWidth: 0 }}
              >
                <ApiProviderIcon
                  apiType="Plugin"
                  provider={{ source: { external: true, pluginId: group.id } }}
                />
                <Typography
                  sx={{
                    flex: "1 1 160px",
                    minWidth: 0,
                    overflowWrap: "anywhere",
                    fontWeight: 600,
                  }}
                >
                  {providerText(group.name, group.nameI18n)}
                </Typography>
                <Chip
                  size="small"
                  color={complete ? "success" : "warning"}
                  variant="outlined"
                  label={
                    complete
                      ? i18n("plugin_authorized")
                      : grant
                        ? i18n("plugin_new_addresses_need_authorization")
                        : i18n("plugin_authorization_required")
                  }
                />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 1, pb: 2.5, minWidth: 0 }}>
              <Stack spacing={2.5} useFlexGap>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {i18n("plugin_linked_versions")}
                  {group.versions.join("、") || i18n("local_ai_device_unknown")}
                  {i18n("plugin_linked_instances")}
                  {group.instanceCount}
                </Typography>
                <PluginAuthorizationDetails summary={group} grant={grant} />
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Button
                    variant="contained"
                    disabled={busy || !!complete}
                    onClick={() => act(group, false)}
                  >
                    {i18n("plugin_authorize")}
                  </Button>
                  <Button
                    color="error"
                    disabled={busy || !grant}
                    onClick={() => act(group, true)}
                  >
                    {i18n("plugin_revoke_authorization")}
                  </Button>
                </Stack>
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
