import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import { sites as webfixSites } from "../../libs/webfix";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useSetting } from "../../hooks/Setting";

function ApiFields({ site }) {
  const { selector, rootSlector } = site;
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
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("patch_setting_help")}</Alert>

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

        <Box>
          {webfixSites.map((site) => (
            <ApiAccordion key={site.pattern} site={site} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
