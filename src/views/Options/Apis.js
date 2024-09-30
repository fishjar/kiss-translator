import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import LoadingButton from "@mui/lab/LoadingButton";
import {
  OPT_TRANS_ALL,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENAI_2,
  OPT_TRANS_OPENAI_3,
  OPT_TRANS_GEMINI,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OLLAMA_2,
  OPT_TRANS_OLLAMA_3,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_NIUTRANS,
  URL_KISS_PROXY,
  URL_NIUTRANS_REG,
  DEFAULT_FETCH_LIMIT,
  DEFAULT_FETCH_INTERVAL,
} from "../../config";
import { useState } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Alert from "@mui/material/Alert";
import { useAlert } from "../../hooks/Alert";
import { useApi } from "../../hooks/Api";
import { apiTranslate } from "../../apis";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { limitNumber, limitFloat } from "../../libs/utils";

function TestButton({ translator, api }) {
  const i18n = useI18n();
  const alert = useAlert();
  const [loading, setLoading] = useState(false);
  const handleApiTest = async () => {
    try {
      setLoading(true);
      const [text] = await apiTranslate({
        translator,
        text: "hello world",
        fromLang: "en",
        toLang: "zh-CN",
        apiSetting: api,
        useCache: false,
      });
      if (!text) {
        throw new Error("empty reault");
      }
      alert.success(i18n("test_success"));
    } catch (err) {
      // alert.error(`${i18n("test_failed")}: ${err.message}`);
      let msg = err.message;
      try {
        msg = JSON.stringify(JSON.parse(err.message), null, 2);
      } catch (err) {
        // skip
      }
      alert.error(
        <>
          <div>{i18n("test_failed")}</div>
          {msg === err.message ? (
            <div
              style={{
                maxWidth: 400,
              }}
            >
              {msg}
            </div>
          ) : (
            <pre
              style={{
                maxWidth: 400,
                overflow: "auto",
              }}
            >
              {msg}
            </pre>
          )}
        </>
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoadingButton
      size="small"
      variant="contained"
      onClick={handleApiTest}
      loading={loading}
    >
      {i18n("click_test")}
    </LoadingButton>
  );
}

function ApiFields({ translator }) {
  const i18n = useI18n();
  const { api, updateApi, resetApi } = useApi(translator);
  const {
    url = "",
    key = "",
    model = "",
    system = "",
    prompt = "",
    fetchLimit = DEFAULT_FETCH_LIMIT,
    fetchInterval = DEFAULT_FETCH_INTERVAL,
    dictNo = "",
    memoryNo = "",
    reqHook = "",
    resHook = "",
    temperature = 0,
    maxTokens = 256,
  } = api;

  const handleChange = (e) => {
    let { name, value } = e.target;
    switch (name) {
      case "fetchLimit":
        value = limitNumber(value, 1, 100);
        break;
      case "fetchInterval":
        value = limitNumber(value, 0, 5000);
        break;
      case "temperature":
        value = limitFloat(value, 0, 2);
        break;
      case "maxTokens":
        value = limitNumber(value, 0, 2 ** 15);
        break;
      default:
    }
    updateApi({
      [name]: value,
    });
  };

  const builtinTranslators = [
    OPT_TRANS_MICROSOFT,
    OPT_TRANS_DEEPLFREE,
    OPT_TRANS_BAIDU,
    OPT_TRANS_TENCENT,
  ];

  const mulkeysTranslators = [
    OPT_TRANS_DEEPL,
    OPT_TRANS_OPENAI,
    OPT_TRANS_OPENAI_2,
    OPT_TRANS_OPENAI_3,
    OPT_TRANS_GEMINI,
    OPT_TRANS_CLOUDFLAREAI,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OLLAMA_2,
    OPT_TRANS_OLLAMA_3,
    OPT_TRANS_NIUTRANS,
  ];

  const keyHelper =
    translator === OPT_TRANS_NIUTRANS ? (
      <>
        {i18n("mulkeys_help")}
        <Link href={URL_NIUTRANS_REG} target="_blank">
          {i18n("reg_niutrans")}
        </Link>
      </>
    ) : mulkeysTranslators.includes(translator) ? (
      i18n("mulkeys_help")
    ) : (
      ""
    );

  return (
    <Stack spacing={3}>
      {!builtinTranslators.includes(translator) && (
        <>
          <TextField
            size="small"
            label={"URL"}
            name="url"
            value={url}
            onChange={handleChange}
            multiline={translator === OPT_TRANS_DEEPLX}
            maxRows={10}
            helperText={
              translator === OPT_TRANS_DEEPLX ? i18n("mulkeys_help") : ""
            }
          />
          <TextField
            size="small"
            label={"KEY"}
            name="key"
            value={key}
            onChange={handleChange}
            multiline={mulkeysTranslators.includes(translator)}
            maxRows={10}
            helperText={keyHelper}
          />
        </>
      )}

      {(translator.startsWith(OPT_TRANS_OPENAI) ||
        translator === OPT_TRANS_GEMINI) && (
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
            maxRows={10}
          />
        </>
      )}

      {(translator.startsWith(OPT_TRANS_OLLAMA)) && (
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
            label={"SYSTEM PROMPT"}
            name="system"
            value={system}
            onChange={handleChange}
            multiline
            maxRows={10}
          />
          <TextField
            size="small"
            label={"PROMPT"}
            name="prompt"
            value={prompt}
            onChange={handleChange}
            multiline
            maxRows={10}
          />
        </>
      )}
      
      {translator.startsWith(OPT_TRANS_OPENAI) && (
        <>
          <TextField
            size="small"
            label={"Temperature"}
            type="number"
            name="temperature"
            value={temperature}
            onChange={handleChange}
          />
          <TextField
            size="small"
            label={"Max Tokens"}
            type="number"
            name="maxTokens"
            value={maxTokens}
            onChange={handleChange}
          />
        </>
      )}

      {translator === OPT_TRANS_NIUTRANS && (
        <>
          <TextField
            size="small"
            label={"DictNo"}
            name="dictNo"
            value={dictNo}
            onChange={handleChange}
          />
          <TextField
            size="small"
            label={"MemoryNo"}
            name="memoryNo"
            value={memoryNo}
            onChange={handleChange}
          />
        </>
      )}

      {translator.startsWith(OPT_TRANS_CUSTOMIZE) && (
        <>
          <TextField
            size="small"
            label={"Request Hook"}
            name="reqHook"
            value={reqHook}
            onChange={handleChange}
            multiline
            maxRows={10}
          />
          <TextField
            size="small"
            label={"Response Hook"}
            name="resHook"
            value={resHook}
            onChange={handleChange}
            multiline
            maxRows={10}
          />
        </>
      )}

      <TextField
        size="small"
        label={i18n("fetch_limit")}
        type="number"
        name="fetchLimit"
        value={fetchLimit}
        onChange={handleChange}
      />

      <TextField
        size="small"
        label={i18n("fetch_interval")}
        type="number"
        name="fetchInterval"
        value={fetchInterval}
        onChange={handleChange}
      />

      <Stack direction="row" spacing={2}>
        <TestButton translator={translator} api={api} />
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            resetApi();
          }}
        >
          {i18n("restore_default")}
        </Button>
      </Stack>

      {translator.startsWith(OPT_TRANS_CUSTOMIZE) && (
        <pre>{i18n("custom_api_help")}</pre>
      )}
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
  const i18n = useI18n();
  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">
          <Link href={URL_KISS_PROXY} target="_blank">
            {i18n("about_api_proxy")}
          </Link>
        </Alert>

        <Box>
          {OPT_TRANS_ALL.map((translator) => (
            <ApiAccordion key={translator} translator={translator} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
