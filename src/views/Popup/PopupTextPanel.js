import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CheckBoxOutlineBlankRoundedIcon from "@mui/icons-material/CheckBoxOutlineBlankRounded";
import CheckBoxRoundedIcon from "@mui/icons-material/CheckBoxRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import MenuItem from "@mui/material/MenuItem";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import { OPT_LANGS_FROM_REVERSED, OPT_LANGS_TO_REVERSED } from "../../config";
import { useI18n } from "../../hooks/I18n";
import { getEnabledApis } from "../../libs/apiSelection";
import { tryDetectLang } from "../../libs/detect";
import { isSameTranslationLanguage } from "../../libs/language";
import { kissLog } from "../../libs/log";
import CopyBtn from "../Selection/CopyBtn";
import TranCont from "../Selection/TranCont";
import PopupMenu from "./PopupMenu";
import { POPUP_TEXT_STYLES } from "./PopupTextPanel.styles";

export const DEFAULT_SOURCE_RATIO = 0.4;
export const SOURCE_RATIO_STORAGE_KEY = "kt-popup-text-source-ratio";
const MIN_SOURCE_RATIO = 0.18;
const MAX_SOURCE_RATIO = 0.78;
const MIN_PANE_HEIGHT = 86;

export function clampSourceRatio(ratio, cardHeight = 0) {
  const minimum = cardHeight
    ? Math.min(0.5, Math.max(MIN_SOURCE_RATIO, MIN_PANE_HEIGHT / cardHeight))
    : MIN_SOURCE_RATIO;
  const maximum = cardHeight
    ? Math.max(
        0.5,
        Math.min(MAX_SOURCE_RATIO, 1 - MIN_PANE_HEIGHT / cardHeight)
      )
    : MAX_SOURCE_RATIO;
  return Math.min(maximum, Math.max(minimum, ratio));
}

export function resolvePopupApiSlugs(apiSlugs, enabledApis) {
  const validSlugs = new Set(enabledApis.map((api) => api.apiSlug));
  if (!Array.isArray(apiSlugs))
    return enabledApis.slice(0, 1).map((api) => api.apiSlug);
  return [...new Set(apiSlugs)].filter((slug) => validSlugs.has(slug));
}

export function togglePopupApiSlug(slugs, slug) {
  return slugs.includes(slug)
    ? slugs.filter((selectedSlug) => selectedSlug !== slug)
    : [...slugs, slug];
}

function readSourceRatio() {
  try {
    const stored = window.localStorage.getItem(SOURCE_RATIO_STORAGE_KEY);
    if (stored !== null) {
      const ratio = Number(stored);
      if (Number.isFinite(ratio)) return clampSourceRatio(ratio);
    }
  } catch {
    // The panel remains resizable when local storage is unavailable.
  }
  return DEFAULT_SOURCE_RATIO;
}

function splitLanguageName(name = "") {
  const [primary, ...parts] = name.split(" - ");
  const secondary = parts.join(" - ").trim();
  return {
    primary,
    secondary:
      secondary.toLowerCase() === primary.toLowerCase() ? "" : secondary,
  };
}

function languageName(code) {
  return splitLanguageName(
    OPT_LANGS_TO_REVERSED.find(([value]) => value === code)?.[1] || code
  ).primary;
}

/** A compact selector with an automatic-detection badge in the source row. */
function LanguageMenu({
  value,
  detectedLang = "",
  source = false,
  onChange,
  isVisible = true,
}) {
  const i18n = useI18n();
  const menuId = useId();
  const [anchorEl, setAnchorEl] = useState(null);
  const selectedRef = useRef(null);
  const options = source ? OPT_LANGS_FROM_REVERSED : OPT_LANGS_TO_REVERSED;
  const automatic = source && value === "auto";
  const name = automatic
    ? languageName(detectedLang) || i18n("popup_auto_detect")
    : languageName(value);
  const label = i18n(source ? "from_lang" : "to_lang");

  useEffect(() => {
    if (!isVisible) setAnchorEl(null);
  }, [isVisible]);

  useEffect(() => {
    if (!anchorEl) return undefined;
    const frame = requestAnimationFrame(() => {
      const item = selectedRef.current;
      const paper = item?.closest(".kt-popup-language-menu");
      if (paper && item) {
        paper.scrollTop =
          item.offsetTop - (paper.clientHeight - item.offsetHeight) / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorEl]);

  return (
    <>
      <button
        type="button"
        className="kt-popup-text-language"
        role="combobox"
        aria-label={label}
        aria-expanded={Boolean(anchorEl)}
        aria-controls={anchorEl ? menuId : undefined}
        aria-haspopup="listbox"
        title={name}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setAnchorEl(event.currentTarget);
          }
        }}
      >
        <span className="kt-popup-text-language__name">{name}</span>
        {automatic && detectedLang && (
          <span className="kt-popup-text-auto">
            {i18n("popup_text_auto_badge")}
          </span>
        )}
        <ArrowDropDownRoundedIcon aria-hidden="true" />
      </button>
      <PopupMenu
        anchorEl={anchorEl}
        open={isVisible && Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        id={menuId}
        ariaLabel={label}
        className="kt-popup-language-menu kt-popup-text-menu"
        estimatedHeight={320}
        menuRole="listbox"
      >
        {options.map(([code, name]) => {
          const { primary, secondary } = splitLanguageName(name);
          const selected = code === value;
          return (
            <MenuItem
              key={code}
              role="option"
              aria-selected={selected}
              selected={selected}
              ref={selected ? selectedRef : undefined}
              onClick={() => {
                onChange(code);
                setAnchorEl(null);
              }}
            >
              <span className="kt-popup-language-option__copy">
                <span className="kt-popup-language-menu__primary">
                  {code === "auto" ? i18n("popup_auto_detect") : primary}
                </span>
                {secondary && code !== "auto" && (
                  <small className="kt-popup-language-menu__secondary">
                    {secondary}
                  </small>
                )}
              </span>
              {selected && (
                <CheckRoundedIcon
                  className="kt-popup-menu-check"
                  aria-hidden="true"
                />
              )}
            </MenuItem>
          );
        })}
      </PopupMenu>
    </>
  );
}

/** Text translation uses the height supplied by the surrounding popup page. */
export default function PopupTextPanel({
  text = "",
  setText,
  transApis = [],
  apiSlugs: initialApiSlugs,
  fromLang: initialFromLang = "auto",
  toLang: initialToLang = "zh-CN",
  toLang2 = "-",
  langDetector = "-",
  translateVariants = true,
  parseLatex = false,
  autoFocusInput = true,
  isVisible = true,
}) {
  const i18n = useI18n();
  const menuId = useId();
  const cardRef = useRef(null);
  const inputRef = useRef(null);
  const draftRef = useRef(text);
  const dragRef = useRef(null);
  const changedApisRef = useRef(false);
  const [draft, setDraft] = useState(text);
  const [fromLang, setFromLang] = useState(initialFromLang);
  const [toLang, setToLang] = useState(initialToLang);
  const [apiSlugs, setApiSlugs] = useState(initialApiSlugs);
  const [sourceRatio, setSourceRatio] = useState(readSourceRatio);
  const [cardHeight, setCardHeight] = useState(0);
  const [requestRevision, setRequestRevision] = useState(0);
  const [serviceAnchor, setServiceAnchor] = useState(null);
  const [actionContainer, setActionContainer] = useState(null);
  const [detection, setDetection] = useState({
    key: "",
    lang: "",
    loading: false,
  });
  const enabledApis = useMemo(() => getEnabledApis(transApis), [transApis]);
  const activeSlugs = useMemo(
    () => resolvePopupApiSlugs(apiSlugs, enabledApis),
    [apiSlugs, enabledApis]
  );
  const selectedApis = useMemo(
    () =>
      activeSlugs.map((slug) =>
        enabledApis.find((api) => api.apiSlug === slug)
      ),
    [activeSlugs, enabledApis]
  );
  const activeDetector = activeSlugs.length > 0 ? langDetector : "-";
  const detectionKey = `${activeDetector}\u0000${text}`;
  const detectedLang = detection.key === detectionKey ? detection.lang : "";
  const detectionPending =
    Boolean(text.trim()) &&
    (detection.key !== detectionKey || detection.loading);
  const hasSecondaryTarget =
    toLang2 !== toLang &&
    OPT_LANGS_TO_REVERSED.some(([code]) => code === toLang2);
  const realToLang =
    fromLang === "auto" &&
    hasSecondaryTarget &&
    isSameTranslationLanguage(detectedLang, toLang, translateVariants)
      ? toLang2
      : toLang;
  const swapSource = fromLang === "auto" ? detectedLang : fromLang;
  const swapDisabled =
    !swapSource ||
    (fromLang === "auto" && (detectionPending || draft.trim() !== text.trim()));
  const effectiveRatio = clampSourceRatio(sourceRatio, cardHeight);

  // Preserve the stored preference while fitting both toolbars in short popups.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return undefined;
    const measure = () => setCardHeight(card.getBoundingClientRect().height);
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(card);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Clipboard replacement wins over a draft even while the editor has focus.
  useLayoutEffect(() => {
    draftRef.current = text;
    setDraft(text);
  }, [text]);

  useEffect(() => {
    if (!changedApisRef.current) setApiSlugs(initialApiSlugs);
  }, [initialApiSlugs]);

  useEffect(() => {
    if (!autoFocusInput || !isVisible) return;
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [autoFocusInput, isVisible]);

  useEffect(() => {
    if (!isVisible || enabledApis.length === 0) setServiceAnchor(null);
  }, [isVisible, enabledApis.length]);

  useEffect(() => {
    let active = true;
    if (!text.trim()) {
      setDetection({ key: detectionKey, lang: "", loading: false });
      return () => {
        active = false;
      };
    }
    setDetection({ key: detectionKey, lang: "", loading: true });
    void tryDetectLang(text, activeDetector)
      .then((lang) => {
        if (active)
          setDetection({ key: detectionKey, lang: lang || "", loading: false });
      })
      .catch((error) => {
        kissLog("popup text: detect language", error);
        if (active)
          setDetection({ key: detectionKey, lang: "", loading: false });
      });
    return () => {
      active = false;
    };
  }, [text, activeDetector, detectionKey]);

  const changeRatio = useCallback((nextRatio) => {
    const ratio = clampSourceRatio(
      nextRatio,
      cardRef.current?.getBoundingClientRect().height
    );
    setSourceRatio(ratio);
    try {
      window.localStorage.setItem(SOURCE_RATIO_STORAGE_KEY, String(ratio));
    } catch {
      // Stored memory is optional and never blocks a resize.
    }
  }, []);

  const commitDraft = useCallback(() => {
    const committed = draftRef.current.trim();
    if (committed !== text) setText(committed);
  }, [setText, text]);

  const submitTranslation = () => {
    commitDraft();
    setRequestRevision((revision) => revision + 1);
  };
  const preserveSourceFocus = useCallback((event) => {
    const input = inputRef.current;
    if (event.button === 0 && input?.getRootNode().activeElement === input) {
      event.preventDefault();
    }
  }, []);
  const stopDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const serviceName =
    enabledApis.length === 0
      ? i18n("popup_no_services")
      : selectedApis.length === 1
        ? selectedApis[0].apiName || selectedApis[0].apiSlug
        : selectedApis.length > 1
          ? i18n("popup_text_service_count").replace(
              "{count}",
              selectedApis.length
            )
          : i18n("popup_text_select_service");

  return (
    <div className="kt-popup-text-editor">
      <style>{POPUP_TEXT_STYLES}</style>
      <div
        className="kt-popup-text-card"
        ref={cardRef}
        style={{ "--kt-popup-text-source-ratio": `${effectiveRatio * 100}%` }}
        onBlurCapture={(event) => {
          if (!isVisible) return;
          const next = event.relatedTarget;
          // Switching popup tabs preserves the unsubmitted editor draft.
          if (next?.closest?.(".kt-popup-tabs [role=tab]")) return;
          if (
            next &&
            (event.currentTarget.contains(next) ||
              next.closest?.(".kt-popup-text-menu"))
          )
            return;
          commitDraft();
        }}
      >
        <section
          className="kt-popup-text-source"
          aria-label={i18n("original_text")}
        >
          <div className="kt-popup-text-toolbar kt-popup-text-toolbar--source">
            <LanguageMenu
              value={fromLang}
              detectedLang={detectedLang}
              source
              onChange={setFromLang}
              isVisible={isVisible}
            />
            <div className="kt-popup-text-source-actions">
              <button
                type="button"
                className="kt-popup-text-icon-button"
                title={i18n("popup_text_clear")}
                aria-label={i18n("popup_text_clear")}
                disabled={!draft}
                onPointerDown={preserveSourceFocus}
                onClick={() => {
                  draftRef.current = "";
                  setDraft("");
                  setText("");
                  inputRef.current?.focus({ preventScroll: true });
                }}
              >
                <CloseRoundedIcon aria-hidden="true" />
              </button>
              <CopyBtn
                text={draft}
                title={i18n("copy")}
                copiedLabel={i18n("copy_success")}
              />
              <button
                type="button"
                className="kt-popup-text-icon-button"
                title={i18n("popup_text_reload")}
                aria-label={i18n("popup_text_reload")}
                disabled={!draft.trim() || activeSlugs.length === 0}
                onPointerDown={preserveSourceFocus}
                onClick={submitTranslation}
              >
                <ReplayRoundedIcon aria-hidden="true" />
              </button>
            </div>
          </div>
          <textarea
            ref={inputRef}
            className="kt-popup-text-input"
            aria-label={i18n("original_text")}
            placeholder={i18n("popup_text_source_placeholder")}
            spellCheck={false}
            value={draft}
            onChange={(event) => {
              draftRef.current = event.target.value;
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submitTranslation();
              }
            }}
          />
        </section>
        <div className="kt-popup-text-divider">
          <div
            className="kt-popup-text-divider__grip"
            role="separator"
            tabIndex={0}
            aria-label={i18n("popup_text_split_label")}
            aria-orientation="horizontal"
            aria-valuemin={Math.round(clampSourceRatio(0, cardHeight) * 100)}
            aria-valuemax={Math.round(clampSourceRatio(1, cardHeight) * 100)}
            aria-valuenow={Math.round(effectiveRatio * 100)}
            title={i18n("popup_text_split_hint")}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              dragRef.current = {
                pointerId: event.pointerId,
                startY: event.clientY,
                ratio: effectiveRatio,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              const height = cardRef.current?.getBoundingClientRect().height;
              if (height)
                changeRatio(
                  drag.ratio + (event.clientY - drag.startY) / height
                );
            }}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onLostPointerCapture={() => {
              dragRef.current = null;
            }}
            onDoubleClick={() => changeRatio(DEFAULT_SOURCE_RATIO)}
            onKeyDown={(event) => {
              const nextRatio = {
                ArrowUp: effectiveRatio - 0.025,
                ArrowDown: effectiveRatio + 0.025,
                Home: 0,
                End: 1,
              }[event.key];
              if (nextRatio === undefined) return;
              event.preventDefault();
              changeRatio(nextRatio);
            }}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
          <button
            type="button"
            className="kt-popup-text-swap"
            disabled={swapDisabled}
            title={i18n("swap_languages")}
            aria-label={i18n("swap_languages")}
            onClick={() => {
              if (swapDisabled) return;
              setFromLang(realToLang);
              setToLang(swapSource);
            }}
          >
            <SwapVertRoundedIcon aria-hidden="true" />
          </button>
        </div>
        <section
          className="kt-popup-text-target"
          aria-label={i18n("translated_text")}
        >
          <div className="kt-popup-text-toolbar kt-popup-text-toolbar--target">
            <LanguageMenu
              value={realToLang}
              onChange={setToLang}
              isVisible={isVisible}
            />
            <button
              type="button"
              className="kt-popup-text-services"
              aria-label={i18n("trans_apis")}
              aria-expanded={Boolean(serviceAnchor)}
              aria-controls={serviceAnchor ? menuId : undefined}
              aria-haspopup="menu"
              disabled={enabledApis.length === 0}
              title={serviceName}
              onClick={(event) => setServiceAnchor(event.currentTarget)}
            >
              {selectedApis.length > 0 && (
                <span
                  className="kt-popup-text-services__icons"
                  aria-hidden="true"
                >
                  {selectedApis.slice(0, 3).map((api) => (
                    <ApiProviderIcon
                      key={api.apiSlug}
                      apiType={api.apiType}
                      size={20}
                      imageSize={12}
                      lightSurface
                      className="kt-service-logo"
                    />
                  ))}
                </span>
              )}
              <span className="kt-popup-text-services__name">
                {serviceName}
              </span>
              <ArrowDropDownRoundedIcon aria-hidden="true" />
            </button>
            <div
              className="kt-popup-text-target-actions"
              ref={setActionContainer}
            />
          </div>
          <div className="kt-popup-text-results">
            {activeSlugs.map((slug) => (
              <TranCont
                key={slug}
                text={text}
                fromLang={fromLang}
                toLang={realToLang}
                apiSlug={slug}
                transApis={transApis}
                translateVariants={translateVariants}
                parseLatex={parseLatex}
                detectedLang={detectedLang}
                sourceDetectionPending={fromLang === "auto" && detectionPending}
                waitForSourceDetection={
                  fromLang === "auto" && hasSecondaryTarget
                }
                requestRevision={requestRevision}
                onActionPointerDown={preserveSourceFocus}
                isPopup
                showProvider={activeSlugs.length > 1}
                actionContainer={
                  activeSlugs.length === 1 ? actionContainer : null
                }
              />
            ))}
            {activeSlugs.length === 0 && (
              <div className="kt-popup-text-no-services">
                {i18n(
                  enabledApis.length === 0
                    ? "popup_no_services"
                    : "popup_text_no_services"
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      <PopupMenu
        anchorEl={serviceAnchor}
        open={isVisible && Boolean(serviceAnchor)}
        onClose={() => setServiceAnchor(null)}
        id={menuId}
        ariaLabel={i18n("trans_apis")}
        className="kt-popup-text-service-menu kt-popup-text-menu"
        estimatedHeight={280}
        maxHeight={320}
        direction="down"
        align="left"
      >
        <div className="kt-popup-menu-title">
          {i18n("popup_text_service_menu")}
        </div>
        {enabledApis.map((api) => {
          const selected = activeSlugs.includes(api.apiSlug);
          const CheckboxIcon = selected
            ? CheckBoxRoundedIcon
            : CheckBoxOutlineBlankRoundedIcon;
          return (
            <MenuItem
              key={api.apiSlug}
              role="menuitemcheckbox"
              aria-checked={selected}
              selected={selected}
              className="kt-popup-text-service-option"
              onClick={() => {
                changedApisRef.current = true;
                setApiSlugs((slugs) =>
                  togglePopupApiSlug(
                    resolvePopupApiSlugs(slugs, enabledApis),
                    api.apiSlug
                  )
                );
              }}
            >
              <CheckboxIcon
                className="kt-popup-text-service-check"
                aria-hidden="true"
              />
              <ApiProviderIcon
                apiType={api.apiType}
                size={22}
                imageSize={14}
                lightSurface
                className="kt-service-logo"
              />
              <span>{api.apiName || api.apiSlug}</span>
            </MenuItem>
          );
        })}
      </PopupMenu>
    </div>
  );
}
