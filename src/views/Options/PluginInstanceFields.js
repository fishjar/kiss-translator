import { useProviderI18n } from "../../hooks/ProviderI18n";
import { useI18n } from "../../hooks/I18n";
import SensitiveTextField from "./SensitiveTextField";
import { useConfirm } from "../../hooks/Confirm";
import {
  ServiceTestCard,
  ServiceTestResult,
  useServiceTestTiming,
  ServiceFormHeader,
  BooleanServiceOption,
  serviceTransportFeatures,
  AsrDurationSetting,
  ServiceTimeoutSetting,
  serviceFieldsGridSx,
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
import { validateEnabledCapabilities } from "../../providers/capabilities";
import Autocomplete from "@mui/material/Autocomplete";
// 本面用裸 MUI Autocomplete，伪下拉样式由 ReusableAutocomplete 的注入体承担，
// 而注入规则整组限定在专属弹层类下，故须挂同一类（单源常量，勿重写字面量）；
// 注入入口亦须共用——本面可独立于任何 ReusableAutocomplete 实例挂载，
// 挂载期由 ProviderSettings 兜底注入同一份注入体。
import {
  PSEUDO_DROPDOWN_POPPER_CLASS,
  ensurePseudoDropdownStyles,
  getShadowCache,
  resolvePopperContainer,
} from "./ReusableAutocomplete";
import {
  createMenuKeyDownHandler,
  focusMenuTarget,
} from "../../libs/menuFocus";
import { ServiceUpgradeAction } from "./ServiceUpgrade";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";
import { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import { CacheProvider } from "@emotion/react";
import {
  Alert,
  Button,
  CircularProgress,
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
  deleteApi,
  copyApi,
}) {
  const i18n = useI18n();
  const providerText = useProviderI18n();
  const { updateSetting } = useSetting();
  const { prompts } = usePromptList();
  const [patch, setPatch] = useState({});
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState(null);
  const confirm = useConfirm();
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
  const [timing, startTiming] = useServiceTestTiming();
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
    const finishTiming = startTiming();
    setTestError("");
    setAudioUrl("");
    // A test may be cancelled while loading saved configuration,
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
      const input = applyTestPrompt(
        capability,
        createTestInput(capability, text, file, assets),
        current,
        { prompts: saved.prompts, subtitleSetting: saved.subtitleSetting }
      );
      if (active.current !== job || job.cancelled) return;
      const invocation = invokeInstance(current, capability, input, {
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
    } catch (err) {
      if (active.current === job) setTestError(err.message);
    } finally {
      assets.clear();
      if (active.current === job) {
        active.current = null;
        finishTiming();
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
        {upgradeSuccess && (
          <Alert severity="success">{i18n("plugin_service_upgraded")}</Alert>
        )}
        <ServiceUpgradeAction
          api={api}
          dirty={dirty}
          disabled={Boolean(call) || quickBusy}
          onUpgraded={() => {
            setPatch({});
            setOptions({});
            setResult("");
            setTestError("");
            setUpgradeSuccess(true);
          }}
        />
        <Box sx={serviceFieldsGridSx}>
          <ProviderSettings
            compact
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
              inline
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
            compact
            service={api.provider}
            fields={specific}
            values={draft.pluginConfig}
            onChange={changeField}
          />
          <>
            {features.batch && (
              <BooleanServiceOption
                name="useBatchFetch"
                label={i18n("plugin_batch_translation")}
                value={draft.useBatchFetch ?? false}
                onChange={(value) =>
                  setOptions((current) => ({
                    ...current,
                    useBatchFetch: value,
                  }))
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
          </>
          <PluginPromptSettings
            inline
            api={draft}
            prompts={prompts}
            onChange={(key, value) =>
              setOptions((current) => ({ ...current, [key]: value }))
            }
          />
          <ServiceTimeoutSetting
            api={draft}
            onChange={(value) =>
              setOptions((current) => ({ ...current, httpTimeout: value }))
            }
          />
          <AsrDurationSetting
            inline
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
        </Box>
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
        timing={timing}
        actions={
          <>
            <Button
              aria-busy={Boolean(call)}
              startIcon={
                call ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                    aria-label={i18n("plugin_test_running")}
                  />
                ) : undefined
              }
              disabled={
                Boolean(call) ||
                quickBusy ||
                !enabled.includes(capability) ||
                !supportsProviderCapability(draft, capability)
              }
              onClick={test}
            >
              {i18n(call ? "plugin_test_running" : "plugin_run_test")}
            </Button>
            <Button disabled={!call} onClick={() => call?.cancel()}>
              {i18n("cancel")}
            </Button>
            {enabled.includes("translate") && (
              <QuickTranslationTest
                api={draft}
                disabled={Boolean(call)}
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
            {result && <ServiceTestResult result={result} />}
            {audioUrl && <audio controls src={audioUrl} />}
          </>
        )}
      </ServiceTestCard>
      {feedbackDialog}
    </Stack>
  );
}

export function ProviderSettings({
  fields,
  values,
  onChange,
  service,
  compact = false,
}) {
  const providerText = useProviderI18n();
  // 弹层与 emotion 样式的按根接线：fields 可异步到达（service 配置迟加载），
  // effect 必须随 fields 重跑；挂载后实例级字段锚点已回填（ref 回调先于
  // layout effect）。按锚点节点所属根判定（主文档 → head 去重注入；影子
  // 宿主 → 该影子根注入 + emotion 影子缓存——head 默认缓存的规则不级联进
  // 影子树）；纯 select 面的菜单弹层同样依赖该判定。缓存翻转守卫单向
  // （null → cache）：包裹翻转 = 返回树根元素类型翻转，React 视为不同节点
  // 整树卸载重挂，不得随重渲染来回翻转。modelFieldRef 声明在本 effect 之下
  // （函数组件体内 ref 不受书写顺序约束，闭包执行时序合法）。
  const [shadowCache, setShadowCache] = useState(null);
  // 实例级字段节点登记表（按字段 key 键控，Map 保持首插序）：select 与模型
  // 字段的挂载回调各登记/注销自身，锚点取首个在挂字段节点。影子根检测与
  // select 菜单容器解析共用该锚点——不单靠可为空的 modelFieldRef（无模型
  // 字段实例也有 select 弹层），也不依赖共享 selectFieldRef（多 select 字段
  // 时最后挂载者胜出，任一字段卸载即清空共享 ref）。卸载回调经字段 key
  // 闭包注销（React 卸载只回调 null，不带节点身份）。
  const fieldNodeRefs = useRef(new Map());
  const anchorNode = () => {
    for (const node of fieldNodeRefs.current.values()) return node;
    return null;
  };
  useLayoutEffect(() => {
    const ownerRoot = anchorNode()?.getRootNode?.();
    if (ownerRoot?.host) setShadowCache(getShadowCache(ownerRoot));
    // modelField 无效→有效切换时 fields 不变，仅 service.modelField 变化：
    // 缺该依赖则字段换型（text → Autocomplete）后 effect 不重跑，注入缺位。
  }, [fields, service?.modelField]);
  useEffect(() => {
    const fieldNode = modelFieldRef.current;
    if (!fieldNode) return;
    ensurePseudoDropdownStyles(fieldNode.getRootNode());
  }, [fields, service?.modelField]);
  // 裸 Autocomplete 弹层挂根锚点：MUI v5 Autocomplete forwardRef 到根 div。
  const modelFieldRef = useRef(null);
  // select 下拉弹层与影子焦点契约接线：影子宿主场景菜单默认 portal 到
  // body，与影子缓存注入的样式异根（样式不级联出影子边界即失活）。
  // shadowCache 非空（组件活在影子树）时 MenuProps 条件化声明——container
  // 按锚点所属根挂回 resolvePopperContainer 解析的根；Shadow 弹层焦点
  // 契约三键同给关掉 MUI 自持焦点链，初始焦点经 focusMenuTarget 走
  // scriptFocus 单一入口（focusModality 统一处置覆盖）。非影子路径三键
  // 不声明、零行为变化。
  const selectFieldRef = useRef(null);
  const navigateSelectMenu = useMemo(
    () => createMenuKeyDownHandler({ shadowOnly: true }),
    []
  );
  const selectMenuProps = shadowCache
    ? {
        container: () => {
          const anchor = anchorNode();
          return anchor?.getRootNode?.()?.host
            ? resolvePopperContainer(anchor)
            : undefined;
        },
        autoFocus: false,
        disableAutoFocus: true,
        disableAutoFocusItem: true,
        disableEnforceFocus: true,
        // 影子树内 document.activeElement＝影子宿主，MUI MenuList 的方向键
        // 导航据此定位当前项会每次回卷首项；捕获导航改由影子口径处理器
        // 接管（镜像 EditorSelect 的 shadowOnly 先例）。
        MenuListProps: {
          onKeyDownCapture: navigateSelectMenu,
        },
        // 初始焦点交付挂 Grow 的 onEntered（MenuProps 顶层 onEntered 在
        // Popover→Modal→Portal 链上被丢弃）：TransitionProps 由 Menu 与
        // 内部 onEntering 合流后落 Grow，node 即菜单 Paper，focusMenuTarget
        // 以选中项→Mui-selected→可用项优先级与容器兜底禁令选点。
        TransitionProps: {
          onEntered: (node) => focusMenuTarget(node),
        },
      }
    : undefined;
  const content = fields.map((field) => {
    const sx =
      compact &&
      (field.type === "password" ||
        field.isSecret ||
        /(?:url|endpoint|address|apiKey|^key$)$/i.test(field.key))
        ? { gridColumn: "1 / -1" }
        : undefined;
    if (field.key === (service?.modelField || "model") && field.type === "text")
      return (
        <Autocomplete
          key={field.key}
          ref={(node) => {
            modelFieldRef.current = node;
            if (node) fieldNodeRefs.current.set(field.key, node);
            else fieldNodeRefs.current.delete(field.key);
          }}
          freeSolo={service?.allowCustomModel !== false}
          disableClearable={service?.allowCustomModel === false}
          forcePopupIcon
          size="small"
          slotProps={{
            popper: {
              className: PSEUDO_DROPDOWN_POPPER_CLASS,
              // 弹层默认 portal 到 body，脱离 .kt-m3-root 令牌作用域；与
              // ReusableAutocomplete 共用同一回退链（.kt-m3-root 祖先 →
              // 影子根 → body），以字段根节点为锚点解析容器。
              container: () => resolvePopperContainer(modelFieldRef.current),
            },
          }}
          options={(service?.models || []).map((model) => model.id)}
          value={values[field.key] || ""}
          onChange={(_, value) => onChange(field.key, value || "")}
          onInputChange={(_, value, reason) => {
            if (reason === "input" && service?.allowCustomModel !== false)
              onChange(field.key, value);
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
        sx={sx}
        fullWidth={compact || undefined}
        key={field.key}
        size="small"
        label={providerText(field.label, field.labelI18n)}
        helperText={providerText(field.helpText, field.helpTextI18n)}
        required={field.required}
        select={field.type === "select"}
        type={field.type === "number" ? "number" : "text"}
        value={values[field.key] ?? ""}
        ref={
          field.type === "select"
            ? (node) => {
                selectFieldRef.current = node;
                if (node) fieldNodeRefs.current.set(field.key, node);
                else fieldNodeRefs.current.delete(field.key);
              }
            : undefined
        }
        SelectProps={
          field.type === "select" ? { MenuProps: selectMenuProps } : undefined
        }
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
  // 影子宿主场景整树包进影子根专属缓存：head 默认缓存的 MUI 规则不级联进
  // 影子树，弹层已 portal 回影子根而样式落 head 即整体失活。非影子路径
  // （shadowCache 为 null）零包裹、零行为变化。
  return shadowCache ? (
    <CacheProvider value={shadowCache}>{content}</CacheProvider>
  ) : (
    content
  );
}
