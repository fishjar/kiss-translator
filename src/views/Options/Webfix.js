import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useSetting } from "../../hooks/Setting";
import CircularProgress from "@mui/material/CircularProgress";
import { syncWebfix, loadOrFetchWebfix } from "../../libs/webfix";
import Button from "@mui/material/Button";
import SyncIcon from "@mui/icons-material/Sync";
import { useAlert } from "../../hooks/Alert";
import HelpButton from "./HelpButton";
import { URL_KISS_RULES_NEW_ISSUE } from "../../config";

function ApiFields({ site }) {
  const { selector, rootSlector, fixer } = site;
  return (
    <Stack spacing={3}>
      <TextField
        size="small"
        label={"rootSlector"}
        name="rootSlector"
        value={rootSlector || "document"}
        disabled
      />
      <TextField
        size="small"
        label={"selector"}
        name="selector"
        value={selector}
        disabled
      />
      <TextField
        size="small"
        label={"fixer"}
        name="fixer"
        value={fixer}
        disabled
      />
    </Stack>
  );
}

function ApiAccordion({ site }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>{site.pattern}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <ApiFields site={site} />}
      </AccordionDetails>
    </Accordion>
  );
}

export default function Webfix() {
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState([]);
  const i18n = useI18n();
  const alert = useAlert();
  const { setting, updateSetting } = useSetting();

  const loadSites = useCallback(async () => {
    const sites = await loadOrFetchWebfix(process.env.REACT_APP_WEBFIXURL);
    setSites(sites);
  }, []);

  const handleSyncTest = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await syncWebfix(process.env.REACT_APP_WEBFIXURL);
      await loadSites();
      alert.success(i18n("sync_success"));
    } catch (err) {
      console.log("[sync webfix]", err);
      alert.error(i18n("sync_failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadSites();
      } catch (err) {
        console.log("[load webfix]", err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSites]);

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("patch_setting_help")}</Alert>

        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
        >
          <Button
            size="small"
            variant="outlined"
            disabled={loading}
            onClick={handleSyncTest}
            startIcon={<SyncIcon />}
          >
            {i18n("sync_now")}
          </Button>
          <HelpButton url={URL_KISS_RULES_NEW_ISSUE} />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={!!setting.injectWebfix}
                onChange={() => {
                  updateSetting({
                    injectWebfix: !setting.injectWebfix,
                  });
                }}
              />
            }
            label={i18n("inject_webfix")}
          />
        </Stack>

        {setting.injectWebfix && (
          <Box>
            {loading ? (
              <center>
                <CircularProgress size={16} />
              </center>
            ) : (
              sites.map((site) => (
                <ApiAccordion key={site.pattern} site={site} />
              ))
            )}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
