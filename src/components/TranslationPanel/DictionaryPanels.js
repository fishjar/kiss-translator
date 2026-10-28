import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  OPT_DICT_MAP,
  OPT_SUG_MAP,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_MODE_FOLLOW_API,
  findPromptBySlug,
} from "../../config";
import {
  isApiConfigured,
  supportsApiCapability,
} from "../../config/serviceSelection";
import { useI18n } from "../../hooks/I18n";
import { isSingleChineseChar, isValidWord } from "../../libs/utils";
import AiDictCont from "../../views/Selection/AiDictCont";
import DictCont from "../../views/Selection/DictCont";
import SugCont from "../../views/Selection/SugCont";
import Zdic from "../../views/Selection/Zdic";

// Treat whitespace-only prompts as unconfigured.
const hasPrompt = (value) => typeof value === "string" && Boolean(value.trim());

/**
 * Revalidate a stored AI dictionary slug against current API availability.
 *
 * @param {Object} settings
 * @param {Array<Object>} [settings.transApis]
 * @param {Array<Object>} [settings.prompts]
 * @param {string} [settings.aiDictApiSlug]
 * @param {string} [settings.aiDictPromptSlug]
 * @returns {Object|null} An API setting carrying the resolved dictionary prompt.
 */
export function resolveAiDictApiSetting({
  transApis = [],
  prompts = [],
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
}) {
  if (!aiDictApiSlug || aiDictApiSlug === "-") {
    return null;
  }

  // Stored slugs can outlive changes to API availability, API type, or prompt category.
  // Recheck eligibility to avoid sending dictionary prompts to a non-AI endpoint.
  const apiSetting = transApis.find(
    (api) =>
      api.apiSlug === aiDictApiSlug &&
      !api.isDisabled &&
      isApiConfigured(api) &&
      supportsApiCapability(api, "dictionary")
  );
  if (!apiSetting) {
    return null;
  }

  // Following the API requires a resolved, nonblank dictPrompt.
  // Empty prompts would create a billed request without useful instructions.
  if (aiDictPromptSlug === PROMPT_MODE_FOLLOW_API) {
    const { provider } = apiSetting;
    if (provider && provider.implementation?.kind !== "native") {
      return apiSetting;
    }
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
}

/**
 * Pure availability probe used by the dictionary panel itself. Hosts must not
 * gate source-text controls on it: whether a screen already offers a headword
 * pronunciation is the panel's business, not the source row's.
 *
 * @param {Object} input
 * @param {string} input.text
 * @param {string} input.enDict
 * @param {Array<Object>} [input.transApis]
 * @param {Array<Object>} [input.prompts]
 * @param {string} [input.aiDictApiSlug]
 * @param {string} [input.aiDictPromptSlug]
 * @returns {{isWord: boolean, defaultDictAvailable: boolean, aiDictAvailable: boolean, aiDictApiSetting: Object|null}}
 */
export function getDictionaryAvailability({
  text,
  enDict,
  transApis = [],
  prompts = [],
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
}) {
  // Only a non-empty string may query a dictionary: `isValidWord` stringifies,
  // so a number like 42 would otherwise reach the API as the word "42", and a
  // truthy non-string would enable the AI dictionary with no real query text.
  const hasText = typeof text === "string" && Boolean(text.trim());
  const isWord = hasText && isValidWord(text);
  const aiDictApiSetting = resolveAiDictApiSetting({
    transApis,
    prompts,
    aiDictApiSlug,
    aiDictPromptSlug,
  });
  return {
    isWord,
    // Use Bing/Youdao for English words and Zdic for single Chinese characters.
    defaultDictAvailable:
      hasText &&
      ((isWord && OPT_DICT_MAP.has(enDict)) || isSingleChineseChar(text)),
    aiDictApiSetting,
    aiDictAvailable: Boolean(hasText && aiDictApiSetting),
  };
}

/**
 * Default dictionary, AI dictionary, Chinese character dictionary and input
 * suggestions. Shared by the translation form and the toolbar popup so both
 * entry points restore the same headword lookup and pronunciation.
 */
export default function DictionaryPanels({
  text,
  enDict,
  enSug,
  fromLang,
  toLang,
  detectedLang,
  transApis,
  prompts,
  aiDictApiSlug,
  aiDictPromptSlug,
  requestRevision,
  source = null,
  context = "",
  ttsApiSlug = "",
  translateVariants = true,
  dictionaryTranslationApi = null,
  isPlayground = false,
  auxiliaryClassName,
}) {
  const i18n = useI18n();
  const dictionaryTabsId = useId();
  const defaultDictionaryTabId = `${dictionaryTabsId}-default-tab`;
  const defaultDictionaryPanelId = `${dictionaryTabsId}-default-panel`;
  const aiDictionaryTabId = `${dictionaryTabsId}-ai-tab`;
  const aiDictionaryPanelId = `${dictionaryTabsId}-ai-panel`;
  const [dictTab, setDictTab] = useState("default");
  const hasUserChangedDictTabRef = useRef(false);
  const { isWord, defaultDictAvailable, aiDictAvailable, aiDictApiSetting } =
    useMemo(
      () =>
        getDictionaryAvailability({
          text,
          enDict,
          transApis,
          prompts,
          aiDictApiSlug,
          aiDictPromptSlug,
        }),
      [text, enDict, transApis, prompts, aiDictApiSlug, aiDictPromptSlug]
    );

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

  // One default-dictionary block shared by the tabbed panel and the plain
  // fallback branch, so both renderers keep identical conditions and props.
  const defaultDictionary = (
    <>
      {isWord && OPT_DICT_MAP.has(enDict) && (
        <DictCont
          text={text}
          enDict={enDict}
          source={source}
          toLang={toLang}
          apiSetting={dictionaryTranslationApi}
          translateVariants={translateVariants}
        />
      )}
      {isSingleChineseChar(text) && <Zdic text={text} />}
    </>
  );

  // Suggestions wrapper: use the same SugCont element and conditionally wrap it in a Box.
  const suggestionsWrapperClass = isPlayground
    ? "kt-playground-translator__auxiliary"
    : auxiliaryClassName;
  const suggestionsNode =
    isWord && OPT_SUG_MAP.has(enSug) ? (
      <SugCont
        text={text}
        enSug={enSug}
        toLang={toLang}
        apiSetting={dictionaryTranslationApi}
        translateVariants={translateVariants}
      />
    ) : null;
  const suggestionsBlock = suggestionsNode
    ? suggestionsWrapperClass
      ? <Box className={suggestionsWrapperClass}>{suggestionsNode}</Box>
      : suggestionsNode
    : null;

  return (
    <>
      {/* Show the default and AI dictionaries according to availability. */}
      {(defaultDictAvailable || aiDictAvailable) && (
        <Box
          className={
            isPlayground
              ? "kt-playground-translator__auxiliary"
              : auxiliaryClassName
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
                aria-label={i18n("dictionary", "Dictionary")}
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
                  {defaultDictionary}
                </Box>
              )}
              {(!defaultDictAvailable || dictTab === "ai") && (
                <Box
                  id={aiDictionaryPanelId}
                  role="tabpanel"
                  aria-labelledby={aiDictionaryTabId}
                >
                  <AiDictCont
                    ttsApiSlug={ttsApiSlug}
                    text={text}
                    fromLang={fromLang}
                    speechLang={fromLang === "auto" ? detectedLang : fromLang}
                    toLang={toLang}
                    apiSetting={aiDictApiSetting}
                    requestRevision={requestRevision}
                    context={
                      // Pass context only when it contains the current text, so manual input cannot reuse stale selection context.
                      context && context.includes(text) ? context : ""
                    }
                  />
                </Box>
              )}
            </>
          ) : (
            defaultDictionary
          )}
        </Box>
      )}

      {/* Show enabled input suggestions for valid English words. */}
      {suggestionsBlock}
    </>
  );
}
