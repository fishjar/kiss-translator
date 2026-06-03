import { useState, useEffect, useMemo, useCallback } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CodeField from "./CodeField";
import Button from "@mui/material/Button";
import LoadingButton from "@mui/lab/LoadingButton";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import StarIcon from "@mui/icons-material/Star";
import AddIcon from "@mui/icons-material/Add";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
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
  OPT_TRANS_EPHONEAI,
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
  defaultSystemPrompt,
  defaultSystemPromptXml,
  defaultSystemPromptLines,
  THINKING_PARAM_MAP,
} from "../../config";
import ValidationInput from "../../hooks/ValidationInput";

function TestButton({ api }) {
  const i18n = useI18n();
  const alert = useAlert();
  const [loading, setLoading] = useState(false);
  const handleApiTest = async () => {
    try {
      setLoading(true);
      const text = "The quick brown fox jumps over the lazy dog.";
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

function ApiFields({ apiSlug, deleteApi, copyApi, onCollapse }) {
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
    e?.preventDefault();
    let { name, value, type, checked } = e.target;

    if (type === "checkbox" || type === "switch") {
      value = checked;
    }

    setFormData((prevData) => {
      const newData = {
        ...prevData,
        [name]: value,
      };

      if (name === "useBatchFetch" && value === false) {
        newData.useStream = false;
      }

      if (name === "useStream" && value === false) {
        newData.streamRenderMode = "disabled";
      }

      if (name === "isDisabled") {
        newData.sortOrder = value ? 999 : 0;
      }

      return newData;
    });
  };

  const handleUpdateSystemPrompt = (e) => {
    const promptMap = {
      json: defaultSystemPrompt,
      xml: defaultSystemPromptXml,
      textlines: defaultSystemPromptLines,
    };
    const systemPrompt =
      promptMap[e.target.dataset.output] || defaultSystemPromptXml;
    setFormData((prevData) => ({
      ...prevData,
      systemPrompt,
    }));
  };

  const handleSave = () => {
    update(formData);
    if (formData.isDisabled || formData.sortOrder === -1) {
      onCollapse?.();
    }
  };

  const handleReset = () => {
    reset();
  };

  const handleCopy = () => {
    copyApi(formData);
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
    reqHook = "",
    resHook = "",
    temperature = 0,
    maxTokens = 20480,
    apiName = "",
    isDisabled = false,
    useBatchFetch = false,
    useStream = false,
    streamRenderMode = "disabled",
    transAllnow = false,
    rootMargin = 500,
    batchInterval = DEFAULT_BATCH_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE,
    batchLength = DEFAULT_BATCH_LENGTH,
    useContext = false,
    contextSize = DEFAULT_CONTEXT_SIZE,
    tone = "neutral",
    placeholder = BUILTIN_PLACEHOLDERS[0],
    placetag = BUILTIN_PLACETAGS[0],
    placetagFormat = "compact",
    region = "",
    sortOrder = 0,
    aiTerms = "",
    thinkingMode = "auto",
    thinkingEffort = "_default",
  } = formData;

  const thinkingParam = THINKING_PARAM_MAP[apiType];

  const keyHelper = useMemo(
    () => (API_SPE_TYPES.mulkeys.has(apiType) ? i18n("mulkeys_help") : ""),
    [apiType, i18n]
  );

  const EPHONEAI_MODELS = [
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gemini-3.1-flash-lite-preview",
    "grok-4.20-beta-0309-non-reasoning",
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <TextField
              size="small"
              fullWidth
              label={i18n("api_name")}
              name="apiName"
              value={apiName}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={i18n("sort_order") || "排序权重"}
              name="sortOrder"
              value={sortOrder}
              onChange={handleChange}
              helperText={i18n("sort_order_help") || "数值越小越靠前"}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <TextField
              select
              fullWidth
              size="small"
              name="transAllnow"
              value={transAllnow}
              label={i18n("trigger_mode")}
              onChange={handleChange}
            >
              <MenuItem value={false}>{i18n("mk_pagescroll")}</MenuItem>
              <MenuItem value={true}>{i18n("mk_pageopen")}</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}>
            <ValidationInput
              fullWidth
              size="small"
              label={i18n("pagescroll_root_margin")}
              type="number"
              name="rootMargin"
              value={rootMargin}
              onChange={handleChange}
              min={0}
              max={10000}
            />
          </Grid>
        </Grid>
      </Box>

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
              label={"Key"}
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

      {API_SPE_TYPES.ai.has(apiType) && (
        <>
          <Box>
            <Grid container spacing={2} columns={12}>
              {apiType === OPT_TRANS_EPHONEAI ? (
                <Grid item xs={12} sm={12} md={6} lg={3}>
                  <ReusableAutocomplete
                    freeSolo
                    size="small"
                    fullWidth
                    options={EPHONEAI_MODELS}
                    name="model"
                    label={"Model"}
                    value={model}
                    onChange={handleChange}
                  />
                </Grid>
              ) : (
                <Grid item xs={12} sm={12} md={6} lg={3}>
                  {/* todo： 改成 ReusableAutocomplete 可选择和填写模型 */}
                  <TextField
                    size="small"
                    fullWidth
                    label={"Model"}
                    name="model"
                    value={model}
                    onChange={handleChange}
                  />
                </Grid>
              )}
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
                  label={"Temperature (0.0-2.0)"}
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

      {apiType === OPT_TRANS_CUSTOMIZE && (
        <>
          <CodeField
            size="small"
            label={"Request Hook"}
            name="reqHook"
            value={reqHook}
            onChange={handleChange}
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
          <CodeField
            size="small"
            label={"Response Hook"}
            name="resHook"
            value={resHook}
            onChange={handleChange}
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
                min={10}
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

      <Box>
        <Grid container spacing={2} columns={12}>
          {API_SPE_TYPES.stream.has(api.apiType) && useBatchFetch && (
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="useStream"
                value={useStream}
                label={i18n("use_stream")}
                onChange={handleChange}
              >
                <MenuItem value={false}>{i18n("disable")}</MenuItem>
                <MenuItem value={true}>{i18n("enable")}</MenuItem>
              </TextField>
            </Grid>
          )}

          {API_SPE_TYPES.stream.has(api.apiType) &&
            useBatchFetch &&
            useStream && (
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="streamRenderMode"
                  value={streamRenderMode}
                  label={i18n("stream_render_mode")}
                  onChange={handleChange}
                >
                  <MenuItem value="disabled">{i18n("disable")}</MenuItem>
                  <MenuItem value="realtime">
                    {i18n("stream_render_realtime")}
                  </MenuItem>
                  <MenuItem value="segment">
                    {i18n("stream_render_segment")}
                  </MenuItem>
                </TextField>
              </Grid>
            )}

          {API_SPE_TYPES.context.has(api.apiType) && (
            <>
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
            </>
          )}
        </Grid>
      </Box>

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
              min={100}
              max={600000}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={3}></Grid>
        </Grid>
      </Box>

      {thinkingParam && (
        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={3}>
              <TextField
                select
                fullWidth
                size="small"
                name="thinkingMode"
                value={thinkingMode}
                label={i18n("thinking_mode")}
                onChange={handleChange}
                helperText={i18n("thinking_mode_helper")}
              >
                <MenuItem value="auto">
                  {i18n("thinking_mode_default")}
                </MenuItem>
                <MenuItem value="enabled">
                  {i18n("thinking_mode_enabled")}
                </MenuItem>
                {thinkingParam.disableSupported !== false && (
                  <MenuItem value="disabled">
                    {i18n("thinking_mode_disabled")}
                  </MenuItem>
                )}
              </TextField>
            </Grid>
            {thinkingMode === "enabled" && thinkingParam.efforts && (
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="thinkingEffort"
                  value={thinkingEffort}
                  label={i18n("thinking_effort")}
                  onChange={handleChange}
                >
                  {thinkingParam.efforts.map((e) => (
                    <MenuItem key={e.value} value={e.value}>
                      {e.label}
                    </MenuItem>
                  ))}
                  <MenuItem value="_default">
                    {i18n("thinking_effort_default")}
                  </MenuItem>
                </TextField>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

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
              <Grid item xs={12} sm={12} md={6} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="placetagFormat"
                  value={placetagFormat}
                  label={i18n("placetag_format") || "占位符格式"}
                  onChange={handleChange}
                >
                  <MenuItem value="compact">
                    {i18n("format_compact") || "简洁格式 <a1>"}
                  </MenuItem>
                  <MenuItem value="attribute">
                    {i18n("format_attribute") || "属性格式 <a i=1>"}
                  </MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Box>

          {API_SPE_TYPES.ai.has(apiType) && (
            <>
              {useBatchFetch ? (
                <TextField
                  size="small"
                  label={"Batch System Prompt"}
                  name="systemPrompt"
                  value={systemPrompt}
                  onChange={handleChange}
                  multiline
                  maxRows={10}
                  helperText={
                    <>
                      {i18n("system_prompt_helper_1")}
                      <Link
                        component="button"
                        sx={{ margin: "0 1em" }}
                        data-output="json"
                        onClick={handleUpdateSystemPrompt}
                      >
                        {i18n("json_output")}
                      </Link>
                      <Link
                        component="button"
                        sx={{ margin: "0 1em" }}
                        data-output="xml"
                        onClick={handleUpdateSystemPrompt}
                      >
                        {i18n("xml_output")}
                      </Link>
                      <Link
                        component="button"
                        sx={{ margin: "0 1em" }}
                        data-output="textlines"
                        onClick={handleUpdateSystemPrompt}
                      >
                        {i18n("textlines_output")}
                      </Link>
                      <br />
                      {i18n("system_prompt_helper_2")}
                    </>
                  }
                />
              ) : (
                <>
                  <TextField
                    size="small"
                    label={"System Prompt"}
                    name="nobatchPrompt"
                    value={nobatchPrompt}
                    onChange={handleChange}
                    multiline
                    maxRows={10}
                  />
                  <TextField
                    size="small"
                    label={"User Prompt"}
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
                label={"Subtitle Prompt"}
                name="subtitlePrompt"
                value={subtitlePrompt}
                onChange={handleChange}
                multiline
                maxRows={10}
                helperText={i18n("system_prompt_helper")}
              />
              <TextField
                size="small"
                label={i18n("ai_terms")}
                helperText={i18n("ai_terms_helper")}
                name="aiTerms"
                value={aiTerms}
                onChange={handleChange}
                multiline
                maxRows={10}
              />
            </>
          )}

          {apiType !== OPT_TRANS_BUILTINAI && (
            <>
              {" "}
              <CodeField
                size="small"
                label={i18n("custom_header")}
                name="customHeader"
                value={customHeader}
                onChange={handleChange}
                maxRows={10}
                helperText={i18n("custom_header_help")}
              />
              <CodeField
                size="small"
                label={i18n("custom_body")}
                name="customBody"
                value={customBody}
                onChange={handleChange}
                maxRows={10}
                helperText={i18n("custom_body_help")}
              />
            </>
          )}

          {apiType !== OPT_TRANS_CUSTOMIZE &&
            apiType !== OPT_TRANS_BUILTINAI && (
              <>
                <CodeField
                  size="small"
                  label={"Request Hook"}
                  name="reqHook"
                  value={reqHook}
                  onChange={handleChange}
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
                <CodeField
                  size="small"
                  label={"Response Hook"}
                  name="resHook"
                  value={resHook}
                  onChange={handleChange}
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
        <Button size="small" variant="outlined" onClick={handleCopy}>
          {i18n("copy_api")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={handleDelete}
        >
          {i18n("delete")}
        </Button>

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

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={sortOrder === -1}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  sortOrder: e.target.checked ? -1 : 0,
                }));
              }}
              disabled={isDisabled}
            />
          }
          label={i18n("is_pinned")}
        />

        <ShowMoreButton showMore={showMore} onChange={setShowMore} />
      </Stack>

      {/* {apiType === OPT_TRANS_CUSTOMIZE && <pre>{i18n("custom_api_help")}</pre>} */}
    </Stack>
  );
}

function ApiListItem({
  api,
  selected,
  dragging,
  dragOver,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  return (
    <ListItemButton
      selected={selected}
      onClick={onSelect}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDrop={onDrop}
      sx={(theme) => ({
        gap: 1,
        alignItems: "flex-start",
        opacity: dragging ? 0.45 : 1,
        borderTop: dragOver
          ? `2px solid ${theme.palette.primary.main}`
          : "2px solid transparent",
      })}
    >
      <Tooltip title="Drag to reorder">
        <Box
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            color: "text.secondary",
            cursor: "grab",
            flex: "0 0 auto",
            mt: "1px",
            "&:active": {
              cursor: "grabbing",
            },
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </Tooltip>
      <Typography
        sx={{
          flex: 1,
          opacity: api.isDisabled ? 0.5 : 1,
          overflowWrap: "anywhere",
        }}
      >
        {`[${api.apiType}] ${api.apiName}`}
      </Typography>
    </ListItemButton>
  );
}

export default function Apis() {
  const i18n = useI18n();
  const { transApis, addApi, deleteApi, copyApi, alphaSortApis, reorderApis } =
    useApiList();

  const [alphaSortDir, setAlphaSortDir] = useState("asc");
  const [detailKey, setDetailKey] = useState(0);
  const [selectedApiSlug, setSelectedApiSlug] = useState("");
  const [draggingApiSlug, setDraggingApiSlug] = useState("");
  const [dragOverApiSlug, setDragOverApiSlug] = useState("");

  const apiTypes = useMemo(
    () =>
      OPT_ALL_TRANS_TYPES.map((type) => ({
        type,
        label: type,
      })),
    []
  );

  const apiItems = useMemo(
    () => transApis.map((api) => ({ api })),
    [transApis]
  );

  useEffect(() => {
    if (apiItems.length === 0) {
      setSelectedApiSlug("");
      return;
    }

    const selectedApiExists = apiItems.some(
      ({ api }) => api.apiSlug === selectedApiSlug
    );

    if (!selectedApiExists) {
      setSelectedApiSlug(apiItems[0].api.apiSlug);
    }
  }, [apiItems, selectedApiSlug]);

  const selectedApiItem = useMemo(
    () => apiItems.find(({ api }) => api.apiSlug === selectedApiSlug),
    [apiItems, selectedApiSlug]
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

  const handleDragStart = useCallback((event, apiSlug) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", apiSlug);
    setDraggingApiSlug(apiSlug);
  }, []);

  const handleDragOver = useCallback(
    (event, apiSlug) => {
      if (!draggingApiSlug || draggingApiSlug === apiSlug) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverApiSlug(apiSlug);
    },
    [draggingApiSlug]
  );

  const handleDrop = useCallback(
    (event, apiSlug) => {
      event.preventDefault();
      const activeSlug =
        draggingApiSlug || event.dataTransfer.getData("text/plain");

      if (activeSlug && activeSlug !== apiSlug) {
        reorderApis(activeSlug, apiSlug);
      }

      setDraggingApiSlug("");
      setDragOverApiSlug("");
    },
    [draggingApiSlug, reorderApis]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingApiSlug("");
    setDragOverApiSlug("");
  }, []);

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
          <Stack direction="row" alignItems="center" spacing={2}>
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
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const newDir = alphaSortDir === "asc" ? "desc" : "asc";
                setAlphaSortDir(newDir);
                setDetailKey((k) => k + 1);
                alphaSortApis(newDir);
              }}
              startIcon={<SwapVertIcon />}
            >
              {i18n("sort_alphabetically")}
            </Button>
          </Stack>
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
                {API_SPE_TYPES.sponsors.has(apiOption.type) && (
                  <StarIcon color="warning" sx={{ marginLeft: "0.2em" }} />
                )}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Box
            sx={(theme) => ({
              width: { xs: "100%", md: 280 },
              flex: { xs: "0 0 auto", md: "0 0 280px" },
              maxHeight: { xs: 240, md: "calc(100vh - 230px)" },
              overflowY: "auto",
              borderRight: {
                xs: 0,
                md: `1px solid ${theme.palette.divider}`,
              },
              borderBottom: {
                xs: `1px solid ${theme.palette.divider}`,
                md: 0,
              },
            })}
          >
            <List disablePadding>
              {apiItems.map(({ api }) => (
                <ApiListItem
                  key={api.apiSlug}
                  api={api}
                  selected={api.apiSlug === selectedApiSlug}
                  dragging={api.apiSlug === draggingApiSlug}
                  dragOver={api.apiSlug === dragOverApiSlug}
                  onSelect={() => setSelectedApiSlug(api.apiSlug)}
                  onDragStart={(event) => handleDragStart(event, api.apiSlug)}
                  onDragOver={(event) => handleDragOver(event, api.apiSlug)}
                  onDrop={(event) => handleDrop(event, api.apiSlug)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </List>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, p: 2 }}>
            {selectedApiItem && (
              <ApiFields
                key={`${detailKey}-${selectedApiItem.api.apiSlug}`}
                apiSlug={selectedApiItem.api.apiSlug}
                deleteApi={deleteApi}
                copyApi={copyApi}
              />
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
