import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import {
  OPT_TRANS_ALL,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_CUSTOMIZE,
} from "../../config";
import { useState } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useAlert } from "../../hooks/Alert";
import { useApi } from "../../hooks/Api";
import { apiTranslate } from "../../apis";

function TestButton({ translator, api }) {
  const i18n = useI18n();
  const alert = useAlert();
  const [loading, setLoading] = useState(false);
  const handleApiTest = async () => {
    try {
      setLoading(true);
      const [text] = await apiTranslate({
        translator,
        q: "hello world",
        fromLang: "auto",
        toLang: "zh-CN",
        setting: api,
      });
      if (!text) {
        throw new Error("empty reault");
      }
      alert.success(i18n("test_success"));
    } catch (err) {
      alert.error(`${i18n("test_failed")}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <CircularProgress sx={{ marginLeft: "2em" }} size={16} />;
  }

  return (
    <Button size="small" variant="contained" onClick={handleApiTest}>
      {i18n("click_test")}
    </Button>
  );
}

function ApiFields({ translator }) {
  const i18n = useI18n();
  const { api, updateApi, resetApi } = useApi(translator);
  const { url = "", key = "", model = "", prompt = "", headers = "" } = api;

  const handleChange = (e) => {
    const { name, value } = e.target;
    updateApi({
      [name]: value,
    });
  };

  return (
    <Stack spacing={3}>
      {translator !== OPT_TRANS_MICROSOFT && (
        <>
          <TextField
            size="small"
            label={"URL"}
            name="url"
            value={url}
            onChange={handleChange}
          />
          <TextField
            size="small"
            label={"KEY"}
            name="key"
            value={key}
            onChange={handleChange}
          />
        </>
      )}
      {translator === OPT_TRANS_OPENAI && (
        <>
          <TextField
            size="small"
            label={"MODEL"}
            name="model"
            value={model}
            onChange={handleChange}
          />
          <TextField
            size="small"
            label={"PROMPT"}
            name="prompt"
            value={prompt}
            onChange={handleChange}
            multiline
          />
        </>
      )}
      {translator === OPT_TRANS_CUSTOMIZE && (
        <TextField
          size="small"
          label={"HEADERS"}
          name="headers"
          value={headers}
          onChange={handleChange}
          multiline
        />
      )}

      <Stack direction="row" spacing={2}>
        <TestButton translator={translator} api={api} />
        {translator !== OPT_TRANS_MICROSOFT && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              resetApi();
            }}
          >
            {i18n("restore_default")}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

function ApiAccordion({ translator }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>{translator}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <ApiFields translator={translator} />}
      </AccordionDetails>
    </Accordion>
  );
}

export default function Apis() {
  return OPT_TRANS_ALL.map((translator) => (
    <ApiAccordion key={translator} translator={translator} />
  ));
}
