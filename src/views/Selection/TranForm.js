import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import DoneIcon from "@mui/icons-material/Done";
import CircularProgress from "@mui/material/CircularProgress";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_LANGDETECTOR_ALL,
  OPT_DICT_ALL,
  OPT_SUG_ALL,
  OPT_LANGS_MAP,
  OPT_DICT_MAP,
  OPT_SUG_MAP,
  API_SPE_TYPES,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_MODE_FOLLOW_API,
  findPromptBySlug,
} from "../../config";
import {
  useId,
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import TranCont from "./TranCont";
import DictCont from "./DictCont";
import AiDictCont from "./AiDictCont";
import SugCont from "./SugCont";
import CopyBtn from "./CopyBtn";
import Zdic from "./Zdic";
import { isValidWord, isSingleChineseChar } from "../../libs/utils";
import { kissLog } from "../../libs/log";
import { tryDetectLang } from "../../libs/detect";
import { isSameTranslationLanguage } from "../../libs/language";
import CompactLanguageSelect from "../Popup/CompactLanguageSelect";
import { createMenuKeyDownHandler } from "../../libs/menuFocus";
import { isShadowHostMoving } from "../../libs/shadowHost";

export const formatLanguageOptionName = (name) => {
  const parts = String(name || "")
    .split(" - ")
    .map((part) => part.trim());

  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }

  return parts.join(" - ");
};

// Treat whitespace-only prompts as unconfigured.
const hasPrompt = (value) => typeof value === "string" && Boolean(value.trim());

const resolveActiveApiSlugs = (apiSlugs, optApis) => {
  if (apiSlugs === undefined || apiSlugs === null) {
    return optApis.slice(0, 1).map((api) => api.key);
  }

  const validSlugs = new Set(optApis.map((api) => api.key));
  return apiSlugs.filter((slug) => validSlugs.has(slug));
};

/**
 * Translation form with language and service choices, dictionaries, detection, and text input.
 */
export default function TranForm({
  text,
  setText,
  translationText = text,
  apiSlugs: initApiSlugs,
  fromLang: initFromLang,
  toLang: initToLang,
  toLang2: initToLang2,
  transApis,
  simpleStyle = false,
  langDetector: initLangDetector = "-",
  translateVariants = true,
  parseLatex = false,
  enDict: initEnDict = "-",
  enSug: initEnSug = "-",
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
  prompts = [],
  selectionContext = "",
  isPlaygound = false,
  autoFocusInput = true,
  syncExternalTextWhileEditing = false,
  playgroundConfigHeader = null,
  popupStyle = false,
}) {
  const i18n = useI18n();
  const dictionaryTabsId = useId();
  const defaultDictionaryTabId = `${dictionaryTabsId}-default-tab`;
  const defaultDictionaryPanelId = `${dictionaryTabsId}-default-panel`;
  const aiDictionaryTabId = `${dictionaryTabsId}-ai-tab`;
  const aiDictionaryPanelId = `${dictionaryTabsId}-ai-panel`;

  // Track whether the focused input is being edited.
  const [editMode, setEditMode] = useState(false);
  const [popupInputFocused, setPopupInputFocused] = useState(false);
  // Keep draft input until blur or submission updates the outer text state.
  const [editText, setEditText] = useState(text);
  const [requestRevision, setRequestRevision] = useState(0);
  const [apiSlugs, setApiSlugs] = useState(initApiSlugs);
  const [hasUserChangedApiSlugs, setHasUserChangedApiSlugs] = useState(false);
  const [fromLang, setFromLang] = useState(initFromLang);
  const [toLang, setToLang] = useState(initToLang);
  const [toLang2, setToLang2] = useState(initToLang2);
  const [langDetector, setLangDetector] = useState(initLangDetector);
  const [enDict, setEnDict] = useState(initEnDict);
  const [enSug, setEnSug] = useState(initEnSug);
  const [dictTab, setDictTab] = useState("default");
  const [showPopupServices, setShowPopupServices] = useState(false);
  const hasUserChangedDictTabRef = useRef(false);
  // Bind detection results to their input and detector to ignore stale requests.
  const [detection, setDetection] = useState({
    key: "",
    lang: "",
    loading: false,
  });
  const inputRef = useRef(null);
  const [isShadowMenu, setIsShadowMenu] = useState(false);
  const setInputRef = useCallback((input) => {
    inputRef.current = input;
    setIsShadowMenu(Boolean(input?.getRootNode()?.host));
  }, []);
  const selectMenuProps = useMemo(
    () => ({
      container: () => inputRef.current?.closest(".kt-m3-root"),
      disableScrollLock: true,
      // MUI's trap sees the shadow host as active and otherwise steals focus
      // from the selected option. Its normal focus restoration still applies.
      disableAutoFocus: isShadowMenu,
      disableEnforceFocus: isShadowMenu,
      MenuListProps: {
        onKeyDownCapture: createMenuKeyDownHandler({
          shadowOnly: true,
          disableListWrap: true,
        }),
      },
      sx: { zIndex: 2147483647 },
    }),
    [isShadowMenu]
  );

  const detectionKey = useMemo(
    () => `${langDetector}\u0000${text}`,
    [langDetector, text]
  );
  const hasCurrentDetection = detection.key === detectionKey;
  const deLang = hasCurrentDetection ? detection.lang : "";
  const deLoading =
    Boolean(text.trim()) && (!hasCurrentDetection || detection.loading);

  // Focus the input at the end of its text when autofocus is enabled.
  // autoFocusInput may become true after asynchronous initialization.
  useEffect(() => {
    if (!autoFocusInput) return;

    const input = inputRef.current;
    if (!input) return;

    input.focus();

    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, [autoFocusInput]);

  // Notify listeners, such as the vocabulary list, when selected or entered text is a valid English word.
  useEffect(() => {
    if (isValidWord(text)) {
      const event = new CustomEvent("kiss-add-word", {
        detail: { word: text },
      });
      document.dispatchEvent(event);
    }
  }, [text]);

  // Synchronize the selected APIs from the outer state.
  useEffect(() => {
    if (!hasUserChangedApiSlugs) {
      setApiSlugs(initApiSlugs);
    }
  }, [initApiSlugs, hasUserChangedApiSlugs]);

  // Normally sync external text only outside editing; text panels can allow clipboard updates to replace drafts.
  useEffect(() => {
    if (syncExternalTextWhileEditing || !editMode) {
      setEditText(text);
    }
  }, [text, editMode, syncExternalTextWhileEditing]);

  // Detect the language asynchronously when text or settings change.
  useEffect(() => {
    let active = true;
    if (!text.trim()) {
      setDetection({ key: detectionKey, lang: "", loading: false });
      return () => {
        active = false;
      };
    }

    setDetection({ key: detectionKey, lang: "", loading: true });
    void (async () => {
      try {
        const detectedLang = await tryDetectLang(text, langDetector);
        if (active) {
          setDetection({
            key: detectionKey,
            lang: detectedLang || "",
            loading: false,
          });
        }
      } catch (err) {
        if (active) {
          kissLog("tranbox: detect lang", err);
          setDetection({ key: detectionKey, lang: "", loading: false });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [text, langDetector, detectionKey]);

  // Paste clipboard text into the translation input.
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setText(text.trim());
    } catch (err) {
      //
    }
  };

  // Use the secondary target when the detected source matches the primary target.
  const realToLang = useMemo(() => {
    if (
      fromLang === "auto" &&
      toLang !== toLang2 &&
      toLang2 !== "-" &&
      isSameTranslationLanguage(deLang, toLang, translateVariants)
    ) {
      return toLang2;
    }

    return toLang;
  }, [fromLang, toLang, toLang2, deLang, translateVariants]);

  // Keep only enabled translation providers.
  const optApis = useMemo(
    () =>
      transApis
        .filter((api) => !api.isDisabled)
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [transApis]
  );

  const isWord = useMemo(() => isValidWord(text), [text]);
  const xs = useMemo(() => (isPlaygound ? 6 : 4), [isPlaygound]);
  const md = useMemo(() => (isPlaygound ? 3 : 4), [isPlaygound]);

  const activeApiSlugs = useMemo(
    () => resolveActiveApiSlugs(apiSlugs, optApis),
    [apiSlugs, optApis]
  );

  // Use Bing/Youdao for English words and Zdic for single Chinese characters.
  const defaultDictAvailable =
    (isWord && OPT_DICT_MAP.has(enDict)) || isSingleChineseChar(text);
  const aiDictApiSetting = useMemo(() => {
    if (!aiDictApiSlug || aiDictApiSlug === "-") {
      return null;
    }

    // Stored slugs can outlive changes to API availability, API type, or prompt category.
    // Recheck eligibility to avoid sending dictionary prompts to a non-AI endpoint.
    const apiSetting = transApis.find(
      (api) =>
        api.apiSlug === aiDictApiSlug &&
        !api.isDisabled &&
        API_SPE_TYPES.ai.has(api.apiType)
    );
    if (!apiSetting) {
      return null;
    }

    // Following the API requires a resolved, nonblank dictPrompt.
    // Empty prompts would create a billed request without useful instructions.
    if (aiDictPromptSlug === PROMPT_MODE_FOLLOW_API) {
      return hasPrompt(apiSetting.dictPrompt) ? apiSetting : null;
    }

    // Override the API's dictionary prompt with the selected global prompt.
    const prompt = findPromptBySlug(prompts, aiDictPromptSlug);
    if (
      !prompt ||
      prompt.category !== PROMPT_CATEGORY_DICTIONARY ||
      !hasPrompt(prompt.systemPrompt)
    ) {
      return null;
    }

    return {
      ...apiSetting,
      dictPromptSlug: prompt.slug,
      dictPrompt: prompt.systemPrompt,
      dictUserPrompt: prompt.userPrompt,
    };
  }, [aiDictApiSlug, aiDictPromptSlug, prompts, transApis]);
  const aiDictAvailable = Boolean(text?.trim() && aiDictApiSetting);

  useEffect(() => {
    if (hasUserChangedDictTabRef.current) {
      return;
    }

    // Prefer the faster default dictionary when available, otherwise select the AI dictionary.
    if (defaultDictAvailable) {
      setDictTab("default");
      return;
    }

    if (aiDictAvailable) {
      setDictTab("ai");
    }
  }, [text, defaultDictAvailable, aiDictAvailable]);

  const commitEditText = () => {
    setEditMode(false);
    setText(editText.trim());
  };

  const submitTranslation = () => {
    commitEditText();
    // Explicit submissions retry unchanged text; ordinary blur commits do not.
    setRequestRevision((revision) => revision + 1);
  };

  const translationResults = activeApiSlugs.map((slug) => (
    <TranCont
      key={slug}
      text={translationText}
      fromLang={fromLang}
      toLang={realToLang}
      simpleStyle={simpleStyle}
      apiSlug={slug}
      transApis={transApis}
      isPlayground={isPlaygound}
      translateVariants={translateVariants}
      parseLatex={parseLatex}
      detectedLang={deLang}
      sourceDetectionPending={fromLang === "auto" && deLoading}
      requestRevision={requestRevision}
    />
  ));
  const togglePopupService = (slug) => {
    setHasUserChangedApiSlugs(true);
    setApiSlugs((current) => {
      const validCurrent = resolveActiveApiSlugs(current, optApis);
      if (!validCurrent.includes(slug)) return [...validCurrent, slug];
      return validCurrent.length > 1
        ? validCurrent.filter((currentSlug) => currentSlug !== slug)
        : validCurrent;
    });
  };

  const popupDictionaryPanels = (
    <>
      {(defaultDictAvailable || aiDictAvailable) && (
        <Box className="kt-popup-dictionary">
          {aiDictAvailable ? (
            <>
              <Tabs
                value={defaultDictAvailable ? dictTab : "ai"}
                onChange={(_, value) => {
                  hasUserChangedDictTabRef.current = true;
                  setDictTab(value);
                }}
                variant="scrollable"
                allowScrollButtonsMobile
                aria-label={i18n("default_dict", "Dictionary")}
                sx={{ minHeight: 36, mb: 1 }}
              >
                {defaultDictAvailable && (
                  <Tab
                    id={defaultDictionaryTabId}
                    aria-controls={defaultDictionaryPanelId}
                    value="default"
                    label={i18n("default_dict", "Default dictionary")}
                    sx={{ minHeight: 36, py: 0.5 }}
                  />
                )}
                <Tab
                  id={aiDictionaryTabId}
                  aria-controls={aiDictionaryPanelId}
                  value="ai"
                  label={i18n("ai_dict", "AI dictionary")}
                  sx={{ minHeight: 36, py: 0.5 }}
                />
              </Tabs>
              {defaultDictAvailable && dictTab === "default" && (
                <Box
                  id={defaultDictionaryPanelId}
                  role="tabpanel"
                  aria-labelledby={defaultDictionaryTabId}
                >
                  {isWord && OPT_DICT_MAP.has(enDict) && (
                    <DictCont text={text} enDict={enDict} />
                  )}
                  {isSingleChineseChar(text) && <Zdic text={text} />}
                </Box>
              )}
              {(!defaultDictAvailable || dictTab === "ai") && (
                <Box
                  id={aiDictionaryPanelId}
                  role="tabpanel"
                  aria-labelledby={aiDictionaryTabId}
                >
                  <AiDictCont
                    text={text}
                    fromLang={fromLang}
                    speechLang={fromLang === "auto" ? deLang : fromLang}
                    toLang={realToLang}
                    apiSetting={aiDictApiSetting}
                    context={
                      selectionContext && selectionContext.includes(text)
                        ? selectionContext
                        : ""
                    }
                  />
                </Box>
              )}
            </>
          ) : (
            <>
              {isWord && OPT_DICT_MAP.has(enDict) && (
                <DictCont text={text} enDict={enDict} />
              )}
              {isSingleChineseChar(text) && <Zdic text={text} />}
            </>
          )}
        </Box>
      )}

      {isWord && OPT_SUG_MAP.has(enSug) && (
        <Box className="kt-popup-dictionary">
          <SugCont text={text} enSug={enSug} />
        </Box>
      )}
    </>
  );

  if (popupStyle) {
    return (
      <div className="kt-popup-translation-form">
        <div
          className={`kt-popup-translation-input ${
            popupInputFocused ? "kt-popup-translation-input--focused" : ""
          }`}
        >
          <div className="kt-popup-translation-textarea">
            <textarea
              className="kt-resizable-textarea"
              ref={setInputRef}
              value={editText}
              aria-label={i18n("original_text")}
              placeholder={i18n("original_text")}
              onFocus={() => setPopupInputFocused(true)}
              onBlur={() => setPopupInputFocused(false)}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  if (!event.repeat) submitTranslation();
                }
              }}
            />
          </div>
          <div className="kt-popup-translation-input__footer">
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <span>{editText.length}</span>
              {!editText.trim() && (
                <IconButton
                  size="small"
                  onClick={handlePaste}
                  title={i18n("paste")}
                  aria-label={i18n("paste")}
                >
                  <ContentPasteIcon fontSize="inherit" />
                </IconButton>
              )}
            </Stack>
            <Button
              variant="contained"
              disabled={!editText.trim()}
              startIcon={<TranslateRoundedIcon />}
              onClick={submitTranslation}
            >
              {i18n("translate")}
            </Button>
          </div>
        </div>

        <div className="kt-popup-translation-direction">
          <CompactLanguageSelect
            value={fromLang}
            ariaLabel={i18n("from_lang")}
            options={OPT_LANGS_FROM}
            onChange={(event) => setFromLang(event.target.value)}
          />
          <span aria-hidden="true">→</span>
          <CompactLanguageSelect
            value={toLang}
            ariaLabel={i18n("to_lang")}
            options={OPT_LANGS_TO}
            onChange={(event) => setToLang(event.target.value)}
          />
        </div>

        <div className="kt-popup-translation-results">
          {activeApiSlugs.map((slug) => (
            <TranCont
              key={slug}
              text={translationText}
              fromLang={fromLang}
              toLang={realToLang}
              apiSlug={slug}
              transApis={transApis}
              translateVariants={translateVariants}
              parseLatex={parseLatex}
              detectedLang={deLang}
              sourceDetectionPending={fromLang === "auto" && deLoading}
              requestRevision={requestRevision}
              popupStyle
            />
          ))}
        </div>

        <button
          type="button"
          className="kt-popup-translation-compare"
          aria-expanded={showPopupServices}
          onClick={() => setShowPopupServices((current) => !current)}
        >
          {i18n("popup_compare_services")}
          <ExpandMoreRoundedIcon />
        </button>

        {showPopupServices && (
          <div className="kt-popup-translation-services">
            {optApis.map((api) => (
              <button
                type="button"
                aria-pressed={activeApiSlugs.includes(api.key)}
                onClick={() => togglePopupService(api.key)}
                key={api.key}
              >
                {api.name}
              </button>
            ))}
          </div>
        )}

        {popupDictionaryPanels}
      </div>
    );
  }

  return (
    <Stack
      className={isPlaygound ? "kt-playground-translator" : undefined}
      spacing={simpleStyle ? 1 : 2}
      useFlexGap={isPlaygound}
    >
      {/* Hide language, provider, and source input controls in simple mode. */}
      {!simpleStyle && (
        <>
          <Box className={isPlaygound ? "kt-playground-config" : undefined}>
            {isPlaygound && playgroundConfigHeader}
            {/* Service and language settings grid. */}
            <Grid
              className={isPlaygound ? "kt-playground-config__grid" : undefined}
              container
              spacing={2}
              columns={12}
            >
              {/* Select multiple translation engines to compare their results. */}
              <Grid
                className={
                  isPlaygound ? "kt-playground-config__service" : undefined
                }
                item
                xs={xs}
                md={md}
              >
                <TextField
                  select
                  SelectProps={{
                    multiple: true,
                    MenuProps: selectMenuProps,
                  }}
                  fullWidth
                  size="small"
                  value={activeApiSlugs}
                  name="apiSlugs"
                  label={i18n("translate_service_multiple")}
                  onChange={(e) => {
                    setHasUserChangedApiSlugs(true);
                    setApiSlugs(e.target.value);
                  }}
                >
                  {optApis.map(({ key, name }) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* Source language. */}
              <Grid item xs={xs} md={md}>
                <TextField
                  select
                  SelectProps={{ MenuProps: selectMenuProps }}
                  fullWidth
                  size="small"
                  name="fromLang"
                  value={fromLang}
                  label={i18n("from_lang")}
                  onChange={(e) => {
                    setFromLang(e.target.value);
                  }}
                >
                  {OPT_LANGS_FROM.map(([lang, name]) => (
                    <MenuItem key={lang} value={lang}>
                      {formatLanguageOptionName(name)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {/* Target language. */}
              <Grid item xs={xs} md={md}>
                <TextField
                  select
                  SelectProps={{ MenuProps: selectMenuProps }}
                  fullWidth
                  size="small"
                  name="toLang"
                  value={toLang}
                  label={i18n("to_lang")}
                  onChange={(e) => {
                    setToLang(e.target.value);
                  }}
                >
                  {OPT_LANGS_TO.map(([lang, name]) => (
                    <MenuItem key={lang} value={lang}>
                      {formatLanguageOptionName(name)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Show additional configuration controls in the Playground. */}
              {isPlaygound && (
                <>
                  {/* Secondary target language. */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ MenuProps: selectMenuProps }}
                      fullWidth
                      size="small"
                      name="toLang2"
                      value={toLang2}
                      label={i18n("to_lang2")}
                      onChange={(e) => {
                        setToLang2(e.target.value);
                      }}
                    >
                      {OPT_LANGS_TO.map(([lang, name]) => (
                        <MenuItem key={lang} value={lang}>
                          {formatLanguageOptionName(name)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* English dictionary service. */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ MenuProps: selectMenuProps }}
                      fullWidth
                      size="small"
                      name="enDict"
                      value={enDict}
                      label={i18n("english_dict")}
                      onChange={(e) => {
                        setEnDict(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_DICT_ALL.map((item) => (
                        <MenuItem value={item} key={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* Input suggestion service. */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ MenuProps: selectMenuProps }}
                      fullWidth
                      size="small"
                      name="enSug"
                      value={enSug}
                      label={i18n("english_suggest")}
                      onChange={(e) => {
                        setEnSug(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_SUG_ALL.map((item) => (
                        <MenuItem value={item} key={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* Language detection engine. */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ MenuProps: selectMenuProps }}
                      fullWidth
                      size="small"
                      name="langDetector"
                      value={langDetector}
                      label={i18n("detected_lang")}
                      onChange={(e) => {
                        setLangDetector(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_LANGDETECTOR_ALL.map((item) => (
                        <MenuItem value={item} key={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {/* Read-only language detection result. */}
                  <Grid item xs={xs} md={md}>
                    <TextField
                      fullWidth
                      size="small"
                      name="deLang"
                      value={
                        deLang &&
                        formatLanguageOptionName(OPT_LANGS_MAP.get(deLang))
                      }
                      label={i18n("detected_result")}
                      placeholder="—"
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ "aria-busy": deLoading }}
                      InputProps={{
                        readOnly: true,
                        startAdornment: (
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            {deLoading && (
                              <CircularProgress
                                size={16}
                                aria-label={i18n("detected_lang")}
                              />
                            )}
                          </Box>
                        ),
                      }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </Box>

          {/* Source text input. */}
          <Box
            className={
              isPlaygound ? "kt-playground-translator__source" : undefined
            }
          >
            <TextField
              className={
                isPlaygound
                  ? "kt-resizable-text-field kt-translation-text-field kt-translation-text-field--source"
                  : "kt-resizable-text-field"
              }
              size="small"
              label={i18n("original_text")}
              InputLabelProps={isPlaygound ? { shrink: true } : undefined}
              fullWidth
              multiline
              inputRef={setInputRef}
              minRows={isPlaygound ? 4 : 1}
              maxRows={10}
              inputProps={{
                className: "kt-resizable-textarea",
                style: { resize: "vertical" },
              }}
              sx={{
                "& .MuiInputBase-root": {
                  overflow: "visible",
                },
                '& textarea:not([aria-hidden="true"])': {
                  resize: "vertical",
                },
              }}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
              }}
              onFocus={() => {
                setEditMode(true);
              }}
              onBlur={(event) => {
                if (isShadowHostMoving(event.target)) return;
                commitEditText();
              }}
              InputProps={{
                endAdornment: (
                  <Stack
                    className={
                      isPlaygound
                        ? "kt-translation-text-field__actions"
                        : undefined
                    }
                    direction="row"
                    sx={
                      isPlaygound
                        ? undefined
                        : {
                            position: "absolute",
                            right: 0,
                            top: 0,
                          }
                    }
                  >
                    {editMode && editText !== text ? (
                      /* Show the submit checkmark while editing. */
                      <IconButton
                        size="small"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const input = inputRef.current;
                          // Read focus within the input's root, including shadow roots.
                          if (
                            input &&
                            input.getRootNode().activeElement === input
                          ) {
                            input.blur();
                          } else {
                            commitEditText();
                          }
                        }}
                        title={i18n("submit")}
                      >
                        <DoneIcon fontSize="inherit" />
                      </IconButton>
                    ) : text ? (
                      /* Show the copy action when text is present. */
                      <CopyBtn
                        text={text}
                        title={i18n("copy")}
                        copiedLabel={i18n("copy_success", "Copied")}
                      />
                    ) : (
                      /* Show the paste action when the input is empty. */
                      <IconButton
                        size="small"
                        onClick={handlePaste}
                        title={i18n("paste")}
                      >
                        <ContentPasteIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Stack>
                ),
              }}
            />
          </Box>
        </>
      )}

      {/* Translation and definition panels. */}
      {/* 1. Render a TranCont result for each selected translation service. */}
      {isPlaygound ? (
        <Stack
          className="kt-playground-translator__results"
          spacing={2}
          useFlexGap
        >
          {translationResults.length > 0 ? (
            translationResults
          ) : (
            <Box className="kt-playground-translator__empty" role="status">
              {i18n(
                "playground_translation_select_service",
                "请先选择至少一个可用的翻译服务"
              )}
            </Box>
          )}
        </Stack>
      ) : (
        translationResults
      )}

      {/* 2. Show the default and AI dictionaries according to availability. */}
      {(defaultDictAvailable || aiDictAvailable) && (
        <Box
          className={
            isPlaygound ? "kt-playground-translator__auxiliary" : undefined
          }
        >
          {aiDictAvailable ? (
            <>
              <Tabs
                value={defaultDictAvailable ? dictTab : "ai"}
                onChange={(_, value) => {
                  hasUserChangedDictTabRef.current = true;
                  setDictTab(value);
                }}
                variant="scrollable"
                allowScrollButtonsMobile
                aria-label={i18n("default_dict", "Dictionary")}
                sx={{ minHeight: 36, mb: 1 }}
              >
                {defaultDictAvailable && (
                  <Tab
                    id={defaultDictionaryTabId}
                    aria-controls={defaultDictionaryPanelId}
                    value="default"
                    label={i18n("default_dict", "默认词典")}
                    sx={{ minHeight: 36, py: 0.5 }}
                  />
                )}
                <Tab
                  id={aiDictionaryTabId}
                  aria-controls={aiDictionaryPanelId}
                  value="ai"
                  label={i18n("ai_dict", "AI词典")}
                  sx={{ minHeight: 36, py: 0.5 }}
                />
              </Tabs>
              {defaultDictAvailable && dictTab === "default" && (
                <Box
                  id={defaultDictionaryPanelId}
                  role="tabpanel"
                  aria-labelledby={defaultDictionaryTabId}
                >
                  {isWord && OPT_DICT_MAP.has(enDict) && (
                    <DictCont text={text} enDict={enDict} />
                  )}
                  {isSingleChineseChar(text) && <Zdic text={text} />}
                </Box>
              )}
              {(!defaultDictAvailable || dictTab === "ai") && (
                <Box
                  id={aiDictionaryPanelId}
                  role="tabpanel"
                  aria-labelledby={aiDictionaryTabId}
                >
                  <AiDictCont
                    text={text}
                    fromLang={fromLang}
                    speechLang={fromLang === "auto" ? deLang : fromLang}
                    toLang={realToLang}
                    apiSetting={aiDictApiSetting}
                    context={
                      // Pass context only when it contains the current text, so manual input cannot reuse stale selection context.
                      selectionContext && selectionContext.includes(text)
                        ? selectionContext
                        : ""
                    }
                  />
                </Box>
              )}
            </>
          ) : (
            <>
              {isWord && OPT_DICT_MAP.has(enDict) && (
                <DictCont text={text} enDict={enDict} />
              )}
              {isSingleChineseChar(text) && <Zdic text={text} />}
            </>
          )}
        </Box>
      )}

      {/* 3. Show enabled input suggestions for valid English words. */}
      {isWord &&
        OPT_SUG_MAP.has(enSug) &&
        (isPlaygound ? (
          <Box className="kt-playground-translator__auxiliary">
            <SugCont text={text} enSug={enSug} />
          </Box>
        ) : (
          <SugCont text={text} enSug={enSug} />
        ))}
    </Stack>
  );
}
