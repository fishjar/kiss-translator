import TouchTranslateControl from "../../components/TouchTranslateControl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import DoNotDisturbOnRoundedIcon from "@mui/icons-material/DoNotDisturbOnRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import HighlightAltRoundedIcon from "@mui/icons-material/HighlightAltRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import {
  sendBgMsg,
  sendTabMsg,
  sendTopFrameMsg,
  getCurTab,
} from "../../libs/msg";
import { isExt } from "../../libs/client";
import { useI18n } from "../../hooks/I18n";
import {
  MSG_TRANS_TOGGLE,
  MSG_RULE_EDITOR,
  MSG_TRANS_PUTRULE,
  MSG_SAVE_RULE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";
import { saveRule } from "../../libs/rules";
import { getRulesWithDefault } from "../../libs/storage";
import { tryClearCaches } from "../../libs/cache";
import { kissLog } from "../../libs/log";
import { getDomainOptions } from "../../libs/url";
import {
  getCompactStylePreviewCode,
  useAllTextStyles,
} from "../../hooks/CustomStyles";
import { useOverviewShortcuts } from "../../hooks/Commands";
import { isInBlacklist } from "../../libs/blacklist";
import { useSetting } from "../../hooks/Setting";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import { COLLAPSED_SERVICE_LIMIT, getVisibleServices } from "./services";
import CompactLanguageSelect from "./CompactLanguageSelect";
import PopupStylePreview from "./PopupStylePreview";
import PopupMenu from "./PopupMenu";
import { queryPopupData } from "./loadData";
import { useConfirmedPopupUpdate } from "./useConfirmedPopupUpdate";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";

const isTouchAction = (action) =>
  action === MSG_TOUCH_TRANSLATE_STATE ||
  action === MSG_TOUCH_TRANSLATE_MODE_SET;
export const POPUP_RULE_FIELDS = [
  "fromLang",
  "toLang",
  "apiSlug",
  "textStyle",
  "transOnly",
  "hasRichText",
  "scanAll",
  "isPlainText",
  "autoScan",
];
const enabledValue = (value) => value === true || value === "true";
function handleRadioKeyDown(event) {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ].includes(event.key)
  )
    return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll('button[role="radio"]:not(:disabled)')
  );
  const index = buttons.indexOf(event.target);
  if (index < 0 || !buttons.length) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index +
            (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
            buttons.length) %
          buttons.length;
  buttons[next].focus();
  buttons[next].click();
}
const normalizedValue = (name, value) =>
  ["transOnly", "hasRichText", "scanAll", "isPlainText", "autoScan"].includes(
    name
  )
    ? enabledValue(value)
    : value;

export function resolvePopupTextStyles(
  allTextStyles,
  activeStyleSlug,
  expanded
) {
  if (expanded) return allTextStyles;
  const active = allTextStyles.find(
    (style) => style.styleSlug === activeStyleSlug
  );
  return [
    ...new Map(
      [active, ...allTextStyles]
        .filter(Boolean)
        .map((style) => [style.styleSlug, style])
    ).values(),
  ].slice(0, 5);
}

export default function PopupCont({
  rule,
  setting,
  setRule,
  handleOpenSetting,
  processActions,
  targetTab,
  documentInfo,
  isVisible = true,
  onPageUnavailable,
  capabilities,
  isTopFrame = true,
  isContent = false,
  isDisabledPage = false,
}) {
  const i18n = useI18n();
  const { setting: contextSetting, updateSetting } = useSetting();
  const shortcutMap = useOverviewShortcuts(setting);
  const [domainOptions, setDomainOptions] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [currentHref, setCurrentHref] = useState("");
  const [favicon, setFavicon] = useState("");
  const [baselineRule, setBaselineRule] = useState(() => ({ ...rule }));
  const [savedPatterns, setSavedPatterns] = useState([]);
  const [openMenu, setOpenMenu] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [cacheStatus, setCacheStatus] = useState("idle");
  const [editorOpening, setEditorOpening] = useState(false);
  const [editorError, setEditorError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [translationError, setTranslationError] = useState(false);
  const [blacklistPending, setBlacklistPending] = useState(false);
  const [ruleUpdatePending, setRuleUpdatePending] = useState(0);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationTogglePending, setTranslationTogglePending] =
    useState(false);
  const busyTimerRef = useRef(null);
  const timersRef = useRef(new Map());
  const translationTogglePendingRef = useRef(false);
  const savePendingRef = useRef(false);
  const blacklistPendingRef = useRef(false);
  const cachePendingRef = useRef(false);
  const editorPendingRef = useRef(false);
  const ruleUpdatePendingRef = useRef(0);
  const ruleRef = useRef(rule);
  const styleGridRef = useRef(null);
  const activeRef = useRef(true);
  const visibleRef = useRef(isVisible);
  const touchActivityRef = useRef(0);
  const pageActionSequenceRef = useRef(0);
  const hasTargetTab = targetTab != null;
  const targetTabUrl = targetTab?.url;
  const targetFaviconUrl = targetTab?.favIconUrl;
  const canTranslatePage = capabilities?.pageTranslation !== false;
  const canEditRule = isTopFrame && capabilities?.ruleEditor !== false;
  const { allTextStyles } = useAllTextStyles();

  const resetLater = useCallback((key, reset) => {
    window.clearTimeout(timersRef.current.get(key));
    timersRef.current.set(
      key,
      window.setTimeout(() => {
        if (activeRef.current) reset();
        timersRef.current.delete(key);
      }, 2000)
    );
  }, []);
  useEffect(() => {
    activeRef.current = true;
    const timers = timersRef.current;
    return () => {
      activeRef.current = false;
      window.clearTimeout(busyTimerRef.current);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  useLayoutEffect(() => {
    ruleRef.current = rule;
  }, [rule]);
  useLayoutEffect(() => {
    visibleRef.current = isVisible;
    touchActivityRef.current += 1;
  }, [isVisible, targetTab?.id, documentInfo?.token]);

  useEffect(() => {
    let active = true;
    getRulesWithDefault()
      .then((rules) => {
        if (active)
          setSavedPatterns((previous) => [
            ...new Set([
              ...previous,
              ...rules
                .filter((item) => item.enabled !== false)
                .map((item) => item.pattern),
            ]),
          ]);
      })
      .catch((error) => kissLog("read saved popup rules", error));
    return () => {
      active = false;
    };
  }, []);

  const blacklistValue = contextSetting?.blacklist ?? setting?.blacklist ?? "";
  const isInCurrentBlacklist = useMemo(
    () =>
      Boolean(
        currentHref &&
          blacklistValue &&
          isInBlacklist(currentHref, blacklistValue)
      ),
    [blacklistValue, currentHref]
  );
  const matchingBlacklistEntries = blacklistValue
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(
      (entry) => entry && currentHref && isInBlacklist(currentHref, entry)
    );
  const restorePattern = matchingBlacklistEntries.includes(selectedDomain)
    ? selectedDomain
    : [...matchingBlacklistEntries].sort(
        (left, right) => right.length - left.length
      )[0];
  useEffect(() => {
    if (
      !isDisabledPage ||
      !currentHref ||
      isInCurrentBlacklist ||
      !Number.isInteger(targetTab?.id)
    )
      return undefined;
    let current = true;
    // Stored preferences can change in this popup or another extension page.
    // Wait for the existing content script to resume before exposing controls.
    void (async () => {
      for (let attempt = 0; attempt < 12 && current; attempt += 1) {
        const data = await queryPopupData(targetTab.id).catch(() => null);
        if (!current || !activeRef.current) return;
        if (data?.rule && data?.setting && !data.error) break;
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      if (current && activeRef.current) onPageUnavailable?.();
    })();
    return () => {
      current = false;
    };
  }, [
    isDisabledPage,
    currentHref,
    isInCurrentBlacklist,
    targetTab?.id,
    onPageUnavailable,
  ]);
  const showActionError = useCallback(
    (error) => {
      kissLog("update popup page state", error);
      if (!activeRef.current) return;
      setActionError(i18n("popup_action_failed"));
      resetLater("action", () => setActionError(""));
    },
    [i18n, resetLater]
  );
  const updateBlacklist = useCallback(
    async (remove) => {
      if (!selectedDomain || blacklistPendingRef.current) return;
      blacklistPendingRef.current = true;
      setBlacklistPending(true);
      try {
        await updateSetting((previous) => {
          const entries = (previous?.blacklist || "")
            .split(/\n|,/)
            .map((entry) => entry.trim())
            .filter(Boolean);
          return {
            ...previous,
            blacklist: remove
              ? entries.filter((entry) => entry !== restorePattern).join("\n")
              : [...new Set([...entries, selectedDomain])].join("\n"),
          };
        });
      } catch (error) {
        showActionError(error);
      } finally {
        blacklistPendingRef.current = false;
        if (activeRef.current) setBlacklistPending(false);
      }
    },
    [selectedDomain, restorePattern, updateSetting, showActionError]
  );
  const handleAddToBlacklist = useCallback(
    () => updateBlacklist(false),
    [updateBlacklist]
  );
  const handleRemoveFromBlacklist = useCallback(
    () => updateBlacklist(true),
    [updateBlacklist]
  );

  const sendPageMessage = useCallback(
    (action, args, topFrame = false) => {
      if (targetTab?.id !== undefined) {
        if (isTouchAction(action) && documentInfo?.token) {
          return sendTabMsg(
            action,
            args,
            { frameId: documentInfo.frameId },
            targetTab.id,
            documentInfo.token
          );
        }
        return topFrame
          ? documentInfo?.frameId === 0
            ? sendTopFrameMsg(action, args, targetTab.id, documentInfo.token)
            : sendTopFrameMsg(action, args, targetTab.id)
          : documentInfo?.token
            ? sendTabMsg(
                action,
                args,
                undefined,
                targetTab.id,
                undefined,
                documentInfo.token
              )
            : sendTabMsg(action, args, undefined, targetTab.id);
      }
      return topFrame
        ? args === undefined
          ? sendTopFrameMsg(action)
          : sendTopFrameMsg(action, args)
        : sendTabMsg(action, args);
    },
    [targetTab?.id, documentInfo]
  );

  const dispatchPageAction = useCallback(
    async (action, args) => {
      if (processActions) {
        const response = await processActions({ action, args });
        if (response?.error) throw new Error(response.error);
        return response;
      }
      const sequence = ++pageActionSequenceRef.current;
      let result;
      try {
        result = await sendPageMessage(action, args);
      } catch (error) {
        if (documentInfo) {
          // A frame can disappear after receiving the command. A separate
          // availability check may recover the panel, but cannot confirm it.
          const current = await queryPopupData(
            targetTab?.id,
            documentInfo
          ).catch(() => undefined);
          if (current == null && sequence === pageActionSequenceRef.current) {
            onPageUnavailable?.();
          }
        }
        throw error;
      }
      if (result?.error) {
        if (
          result.code === "STALE_DOCUMENT" &&
          sequence === pageActionSequenceRef.current
        ) {
          onPageUnavailable?.();
        }
        throw new Error(result.error);
      }
      // Only the selected document acknowledges a broadcast. Verify that it
      // is still current before accepting its resulting state.
      const response = await queryPopupData(targetTab?.id, documentInfo);
      if (response == null && sequence === pageActionSequenceRef.current) {
        onPageUnavailable?.();
      }
      if (response?.error) throw new Error(response.error);
      // Touch state is returned by its own command, after verifying that the
      // document which produced it still owns this popup's page controls.
      return isTouchAction(action) && response != null ? result : response;
    },
    [
      onPageUnavailable,
      processActions,
      sendPageMessage,
      targetTab?.id,
      documentInfo,
    ]
  );

  const dispatchTouchAction = useCallback(
    async ({ action, args }) => {
      if (
        !processActions &&
        (!Number.isInteger(targetTab?.id) || !documentInfo?.token)
      ) {
        throw new Error("The popup document is not ready.");
      }
      if (!isVisible || !activeRef.current || !visibleRef.current) {
        throw new Error("The popup page controls are no longer active.");
      }
      const activity = touchActivityRef.current;
      const response = await dispatchPageAction(action, args);
      // A late reply must not persist a preference after navigation or unmount.
      if (
        !activeRef.current ||
        !visibleRef.current ||
        activity !== touchActivityRef.current
      ) {
        throw new Error("The popup page controls are no longer active.");
      }
      return response;
    },
    [
      dispatchPageAction,
      documentInfo?.token,
      isVisible,
      processActions,
      targetTab?.id,
    ]
  );

  const updateRule = useConfirmedPopupUpdate({
    value: rule,
    setValue: setRule,
    onError: showActionError,
  });
  const putRuleValues = useCallback(
    async (values) => {
      if (!canTranslatePage || isInCurrentBlacklist) return;
      ruleRef.current = { ...ruleRef.current, ...values };
      ruleUpdatePendingRef.current += 1;
      setRuleUpdatePending(ruleUpdatePendingRef.current);
      setSaveStatus("idle");
      try {
        await updateRule(
          values,
          async () =>
            (await dispatchPageAction(MSG_TRANS_PUTRULE, values))?.rule
        );
      } finally {
        ruleUpdatePendingRef.current -= 1;
        if (activeRef.current)
          setRuleUpdatePending(ruleUpdatePendingRef.current);
      }
    },
    [canTranslatePage, isInCurrentBlacklist, dispatchPageAction, updateRule]
  );
  const putRuleValue = useCallback(
    (name, value) => putRuleValues({ [name]: value }),
    [putRuleValues]
  );
  const handleSwapLanguages = useCallback(() => {
    const { fromLang, toLang } = ruleRef.current;
    void putRuleValues({ fromLang: toLang, toLang: fromLang });
  }, [putRuleValues]);

  const handleTransToggle = useCallback(
    async (enabled) => {
      if (
        !canTranslatePage ||
        isInCurrentBlacklist ||
        translationTogglePendingRef.current
      )
        return;
      translationTogglePendingRef.current = true;
      setTranslationTogglePending(true);
      setTranslationError(false);
      const previousTransOpen = ruleRef.current?.transOpen;
      window.clearTimeout(busyTimerRef.current);
      setRule((previous) => ({
        ...previous,
        transOpen: enabled ? "true" : "false",
      }));
      setTranslationBusy(enabled);
      try {
        const response = await dispatchPageAction(MSG_TRANS_TOGGLE, {
          enabled,
        });
        if (!activeRef.current) return;
        const confirmed = response?.rule?.transOpen;
        if (
          ![true, false, "true", "false"].includes(confirmed) ||
          enabledValue(confirmed) !== enabled
        )
          throw new Error("Page translation state was not confirmed");
        setRule((previous) => ({
          ...previous,
          transOpen: enabled ? "true" : "false",
        }));
        busyTimerRef.current = window.setTimeout(
          () => setTranslationBusy(false),
          enabled ? 900 : 0
        );
      } catch (error) {
        if (!activeRef.current) return;
        kissLog("toggle translation", error);
        setRule((previous) => ({ ...previous, transOpen: previousTransOpen }));
        setTranslationBusy(false);
        setTranslationError(true);
        resetLater("translation", () => setTranslationError(false));
      } finally {
        if (activeRef.current) {
          translationTogglePendingRef.current = false;
          setTranslationTogglePending(false);
        }
      }
    },
    [
      canTranslatePage,
      isInCurrentBlacklist,
      dispatchPageAction,
      setRule,
      resetLater,
    ]
  );

  const handleOpenRuleEditor = useCallback(async () => {
    if (!canEditRule || editorPendingRef.current) return;
    editorPendingRef.current = true;
    setEditorOpening(true);
    setEditorError(false);
    try {
      const response = processActions
        ? await processActions({ action: MSG_RULE_EDITOR })
        : await sendPageMessage(MSG_RULE_EDITOR, undefined, true);
      if (!activeRef.current || !visibleRef.current) return;
      if (response?.error || response?.ruleEditorOpened !== true)
        throw new Error(response?.error || "Rule editor did not open");
      if (!processActions) window.close();
    } catch (error) {
      if (activeRef.current) {
        setEditorError(true);
        kissLog("open popup rule editor", error);
        resetLater("editor", () => setEditorError(false));
      }
    } finally {
      editorPendingRef.current = false;
      if (activeRef.current) setEditorOpening(false);
    }
  }, [canEditRule, processActions, sendPageMessage, resetLater]);
  const handleClearCache = useCallback(async () => {
    if (cachePendingRef.current || cacheStatus === "done") return;
    cachePendingRef.current = true;
    setCacheStatus("clearing");
    let cleared = false;
    try {
      cleared = await tryClearCaches();
    } catch (error) {
      kissLog("clear popup cache", error);
    }
    cachePendingRef.current = false;
    if (!activeRef.current) return;
    setCacheStatus(cleared ? "done" : "error");
    resetLater("cache", () => setCacheStatus("idle"));
  }, [cacheStatus, resetLater]);
  const handleSaveRule = useCallback(async () => {
    if (
      !selectedDomain ||
      savePendingRef.current ||
      ruleUpdatePendingRef.current ||
      translationTogglePendingRef.current
    )
      return;
    savePendingRef.current = true;
    setSaveStatus("saving");
    const savedRule = { ...ruleRef.current, pattern: selectedDomain };
    try {
      const response =
        isExt && isContent
          ? await sendBgMsg(MSG_SAVE_RULE, savedRule)
          : await saveRule(savedRule);
      if (response?.error) throw new Error(response.error);
      if (!activeRef.current) return;
      setBaselineRule(savedRule);
      setSavedPatterns((previous) => [
        ...new Set([...previous, savedRule.pattern]),
      ]);
      setSaveStatus("saved");
    } catch (error) {
      kissLog("save popup rule", error);
      if (activeRef.current) setSaveStatus("error");
    } finally {
      savePendingRef.current = false;
    }
  }, [selectedDomain, isContent]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const tab = isContent
          ? { url: window.location?.href }
          : hasTargetTab
            ? { url: targetTabUrl, favIconUrl: targetFaviconUrl }
            : await getCurTab();
        if (!active || !tab?.url) return;
        const options = getDomainOptions(tab.url);
        setCurrentHref(tab.url);
        setDomainOptions(options);
        setSelectedDomain(options[0] || "");
        setFavicon(tab.favIconUrl || "");
      } catch (error) {
        kissLog("get popup domain options", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [isContent, hasTargetTab, targetTabUrl, targetFaviconUrl]);

  const services = useMemo(
    () =>
      (setting?.transApis || [])
        .filter((api) => !api.isDisabled)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((api) => ({
          key: api.apiSlug,
          type: api.apiType || api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [setting?.transApis]
  );
  const { transOpen, apiSlug, fromLang, toLang, textStyle, transOnly } =
    rule || {};
  const translationEnabled = canTranslatePage && enabledValue(transOpen);
  const isAutoSource =
    !fromLang || fromLang === "auto" || fromLang === "$global";
  const visibleServices = useMemo(
    () => getVisibleServices(services, apiSlug, false),
    [services, apiSlug]
  );
  const serviceIndex = visibleServices.findIndex(
    (service) => service.key === apiSlug
  );
  const hiddenServiceCount = services.length - visibleServices.length;
  const activeStyle = allTextStyles.find(
    (style) => style.styleSlug === textStyle
  );
  const dirtyFields = POPUP_RULE_FIELDS.filter(
    (name) =>
      normalizedValue(name, rule?.[name]) !==
      normalizedValue(name, baselineRule?.[name])
  );
  const isDirty = (name) => dirtyFields.includes(name);
  const hasSavedRule = savedPatterns.includes(selectedDomain);
  const saved = hasSavedRule && !dirtyFields.length;
  const blockedControls = isInCurrentBlacklist || !canTranslatePage;
  const fieldLabels = {
    fromLang: i18n("from_lang"),
    toLang: i18n("to_lang"),
    apiSlug: i18n("translate_service"),
    textStyle: i18n("text_style_alt"),
    transOnly: i18n("popup_display_mode"),
    autoScan: i18n("autoscan_alt"),
    scanAll: i18n("scan_all_nodes"),
    hasRichText: i18n("richtext_alt"),
    isPlainText: i18n("plain_text_translate"),
  };
  const pageOptions = ["autoScan", "scanAll", "hasRichText", "isPlainText"];
  const pageShortcut = shortcutMap.page.join("+");
  const translationLabel = isInCurrentBlacklist
    ? i18n("popup_restore_site")
    : !canTranslatePage
      ? i18n("popup_unavailable")
      : translationError
        ? i18n("rule_toggle_failed")
        : translationBusy
          ? i18n("popup_translating")
          : translationEnabled
            ? i18n("popup_translated")
            : i18n("popup_translate_page");
  const actionLabel = isInCurrentBlacklist
    ? i18n("popup_restore_site")
    : translationEnabled
      ? i18n("popup_show_original")
      : i18n("popup_translate_page");
  const menuProps = (name) => ({
    anchorEl: openMenu?.name === name ? openMenu.anchor : null,
    open: openMenu?.name === name,
    onClose: () => setOpenMenu(null),
  });
  useEffect(() => {
    if (openMenu?.name !== "style") return undefined;
    const frame = requestAnimationFrame(() =>
      (
        styleGridRef.current?.querySelector('[aria-pressed="true"]') ||
        styleGridRef.current?.querySelector("button")
      )?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [openMenu?.name]);
  const showMenu = (name, event) =>
    setOpenMenu({ name, anchor: event.currentTarget });
  const dirtyDot = (name) =>
    isDirty(name) && <span className="kt-popup-dirty-dot" aria-hidden="true" />;
  const saveLabel =
    saveStatus === "saving"
      ? i18n("popup_saving")
      : saveStatus === "error"
        ? i18n("popup_save_failed")
        : dirtyFields.length
          ? i18n("popup_save_changes").replace("{count}", dirtyFields.length)
          : saved
            ? i18n("popup_saved")
            : i18n("popup_save_site");
  const SaveIcon =
    saveStatus === "error"
      ? ErrorOutlineRoundedIcon
      : saved
        ? CheckRoundedIcon
        : BookmarkAddRoundedIcon;

  return (
    <section className="kt-popup-content">
      <div
        className={`kt-popup-hero${translationEnabled ? " kt-popup-hero--translated" : ""}${isInCurrentBlacklist ? " kt-popup-hero--blocked" : ""}${translationBusy ? " kt-popup-hero--busy" : ""}`}
        aria-busy={translationTogglePending || translationBusy}
      >
        <div className="kt-popup-hero__main">
          <div className="kt-popup-site-row">
            <span className="kt-popup-favicon" aria-hidden="true">
              {favicon ? (
                <img src={favicon} alt="" onError={() => setFavicon("")} />
              ) : (
                <LanguageRoundedIcon />
              )}
            </span>
            <button
              type="button"
              className="kt-popup-pattern-button"
              title={selectedDomain}
              aria-label={i18n("popup_match_scope")}
              aria-haspopup="menu"
              aria-expanded={openMenu?.name === "pattern"}
              disabled={!domainOptions.length}
              onClick={(event) => showMenu("pattern", event)}
            >
              <span>{selectedDomain || i18n("popup_unavailable")}</span>
              <ArrowDropDownRoundedIcon aria-hidden="true" />
            </button>
            {isInCurrentBlacklist && (
              <span className="kt-popup-blocked-badge">
                <DoNotDisturbOnRoundedIcon aria-hidden="true" />
                {i18n("popup_site_disabled")}
              </span>
            )}
          </div>
          <div
            className="kt-popup-language-row"
            aria-disabled={blockedControls}
          >
            <div className="kt-popup-language">
              <CompactLanguageSelect
                value={fromLang}
                ariaLabel={i18n("from_lang")}
                options={OPT_LANGS_FROM}
                disabled={blockedControls}
                changed={isDirty("fromLang")}
                onChange={(event) =>
                  void putRuleValue("fromLang", event.target.value)
                }
              />
            </div>
            <IconButton
              className="kt-popup-swap"
              disabled={blockedControls || isAutoSource}
              title={i18n("swap_languages")}
              aria-label={i18n("swap_languages")}
              onClick={handleSwapLanguages}
            >
              <SwapHorizRoundedIcon />
            </IconButton>
            <div className="kt-popup-language">
              <CompactLanguageSelect
                value={toLang}
                ariaLabel={i18n("to_lang")}
                options={OPT_LANGS_TO}
                disabled={blockedControls}
                changed={isDirty("toLang")}
                onChange={(event) =>
                  void putRuleValue("toLang", event.target.value)
                }
              />
            </div>
          </div>
        </div>
        <div className="kt-popup-translate-action">
          <button
            type="button"
            className="kt-popup-translate-button"
            aria-label={actionLabel}
            aria-pressed={translationEnabled}
            aria-busy={translationTogglePending || translationBusy}
            title={
              isInCurrentBlacklist
                ? i18n("popup_restore_scope_hint").replace(
                    "{domain}",
                    restorePattern || selectedDomain
                  )
                : `${actionLabel}${pageShortcut ? ` (${pageShortcut})` : ""}`
            }
            disabled={
              (!canTranslatePage && !isInCurrentBlacklist) ||
              translationTogglePending ||
              blacklistPending
            }
            onClick={() =>
              void (isInCurrentBlacklist
                ? handleRemoveFromBlacklist()
                : handleTransToggle(!translationEnabled))
            }
          >
            <span className="kt-popup-translate-icon">
              {isInCurrentBlacklist ? (
                <RestartAltRoundedIcon />
              ) : (
                <TranslateRoundedIcon />
              )}
            </span>
            {translationEnabled && !isInCurrentBlacklist && (
              <>
                <span className="kt-popup-undo-icon">
                  <UndoRoundedIcon />
                </span>
                <span className="kt-popup-translate-check">
                  <CheckRoundedIcon />
                </span>
              </>
            )}
          </button>
          <span
            className={`kt-popup-translate-label${translationError ? " kt-popup-translate-label--error" : ""}`}
            role="status"
          >
            <span>{translationLabel}</span>
            {translationEnabled &&
              !translationBusy &&
              !isInCurrentBlacklist &&
              !translationError && (
                <span className="kt-popup-translate-hover-label">
                  {i18n("popup_show_original")}
                </span>
              )}
          </span>
        </div>
      </div>
      <div className="kt-popup-settings-grid" aria-disabled={blockedControls}>
        <div className="kt-popup-services-block">
          <div
            className="kt-popup-services"
            role="radiogroup"
            aria-label={i18n("translate_service")}
            onKeyDown={handleRadioKeyDown}
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, visibleServices.length)}, minmax(0, 1fr))`,
            }}
          >
            {serviceIndex >= 0 && (
              <span
                className="kt-popup-segment-indicator"
                aria-hidden="true"
                style={{
                  width: `${100 / visibleServices.length}%`,
                  transform: `translateX(${serviceIndex * 100}%)`,
                }}
              />
            )}
            {visibleServices.map((service) => (
              <button
                type="button"
                className="kt-popup-service"
                role="radio"
                aria-checked={service.key === apiSlug}
                key={service.key}
                title={service.name}
                disabled={blockedControls}
                onClick={() => void putRuleValue("apiSlug", service.key)}
              >
                <ApiProviderIcon
                  apiType={service.type}
                  className="kt-service-logo"
                  lightSurface
                />
                <span className="kt-popup-service__name">{service.name}</span>
              </button>
            ))}
          </div>
          {services.length > COLLAPSED_SERVICE_LIMIT && (
            <button
              type="button"
              className="kt-popup-more-service"
              aria-label={i18n("popup_more_services")}
              aria-haspopup="menu"
              aria-expanded={openMenu?.name === "service"}
              disabled={blockedControls}
              onClick={(event) => showMenu("service", event)}
            >
              +{hiddenServiceCount}
              <ExpandMoreRoundedIcon aria-hidden="true" />
            </button>
          )}
          {dirtyDot("apiSlug")}
        </div>
        <button
          type="button"
          className="kt-popup-style-select"
          aria-label={i18n("text_style_alt")}
          aria-haspopup="menu"
          aria-expanded={openMenu?.name === "style"}
          disabled={blockedControls}
          onClick={(event) => showMenu("style", event)}
        >
          <span className="kt-popup-style-label">{i18n("popup_style")}</span>
          <span className="kt-popup-style-value">
            <PopupStylePreview
              styleSlug={textStyle}
              previewCode={
                activeStyle ? getCompactStylePreviewCode(activeStyle) : ""
              }
              label={activeStyle?.styleName || textStyle}
            />
          </span>
          <ExpandMoreRoundedIcon aria-hidden="true" />
          {dirtyDot("textStyle")}
        </button>
        <div
          className="kt-popup-display-mode"
          role="radiogroup"
          aria-label={i18n("popup_display_mode")}
          onKeyDown={handleRadioKeyDown}
        >
          <span
            className="kt-popup-segment-indicator"
            aria-hidden="true"
            style={{
              transform: `translateX(${enabledValue(transOnly) ? 100 : 0}%)`,
            }}
          />
          {[false, true].map((only) => (
            <button
              type="button"
              role="radio"
              key={String(only)}
              aria-checked={enabledValue(transOnly) === only}
              disabled={blockedControls}
              onClick={() => void putRuleValue("transOnly", String(only))}
            >
              {i18n(only ? "popup_translation_only" : "popup_bilingual")}
            </button>
          ))}
          {dirtyDot("transOnly")}
        </div>
        {pageOptions.map((name) => (
          <button
            type="button"
            className="kt-popup-option-row"
            role="switch"
            aria-label={fieldLabels[name]}
            aria-checked={enabledValue(rule?.[name])}
            key={name}
            disabled={blockedControls}
            onClick={() =>
              void putRuleValue(
                name,
                name === "isPlainText"
                  ? !enabledValue(rule?.[name])
                  : String(!enabledValue(rule?.[name]))
              )
            }
          >
            <span>
              <span>{fieldLabels[name]}</span>
              {isDirty(name) && (
                <span
                  className="kt-popup-dirty-dot kt-popup-dirty-dot--inline"
                  aria-hidden="true"
                />
              )}
            </span>
            <span
              className="kt-popup-switch"
              data-checked={enabledValue(rule?.[name])}
              aria-hidden="true"
            />
          </button>
        ))}
        {canEditRule || isDisabledPage ? (
          <button
            type="button"
            className="kt-popup-editor-button"
            aria-busy={editorOpening}
            data-error={editorError}
            disabled={blockedControls || editorOpening}
            onClick={() => void handleOpenRuleEditor()}
          >
            {i18n(
              editorOpening
                ? "popup_editor_opening"
                : editorError
                  ? "popup_editor_failed"
                  : "popup_edit_rule"
            )}
            {editorOpening ? (
              <OpenInNewRoundedIcon aria-hidden="true" />
            ) : (
              <HighlightAltRoundedIcon aria-hidden="true" />
            )}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={`kt-popup-save-button${saveStatus === "error" ? " kt-popup-save-button--error" : dirtyFields.length ? " kt-popup-save-button--dirty" : saved ? " kt-popup-save-button--saved" : ""}`}
          disabled={
            blockedControls ||
            !selectedDomain ||
            saveStatus === "saving" ||
            Boolean(ruleUpdatePending) ||
            translationTogglePending ||
            (saved && saveStatus !== "error")
          }
          aria-busy={saveStatus === "saving"}
          data-dirty-count={dirtyFields.length}
          data-save-status={saveStatus}
          title={(dirtyFields.length
            ? i18n("popup_save_changes_hint").replace(
                "{fields}",
                dirtyFields
                  .map((name) => fieldLabels[name])
                  .join(i18n("popup_list_separator"))
              )
            : i18n("popup_save_site_hint")
          ).replace("{domain}", selectedDomain)}
          onClick={() => void handleSaveRule()}
        >
          <SaveIcon aria-hidden="true" />
          {saveLabel}
        </button>
      </div>
      {!blockedControls && (
        <TouchTranslateControl
          processActions={dispatchTouchAction}
          inlineFeedback
        />
      )}
      <div className="kt-popup-bottom-actions">
        {!isInCurrentBlacklist && (
          <button
            type="button"
            className="kt-popup-disable-button"
            disabled={!selectedDomain || blacklistPending}
            onClick={() => void handleAddToBlacklist()}
          >
            <BlockRoundedIcon aria-hidden="true" />
            {i18n("popup_disable_site")}
          </button>
        )}
        <button
          type="button"
          className="kt-popup-cache-button"
          data-status={cacheStatus}
          disabled={cacheStatus === "clearing" || cacheStatus === "done"}
          onClick={() => void handleClearCache()}
        >
          {cacheStatus === "done" ? (
            <CheckRoundedIcon aria-hidden="true" />
          ) : (
            <DeleteSweepRoundedIcon aria-hidden="true" />
          )}
          {i18n(
            cacheStatus === "done"
              ? "popup_cache_cleared"
              : cacheStatus === "error"
                ? "popup_cache_failed"
                : "clear_cache"
          )}
        </button>
        <span className="kt-popup-version">
          v{process.env.REACT_APP_VERSION}
        </span>
      </div>
      {actionError && (
        <span className="kt-popup-action-error" role="status">
          {actionError}
        </span>
      )}
      {isContent && (
        <>
          <button
            type="button"
            className="kt-popup-all-settings"
            onClick={handleOpenSetting}
          >
            {i18n("popup_all_settings")}
          </button>
          <div className="kt-popup-support">
            <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer">
              {i18n("comment_support")}
            </a>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              {i18n("appreciate_support")}
            </a>
          </div>
        </>
      )}
      <PopupMenu
        {...menuProps("pattern")}
        className="kt-popup-pattern-menu"
        ariaLabel={i18n("popup_match_scope")}
        estimatedHeight={domainOptions.length * 48 + 32}
      >
        <div className="kt-popup-menu-title">
          {i18n("popup_match_scope_hint")}
        </div>
        {domainOptions.map((domain) => (
          <MenuItem
            className="kt-popup-pattern-option"
            selected={domain === selectedDomain}
            key={domain}
            onClick={() => {
              setSelectedDomain(domain);
              setSaveStatus("idle");
              setOpenMenu(null);
            }}
          >
            {domain === selectedDomain ? (
              <RadioButtonCheckedIcon />
            ) : (
              <RadioButtonUncheckedIcon />
            )}
            <span className="kt-popup-pattern-copy">
              <span>{domain}</span>
              <small>
                {i18n(
                  domain.includes("*")
                    ? "popup_scope_subdomains"
                    : "popup_scope_exact"
                )}
              </small>
            </span>
          </MenuItem>
        ))}
      </PopupMenu>
      <PopupMenu
        {...menuProps("service")}
        className="kt-popup-service-menu"
        ariaLabel={i18n("popup_more_services")}
        estimatedHeight={services.length * 38 + 12}
      >
        {services.map((service) => (
          <MenuItem
            className="kt-popup-service-option"
            key={service.key}
            selected={service.key === apiSlug}
            onClick={() => {
              void putRuleValue("apiSlug", service.key);
              setOpenMenu(null);
            }}
          >
            <ApiProviderIcon
              apiType={service.type}
              className="kt-service-logo"
              lightSurface
            />
            <span>{service.name}</span>
            {service.key === apiSlug && (
              <CheckRoundedIcon
                className="kt-popup-menu-check"
                aria-hidden="true"
              />
            )}
          </MenuItem>
        ))}
      </PopupMenu>
      <PopupMenu
        {...menuProps("style")}
        className="kt-popup-style-menu"
        ariaLabel={i18n("text_style_alt")}
        estimatedHeight={Math.ceil(allTextStyles.length / 3) * 40 + 16}
      >
        <div
          className="kt-popup-style-grid"
          ref={styleGridRef}
          tabIndex={-1}
          role="group"
          aria-label={i18n("text_style_alt")}
          onKeyDown={(event) => {
            if (
              ![
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
              ].includes(event.key)
            )
              return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll("button")
            );
            const index = buttons.indexOf(event.target);
            if (index < 0 || !buttons.length) return;
            event.preventDefault();
            event.stopPropagation();
            const offset = {
              ArrowLeft: -1,
              ArrowRight: 1,
              ArrowUp: -3,
              ArrowDown: 3,
            }[event.key];
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index + offset + buttons.length) % buttons.length;
            buttons[next].focus();
          }}
        >
          {allTextStyles.map((style) => (
            <button
              type="button"
              className="kt-popup-style-chip"
              aria-pressed={style.styleSlug === textStyle}
              key={style.styleSlug}
              onClick={() => {
                void putRuleValue("textStyle", style.styleSlug);
                setOpenMenu(null);
              }}
            >
              <PopupStylePreview
                styleSlug={style.styleSlug}
                previewCode={getCompactStylePreviewCode(style)}
                label={style.styleName}
              />
            </button>
          ))}
        </div>
      </PopupMenu>
    </section>
  );
}
