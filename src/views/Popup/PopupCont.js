import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import KeyboardRoundedIcon from "@mui/icons-material/KeyboardRounded";
import MouseRoundedIcon from "@mui/icons-material/MouseRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Switch from "@mui/material/Switch";
import { sendBgMsg, sendTabMsg, getCurTab } from "../../libs/msg";
import { isExt } from "../../libs/client";
import { useI18n } from "../../hooks/I18n";
import {
  MSG_TRANS_TOGGLE,
  MSG_RULE_EDITOR,
  MSG_TRANS_PUTRULE,
  MSG_SAVE_RULE,
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";
import { saveRule } from "../../libs/rules";
import { tryClearCaches } from "../../libs/cache";
import { kissLog } from "../../libs/log";
import { getDomainOptions, truncateMiddle } from "../../libs/url";
import {
  getCompactStylePreviewCode,
  useAllTextStyles,
} from "../../hooks/CustomStyles";
import { useOverviewShortcuts } from "../../hooks/Commands";
import { isInBlacklist } from "../../libs/blacklist";
import { useSetting } from "../../hooks/Setting";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import { COLLAPSED_SERVICE_LIMIT, getVisibleServices } from "./services";
import { usePopupFeatureToggles } from "./usePopupFeatureToggles";
import CompactLanguageSelect from "./CompactLanguageSelect";
import PopupStylePreview from "./PopupStylePreview";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";
import { queryPopupData } from "./loadData";

export function resolvePopupTextStyles(
  allTextStyles,
  activeStyleSlug,
  expanded
) {
  if (expanded) return allTextStyles;

  const activeStyle = allTextStyles.find(
    (style) => style.styleSlug === activeStyleSlug
  );
  const seen = new Set();
  return [activeStyle, ...allTextStyles]
    .filter(Boolean)
    .filter((style) => {
      if (seen.has(style.styleSlug)) return false;
      seen.add(style.styleSlug);
      return true;
    })
    .slice(0, 5);
}

export default function PopupCont({
  rule,
  setting,
  setRule,
  setSetting,
  handleOpenSetting,
  processActions,
  isContent = false,
}) {
  const i18n = useI18n();
  const { setting: contextSetting, updateSetting } = useSetting();
  const shortcutMap = useOverviewShortcuts(setting);
  const [domainOptions, setDomainOptions] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [currentHref, setCurrentHref] = useState("");
  const [snackbar, setSnackbar] = useState({
    id: 0,
    open: false,
    message: "",
    severity: "success",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationTogglePending, setTranslationTogglePending] =
    useState(false);
  const busyTimerRef = useRef(null);
  const translationTogglePendingRef = useRef(false);
  const snackbarSequenceRef = useRef(0);
  const ruleRef = useRef(rule);
  const { allTextStyles } = useAllTextStyles();
  const visiblePopupTextStyles = useMemo(
    () => resolvePopupTextStyles(allTextStyles, rule?.textStyle, showAllStyles),
    [allTextStyles, rule?.textStyle, showAllStyles]
  );
  const hiddenStyleCount = allTextStyles.length - visiblePopupTextStyles.length;
  const styleDisclosureLabel = showAllStyles
    ? `${i18n("popup_collapse")}: ${i18n("popup_all_styles")}`
    : `${i18n("popup_all_styles")} (${hiddenStyleCount})`;

  const showMessage = useCallback((message, severity = "success") => {
    setSnackbar({
      id: ++snackbarSequenceRef.current,
      open: true,
      message,
      severity,
    });
  }, []);

  useEffect(
    () => () => {
      if (busyTimerRef.current) window.clearTimeout(busyTimerRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    ruleRef.current = rule;
  }, [rule]);

  const blacklistValue = contextSetting?.blacklist || "";
  const isInCurrentBlacklist = useMemo(() => {
    if (!selectedDomain || !blacklistValue) return false;
    return isInBlacklist(currentHref, blacklistValue);
  }, [blacklistValue, currentHref, selectedDomain]);

  const handleAddToBlacklist = useCallback(() => {
    if (!selectedDomain) return;
    const nextBlacklist = blacklistValue
      ? `${blacklistValue}\n${selectedDomain}`
      : selectedDomain;
    updateSetting((previous) => ({
      ...previous,
      blacklist: nextBlacklist,
    }));
    showMessage(`${i18n("add_to_blacklist")}: ${selectedDomain}`);
  }, [blacklistValue, i18n, selectedDomain, showMessage, updateSetting]);

  const handleRemoveFromBlacklist = useCallback(() => {
    if (!selectedDomain) return;
    const nextBlacklist = blacklistValue
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter((item) => item !== selectedDomain)
      .join("\n");
    updateSetting((previous) => ({
      ...previous,
      blacklist: nextBlacklist,
    }));
    showMessage(`${i18n("remove_from_blacklist")}: ${selectedDomain}`);
  }, [blacklistValue, i18n, selectedDomain, showMessage, updateSetting]);

  const putRuleValues = useCallback(
    async (values) => {
      // Keep consecutive actions current even before React commits their updates.
      ruleRef.current = { ...ruleRef.current, ...values };
      setRule((previous) => ({ ...previous, ...values }));
      try {
        if (processActions) {
          processActions({
            action: MSG_TRANS_PUTRULE,
            args: values,
          });
        } else {
          await sendTabMsg(MSG_TRANS_PUTRULE, values);
        }
      } catch (error) {
        kissLog("update rule", error);
      }
    },
    [processActions, setRule]
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
      if (translationTogglePendingRef.current) return;
      translationTogglePendingRef.current = true;
      setTranslationTogglePending(true);
      const previousTransOpen = rule?.transOpen;
      if (busyTimerRef.current) {
        window.clearTimeout(busyTimerRef.current);
        busyTimerRef.current = null;
      }
      setRule((previous) => ({
        ...previous,
        transOpen: enabled ? "true" : "false",
      }));
      setTranslationBusy(true);
      try {
        let response;
        if (processActions) {
          response = await processActions({
            action: MSG_TRANS_TOGGLE,
            args: { enabled },
          });
        } else {
          await sendTabMsg(MSG_TRANS_TOGGLE, { enabled });
          response = await queryPopupData();
        }

        if (response?.error) {
          throw new Error(response.error);
        }

        const responseTransOpen = response?.rule?.transOpen;
        const hasConfirmedState =
          responseTransOpen === true ||
          responseTransOpen === false ||
          responseTransOpen === "true" ||
          responseTransOpen === "false";

        // Direct page actions intentionally return void. A completed call is
        // sufficient confirmation there; tab messages require an explicit
        // state because the browser may otherwise have had no receiver.
        if (!processActions && !hasConfirmedState) {
          throw new Error("Page translation state was not confirmed");
        }
        if (processActions && response !== undefined && !hasConfirmedState) {
          throw new Error("Page translation state was not confirmed");
        }

        const resolvedEnabled = hasConfirmedState
          ? responseTransOpen === true || responseTransOpen === "true"
          : enabled;
        if (hasConfirmedState && resolvedEnabled !== enabled) {
          throw new Error("Page translation state did not match the request");
        }
        if (hasConfirmedState) {
          setRule((previous) => ({
            ...previous,
            transOpen: resolvedEnabled ? "true" : "false",
          }));
        }

        // The card already shows successful state changes. Reserve snackbars
        // for failures so they do not obscure the other translation controls.
        busyTimerRef.current = window.setTimeout(
          () => {
            setTranslationBusy(false);
          },
          resolvedEnabled ? 900 : 0
        );
      } catch (error) {
        kissLog("toggle translation", error);
        setRule((previous) => ({
          ...previous,
          transOpen: previousTransOpen,
        }));
        setTranslationBusy(false);
        showMessage(i18n("rule_toggle_failed"), "error");
      } finally {
        translationTogglePendingRef.current = false;
        setTranslationTogglePending(false);
      }
    },
    [i18n, processActions, rule?.transOpen, setRule, showMessage]
  );

  const { handleInputToggle, handleMouseHoverToggle, handleTransboxToggle } =
    usePopupFeatureToggles({ processActions, setSetting });

  const handleClearCache = useCallback(async () => {
    const cleared = await tryClearCaches();
    showMessage(
      i18n(cleared ? "clear_success" : "clear_failed"),
      cleared ? "success" : "error"
    );
  }, [i18n, showMessage]);

  const handleSaveRule = useCallback(async () => {
    if (!selectedDomain) return;
    try {
      const currentRule = { ...rule, pattern: selectedDomain };
      if (isExt && isContent) sendBgMsg(MSG_SAVE_RULE, currentRule);
      else saveRule(currentRule);
      showMessage(`${i18n("save_rule")}: ${selectedDomain}`);
    } catch (error) {
      kissLog("save rule", error);
    }
  }, [i18n, isContent, rule, selectedDomain, showMessage]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const href = isContent
          ? window.location?.href
          : (await getCurTab())?.url || "";
        if (!active || !href) return;
        const options = getDomainOptions(href);
        setCurrentHref(href);
        setDomainOptions(options);
        setSelectedDomain(options[0] || "");
      } catch (error) {
        kissLog("get domain options", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [isContent]);

  const services = useMemo(
    () =>
      (setting?.transApis || [])
        .filter((api) => !api.isDisabled)
        .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
        .map((api) => ({
          key: api.apiSlug,
          type: api.apiType || api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [setting?.transApis]
  );

  const {
    transOpen,
    apiSlug,
    fromLang,
    toLang,
    textStyle,
    autoScan,
    transOnly,
    hasRichText,
    scanAll,
    isPlainText: plainTextValue = false,
  } = rule || {};
  const translationEnabled = transOpen === true || transOpen === "true";
  const isPlainText = plainTextValue === true || plainTextValue === "true";
  const tranboxEnabled = !!setting?.tranboxSetting?.transOpen;
  const mouseHoverEnabled = !!setting?.mouseHoverSetting?.useMouseHover;
  const inputEnabled = !!setting?.inputRule?.transOpen;
  const targetName =
    OPT_LANGS_TO.find(([key]) => key === toLang)?.[1] || toLang;
  const activeService = services.find(({ key }) => key === apiSlug);
  const activeServiceName = activeService?.name || apiSlug || "—";
  const pageShortcutLabel = shortcutMap.page.join("+");
  const enabledSummary = [
    i18n("popup_enabled"),
    `${activeServiceName} → ${targetName}`,
    pageShortcutLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const isAutoSource =
    !fromLang || fromLang === "auto" || fromLang === "$global";

  const visibleServices = useMemo(
    () => getVisibleServices(services, apiSlug, showAllServices),
    [apiSlug, services, showAllServices]
  );
  const hiddenServiceCount = services.length - visibleServices.length;
  const serviceDisclosureLabel = showAllServices
    ? `${i18n("popup_collapse")}: ${i18n("popup_more_services")}`
    : `${i18n("popup_more_services")} (${hiddenServiceCount})`;

  const scenes = [
    {
      key: "selection",
      label: i18n("selection_translate"),
      icon: SelectAllRoundedIcon,
      enabled: tranboxEnabled,
      onChange: handleTransboxToggle,
    },
    {
      key: "hover",
      label: i18n("mousehover_translate"),
      icon: MouseRoundedIcon,
      enabled: mouseHoverEnabled,
      onChange: handleMouseHoverToggle,
    },
    {
      key: "input",
      label: i18n("input_translate"),
      icon: KeyboardRoundedIcon,
      enabled: inputEnabled,
      onChange: handleInputToggle,
    },
  ];

  const advancedRows = [
    ["transOnly", i18n("show_only_translations"), transOnly === "true"],
    ["hasRichText", i18n("richtext_alt"), hasRichText === "true"],
    ["scanAll", i18n("scan_all_nodes"), scanAll === "true"],
    ["isPlainText", i18n("plain_text_translate"), isPlainText],
  ];

  const renderPopupStyleChip = (style) => (
    <button
      type="button"
      className="kt-popup-style-chip"
      aria-pressed={style.styleSlug === textStyle}
      key={style.styleSlug}
      onClick={() => putRuleValue("textStyle", style.styleSlug)}
    >
      <PopupStylePreview
        styleSlug={style.styleSlug}
        previewCode={getCompactStylePreviewCode(style)}
        label={i18n("style_preview_translation")}
      />
      <small>{style.styleName}</small>
    </button>
  );

  return (
    <section className="kt-popup-content">
      <div
        className={`kt-popup-hero ${
          translationEnabled ? "" : "kt-popup-hero--off"
        } ${translationBusy ? "kt-popup-hero--busy" : ""}`}
        aria-busy={translationTogglePending || translationBusy}
        onClick={() => {
          if (!translationTogglePending) {
            void handleTransToggle(!translationEnabled);
          }
        }}
      >
        <span className="kt-popup-hero__icon" aria-hidden="true">
          {translationBusy ? (
            <AutorenewRoundedIcon />
          ) : (
            <TranslateRoundedIcon />
          )}
        </span>
        <span className="kt-popup-hero__copy">
          <span className="kt-popup-hero__title">
            {i18n("popup_translate_page")}
          </span>
          <span className="kt-popup-hero__subtitle">
            {translationBusy
              ? i18n("popup_translating")
              : translationEnabled
                ? enabledSummary
                : i18n("popup_disabled")}
          </span>
        </span>
        <Switch
          className="kt-popup-main-switch"
          checked={translationEnabled}
          disabled={translationTogglePending}
          onChange={(_event, checked) => void handleTransToggle(checked)}
          onClick={(event) => event.stopPropagation()}
          inputProps={{
            "aria-label": i18n("popup_translate_page"),
            "aria-busy": translationTogglePending || translationBusy,
          }}
        />
        {translationBusy && <span className="kt-popup-hero__progress" />}
      </div>

      <div className="kt-popup-language-row">
        <div className="kt-popup-language">
          <span>{i18n("from_lang")}</span>
          <CompactLanguageSelect
            value={fromLang}
            ariaLabel={i18n("from_lang")}
            options={OPT_LANGS_FROM}
            onChange={(event) => putRuleValue("fromLang", event.target.value)}
          />
        </div>
        <IconButton
          className="kt-popup-swap"
          disabled={isAutoSource}
          title={i18n("swap_languages")}
          onClick={handleSwapLanguages}
        >
          <SwapHorizRoundedIcon />
        </IconButton>
        <div className="kt-popup-language">
          <span>{i18n("to_lang")}</span>
          <CompactLanguageSelect
            value={toLang}
            ariaLabel={i18n("to_lang")}
            options={OPT_LANGS_TO}
            onChange={(event) => putRuleValue("toLang", event.target.value)}
          />
        </div>
      </div>

      <div className="kt-popup-services-block">
        <div className="kt-popup-section-label">
          {i18n("translate_service")}
        </div>
        <div
          className={`kt-popup-services ${
            showAllServices ? "kt-popup-services--open" : ""
          }`}
        >
          {visibleServices.map((service) => (
            <button
              type="button"
              className="kt-popup-service"
              aria-pressed={service.key === apiSlug}
              key={service.key}
              onClick={() => putRuleValue("apiSlug", service.key)}
            >
              <ApiProviderIcon
                apiType={service.type}
                className="kt-service-logo"
                lightSurface
              />
              <span className="kt-popup-service__name">{service.name}</span>
            </button>
          ))}
          {services.length > COLLAPSED_SERVICE_LIMIT && (
            <button
              type="button"
              className={`kt-popup-service kt-popup-more-service ${
                showAllServices ? "kt-popup-more-service--open" : ""
              }`}
              aria-label={serviceDisclosureLabel}
              aria-expanded={showAllServices}
              title={serviceDisclosureLabel}
              onClick={() => setShowAllServices((current) => !current)}
            >
              {showAllServices
                ? i18n("popup_collapse")
                : `+${services.length - visibleServices.length}`}
              <ExpandMoreRoundedIcon aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="kt-popup-scenes">
        {scenes.map((scene) => {
          const SceneIcon = scene.icon;
          return (
            <button
              type="button"
              className="kt-popup-scene"
              aria-pressed={scene.enabled}
              key={scene.key}
              onClick={() => void scene.onChange(!scene.enabled)}
            >
              <SceneIcon />
              <span className="kt-popup-scene__copy">
                <span className="kt-popup-scene__label" title={scene.label}>
                  {scene.label}
                </span>
                <span className="kt-popup-scene__state">
                  {i18n(scene.enabled ? "popup_enabled" : "popup_disabled")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="kt-popup-site">
        <div className="kt-popup-site__top">
          <select
            className="kt-popup-site__select"
            value={selectedDomain}
            aria-label={i18n("domain")}
            onChange={(event) => setSelectedDomain(event.target.value)}
          >
            {domainOptions.map((domain) => (
              <option key={domain} value={domain} title={domain}>
                {truncateMiddle(domain)}
              </option>
            ))}
          </select>
          <span
            className={`kt-popup-site__badge ${
              isInCurrentBlacklist ? "kt-popup-site__badge--blocked" : ""
            }`}
          >
            {i18n(
              isInCurrentBlacklist
                ? "popup_domain_blocked"
                : "popup_domain_allowed"
            )}
          </span>
        </div>
        <div className="kt-popup-site__actions">
          <Button
            variant="contained"
            color="secondary"
            onClick={handleSaveRule}
            disabled={!domainOptions.length}
          >
            {i18n("save_rule")}
          </Button>
          <Button
            variant={isInCurrentBlacklist ? "contained" : "outlined"}
            color={isInCurrentBlacklist ? "error" : "primary"}
            onClick={
              isInCurrentBlacklist
                ? handleRemoveFromBlacklist
                : handleAddToBlacklist
            }
            disabled={!domainOptions.length}
          >
            {i18n(
              isInCurrentBlacklist
                ? "remove_from_blacklist"
                : "add_to_blacklist"
            )}
          </Button>
          <IconButton
            onClick={handleClearCache}
            aria-label={i18n("clear_cache")}
          >
            <DeleteSweepRoundedIcon />
          </IconButton>
        </div>
      </div>

      <div className="kt-popup-disclosure-row">
        <button
          type="button"
          className="kt-popup-disclosure"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {i18n("popup_advanced_options")}
          <ExpandMoreRoundedIcon />
        </button>
      </div>

      {showAdvanced && (
        <div className="kt-popup-advanced">
          <div>
            <div className="kt-popup-section-label">
              {i18n("text_style_alt")}
            </div>
            <div className="kt-popup-style-chips">
              {visiblePopupTextStyles.map(renderPopupStyleChip)}
              {allTextStyles.length > 5 && (
                <button
                  type="button"
                  className="kt-popup-style-chip kt-popup-style-more"
                  aria-label={styleDisclosureLabel}
                  aria-expanded={showAllStyles}
                  title={styleDisclosureLabel}
                  onClick={() => setShowAllStyles((current) => !current)}
                >
                  {showAllStyles
                    ? i18n("popup_collapse")
                    : `+${hiddenStyleCount}`}
                  <ExpandMoreRoundedIcon aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className="kt-popup-advanced-grid">
            {advancedRows.map(([name, label, checked]) => (
              <div className="kt-popup-advanced-row" key={name}>
                <span>{label}</span>
                <Switch
                  size="small"
                  checked={checked}
                  onChange={(event) =>
                    putRuleValue(
                      name,
                      name === "isPlainText"
                        ? event.target.checked
                        : event.target.checked
                          ? "true"
                          : "false"
                    )
                  }
                  inputProps={{ "aria-label": label }}
                />
              </div>
            ))}
          </div>
          <div className="kt-popup-advanced-row">
            <span>{i18n("autoscan_alt")}</span>
            <Switch
              size="small"
              checked={autoScan === "true"}
              onChange={(event) =>
                putRuleValue(
                  "autoScan",
                  event.target.checked ? "true" : "false"
                )
              }
              inputProps={{ "aria-label": i18n("autoscan_alt") }}
            />
          </div>
        </div>
      )}

      <Button
        variant="outlined"
        onClick={async () => {
          if (processActions) processActions({ action: MSG_RULE_EDITOR });
          else {
            await sendTabMsg(MSG_RULE_EDITOR);
            window.close();
          }
        }}
      >
        {i18n("rule_editor_open")}
      </Button>

      {isContent && (
        <>
          <footer className="kt-popup-footer">
            {[shortcutMap.page, shortcutMap.selection]
              .filter((keys) => keys.length > 0)
              .map((keys) => (
                <span className="kt-popup-footer__keys" key={keys.join("+")}>
                  {keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </span>
              ))}
            <span className="kt-popup-footer__spacer" />
            <Button variant="text" onClick={handleOpenSetting}>
              {i18n("popup_all_settings")}
            </Button>
          </footer>
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

      <Snackbar
        key={snackbar.id}
        open={snackbar.open}
        autoHideDuration={2200}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setSnackbar((current) => ({ ...current, open: false }));
        }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() =>
            setSnackbar((current) => ({ ...current, open: false }))
          }
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </section>
  );
}
