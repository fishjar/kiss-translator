import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
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
import PushPinIcon from "@mui/icons-material/PushPin";
import DeleteIcon from "@mui/icons-material/Delete";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CheckBoxRoundedIcon from "@mui/icons-material/CheckBoxRounded";
import CheckBoxOutlineBlankRoundedIcon from "@mui/icons-material/CheckBoxOutlineBlankRounded";
import Link from "@mui/material/Link";
import { useSetting } from "../../hooks/Setting";
import { useAlert } from "../../hooks/Alert";
import {
  API_SORT_MODES,
  getApiDisplayName,
  getApiSortMode,
  useApiList,
  useApiItem,
} from "../../hooks/Api";
import { useConfirm } from "../../hooks/Confirm";
import { resolveApiPromptSettings } from "../../config/prompt";
import { apiTranslate } from "../../apis";
import { fetchModelCatalog } from "../../libs/modelList";
import Box from "@mui/material/Box";
import ReusableAutocomplete from "./ReusableAutocomplete";
import ShowMoreButton from "./ShowMoreButton";
import {
  OPT_TRANS_DEEPLX,
  // OPT_TRANS_OLLAMA,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  DEFAULT_FETCH_LIMIT,
  DEFAULT_FETCH_INTERVAL,
  DEFAULT_HTTP_TIMEOUT,
  DEFAULT_BATCH_INTERVAL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_LENGTH,
  DEFAULT_BATCH_CONCURRENCY,
  DEFAULT_CONTEXT_SIZE,
  OPT_ALL_TRANS_TYPES,
  OPT_LANGS_LIST,
  API_SPE_TYPES,
  BUILTIN_STONES,
  BUILTIN_PLACEHOLDERS,
  BUILTIN_PLACETAGS,
  OPT_TRANS_AZUREAI,
  THINKING_API_REGISTRY,
  getOpenRouterThinkingCapability,
  getThinkingCapability,
  isThinkingMinimumFallback,
  normalizeThinkingSettings,
  DEFAULT_NOBATCH_PROMPT_SLUG,
  DEFAULT_BATCH_PROMPT_SLUG,
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  DEFAULT_DICTIONARY_PROMPT_SLUG,
  getBatchPromptOptions,
  getDictionaryPromptOptions,
  getNobatchPromptOptions,
  getPromptDisplayName,
  getSubtitlePromptOptions,
} from "../../config";
import ValidationInput from "../../hooks/ValidationInput";
import { usePromptList } from "../../hooks/Prompt";
import ApiProviderIcon from "../../components/ApiProviderIcon";

const API_LIST_CONTROL_SIZE = 24;
const API_LIST_CONTROL_GAP = 0.5;

const apiListControlSx = {
  width: API_LIST_CONTROL_SIZE,
  height: API_LIST_CONTROL_SIZE,
  flex: `0 0 ${API_LIST_CONTROL_SIZE}px`,
};

const EPHONEAI_MODELS = [
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gemini-3.1-flash-lite-preview",
  "grok-4.20-beta-0309-non-reasoning",
];

function TestButton({ api }) {
  const i18n = useI18n();
  const alert = useAlert();
  const { setting: { prompts, subtitleSetting, uiLang } = {} } = useSetting();
  const [loading, setLoading] = useState(false);
  const handleApiTest = async () => {
    try {
      setLoading(true);
      const text = "The quick brown fox jumps over the lazy dog.";

      const apiSetting = resolveApiPromptSettings(
        { ...api },
        prompts,
        subtitleSetting
      );

      // 测试译文目标语言跟随界面语言；界面语言为英文（与原文相同）时回退到简体中文
      const fromLang = "en";
      const UI_LANG_TO_TRANS = { zh: "zh-CN", zh_TW: "zh-TW" };
      let toLang = UI_LANG_TO_TRANS[uiLang] || uiLang;
      if (!OPT_LANGS_LIST.includes(toLang) || toLang === fromLang) {
        toLang = "zh-CN";
      }

      const { trText } = await apiTranslate({
        text,
        fromLang,
        toLang,
        apiSetting,
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

/**
 * 敏感文本输入框。
 * 失焦时仅展示圆点，避免 API 密钥在配置页面长期明文暴露；
 * 聚焦编辑时恢复真实值，确保保存、测试和多行密钥逻辑仍使用原始字段值。
 */
function SensitiveTextField({ value = "", onChange, inputProps, ...props }) {
  const [editing, setEditing] = useState(false);
  const displayValue = editing
    ? value
    : String(value)
        .split("\n")
        .map((line) => (line ? "•".repeat(Math.min(line.length, 24)) : ""))
        .join("\n");

  return (
    <TextField
      {...props}
      value={displayValue}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={editing ? onChange : undefined}
      inputProps={{
        ...inputProps,
        readOnly: !editing,
      }}
    />
  );
}

function ApiFields({ apiSlug, deleteApi, copyApi, onCollapse, onDirtyChange }) {
  const { api, update, reset } = useApiItem(apiSlug);
  const { prompts } = usePromptList();
  const i18n = useI18n();
  const [formData, setFormData] = useState(() => api || {});
  const [showMore, setShowMore] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [modelThinkingCapabilities, setModelThinkingCapabilities] = useState(
    {}
  );
  const modelThinkingCapabilitiesRef = useRef({});
  const [modelListStatus, setModelListStatus] = useState("idle");
  const [modelListError, setModelListError] = useState("");
  const requestedModelListKeyRef = useRef("");
  const lastSyncedApiRef = useRef(api);
  const pendingOpenRouterResolutionRef = useRef(false);
  const confirm = useConfirm();
  const [actionsAnchorEl, setActionsAnchorEl] = useState(null);
  const actionsMenuOpen = Boolean(actionsAnchorEl);

  useLayoutEffect(() => {
    setFormData((currentFormData) => {
      const previousApi = lastSyncedApiRef.current;
      const hasLocalDraft =
        currentFormData?.apiSlug === apiSlug &&
        JSON.stringify(currentFormData) !== JSON.stringify(previousApi || {});

      return hasLocalDraft ? currentFormData : api || {};
    });
    lastSyncedApiRef.current = api;
  }, [api, apiSlug]);

  useLayoutEffect(() => {
    setShowMore(false);
    setModelOptions([]);
    setModelThinkingCapabilities({});
    modelThinkingCapabilitiesRef.current = {};
    setModelListStatus("idle");
    setModelListError("");
    setActionsAnchorEl(null);
    requestedModelListKeyRef.current = "";
    pendingOpenRouterResolutionRef.current = false;
  }, [apiSlug]);

  const activeFormData = useMemo(
    () => (formData?.apiSlug === apiSlug ? formData : api || {}),
    [api, apiSlug, formData]
  );

  const isModified = useMemo(() => {
    if (!api || activeFormData?.apiSlug !== apiSlug) {
      return false;
    }

    return JSON.stringify(api) !== JSON.stringify(activeFormData);
  }, [api, apiSlug, activeFormData]);

  useEffect(() => {
    onDirtyChange?.(isModified);
  }, [isModified, onDirtyChange]);

  const handleChange = (e) => {
    let { name, value, type, checked } = e.target;

    if (type === "checkbox" || type === "switch") {
      value = checked;
    }

    const shouldNormalizeThinking = [
      "model",
      "url",
      "thinkingMode",
      "thinkingEffort",
    ].includes(name);
    let cachedOpenRouterMetadata;
    let nextOpenRouterMode = thinkingMode;
    if (api?.apiType === OPT_TRANS_OPENROUTER && shouldNormalizeThinking) {
      const nextModel = name === "model" ? value : model;
      nextOpenRouterMode = name === "thinkingMode" ? value : thinkingMode;
      cachedOpenRouterMetadata =
        modelThinkingCapabilitiesRef.current[nextModel];
      const cachedOpenRouterCapability = getOpenRouterThinkingCapability(
        nextModel,
        cachedOpenRouterMetadata
      );
      pendingOpenRouterResolutionRef.current =
        nextOpenRouterMode !== "auto" && !cachedOpenRouterCapability;
      if (
        pendingOpenRouterResolutionRef.current &&
        modelListStatus === "error"
      ) {
        // Reopen the request path on the next user action without retrying in a loop.
        setModelListStatus("idle");
        setModelListError("");
      }
    }

    setFormData((prevData) => {
      const baseData = prevData?.apiSlug === apiSlug ? prevData : api || {};
      const newData = {
        ...baseData,
        [name]: value,
      };

      if (name === "useStream" && value === false) {
        newData.streamRenderMode = "disabled";
      }

      if (name === "isDisabled") {
        newData.sortOrder = value ? 999 : 0;
      }

      if (shouldNormalizeThinking && THINKING_API_REGISTRY[baseData.apiType]) {
        // Clear stale effort when the model, URL, or mode changes.
        if (["model", "url", "thinkingMode"].includes(name)) {
          newData.thinkingEffort = "_default";
        }
        Object.assign(
          newData,
          normalizeThinkingSettings({
            ...newData,
            openRouterMetadata: cachedOpenRouterMetadata,
          })
        );
      }

      return newData;
    });
  };

  const handlePromptChange = (e) => {
    e?.preventDefault();
    const { name, value } = e.target;
    const prompt = prompts.find((item) => item.slug === value);

    setFormData((prevData) => {
      const baseData = prevData?.apiSlug === apiSlug ? prevData : api || {};
      const newData = {
        ...baseData,
        [name]: value,
      };

      if (name === "batchPromptSlug" && prompt) {
        newData.systemPrompt = prompt.systemPrompt;
      }

      if (name === "nobatchPromptSlug" && prompt) {
        newData.nobatchPrompt = prompt.systemPrompt;
        newData.nobatchUserPrompt = prompt.userPrompt;
      }

      if (name === "subtitlePromptSlug" && prompt) {
        newData.subtitlePrompt = prompt.systemPrompt;
      }

      if (name === "dictPromptSlug" && prompt) {
        newData.dictPrompt = prompt.systemPrompt;
        newData.dictUserPrompt = prompt.userPrompt;
      }

      return newData;
    });
  };

  const handleSave = () => {
    const nextFormData = { ...activeFormData };
    if (thinkingParam) {
      // Revalidate the final fields so test requests and saved settings stay aligned.
      Object.assign(
        nextFormData,
        normalizeThinkingSettings({
          ...nextFormData,
          openRouterMetadata:
            nextFormData.apiType === OPT_TRANS_OPENROUTER
              ? modelThinkingCapabilitiesRef.current[nextFormData.model]
              : undefined,
        })
      );
    }
    update(nextFormData);
    if (activeFormData.isDisabled || activeFormData.sortOrder === -1) {
      onCollapse?.();
    }
  };

  const handleReset = () => {
    setActionsAnchorEl(null);
    setFormData(api || {});
    reset();
  };

  const handleCopy = () => {
    setActionsAnchorEl(null);
    copyApi(activeFormData);
  };

  const handleDelete = async () => {
    setActionsAnchorEl(null);
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
    modelListUrl = "",
    apiType,
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
    batchConcurrency = DEFAULT_BATCH_CONCURRENCY,
    useContext = false,
    contextSize = DEFAULT_CONTEXT_SIZE,
    tone = "neutral",
    placeholder = BUILTIN_PLACEHOLDERS[0],
    placetag = BUILTIN_PLACETAGS[0],
    placetagFormat = "compact",
    region = "",
    sortOrder = 0,
    aiTerms = "",
    thinkingMode = "disabled",
    thinkingEffort = "_default",
    batchPromptSlug = "",
    nobatchPromptSlug = "",
    subtitlePromptSlug = "",
    dictPromptSlug = "",
  } = activeFormData;
  const contextForcesSerialBatch =
    useContext && API_SPE_TYPES.context.has(apiType);

  useEffect(() => {
    setModelListStatus("idle");
    setModelListError("");
    setModelThinkingCapabilities({});
    modelThinkingCapabilitiesRef.current = {};
    requestedModelListKeyRef.current = "";
    pendingOpenRouterResolutionRef.current = false;
  }, [modelListUrl, key]);

  const thinkingCapability =
    apiType === OPT_TRANS_OPENROUTER
      ? getOpenRouterThinkingCapability(model, modelThinkingCapabilities[model])
      : getThinkingCapability({ apiType, url, model });
  // Keep the mode selector visible for unknown models so the fallback is explicit.
  const thinkingParam = Boolean(THINKING_API_REGISTRY[apiType]);
  const hasResolvedOpenRouterThinking =
    apiType === OPT_TRANS_OPENROUTER &&
    thinkingEffort !== undefined &&
    thinkingEffort !== "_default";
  // A persisted OpenRouter effort was already normalized by the settings page.
  const isUnknownThinkingModel =
    thinkingParam && !thinkingCapability && !hasResolvedOpenRouterThinking;
  const thinkingEfforts = thinkingCapability?.efforts;
  const selectedThinkingEffort = thinkingEfforts?.some(
    (effort) => effort.value === thinkingEffort
  )
    ? thinkingEffort
    : "_default";
  const hasRuntimeOptions =
    API_SPE_TYPES.stream.has(apiType) || API_SPE_TYPES.context.has(apiType);
  const showUnknownThinkingWarning =
    isUnknownThinkingModel && thinkingMode !== "auto";
  const showMinimumThinkingHelper = isThinkingMinimumFallback({
    capability: thinkingCapability,
    thinkingMode,
  });
  const selectedBatchPromptSlug = Object.prototype.hasOwnProperty.call(
    activeFormData,
    "batchPromptSlug"
  )
    ? batchPromptSlug
    : DEFAULT_BATCH_PROMPT_SLUG;
  const selectedNobatchPromptSlug = Object.prototype.hasOwnProperty.call(
    activeFormData,
    "nobatchPromptSlug"
  )
    ? nobatchPromptSlug
    : DEFAULT_NOBATCH_PROMPT_SLUG;
  const selectedSubtitlePromptSlug = Object.prototype.hasOwnProperty.call(
    activeFormData,
    "subtitlePromptSlug"
  )
    ? subtitlePromptSlug
    : DEFAULT_SUBTITLE_PROMPT_SLUG;
  const selectedDictPromptSlug = Object.prototype.hasOwnProperty.call(
    activeFormData,
    "dictPromptSlug"
  )
    ? dictPromptSlug
    : DEFAULT_DICTIONARY_PROMPT_SLUG;
  const nobatchPromptOptions = useMemo(
    () => getNobatchPromptOptions(prompts),
    [prompts]
  );
  const batchPromptOptions = useMemo(
    () => getBatchPromptOptions(prompts),
    [prompts]
  );
  const subtitlePromptOptions = useMemo(
    () => getSubtitlePromptOptions(prompts),
    [prompts]
  );
  const dictionaryPromptOptions = useMemo(
    () => getDictionaryPromptOptions(prompts),
    [prompts]
  );

  const keyHelper = useMemo(
    () => (API_SPE_TYPES.mulkeys.has(apiType) ? i18n("mulkeys_help") : ""),
    [apiType, i18n]
  );

  const allModelOptions = useMemo(() => {
    const baseOptions = apiType === OPT_TRANS_EPHONEAI ? EPHONEAI_MODELS : [];
    return Array.from(new Set([...baseOptions, ...modelOptions]));
  }, [apiType, modelOptions]);

  const modelListHelperText = useMemo(() => {
    if (modelListStatus === "loading") {
      return i18n("model_list_loading");
    }

    if (modelListStatus === "empty") {
      return i18n("model_list_empty");
    }

    if (modelListStatus === "error") {
      return `${i18n("model_list_fetch_failed")}: ${modelListError}`;
    }

    return "";
  }, [i18n, modelListError, modelListStatus]);

  const handleLoadModelList = useCallback(async () => {
    if (apiType === OPT_TRANS_OPENROUTER && thinkingMode !== "auto") {
      // The model catalog includes OpenRouter capabilities used for normalization.
      pendingOpenRouterResolutionRef.current = true;
    }
    const requestKey = `${apiSlug}|${modelListUrl}|${key}`;
    if (
      !modelListUrl?.trim() ||
      !key?.trim() ||
      requestedModelListKeyRef.current === requestKey ||
      modelListStatus === "loading"
    ) {
      return;
    }

    requestedModelListKeyRef.current = requestKey;
    setModelListStatus("loading");
    setModelListError("");

    try {
      const catalog = await fetchModelCatalog({
        apiType,
        modelListUrl,
        key,
        httpTimeout,
      });
      // Ignore stale successes after the URL or key changes.
      if (requestedModelListKeyRef.current !== requestKey) return;
      const nextModelOptions = catalog.models;
      setModelOptions(nextModelOptions);
      modelThinkingCapabilitiesRef.current = catalog.thinkingCapabilities;
      setModelThinkingCapabilities(catalog.thinkingCapabilities);
      setModelListStatus(nextModelOptions.length > 0 ? "success" : "empty");
    } catch (err) {
      // Ignore stale failures after the URL or key changes.
      if (requestedModelListKeyRef.current !== requestKey) return;
      requestedModelListKeyRef.current = "";
      pendingOpenRouterResolutionRef.current = false;
      setModelListStatus("error");
      setModelListError(err?.message || String(err));
    }
  }, [
    apiSlug,
    apiType,
    httpTimeout,
    key,
    modelListStatus,
    modelListUrl,
    thinkingMode,
  ]);

  useEffect(() => {
    if (
      apiType !== OPT_TRANS_OPENROUTER ||
      !pendingOpenRouterResolutionRef.current ||
      thinkingMode === "auto"
    ) {
      return;
    }

    const capability = getOpenRouterThinkingCapability(
      model,
      modelThinkingCapabilities[model]
    );
    if (!capability) {
      if (modelListStatus === "idle") void handleLoadModelList();
      if (["success", "empty", "error"].includes(modelListStatus)) {
        pendingOpenRouterResolutionRef.current = false;
      }
      return;
    }

    const resolved = normalizeThinkingSettings({
      apiType,
      url,
      model,
      thinkingMode,
      thinkingEffort,
      openRouterMetadata: modelThinkingCapabilities[model],
    });
    setFormData((prevData) => {
      const baseData = prevData?.apiSlug === apiSlug ? prevData : api || {};
      // Apply async results only while the form still targets the same model and mode.
      if (baseData.model !== model || baseData.thinkingMode !== thinkingMode) {
        return baseData;
      }
      return {
        ...baseData,
        thinkingEffort: resolved.thinkingEffort,
      };
    });
    pendingOpenRouterResolutionRef.current = false;
  }, [
    api,
    apiSlug,
    apiType,
    handleLoadModelList,
    model,
    modelListStatus,
    modelThinkingCapabilities,
    thinkingEffort,
    thinkingMode,
    url,
  ]);

  return (
    <Stack spacing={3}>
      <Stack
        className="kt-api-detail__header"
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        useFlexGap
        flexWrap="wrap"
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}
          >
            {getApiDisplayName(activeFormData)}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }}>
            {apiType}
          </Typography>
        </Box>
        <Stack
          className="kt-api-detail__status-actions"
          direction="row"
          alignItems="center"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
        >
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
                name="isPinned"
                checked={sortOrder === -1}
                onChange={(event) => {
                  setFormData((prev) => ({
                    ...(prev?.apiSlug === apiSlug ? prev : api || {}),
                    sortOrder: event.target.checked ? -1 : 0,
                  }));
                }}
                disabled={isDisabled}
              />
            }
            label={i18n("is_pinned")}
          />
        </Stack>
      </Stack>
      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={12} sm={12} md={6} lg={6}>
            <TextField
              size="small"
              fullWidth
              label={i18n("api_name")}
              name="apiName"
              value={apiName}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6} lg={6}>
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
          <Grid item xs={12} sm={12} md={6} lg={6}>
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
            <SensitiveTextField
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
          <TextField
            size="small"
            fullWidth
            label={i18n("model_list_url")}
            name="modelListUrl"
            value={modelListUrl}
            onChange={handleChange}
          />
          <Box>
            <Grid container spacing={2} columns={12}>
              <Grid item xs={12} sm={12} md={6} lg={6}>
                <ReusableAutocomplete
                  freeSolo
                  size="small"
                  fullWidth
                  options={allModelOptions}
                  name="model"
                  label={"Model"}
                  value={model}
                  onChange={handleChange}
                  onFocus={handleLoadModelList}
                  loading={modelListStatus === "loading"}
                  loadingText={i18n("model_list_loading")}
                  noOptionsText={i18n("model_list_empty")}
                  textFieldProps={{
                    helperText: modelListHelperText,
                    error: modelListStatus === "error",
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={12} md={6} lg={6}>
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
              {apiType !== OPT_TRANS_GEMINI &&
                apiType !== OPT_TRANS_GEMINI_2 && (
                  <Grid item xs={12} sm={12} md={6} lg={6}>
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
                      inputProps={{
                        step: 0.1,
                      }}
                    />
                  </Grid>
                )}
              <Grid item xs={12} sm={12} md={6} lg={6}>
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

      {API_SPE_TYPES.batch.has(apiType) && (
        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={6}>
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
            <Grid item xs={12} sm={12} md={6} lg={6}>
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
            <Grid item xs={12} sm={12} md={6} lg={6}>
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
            <Grid item xs={12} sm={12} md={6} lg={6}>
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
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <ValidationInput
                size="small"
                fullWidth
                label={i18n("batch_concurrency")}
                type="number"
                name="batchConcurrency"
                value={contextForcesSerialBatch ? 1 : batchConcurrency}
                onChange={handleChange}
                min={1}
                max={100}
                disabled={contextForcesSerialBatch}
                helperText={
                  contextForcesSerialBatch
                    ? i18n("batch_concurrency_context_hint")
                    : ""
                }
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {hasRuntimeOptions && (
        <Box className="kt-api-runtime-options">
          <Grid container spacing={2} columns={12}>
            {API_SPE_TYPES.stream.has(apiType) && (
              <Grid item xs={12} sm={12} md={6} lg={6}>
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

            {API_SPE_TYPES.stream.has(apiType) && useStream && (
              <Grid item xs={12} sm={12} md={6} lg={6}>
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

            {API_SPE_TYPES.context.has(apiType) && (
              <>
                <Grid item xs={12} sm={12} md={6} lg={6}>
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
                <Grid item xs={12} sm={12} md={6} lg={6}>
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
      )}

      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={12} sm={12} md={6} lg={6}>
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
          <Grid item xs={12} sm={12} md={6} lg={6}>
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
          <Grid item xs={12} sm={12} md={6} lg={6}>
            <ValidationInput
              size="small"
              fullWidth
              label={i18n("http_timeout")}
              type="number"
              name="httpTimeout"
              value={httpTimeout}
              onChange={handleChange}
              min={1}
              max={600}
            />
          </Grid>
        </Grid>
      </Box>

      {API_SPE_TYPES.ai.has(apiType) && (
        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="nobatchPromptSlug"
                value={selectedNobatchPromptSlug}
                label={i18n("nobatch_prompt", "非聚合翻译提示词")}
                onChange={handlePromptChange}
              >
                {nobatchPromptOptions.map((prompt) => (
                  <MenuItem key={prompt.slug} value={prompt.slug}>
                    {getPromptDisplayName(prompt, i18n)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              {/* AI 词典使用独立提示词，避免复用普通翻译提示词时输出格式不可控。 */}
              <TextField
                select
                fullWidth
                size="small"
                name="batchPromptSlug"
                value={selectedBatchPromptSlug}
                label={i18n("batch_prompt", "聚合翻译提示词")}
                onChange={handlePromptChange}
              >
                {batchPromptOptions.map((prompt) => (
                  <MenuItem key={prompt.slug} value={prompt.slug}>
                    {getPromptDisplayName(prompt, i18n)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="subtitlePromptSlug"
                value={selectedSubtitlePromptSlug}
                label={i18n("subtitle_prompt", "AI断句提示词")}
                onChange={handlePromptChange}
              >
                {subtitlePromptOptions.map((prompt) => (
                  <MenuItem key={prompt.slug} value={prompt.slug}>
                    {getPromptDisplayName(prompt, i18n)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="dictPromptSlug"
                value={selectedDictPromptSlug}
                label={i18n("ai_dict_prompt", "AI词典提示词")}
                onChange={handlePromptChange}
              >
                {dictionaryPromptOptions.map((prompt) => (
                  <MenuItem key={prompt.slug} value={prompt.slug}>
                    {getPromptDisplayName(prompt, i18n)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Box>
      )}

      {thinkingParam && (
        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={12} md={6} lg={6}>
              <TextField
                select
                fullWidth
                size="small"
                name="thinkingMode"
                value={thinkingMode}
                label={i18n("thinking_mode")}
                onChange={handleChange}
                error={showUnknownThinkingWarning}
                helperText={
                  showUnknownThinkingWarning
                    ? i18n("thinking_unknown_model_helper")
                    : showMinimumThinkingHelper
                      ? i18n("gemini_thinking_minimum_helper")
                      : i18n("thinking_mode_helper")
                }
              >
                <MenuItem value="auto">
                  {i18n("thinking_mode_default")}
                </MenuItem>
                <MenuItem value="enabled">
                  {i18n("thinking_mode_enabled")}
                </MenuItem>
                <MenuItem value="disabled">
                  {i18n("thinking_mode_disabled")}
                </MenuItem>
              </TextField>
            </Grid>
            {thinkingMode === "enabled" && thinkingEfforts && (
              <Grid item xs={12} sm={12} md={6} lg={6}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  name="thinkingEffort"
                  value={selectedThinkingEffort}
                  label={i18n("thinking_effort")}
                  onChange={handleChange}
                >
                  {thinkingEfforts.map((e) => (
                    <MenuItem key={e.value} value={e.value}>
                      {e.label}
                    </MenuItem>
                  ))}
                  {(apiType !== OPT_TRANS_OPENROUTER ||
                    thinkingEffort === null) && (
                    <MenuItem value="_default">
                      {i18n("thinking_effort_default")}
                    </MenuItem>
                  )}
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
              <Grid item xs={12} sm={12} md={6} lg={6}>
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
              <Grid item xs={12} sm={12} md={6} lg={6}>
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
              <Grid item xs={12} sm={12} md={6} lg={6}>
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
                helperText={i18n(
                  apiType === OPT_TRANS_GEMINI
                    ? "gemini_interactions_custom_body_help"
                    : "custom_body_help"
                )}
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
        className="kt-api-detail__footer"
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        useFlexGap
        flexWrap="wrap"
      >
        <Stack
          className="kt-api-detail__primary-actions"
          direction="row"
          alignItems="center"
          spacing={1}
        >
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={!isModified}
          >
            {i18n("save")}
          </Button>
          <TestButton api={activeFormData} />
        </Stack>
        <Stack
          className="kt-api-detail__secondary-actions"
          direction="row"
          alignItems="center"
          spacing={1}
        >
          <ShowMoreButton showMore={showMore} onChange={setShowMore} />
          <Button
            id={`api-detail-actions-button-${apiSlug}`}
            size="small"
            variant="outlined"
            aria-controls={
              actionsMenuOpen ? `api-detail-actions-menu-${apiSlug}` : undefined
            }
            aria-haspopup="menu"
            aria-expanded={actionsMenuOpen ? "true" : undefined}
            endIcon={<KeyboardArrowDownIcon />}
            onClick={(event) => setActionsAnchorEl(event.currentTarget)}
          >
            {i18n("api_actions")}
          </Button>
        </Stack>
        <Menu
          id={`api-detail-actions-menu-${apiSlug}`}
          anchorEl={actionsAnchorEl}
          open={actionsMenuOpen}
          onClose={() => setActionsAnchorEl(null)}
          MenuListProps={{
            "aria-labelledby": `api-detail-actions-button-${apiSlug}`,
          }}
        >
          <MenuItem onClick={handleReset}>{i18n("restore_default")}</MenuItem>
          <MenuItem onClick={handleCopy}>{i18n("copy_api")}</MenuItem>
          <MenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
            {i18n("delete")}
          </MenuItem>
        </Menu>
      </Stack>

      {/* {apiType === OPT_TRANS_CUSTOMIZE && <pre>{i18n("custom_api_help")}</pre>} */}
    </Stack>
  );
}

function ApiListItem({
  api,
  selected,
  bulkMode,
  checked,
  dragging,
  dragOver,
  onSelect,
  onCheck,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const handleContentClick = (event) => {
    if (bulkMode) {
      onCheck(event, api.apiSlug);
      return;
    }

    onSelect();
  };

  const displayName = getApiDisplayName(api);
  const cardSelected = bulkMode ? checked : selected;

  return (
    <ListItem
      disablePadding
      className="kt-api-list__item"
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDrop={onDrop}
      sx={{
        display: "block",
        opacity: dragging ? 0.45 : 1,
      }}
    >
      <ListItemButton
        className="kt-api-list__card"
        selected={cardSelected}
        onClick={handleContentClick}
        aria-current={!bulkMode && selected ? "true" : undefined}
        role={bulkMode ? "checkbox" : undefined}
        aria-checked={bulkMode ? checked : undefined}
        aria-label={displayName}
        sx={(theme) => ({
          gap: API_LIST_CONTROL_GAP,
          minWidth: 0,
          minHeight: 68,
          py: 1,
          px: 1,
          border: "1px solid",
          borderColor: dragOver
            ? theme.palette.primary.main
            : theme.palette.divider,
          borderRadius: 2.5,
          backgroundColor: theme.palette.background.paper,
          boxShadow: dragOver
            ? `0 0 0 2px ${theme.palette.primary.main}`
            : "none",
          transition: theme.transitions.create([
            "background-color",
            "border-color",
            "box-shadow",
          ]),
          "&.Mui-selected": {
            borderColor: theme.palette.primary.main,
            backgroundColor: theme.palette.secondary.main,
            color: theme.palette.secondary.contrastText,
          },
          "&.Mui-selected:hover": {
            backgroundColor: theme.palette.secondary.main,
          },
          "&.Mui-selected .kt-api-list__secondary": {
            color: "inherit",
            opacity: 0.78,
          },
        })}
      >
        {bulkMode && (
          <Box
            className="kt-api-list__check"
            aria-hidden="true"
            sx={{
              ...apiListControlSx,
              display: "inline-flex",
              alignSelf: "center",
              color: checked ? "primary.main" : "text.secondary",
            }}
          >
            {checked ? (
              <CheckBoxRoundedIcon fontSize="small" />
            ) : (
              <CheckBoxOutlineBlankRoundedIcon fontSize="small" />
            )}
          </Box>
        )}
        <Tooltip title="Drag to reorder">
          <Box
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
            sx={{
              ...apiListControlSx,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: cardSelected ? "inherit" : "text.secondary",
              cursor: "grab",
              "&:active": {
                cursor: "grabbing",
              },
            }}
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
        </Tooltip>
        <ApiProviderIcon
          className="kt-api-provider-icon"
          apiType={api.apiType}
          size={38}
          imageSize={22}
          disabled={api.isDisabled}
        />
        <Box
          sx={{
            minWidth: 0,
            flex: 1,
            opacity: api.isDisabled ? 0.5 : 1,
          }}
        >
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 650,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </Typography>
          <Typography
            className="kt-api-list__secondary"
            color="text.secondary"
            sx={{
              mt: 0.25,
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {api.model || api.apiType}
          </Typography>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}

export default function Apis() {
  const i18n = useI18n();
  const {
    transApis,
    addApi,
    deleteApi,
    deleteApis,
    pinApis,
    disableApis,
    enableApis,
    copyApi,
    alphaSortApis,
    reorderApis,
  } = useApiList();
  const confirm = useConfirm();

  const [detailKey, setDetailKey] = useState(0);
  const [detailDirty, setDetailDirty] = useState(false);
  const [selectedApiSlug, setSelectedApiSlug] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [checkedApiSlugs, setCheckedApiSlugs] = useState([]);
  const [draggingApiSlug, setDraggingApiSlug] = useState("");
  const [dragOverApiSlug, setDragOverApiSlug] = useState("");
  const detailPanelRef = useRef(null);

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

  const apiSortMode = useMemo(() => getApiSortMode(transApis), [transApis]);
  const canAlphabeticallySort = useMemo(
    () =>
      transApis.filter((api) => api.sortOrder !== -1 && !api.isDisabled)
        .length > 1,
    [transApis]
  );
  const apiSortModeLabel =
    apiSortMode === API_SORT_MODES.ASC
      ? "A–Z"
      : apiSortMode === API_SORT_MODES.DESC
        ? "Z–A"
        : i18n("custom_option", "Custom");

  const apiSlugList = useMemo(
    () => apiItems.map(({ api }) => api.apiSlug),
    [apiItems]
  );

  const checkedApiSlugSet = useMemo(
    () => new Set(checkedApiSlugs),
    [checkedApiSlugs]
  );

  const checkedApiCount = checkedApiSlugs.length;
  const hasCheckedApis = checkedApiCount > 0;
  const allApisChecked =
    apiItems.length > 0 && checkedApiCount === apiItems.length;

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

  useEffect(() => {
    setCheckedApiSlugs((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const apiSlugSet = new Set(apiSlugList);
      const next = prev.filter((apiSlug) => apiSlugSet.has(apiSlug));

      return next.length === prev.length ? prev : next;
    });
  }, [apiSlugList]);

  const selectedApiItem = useMemo(
    () => apiItems.find(({ api }) => api.apiSlug === selectedApiSlug),
    [apiItems, selectedApiSlug]
  );

  useLayoutEffect(() => {
    detailPanelRef.current?.scrollTo({ top: 0 });
  }, [selectedApiSlug]);

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const [sortAnchorEl, setSortAnchorEl] = useState(null);
  const sortMenuOpen = Boolean(sortAnchorEl);

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

  const handleSortMenuClose = () => {
    setSortAnchorEl(null);
  };

  const confirmDiscardDetailChanges = useCallback(async () => {
    if (!detailDirty) return true;

    return confirm({
      message: i18n(
        "discard_api_changes_confirm",
        "This API has unsaved changes. Discard them?"
      ),
      confirmText: i18n("discard_changes"),
      cancelText: i18n("cancel"),
    });
  }, [confirm, detailDirty, i18n]);

  const prepareListMutation = useCallback(async () => {
    if (!(await confirmDiscardDetailChanges())) return false;

    setDetailDirty(false);
    setDetailKey((key) => key + 1);
    return true;
  }, [confirmDiscardDetailChanges]);

  const handleSelectApi = useCallback(
    async (apiSlug) => {
      if (apiSlug === selectedApiSlug) return;

      if (!(await confirmDiscardDetailChanges())) return;

      setDetailDirty(false);
      setSelectedApiSlug(apiSlug);
    },
    [confirmDiscardDetailChanges, selectedApiSlug]
  );

  const handleCheckApi = useCallback((event, apiSlug) => {
    event.stopPropagation();
    setCheckedApiSlugs((prev) =>
      prev.includes(apiSlug)
        ? prev.filter((item) => item !== apiSlug)
        : [...prev, apiSlug]
    );
  }, []);

  const handleToggleAllApis = useCallback(() => {
    setCheckedApiSlugs((prev) =>
      apiSlugList.length > 0 && prev.length === apiSlugList.length
        ? []
        : apiSlugList
    );
  }, [apiSlugList]);

  const handleToggleBulkMode = useCallback(() => {
    setBulkMode((prev) => {
      if (prev) {
        setCheckedApiSlugs([]);
      }

      return !prev;
    });
  }, []);

  const handlePinCheckedApis = useCallback(async () => {
    if (!(await prepareListMutation())) return;
    pinApis(checkedApiSlugs);
  }, [checkedApiSlugs, pinApis, prepareListMutation]);

  const handleEnableCheckedApis = useCallback(async () => {
    if (!(await prepareListMutation())) return;
    enableApis(checkedApiSlugs);
  }, [checkedApiSlugs, enableApis, prepareListMutation]);

  const handleDisableCheckedApis = useCallback(async () => {
    if (!(await prepareListMutation())) return;
    disableApis(checkedApiSlugs);
  }, [checkedApiSlugs, disableApis, prepareListMutation]);

  const handleAlphaSortApis = useCallback(
    async (direction) => {
      if (direction === apiSortMode) {
        setSortAnchorEl(null);
        return;
      }
      setSortAnchorEl(null);
      if (!(await prepareListMutation())) return;
      alphaSortApis(direction);
    },
    [alphaSortApis, apiSortMode, prepareListMutation]
  );

  const handleDeleteCheckedApis = useCallback(async () => {
    const isConfirmed = await confirm({
      message: i18n(
        "delete_selected_apis_confirm",
        "Delete {count} selected interfaces?"
      ).replace("{count}", checkedApiCount),
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (!isConfirmed) return;
    if (
      checkedApiSlugs.includes(selectedApiSlug) &&
      !(await prepareListMutation())
    ) {
      return;
    }

    deleteApis(checkedApiSlugs);
    setCheckedApiSlugs([]);
  }, [
    checkedApiCount,
    checkedApiSlugs,
    confirm,
    deleteApis,
    i18n,
    prepareListMutation,
    selectedApiSlug,
  ]);

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
    async (event, apiSlug) => {
      event.preventDefault();
      const activeSlug =
        draggingApiSlug || event.dataTransfer.getData("text/plain");

      if (activeSlug && activeSlug !== apiSlug) {
        if (!(await prepareListMutation())) {
          setDraggingApiSlug("");
          setDragOverApiSlug("");
          return;
        }
        reorderApis(activeSlug, apiSlug);
      }

      setDraggingApiSlug("");
      setDragOverApiSlug("");
    },
    [draggingApiSlug, prepareListMutation, reorderApis]
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
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            useFlexGap
            flexWrap="wrap"
          >
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
              id="api-sort-button"
              size="small"
              variant="outlined"
              disabled={!canAlphabeticallySort}
              onClick={(event) => setSortAnchorEl(event.currentTarget)}
              aria-controls={sortMenuOpen ? "api-sort-menu" : undefined}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen ? "true" : undefined}
              aria-label={`${i18n("sort_alphabetically")}: ${apiSortModeLabel}`}
              startIcon={<SwapVertIcon />}
              endIcon={<KeyboardArrowDownIcon />}
            >
              {i18n("sort_alphabetically")} · {apiSortModeLabel}
            </Button>
            <Menu
              id="api-sort-menu"
              anchorEl={sortAnchorEl}
              open={sortMenuOpen}
              onClose={handleSortMenuClose}
              MenuListProps={{
                "aria-labelledby": "api-sort-button",
              }}
            >
              <MenuItem
                role="menuitemradio"
                aria-checked={apiSortMode === API_SORT_MODES.ASC}
                selected={apiSortMode === API_SORT_MODES.ASC}
                onClick={() => handleAlphaSortApis(API_SORT_MODES.ASC)}
              >
                A–Z
              </MenuItem>
              <MenuItem
                role="menuitemradio"
                aria-checked={apiSortMode === API_SORT_MODES.DESC}
                selected={apiSortMode === API_SORT_MODES.DESC}
                onClick={() => handleAlphaSortApis(API_SORT_MODES.DESC)}
              >
                Z–A
              </MenuItem>
            </Menu>
            <Button
              size="small"
              variant={bulkMode ? "contained" : "outlined"}
              onClick={handleToggleBulkMode}
            >
              {i18n("bulk_actions")}
            </Button>
            {bulkMode && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button
                  size="small"
                  variant="outlined"
                  disabled={apiItems.length === 0}
                  onClick={handleToggleAllApis}
                >
                  {allApisChecked ? i18n("deselect_all") : i18n("select_all")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!hasCheckedApis}
                  onClick={handlePinCheckedApis}
                  startIcon={<PushPinIcon />}
                >
                  {i18n("pin_to_top")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!hasCheckedApis}
                  onClick={handleEnableCheckedApis}
                  startIcon={<CheckCircleOutlineIcon />}
                >
                  {i18n("enable")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!hasCheckedApis}
                  onClick={handleDisableCheckedApis}
                  startIcon={<BlockIcon />}
                >
                  {i18n("disable")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={!hasCheckedApis}
                  onClick={handleDeleteCheckedApis}
                  startIcon={<DeleteIcon />}
                >
                  {i18n("delete")}
                </Button>
              </Stack>
            )}
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
                sx={{ gap: 1 }}
              >
                <ApiProviderIcon
                  className="kt-api-provider-icon"
                  apiType={apiOption.type}
                  size={38}
                  imageSize={22}
                />
                <Box component="span" sx={{ flex: 1 }}>
                  {apiOption.label}
                </Box>
                {API_SPE_TYPES.sponsors.has(apiOption.type) && (
                  <StarIcon color="warning" sx={{ marginLeft: "0.2em" }} />
                )}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        <Box
          className="kt-api-master-detail"
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 2,
            alignItems: "start",
            "@container options-main (min-width: 760px)": {
              gridTemplateColumns: "minmax(230px, 0.72fr) minmax(0, 1.28fr)",
            },
          }}
        >
          <List
            disablePadding
            className="kt-api-list"
            aria-label={i18n("sort_order")}
            sx={{
              minWidth: 0,
              maxHeight: "min(48vh, 420px)",
              display: "flex !important",
              flexDirection: "column",
              gap: 1,
              overflowX: "hidden",
              overflowY: "auto",
              pl: "0 !important",
              pr: 0.5,
              "@container options-main (min-width: 760px)": {
                maxHeight: "min(72vh, 720px)",
              },
            }}
          >
            {apiItems.map(({ api }) => (
              <ApiListItem
                key={api.apiSlug}
                api={api}
                selected={api.apiSlug === selectedApiSlug}
                bulkMode={bulkMode}
                checked={checkedApiSlugSet.has(api.apiSlug)}
                dragging={api.apiSlug === draggingApiSlug}
                dragOver={api.apiSlug === dragOverApiSlug}
                onSelect={() => handleSelectApi(api.apiSlug)}
                onCheck={handleCheckApi}
                onDragStart={(event) => handleDragStart(event, api.apiSlug)}
                onDragOver={(event) => handleDragOver(event, api.apiSlug)}
                onDrop={(event) => handleDrop(event, api.apiSlug)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </List>
          {selectedApiItem && (
            <Box
              className="kt-api-detail"
              ref={detailPanelRef}
              sx={{ minWidth: 0, mt: "0 !important" }}
            >
              <ApiFields
                key={detailKey}
                apiSlug={selectedApiItem.api.apiSlug}
                deleteApi={deleteApi}
                copyApi={copyApi}
                onDirtyChange={setDetailDirty}
              />
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
