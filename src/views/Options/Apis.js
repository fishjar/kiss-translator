import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import LoadingButton from "@mui/lab/LoadingButton";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import Grid from "@mui/material/Grid";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Link from "@mui/material/Link";
import { useAlert } from "../../hooks/Alert";
import { useApiList, useApiItem } from "../../hooks/Api";
import { useConfirm } from "../../hooks/Confirm";
import { apiTranslate } from "../../apis";
import Box from "@mui/material/Box";
import ReusableAutocomplete from "./ReusableAutocomplete";
import ShowMoreButton from "./ShowMoreButton";
import {
  OPT_TRANS_DEEPLX,
  // OPT_TRANS_OLLAMA,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_NIUTRANS,
  OPT_TRANS_BUILTINAI,
  DEFAULT_FETCH_LIMIT,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_HTTP_TIMEOUT,
  DEFAULT_BATCH_INTERVAL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_LENGTH,
  DEFAULT_CONTEXT_SIZE,
  OPT_ALL_TRANS_TYPES,
  API_SPE_TYPES,
  BUILTIN_STONES,
  BUILTIN_PLACEHOLDERS,
  BUILTIN_PLACETAGS,
  OPT_TRANS_AZUREAI,
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
} from "../../config";
import ValidationInput from "../../hooks/ValidationInput";

function TestButton({ api }) {
  const i18n = useI18n();
  const alert = useAlert();
  const [loading, setLoading] = useState(false);
  const handleApiTest = async () => {
    try {
      setLoading(true);
      const text = "hello world";
      const { trText } = await apiTranslate({
        text,
        fromLang: "en",
        toLang: "zh-CN",
        apiSetting: { ...api },
        useCache: false,
        usePool: false,
      });
      if (!trText) {
        throw new Error("empty result");
      }
      alert.success(
        <>
          <div>{i18n("test_success")}</div>
          <div>{text}</div>
          <div>{trText}</div>
        </>
      );
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
          {msg === err.message ? <div>{msg}</div> : <pre>{msg}</pre>}
        </>
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoadingButton
      size="small"
      variant="outlined"
      onClick={handleApiTest}
      loading={loading}
    >
      {i18n("click_test")}
    </LoadingButton>
  );
}

function ApiFields({ apiSlug, isUserApi, deleteApi }) {
  const { api, update, reset } = useApiItem(apiSlug);
  const i18n = useI18n();
  const [formData, setFormData] = useState({});
  const [isModified, setIsModified] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (api) {
      setFormData(api);
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const hasChanged = JSON.stringify(api) !== JSON.stringify(formData);
    setIsModified(hasChanged);
  }, [api, formData]);

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value, type, checked } = e.target;

    if (type === "checkbox" || type === "switch") {
      value = checked;
    }

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSave = () => {
    // 过滤掉 api 对象中不存在的字段
    // const updatedFields = Object.keys(formData).reduce((acc, key) => {
    //   if (api && Object.keys(api).includes(key)) {
    //     acc[key] = formData[key];
    //   }
    //   return acc;
    // }, {});
    // update(updatedFields);
    update(formData);
  };

  const handleReset = () => {
    reset();
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      deleteApi(apiSlug);
    }
  };

  const {
    url = "",
    key = "",
    model = "",
    apiType,
    systemPrompt = "",
    nobatchPrompt = defaultNobatchPrompt,
    nobatchUserPrompt = defaultNobatchUserPrompt,
    subtitlePrompt = "",
    // userPrompt = "",
    customHeader = "",
    customBody = "",
    // think = false,
    // thinkIgnore = "",
    fetchLimit = DEFAULT_FETCH_LIMIT,
    fetchInterval = DEFAULT_FETCH_INTERVAL,
    httpTimeout = DEFAULT_HTTP_TIMEOUT,
    dictNo = "",
    memoryNo = "",
    reqHook = "",
    resHook = "",
    temperature = 0,
    maxTokens = 20480,
    apiName = "",
    isDisabled = false,
    useBatchFetch = false,
    batchInterval = DEFAULT_BATCH_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE,
    batchLength = DEFAULT_BATCH_LENGTH,
    useContext = false,
    contextSize = DEFAULT_CONTEXT_SIZE,
    tone = "neutral",
    placeholder = BUILTIN_PLACEHOLDERS[0],
    placetag = BUILTIN_PLACETAGS[0],
    region = "",
    // aiTerms = false,
  } = formData;

  const keyHelper = useMemo(
    () => (API_SPE_TYPES.mulkeys.has(apiType) ? i18n("mulkeys_help") : ""),
    [apiType, i18n]
  );

  return (
    <Stack spacing={3}>
      <TextField
        size="small"
        label={i18n("api_name")}
        name="apiName"
        value={apiName}
        onChange={handleChange}
      />

      {!API_SPE_TYPES.machine.has(apiType) &&
        apiType !== OPT_TRANS_BUILTINAI && (
          <>
            <TextField
              size="small"
              label={"URL"}
              name="url"
              value={url}
              onChange={handleChange}
              multiline={apiType === OPT_TRANS_DEEPLX}
              maxRows={10}
              helperText={
                apiType === OPT_TRANS_DEEPLX ? i18n("mulkeys_help") : ""
              }
            />
            <TextField
              size="small"
              label={"KEY"}
              name="key"
              value={key}
              onChange={handleChange}
              multiline={API_SPE_TYPES.mulkeys.has(apiType)}
              maxRows={10}
              helperText={keyHelper}
            />
          </>
        )}

      {apiType === OPT_TRANS_AZUREAI && (
        <TextField
          size="small"
          label={"Region"}
          name="region"
          value={region}
          onChange={handleChange}
        />
      )}

      {(API_SPE_TYPES.ai.has(apiType) || apiType === OPT_TRANS_CUSTOMIZE) && (
        <>
          <Box>
            <Grid container spacing={2} columns={12}>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                {/* todo： 改成 ReusableAutocomplete 可选择和填写模型 */}
                <TextField
                  size="small"
                  fullWidth
                  label={"MODEL"}
                  name="model"
                  value={model}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ReusableAutocomplete
                  freeSolo
                  size="small"
                  fullWidth
                  options={BUILTIN_STONES}
                  name="tone"
                  label={i18n("translation_style")}
                  value={tone}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  size="small"
                  fullWidth
                  label={"Temperature"}
                  type="number"
                  name="temperature"
                  value={temperature}
                  onChange={handleChange}
                  min={0.0}
                  max={2.0}
                  isFloat={true}
                />
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <ValidationInput
                  size="small"
                  fullWidth
                  label={"Max Tokens (0-1000000)"}
                  type="number"
                  name="maxTokens"
                  value={maxTokens}
                  onChange={handleChange}
                  min={0}
                  max={1000000}
                />
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}></Grid>
            </Grid>
          </Box>

          {useBatchFetch ? (
            <TextField
              size="small"
              label={"BATCH SYSTEM PROMPT"}
              name="systemPrompt"
              value={systemPrompt}
              onChange={handleChange}
              multiline
              maxRows={10}
              helperText={i18n("system_prompt_helper")}
            />
          ) : (
            <>
              <TextField
                size="small"
                label={"SYSTEM PROMPT"}
                name="nobatchPrompt"
                value={nobatchPrompt}
                onChange={handleChange}
                multiline
                maxRows={10}
              />
              <TextField
                size="small"
                label={"USER PROMPT"}
                name="nobatchUserPrompt"
                value={nobatchUserPrompt}
                onChange={handleChange}
                multiline
                maxRows={10}
              />
            </>
          )}

          <TextField
            size="small"
            label={"SUBTITLE PROMPT"}
            name="subtitlePrompt"
            value={subtitlePrompt}
            onChange={handleChange}
            multiline
            maxRows={10}
            helperText={i18n("system_prompt_helper")}
          />
          {/* <TextField
            size="small"
            label={"USER PROMPT"}
            name="userPrompt"
            value={userPrompt}
            onChange={handleChange}
            multiline
            maxRows={10}
          /> */}
        </>
      )}

      {/* {apiType === OPT_TRANS_OLLAMA && (
        <>
          <TextField
            select
            size="small"
            name="think"
            value={think}
            label={i18n("if_think")}
            onChange={handleChange}
          >
            <MenuItem value={false}>{i18n("nothink")}</MenuItem>
            <MenuItem value={true}>{i18n("think")}</MenuItem>
          </TextField>
          <TextField
            size="small"
            label={i18n("think_ignore")}
            name="thinkIgnore"
            value={thinkIgnore}
            onChange={handleChange}
          />
        </>
      )} */}

      {apiType === OPT_TRANS_NIUTRANS && (
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

      {apiType === OPT_TRANS_CUSTOMIZE && (
        <>
          <TextField
            size="small"
            label={"Request Hook"}
            name="reqHook"
            value={reqHook}
            onChange={handleChange}
            multiline
            maxRows={10}
            FormHelperTextProps={{
              component: "div",
            }}
            helperText={
              <Box component="pre" sx={{ overflowX: "auto" }}>
                {i18n("request_hook_helper")}
              </Box>
            }
          />
          <TextField
            size="small"
            label={"Response Hook"}
            name="resHook"
            value={resHook}
            onChange={handleChange}
            multiline
            maxRows={10}
            FormHelperTextProps={{
              component: "div",
            }}
            helperText={
              <Box component="pre" sx={{ overflowX: "auto" }}>
                {i18n("response_hook_helper")}
              </Box>
            }
          />
        </>
      )}

      {API_SPE_TYPES.batch.has(api.apiType) && (
        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="useBatchFetch"
                value={useBatchFetch}
                label={i18n("use_batch_fetch")}
                onChange={handleChange}
              >
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                size="small"
                fullWidth
                label={i18n("batch_interval")}
                type="number"
                name="batchInterval"
                value={batchInterval}
                onChange={handleChange}
                min={100}
                max={10000}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                size="small"
                fullWidth
                label={i18n("batch_size")}
                type="number"
                name="batchSize"
                value={batchSize}
                onChange={handleChange}
                min={1}
                max={100}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <ValidationInput
                size="small"
                fullWidth
                label={i18n("batch_length")}
                type="number"
                name="batchLength"
                value={batchLength}
                onChange={handleChange}
                min={1000}
                max={100000}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {API_SPE_TYPES.context.has(api.apiType) && (
        <>
          <Box>
            <Grid container spacing={2} columns={12}>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                {" "}
                <TextField
                  select
                  size="small"
                  fullWidth
                  name="useContext"
                  value={useContext}
                  label={i18n("use_context")}
                  onChange={handleChange}
                >
                  <MenuItem value={false}>{i18n("disable")}</MenuItem>
                  <MenuItem value={true}>{i18n("enable")}</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                {" "}
                <TextField
                  size="small"
                  fullWidth
                  label={i18n("context_size")}
                  type="number"
                  name="contextSize"
                  value={contextSize}
                  onChange={handleChange}
                  min={1}
                  max={20}
                />
              </Grid>
            </Grid>
          </Box>
        </>
      )}

      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <ValidationInput
              size="small"
              fullWidth
              label={i18n("fetch_limit")}
              type="number"
              name="fetchLimit"
              value={fetchLimit}
              onChange={handleChange}
              min={1}
              max={100}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <ValidationInput
              size="small"
              fullWidth
              label={i18n("fetch_interval")}
              type="number"
              name="fetchInterval"
              value={fetchInterval}
              onChange={handleChange}
              min={0}
              max={5000}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <ValidationInput
              size="small"
              fullWidth
              label={i18n("http_timeout")}
              type="number"
              name="httpTimeout"
              value={httpTimeout}
              onChange={handleChange}
              min={5000}
              max={60000}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}></Grid>
        </Grid>
      </Box>

      {showMore && (
        <>
          <Box>
            <Grid container spacing={2} columns={12}>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="placeholder"
                  value={placeholder}
                  label={i18n("api_placeholder")}
                  onChange={handleChange}
                >
                  {BUILTIN_PLACEHOLDERS.map((item) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="placetag"
                  value={placetag}
                  label={i18n("api_placetag")}
                  onChange={handleChange}
                >
                  {BUILTIN_PLACETAGS.map((item) => (
                    <MenuItem key={item} value={item}>
                      {`<${item}>`}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </Box>

          {apiType !== OPT_TRANS_BUILTINAI && (
            <>
              {" "}
              <TextField
                size="small"
                label={i18n("custom_header")}
                name="customHeader"
                value={customHeader}
                onChange={handleChange}
                multiline
                maxRows={10}
                helperText={i18n("custom_header_help")}
              />
              <TextField
                size="small"
                label={i18n("custom_body")}
                name="customBody"
                value={customBody}
                onChange={handleChange}
                multiline
                maxRows={10}
                helperText={i18n("custom_body_help")}
              />
            </>
          )}

          {apiType !== OPT_TRANS_CUSTOMIZE &&
            apiType !== OPT_TRANS_BUILTINAI && (
              <>
                <TextField
                  size="small"
                  label={"Request Hook"}
                  name="reqHook"
                  value={reqHook}
                  onChange={handleChange}
                  multiline
                  maxRows={10}
                  FormHelperTextProps={{
                    component: "div",
                  }}
                  helperText={
                    <Box component="pre" sx={{ overflowX: "auto" }}>
                      {i18n("request_hook_helper")}
                    </Box>
                  }
                />
                <TextField
                  size="small"
                  label={"Response Hook"}
                  name="resHook"
                  value={resHook}
                  onChange={handleChange}
                  multiline
                  maxRows={10}
                  FormHelperTextProps={{
                    component: "div",
                  }}
                  helperText={
                    <Box component="pre" sx={{ overflowX: "auto" }}>
                      {i18n("response_hook_helper")}
                    </Box>
                  }
                />
              </>
            )}
        </>
      )}

      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        useFlexGap
        flexWrap="wrap"
      >
        <Button
          size="small"
          variant="contained"
          onClick={handleSave}
          disabled={!isModified}
        >
          {i18n("save")}
        </Button>
        <TestButton api={formData} />
        <Button size="small" variant="outlined" onClick={handleReset}>
          {i18n("restore_default")}
        </Button>
        {isUserApi && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleDelete}
          >
            {i18n("delete")}
          </Button>
        )}

        <FormControlLabel
          control={
            <Switch
              size="small"
              name="isDisabled"
              checked={isDisabled}
              onChange={handleChange}
            />
          }
          label={i18n("is_disabled")}
        />

        <ShowMoreButton showMore={showMore} onChange={setShowMore} />
      </Stack>

      {/* {apiType === OPT_TRANS_CUSTOMIZE && <pre>{i18n("custom_api_help")}</pre>} */}
    </Stack>
  );
}

function ApiAccordion({ api, isUserApi, deleteApi }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography
          sx={{
            opacity: api.isDisabled ? 0.5 : 1,
            overflowWrap: "anywhere",
          }}
        >
          {`[${api.apiType}] ${api.apiName}`}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <ApiFields
            apiSlug={api.apiSlug}
            isUserApi={isUserApi}
            deleteApi={deleteApi}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function Apis() {
  const i18n = useI18n();
  const { userApis, builtinApis, addApi, deleteApi } = useApiList();

  const apiTypes = useMemo(
    () =>
      OPT_ALL_TRANS_TYPES.map((type) => ({
        type,
        label: type,
      })),
    []
  );

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMenuItemClick = (apiType) => {
    addApi(apiType);
    handleClose();
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">
          {i18n("about_api")}
          <br />
          {i18n("about_api_2")}
          <br />
          {i18n("about_api_3")}
          <Link
            href="https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md"
            target="_blank"
          >
            {i18n("goto_custom_api_example")}
          </Link>
        </Alert>

        <Box>
          <Button
            size="small"
            id="add-api-button"
            variant="contained"
            onClick={handleClick}
            aria-controls={open ? "add-api-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={open ? "true" : undefined}
            endIcon={<KeyboardArrowDownIcon />}
            startIcon={<AddIcon />}
          >
            {i18n("add")}
          </Button>
          <Menu
            id="add-api-menu"
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            MenuListProps={{
              "aria-labelledby": "add-api-button",
            }}
          >
            {apiTypes.map((apiOption) => (
              <MenuItem
                key={apiOption.type}
                onClick={() => handleMenuItemClick(apiOption.type)}
              >
                {apiOption.label}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        <Box>
          {userApis.map((api) => (
            <ApiAccordion
              key={api.apiSlug}
              api={api}
              isUserApi={true}
              deleteApi={deleteApi}
            />
          ))}
        </Box>
        <Box>
          {builtinApis.map((api) => (
            <ApiAccordion key={api.apiSlug} api={api} />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
