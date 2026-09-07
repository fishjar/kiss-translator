import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiTranslate } from "../../apis";
import {
  API_SPE_TYPES,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
} from "../../config";
import { useI18n } from "../../hooks/I18n";
import CopyBtn from "./CopyBtn";
import { BrowserTtsBtn } from "./AudioBtn";

/**
 * Determine whether selection translation results can render incrementally.
 *
 * @param {Object} apiSetting Translation API settings.
 * @returns {boolean} Whether this API should display streaming chunks immediately.
 */
const canRenderStream = (apiSetting) =>
  Boolean(
    apiSetting?.useStream &&
      API_SPE_TYPES.stream.has(apiSetting.apiType) &&
      (apiSetting.streamRenderMode || "disabled") !== "disabled"
  );

/**
 * Normalize the text payload from a streaming callback.
 *
 * @param {string|string[]} text Partial or final text from a streaming callback.
 * @returns {string} Translation text ready for display.
 */
const normalizeChunkText = (text) => {
  if (Array.isArray(text)) {
    return text[0] || "";
  }

  return text || "";
};

/**
 * Convert an API response to plain text for display and copying.
 *
 * @param {string} text Text returned by the translation API.
 * @param {string} apiType Translation API type.
 * @param {string} sourceText Original text to translate.
 * @returns {string} Translation text ready for the text UI.
 */
const normalizeTranslationText = (text, apiType, sourceText) => {
  const normalizedText = normalizeChunkText(text);
  if (apiType === OPT_TRANS_GOOGLE) {
    return normalizedText.replace(/[\t ]*(\r\n|\r|\n)[\t ]*/g, "\n");
  }

  if (API_SPE_TYPES.ai.has(apiType) && /\r\n|\r|\n/.test(sourceText)) {
    return normalizedText.replace(/\\r\\n|\\n|\\r/g, "\n");
  }

  return normalizedText;
};

/**
 * BuiltinAI does not preserve input line breaks reliably. Translate each
 * non-empty text fragment separately, then rejoin the original separators.
 *
 * @param {string} text Original text to translate.
 * @param {string} fromLang Requested source language.
 * @param {string} detectedLang Source language detected from the complete input.
 * @param {Function} translate Translation function for one text fragment.
 * @returns {Promise<{trText: string, isSame: boolean}>} Rejoined translated text.
 */
const translateBuiltinText = async (
  text,
  fromLang,
  detectedLang,
  translate
) => {
  const parts = text.split(/(\r\n|\r|\n)/);
  const translatableIndexes = parts.reduce((indexes, part, index) => {
    if (index % 2 === 0 && part.trim()) indexes.push(index);
    return indexes;
  }, []);
  if (translatableIndexes.length === 0) {
    return { trText: text, isSame: false };
  }

  const results = [];
  const translatedParts = [...parts];
  let requestFromLang =
    fromLang === "auto" && detectedLang ? detectedLang : fromLang;
  let remainingIndexes = translatableIndexes;

  // If full-input detection has no result, use auto/fallback only for the first fragment.
  // Reuse its source language to avoid concurrent remote detection for later fragments.
  if (requestFromLang === "auto") {
    const [firstIndex, ...restIndexes] = translatableIndexes;
    const firstResult = await translate(parts[firstIndex], "auto");
    results.push(firstResult);
    translatedParts[firstIndex] = firstResult.trText;
    remainingIndexes = restIndexes;
    requestFromLang = firstResult.srCode || firstResult.srLang;
    if (remainingIndexes.length > 0 && !requestFromLang) {
      throw new Error(
        "BuiltinAI could not resolve the source language for multiline translation"
      );
    }
  }

  await Promise.all(
    remainingIndexes.map(async (index) => {
      const result = await translate(parts[index], requestFromLang);
      results.push(result);
      translatedParts[index] = result.trText;
    })
  );

  return {
    trText: translatedParts.join(""),
    isSame: results.length > 0 && results.every((result) => result.isSame),
  };
};

/**
 * Request and display a selection translation from one provider.
 *
 * @param {Object} props Component props.
 * @param {string} props.text Original text to translate.
 * @param {string} props.fromLang Source language code.
 * @param {string} props.toLang Target language code.
 * @param {string} props.apiSlug Selected translation API identifier.
 * @param {Array<Object>} props.transApis Available translation API settings.
 * @param {boolean} [props.simpleStyle=false] Whether to use the simple text layout.
 * @param {boolean} [props.isPlayground=false] Whether to render the full Playground result surface.
 * @param {boolean} [props.popupStyle=false] Whether to use the Popup M3 result card.
 * @param {number} [props.requestRevision=0] Explicit submission revision for retrying unchanged input.
 * @returns {JSX.Element|null} Result view for one translation provider.
 */
export default function TranCont({
  text,
  fromLang,
  toLang,
  apiSlug,
  transApis,
  translateVariants = true,
  detectedLang = "",
  sourceDetectionPending = false,
  simpleStyle = false,
  isPlayground = false,
  popupStyle = false,
  requestRevision = 0,
}) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsedMs, setElapsedMs] = useState(null);
  const [attemptRevision, setAttemptRevision] = useState(requestRevision);
  const requestPendingRef = useRef(false);

  // Resolve the translation API settings for this instance's slug.
  const apiSetting = useMemo(
    () => transApis.find((api) => api.apiSlug === apiSlug),
    [transApis, apiSlug]
  );
  const coordinatesBuiltinSource =
    apiSetting?.apiType === OPT_TRANS_BUILTINAI && fromLang === "auto";
  const builtinDetectedLang = coordinatesBuiltinSource ? detectedLang : "";
  const waitForBuiltinDetection =
    coordinatesBuiltinSource && sourceDetectionPending;

  useEffect(() => {
    requestPendingRef.current = false;
    if (!text?.trim() || !apiSetting) {
      setTrText("");
      setLoading(false);
      setError("");
      return;
    }

    if (waitForBuiltinDetection) {
      requestPendingRef.current = true;
      setTrText("");
      setLoading(true);
      setError("");
      return;
    }

    let active = true;
    requestPendingRef.current = true;
    const controller = new AbortController();
    const enableStreamRender = canRenderStream(apiSetting);
    const startedAt = Date.now();

    /**
     * Synchronize streaming text from the translation queue with the output field.
     *
     * @param {Object} chunk Streaming translation chunk.
     * @param {string|string[]} chunk.text Translation text parsed from this chunk.
     */
    const handleStreamChunk = enableStreamRender
      ? ({ text: chunkText }) => {
          // Ignore late chunks from replaced or canceled requests.
          if (!active || controller.signal.aborted) {
            return;
          }

          const nextText = normalizeTranslationText(
            chunkText,
            apiSetting.apiType,
            text
          );
          if (nextText) {
            setTrText(nextText);
          }
        }
      : undefined;

    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");
        setElapsedMs(null);

        const translate = (requestText, requestFromLang = fromLang) =>
          apiTranslate({
            text: requestText,
            fromLang: requestFromLang,
            toLang,
            apiSetting,
            textFormat: "text",
            translateVariants,
            onStreamChunk: handleStreamChunk,
            // Pass cancellation through so stale requests stop using the network and updating the UI.
            signal: controller.signal,
          });
        const { trText, isSame } =
          apiSetting.apiType === OPT_TRANS_BUILTINAI
            ? await translateBuiltinText(
                text,
                fromLang,
                builtinDetectedLang,
                translate
              )
            : await translate(text);

        if (active) {
          setTrText(
            isSame
              ? ""
              : normalizeTranslationText(trText, apiSetting.apiType, text)
          );
          setElapsedMs(Date.now() - startedAt);
        }
      } catch (err) {
        if (err?.name === "AbortError") {
          return;
        }

        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          requestPendingRef.current = false;
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      requestPendingRef.current = false;
      // Abort on unmount or dependency changes to stop streaming data for stale selections.
      controller.abort();
    };
  }, [
    text,
    fromLang,
    toLang,
    apiSetting,
    translateVariants,
    builtinDetectedLang,
    waitForBuiltinDetection,
    attemptRevision,
  ]);

  // Keep pending requests, including queued batches, intact on repeated submits.
  // Input changes are handled above and must not trigger a second attempt here.
  useEffect(() => {
    if (!requestPendingRef.current) setAttemptRevision(requestRevision);
  }, [requestRevision]);

  if (!apiSetting) {
    return null;
  }

  if (simpleStyle) {
    return (
      <Box aria-live="polite" aria-busy={loading}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : trText ? (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ width: 12, height: 12, flex: "0 0 auto", mt: "0.35em" }}>
              {loading && (
                <CircularProgress
                  size={12}
                  aria-label={i18n("popup_translating")}
                />
              )}
            </Box>
            <Typography style={{ whiteSpace: "pre-line" }}>{trText}</Typography>
          </Stack>
        ) : loading ? (
          <CircularProgress size={16} />
        ) : null}
      </Box>
    );
  }

  if (popupStyle) {
    return (
      <article className="kt-popup-translation-result">
        <header>
          <strong>{apiSetting.apiName || apiSetting.apiSlug}</strong>
          {elapsedMs !== null && <span>{elapsedMs}ms</span>}
          <div>
            {trText && (
              <CopyBtn
                text={trText}
                title={i18n("copy")}
                copiedLabel={i18n("copy_success", "Copied")}
              />
            )}
            <BrowserTtsBtn
              text={trText}
              lang={toLang}
              title={i18n("read_aloud")}
            />
          </div>
        </header>
        <div
          className="kt-popup-translation-result__body"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading && !trText ? (
            <CircularProgress size={18} />
          ) : error ? (
            <span className="kt-popup-translation-result__error">{error}</span>
          ) : trText ? (
            <span>{trText}</span>
          ) : (
            <span className="kt-popup-translation-result__empty">
              {i18n("popup_enter_text")}
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <Box
      className={isPlayground ? "kt-playground-translator__result" : undefined}
    >
      <TextField
        className={
          isPlayground
            ? "kt-resizable-text-field kt-translation-text-field kt-translation-text-field--result"
            : "kt-resizable-text-field"
        }
        size="small"
        label={`${i18n("translated_text")} - ${apiSetting.apiName}`}
        InputLabelProps={isPlayground ? { shrink: true } : undefined}
        fullWidth
        multiline
        minRows={isPlayground ? 4 : undefined}
        maxRows={10}
        inputProps={{
          className: "kt-resizable-textarea",
          style: { resize: "vertical" },
          "aria-busy": loading,
        }}
        placeholder={
          isPlayground && !text
            ? i18n(
                "playground_translation_empty_result",
                "输入原文后，译文将在这里显示"
              )
            : undefined
        }
        sx={{
          "& .MuiInputBase-root": {
            overflow: "visible",
          },
          '& textarea:not([aria-hidden="true"])': {
            resize: "vertical",
          },
        }}
        value={trText}
        helperText={error}
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
              {loading && (
                <CircularProgress
                  size={16}
                  aria-label={i18n("popup_translating")}
                />
              )}
            </Box>
          ),
          endAdornment: (
            <Stack
              className={
                isPlayground ? "kt-translation-text-field__actions" : undefined
              }
              direction="row"
              sx={
                isPlayground
                  ? undefined
                  : {
                      position: "absolute",
                      right: 0,
                      top: 0,
                    }
              }
            >
              {/* Copy the current translation, including partial text during streaming. */}
              {trText && (
                <CopyBtn
                  text={trText}
                  title={i18n("copy")}
                  copiedLabel={i18n("copy_success", "Copied")}
                />
              )}
            </Stack>
          ),
        }}
      />
    </Box>
  );
}
