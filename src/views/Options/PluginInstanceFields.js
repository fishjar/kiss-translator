import { useProviderI18n } from "../../hooks/ProviderI18n";
import { useI18n } from "../../hooks/I18n";
import SensitiveTextField from "./SensitiveTextField";
import { useConfirm } from "../../hooks/Confirm";
import {
  ServiceTestCard,
  ServiceFormHeader,
  BooleanServiceOption,
  serviceTransportFeatures,
  AsrDurationSetting,
  ServiceTimeoutSetting,
} from "./ServiceForm";
import { asrMaxDurationSeconds } from "../../providers/asrLimits";
import { validateBuiltinSettingChanges } from "../../builtin-plugins/fields";
import PluginPromptSettings from "./PluginPromptSettings";
import CapabilityOptions from "./CapabilityOptions";
import QuickTranslationTest from "./QuickTranslationTest";
import ThinkingOptions from "./ThinkingOptions";
import useServiceFeedback, {
  describeConfigurationError,
} from "./ServiceFeedback";
import {
  enabledApiCapabilities,
  supportedApiCapabilities,
} from "../../config/serviceSelection";
import {
  validateEnabledCapabilities,
  reconcileEnabledCapabilities,
} from "../../providers/capabilities";
import Autocomplete from "@mui/material/Autocomplete";
import { ServiceUpgradeAction } from "./ServiceUpgrade";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Box,
  Menu,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useSetting } from "../../hooks/Setting";
import { usePromptList } from "../../hooks/Prompt";
import {
  validateServiceConfig,
  getSettingOptions,
  isSettingVisible,
} from "../../providers/instances";
import {
  approvedProviderOrigins,
  providerGrantKey,
  providerPluginId,
  PLUGIN_GRANT_PREFIX,
} from "../../providers/grants";
import { browser } from "../../libs/browser";
import { invokeService as invokeInstance } from "../../providers/serviceRuntime";
import { createAssetStore } from "../../providers/transport";
import { getSettingWithDefault } from "../../libs/storage";
import {
  createTestInput,
  structuredTestSamples,
  applyTestPrompt,
} from "../../providers/testInput";
import { resolveApiPromptSettings } from "../../config/prompt";
import { supportsProviderCapability } from "../../providers/capabilities";
export default function PluginInstanceFields({
  api,
  onDirtyChange,
  onCollapse,
  onTestSuccess,
  onUpgrade,
  deleteApi,
  copyApi,
}) {
  const i18n = useI18n();
  const providerText = useProviderI18n();
  const { updateSetting } = useSetting();
  const { prompts } = usePromptList();
  const [patch, setPatch] = useState({});
  const [actionsAnchor, setActionsAnchor] = useState(null);
  const confirm = useConfirm();
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [options, setOptions] = useState({});
  const [text, setText] = useState(() => {
    const sample =
      structuredTestSamples[Object.keys(api.provider.capabilities)[0]];
    return sample ? JSON.stringify(sample, null, 2) : "Hello";
  });
  const [file, setFile] = useState(null);
  const [capability, setCapability] = useState(
    Object.keys(api.provider.capabilities)[0]
  );
  const [result, setResult] = useState("");
  const { showFeedback, feedbackDialog } = useServiceFeedback();
  const [testError, setTestError] = useState("");
  const active = useRef(null);
  const [call, setCall] = useState(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const draft = useMemo(
    () => ({
      ...api,
      ...options,
      pluginConfig: { ...api.pluginConfig, ...patch },
    }),
    [api, options, patch]
  );
  const enabled = useMemo(() => enabledApiCapabilities(draft), [draft]);
  useEffect(() => {
    if (!enabled.includes(capability)) setCapability(enabled[0] || "");
  }, [enabled, capability]);

  const dirty =
    Object.keys(patch).length > 0 || Object.keys(options).length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(
    () => () => {
      active.current?.cancel();
      active.current = null;
    },
    []
  );
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );
  const save = async () => {
    if (enabled.includes("transcribe"))
      asrMaxDurationSeconds(draft.asrMaxDurationSeconds);
    const warnings = [];
    for (const validate of [
      () =>
        validateBuiltinSettingChanges(api, { httpTimeout: draft.httpTimeout }),
      () =>
        validateEnabledCapabilities(
          draft,
          draft.enabledCapabilities ?? supportedApiCapabilities(draft)
        ),
      () =>
        validateServiceConfig(
          draft.provider,
          draft.pluginConfig,
          enabledApiCapabilities(draft)
        ),
    ]) {
      try {
        validate();
      } catch (error) {
        warnings.push(
          describeConfigurationError(
            error,
            draft.provider.settings,
            i18n,
            providerText
          )
        );
      }
    }
    await updateSetting((previous) => ({
      ...previous,
      transApis: previous.transApis.map((item) => {
        if (item.apiSlug !== api.apiSlug) return item;
        return {
          ...item,
          ...options,
          pluginConfig: { ...item.pluginConfig, ...patch },
        };
      }),
    }));
    setPatch({});
    setOptions({});
    if (warnings.length)
      showFeedback({
        title: i18n("plugin_configuration_saved"),
        message: i18n(
          "plugin_configuration_saved_check_the_following_issues_before_using_this_servi"
        ).replace("{0}", () => warnings.join("\n")),
      });
  };
  const test = async () => {
    setTestError("");
    setAudioUrl("");
    // A test may be cancelled while loading saved configuration/authorization,
    // before an actual invocation exists.
    const job = {
      cancelled: false,
      cancel() {
        job.cancelled = true;
      },
    };
    active.current = job;
    setCall(job);
    setResult("");
    const assets = createAssetStore();
    try {
      if (dirty) throw new Error(i18n("plugin_save_changes_first"));
      const saved = await getSettingWithDefault();
      const storedApi = saved.transApis.find(
        (item) => item.apiSlug === api.apiSlug
      );
      if (!storedApi)
        throw new Error(i18n("plugin_service_instance_has_been_deleted"));
      const current = resolveApiPromptSettings(
        storedApi,
        saved.prompts,
        saved.subtitleSetting
      );
      const origins = await approvedProviderOrigins(current);
      const input = applyTestPrompt(
        capability,
        createTestInput(capability, text, file, assets),
        current
      );
      if (active.current !== job || job.cancelled) return;
      const invocation = invokeInstance(current, capability, input, {
        approvedOrigins: origins,
        assets,
        streaming: "auto",
      });
      job.cancel = invocation.cancel;
      setCall(invocation);
      const output = await invocation.result;
      if (active.current !== job) return;
      if (output.audio)
        setAudioUrl(URL.createObjectURL(assets.get(output.audio)));
      setResult(JSON.stringify(output, null, 2));
      onTestSuccess?.(current, capability);
    } catch (err) {
      if (active.current === job) setTestError(err.message);
    } finally {
      assets.clear();
      if (active.current === job) {
        active.current = null;
        setCall(null);
      }
    }
  };
  const features = serviceTransportFeatures(draft);
  const visibleFields = (api.provider.settings || []).filter((field) =>
    isSettingVisible(field, enabled)
  );
  const modeField = visibleFields.find(
    (field) => field.key === "thinkingMode" && field.type === "select"
  );
  const effortField =
    modeField &&
    visibleFields.find(
      (field) => field.key === "thinkingEffort" && field.type === "select"
    );
  const fields = visibleFields.filter(
    (field) => field !== modeField && field !== effortField
  );
  const modelKey = api.provider.modelField || "model";
  const common = fields.filter((field) => !field.visibleForCapabilities);
  const specific = fields.filter((field) => field.visibleForCapabilities);
  const orderedCommon = [
    ...common.filter((field) => field.key !== modelKey),
    ...common.filter((field) => field.key === modelKey),
  ];
  const changeField = (key, value) => {
    if (key === modelKey) {
      const supported = supportedApiCapabilities({
        ...draft,
        pluginConfig: { ...draft.pluginConfig, [key]: value },
      });
      setOptions((current) => ({
        ...current,
        enabledCapabilities: reconcileEnabledCapabilities(enabled, supported),
      }));
      if (supported.length && !enabled.some((name) => supported.includes(name)))
        setResult(
          i18n(
            "plugin_model_switched_capabilities_supported_by_the_new_model_are_enabled_che"
          )
        );
    }
    const resetEffort =
      effortField &&
      [modelKey, "thinkingMode"].includes(key) &&
      getSettingOptions(effortField).some(
        (option) => option.value === "_default"
      );
    setPatch((current) => ({
      ...current,
      [key]: value,
      ...(resetEffort && { thinkingEffort: "_default" }),
    }));
  };
  useEffect(() => {
    let alive = true;
    let revision = 0;
    let grantKey;
    try {
      grantKey = providerGrantKey(providerPluginId(draft));
    } catch {
      /* Invalid snapshots remain unauthorized. */
    }
    const refresh = () => {
      const current = ++revision;
      return approvedProviderOrigins({ ...draft, pluginConfig: {} })
        .then(() => {
          if (alive && current === revision) setAuthorized(true);
        })
        .catch(() => {
          if (alive && current === revision) setAuthorized(false);
        });
    };
    const changed = async (changes, area) => {
      if (
        area === "local" &&
        Object.keys(changes).some((key) => key.startsWith(PLUGIN_GRANT_PREFIX))
      ) {
        const change = changes[grantKey];
        if (!alive) return;
        if (change && !change.newValue) active.current?.cancel();
        refresh();
      }
    };
    refresh();
    browser.storage.onChanged?.addListener(changed);
    return () => {
      alive = false;
      browser.storage.onChanged?.removeListener(changed);
    };
  }, [draft]);
  const [actionBusy, setActionBusy] = useState(false);
  const action =
    (callback, title = i18n("plugin_operation_failed")) =>
    async () => {
      setActionBusy(true);
      setActionsAnchor(null);
      try {
        await callback();
      } catch (err) {
        showFeedback({ title, severity: "error", message: err.message });
      } finally {
        setActionBusy(false);
      }
    };
  return (
    <Stack spacing={3} useFlexGap>
      <Stack className="kt-service-card kt-service-configuration" spacing={2}>
        <ServiceFormHeader
          api={draft}
          onChange={(name, value) =>
            setOptions((previous) => ({ ...previous, [name]: value }))
          }
        />
        <TextField
          fullWidth
          size="small"
          name="apiName"
          label={i18n("api_name")}
          value={options.apiName ?? api.apiName}
          onChange={(event) =>
            setOptions((previous) => ({
              ...previous,
              apiName: event.target.value,
            }))
          }
        />
        {onUpgrade && <ServiceUpgradeAction api={api} onCreated={onUpgrade} />}
        <ProviderSettings
          service={api.provider}
          fields={orderedCommon}
          values={draft.pluginConfig}
          onChange={changeField}
        />
        <CapabilityOptions
          api={draft}
          onChange={(value) =>
            setOptions((current) => ({
              ...current,
              enabledCapabilities: value,
            }))
          }
        />

        {modeField && (
          <ThinkingOptions
            mode={
              draft.pluginConfig.thinkingMode ??
              modeField.defaultValue ??
              "disabled"
            }
            effort={
              draft.pluginConfig.thinkingEffort ??
              effortField?.defaultValue ??
              "_default"
            }
            efforts={effortField ? getSettingOptions(effortField) : undefined}
            onChange={changeField}
            allowDefaultEffort={Boolean(
              effortField &&
                getSettingOptions(effortField).some(
                  (option) => option.value === "_default"
                )
            )}
          />
        )}
        <ProviderSettings
          service={api.provider}
          fields={specific}
          values={draft.pluginConfig}
          onChange={changeField}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            gap: 2,
          }}
        >
          {features.batch && (
            <BooleanServiceOption
              name="useBatchFetch"
              label={i18n("plugin_batch_translation")}
              value={draft.useBatchFetch ?? false}
              onChange={(value) =>
                setOptions((current) => ({ ...current, useBatchFetch: value }))
              }
            />
          )}
          {features.stream && (
            <BooleanServiceOption
              name="useStream"
              label={i18n("plugin_streaming_output")}
              value={draft.useStream ?? true}
              onChange={(value) =>
                setOptions((current) => ({ ...current, useStream: value }))
              }
            />
          )}
        </Box>
        <PluginPromptSettings
          api={draft}
          prompts={prompts}
          onChange={(key, value) =>
            setOptions((current) => ({ ...current, [key]: value }))
          }
        />
        {!authorized && (
          <Alert
            severity="warning"
            action={
              <Button
                disabled={authorizationBusy}
                onClick={action(async () => {
                  setAuthorizationBusy(true);
                  try {
                    const id = providerPluginId(draft);
                    window.location.hash = `/plugins?plugin=${encodeURIComponent(id)}`;
                  } finally {
                    setAuthorizationBusy(false);
                  }
                })}
              >
                {i18n("plugin_go_to_authorization")}
              </Button>
            }
          >
            {i18n(
              "plugin_this_plugin_or_its_declared_fixed_addresses_are_not_authorized_authori"
            )}
          </Alert>
        )}
        <ServiceTimeoutSetting
          api={draft}
          onChange={(value) =>
            setOptions((current) => ({ ...current, httpTimeout: value }))
          }
        />
        <AsrDurationSetting
          api={draft}
          onTimestampChange={(value) =>
            setOptions((current) => ({
              ...current,
              asrTimestampSupport: value,
            }))
          }
          onChange={(value) =>
            setOptions((current) => ({
              ...current,
              asrMaxDurationSeconds: value,
            }))
          }
        />
        <Stack
          className="kt-api-detail__footer"
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          alignItems="center"
        >
          <Button
            variant="contained"
            disabled={!dirty || actionBusy}
            onClick={action(save, i18n("plugin_save_failed"))}
          >
            {i18n("save")}
          </Button>
          <Button
            variant="outlined"
            disabled={actionBusy}
            onClick={(event) => setActionsAnchor(event.currentTarget)}
          >
            {i18n("api_actions")}
          </Button>
        </Stack>
        <Menu
          anchorEl={actionsAnchor}
          open={Boolean(actionsAnchor)}
          onClose={() => setActionsAnchor(null)}
        >
          <MenuItem
            onClick={action(() => {
              setPatch({});
              setOptions({});
            })}
          >
            {i18n("plugin_discard_changes")}
          </MenuItem>
          {copyApi && (
            <MenuItem onClick={action(() => copyApi(api))}>
              {i18n("plugin_copy_service")}
            </MenuItem>
          )}
          {deleteApi && (
            <MenuItem
              sx={{ color: "error.main" }}
              onClick={action(async () => {
                if (
                  await confirm({
                    title: i18n("plugin_delete_service_instance"),
                    message: i18n("plugin_delete_this_service_instance"),
                  })
                )
                  deleteApi(api.apiSlug);
              })}
            >
              {i18n("plugin_delete_service")}
            </MenuItem>
          )}
          {onCollapse && (
            <MenuItem onClick={action(onCollapse)}>
              {i18n("popup_collapse")}
            </MenuItem>
          )}
        </Menu>
      </Stack>
      <ServiceTestCard
        actions={
          <>
            <Button
              disabled={
                !authorized ||
                authorizationBusy ||
                Boolean(call) ||
                quickBusy ||
                !enabled.includes(capability) ||
                !supportsProviderCapability(draft, capability)
              }
              onClick={test}
            >
              {i18n("plugin_run_test")}
            </Button>
            <Button disabled={!call} onClick={() => call?.cancel()}>
              {i18n("cancel")}
            </Button>
            {enabled.includes("translate") && (
              <QuickTranslationTest
                api={draft}
                disabled={!authorized || authorizationBusy || Boolean(call)}
                onBusyChange={setQuickBusy}
              />
            )}
          </>
        }
      >
        {testError && <Alert severity="error">{testError}</Alert>}
        {!enabled.length ? (
          <Alert severity="info">
            {i18n("plugin_no_capabilities_enabled")}
          </Alert>
        ) : (
          <>
            <TextField
              select
              size="small"
              label={i18n("plugin_test_capability")}
              value={enabled.includes(capability) ? capability : ""}
              onChange={(event) => {
                const name = event.target.value;
                setCapability(name);
                setText(
                  structuredTestSamples[name]
                    ? JSON.stringify(structuredTestSamples[name], null, 2)
                    : "Hello"
                );
              }}
            >
              {enabled.map((name) => (
                <MenuItem
                  key={name}
                  value={name}
                  disabled={!supportsProviderCapability(draft, name)}
                >
                  {i18n(capabilityLabelKeys[name], name)}
                  {!supportsProviderCapability(draft, name) &&
                    i18n("plugin_current_model_unavailable")}
                </MenuItem>
              ))}
            </TextField>
            {[
              "transcribe",
              "recognizeText",
              "parseImage",
              "analyzeLayout",
            ].includes(capability) ? (
              <input
                type="file"
                accept={capability === "transcribe" ? "audio/*" : "image/*"}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            ) : (
              <TextField
                multiline
                label={
                  structuredTestSamples[capability]
                    ? i18n("plugin_test_input_json")
                    : i18n("plugin_test_text")
                }
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            )}
            {result && (
              <TextField
                multiline
                label={i18n("plugin_result")}
                maxRows={12}
                value={result}
                inputProps={{ readOnly: true }}
              />
            )}
            {audioUrl && <audio controls src={audioUrl} />}
          </>
        )}
      </ServiceTestCard>
      {feedbackDialog}
    </Stack>
  );
}

export function ProviderSettings({ fields, values, onChange, service }) {
  const providerText = useProviderI18n();
  return fields.map((field) => {
    if (field.key === (service?.modelField || "model") && field.type === "text")
      return (
        <Autocomplete
          key={field.key}
          freeSolo
          forcePopupIcon
          size="small"
          options={(service?.models || []).map((model) => model.id)}
          value={values[field.key] || ""}
          onChange={(_, value) => onChange(field.key, value || "")}
          onInputChange={(_, value, reason) => {
            if (reason === "input") onChange(field.key, value);
          }}
          renderOption={(props, id) => {
            const model = service?.models?.find((item) => item.id === id);
            return (
              <li {...props}>
                {model?.name ? providerText(model.name, model.nameI18n) : id}
                {model?.name ? ` (${id})` : ""}
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={providerText(field.label, field.labelI18n)}
              required={field.required}
            />
          )}
        />
      );
    if (field.type === "boolean")
      return (
        <FormControlLabel
          key={field.key}
          label={providerText(field.label, field.labelI18n)}
          control={
            <Checkbox
              checked={Boolean(values[field.key])}
              onChange={(event) => onChange(field.key, event.target.checked)}
            />
          }
        />
      );
    const options = field.type === "select" ? getSettingOptions(field) : [];
    const Field =
      field.type === "password" || (field.type === "text" && field.isSecret)
        ? SensitiveTextField
        : TextField;
    return (
      <Field
        key={field.key}
        size="small"
        label={providerText(field.label, field.labelI18n)}
        required={field.required}
        select={field.type === "select"}
        type={field.type === "number" ? "number" : "text"}
        value={values[field.key] ?? ""}
        onChange={(event) =>
          onChange(
            field.key,
            field.type === "number" && event.target.value !== ""
              ? Number(event.target.value)
              : event.target.value
          )
        }
      >
        {field.type === "select" &&
          options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {providerText(option.label, option.labelI18n)}
            </MenuItem>
          ))}
      </Field>
    );
  });
}
