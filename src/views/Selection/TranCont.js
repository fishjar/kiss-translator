import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiTranslate } from "../../apis";
import {
  API_SPE_TYPES,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
} from "../../config";
import { useI18n } from "../../hooks/I18n";
import { parseMathInText } from "../../libs/mathParse";
import CopyBtn from "./CopyBtn";
import { BrowserTtsBtn } from "./AudioBtn";
import TextareaResizeGrip from "../../components/TextareaResizeGrip";
import ApiProviderIcon from "../../components/ApiProviderIcon";
import useTextareaHeightLock, {
  useTextareaGripStyle,
  useReleaseOnGripHidden,
} from "../../hooks/useTextareaHeightLock";

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

function getPopupErrorMessage(value, concise = false) {
  if (typeof value !== "string") return "";
  const message = value.replace(/\n\s*at\b[\s\S]*$/, "").trim();
  if (
    !message ||
    /^[{[]/.test(message) ||
    /[a-z][a-z\d+.-]*:\/\/|www\.|<\/?[a-z!][^>]*>/i.test(message)
  ) {
    return "";
  }
  if (!concise) return message;
  const singleLine = message.replace(/\s+/g, " ");
  return singleLine.length > 180 ? `${singleLine.slice(0, 179)}…` : singleLine;
}

function formatPopupError(error, i18n) {
  const generic = i18n(
    "popup_text_failed",
    "Translation failed. Please retry."
  );
  const auth = i18n(
    "popup_text_auth_failed",
    "Check your API Key in Settings."
  );
  const raw = String(error || "")
    .replace(/^(?:Uncaught\s+)?(?:\w*Error):\s*/i, "")
    .trim();
  const isAuthError = (message) =>
    /unauthorized|(?:missing|invalid|incorrect)\s+(?:an?\s+)?api[\s_-]*key|api[\s_-]*key\s+(?:is\s+)?(?:missing|required|invalid|incorrect)|(?:authentication|authorization)\s+(?:failed|failure)/i.test(
      message
    );
  let details;
  try {
    details = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        details = JSON.parse(raw.slice(start, end + 1));
      } catch {
        // A malformed diagnostic payload must not appear in the popup.
      }
    }
  }
  if (details === undefined) {
    const message = getPopupErrorMessage(raw);
    return message ? (isAuthError(message) ? auth : message) : generic;
  }
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return generic;
  }

  let response = details.response ?? details;
  if (typeof response === "string") {
    try {
      response = JSON.parse(response);
    } catch {
      // Plain upstream messages do not need a JSON response envelope.
    }
  }
  const message = getPopupErrorMessage(
    typeof response === "string"
      ? response
      : response?.error?.message || response?.message,
    true
  );
  const status = Number(details.status);
  const hasStatus = Number.isInteger(status) && status >= 100 && status <= 599;
  const detail =
    status === 401 || isAuthError(`${details.statusText || ""} ${message}`)
      ? auth
      : message;
  if (!hasStatus) return detail || generic;
  const failed = i18n(
    "popup_text_request_failed",
    "Request failed ({status})"
  ).replace("{status}", String(status));
  return detail ? `${failed}: ${detail}` : failed;
}

/**
 * Convert an API response to plain text for display and copying.
 *
 * @param {string} text Text returned by the translation API.
 * @param {string} apiType Translation API type.
 * @param {string} sourceText Original text to translate.
 * @param {boolean} parseLatex Whether to render inline LaTeX as Unicode.
 * @returns {string} Translation text ready for the text UI.
 */
const normalizeTranslationText = (text, apiType, sourceText, parseLatex) => {
  const normalizedText = normalizeChunkText(text);
  // Convert inline LaTeX before unescaping newlines so commands such as
  // `\right` are not split by the escaped carriage-return replacement.
  const mathText = parseLatex
    ? parseMathInText(normalizedText)
    : normalizedText;

  if (apiType === OPT_TRANS_GOOGLE) {
    return mathText.replace(/[\t ]*(\r\n|\r|\n)[\t ]*/g, "\n");
  }

  if (API_SPE_TYPES.ai.has(apiType) && /\r\n|\r|\n/.test(sourceText)) {
    return mathText.replace(/\\r\\n|\\n|\\r/g, "\n");
  }

  return mathText;
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
 * @param {boolean} [props.isPopup=false] Whether to render a popup result section.
 * @param {boolean} [props.showProvider=true] Whether to show the provider section header.
 * @param {HTMLElement|null} [props.actionContainer=null] Host for single-provider popup actions.
 * @param {boolean} [props.waitForSourceDetection=false] Whether the target requires completed source detection.
 * @param {number} [props.requestRevision=0] Explicit submission revision for retrying unchanged input.
 * @param {Function} [props.onActionPointerDown] Host focus policy for result actions.
 * @returns {JSX.Element|null} Result view for one translation provider.
 */
export default function TranCont({
  text,
  fromLang,
  toLang,
  apiSlug,
  transApis,
  translateVariants = true,
  parseLatex = false,
  detectedLang = "",
  sourceDetectionPending = false,
  waitForSourceDetection = false,
  simpleStyle = false,
  isPlayground = false,
  isPopup = false,
  showProvider = true,
  actionContainer = null,
  requestRevision = 0,
  onActionPointerDown,
}) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attemptRevision, setAttemptRevision] = useState(requestRevision);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestPendingRef = useRef(false);
  const gripStyle = useTextareaGripStyle();
  const resultHeightLock = useTextareaHeightLock(
    // 键随 apiSlug 走：TranForm 以 key={slug} 并存多个结果实例，共享键
    // 会让各实例互改写同一会话记忆；playground 为单实例，键保留。
    isPopup
      ? `trancont-popup-result:${apiSlug}`
      : isPlayground
        ? "trancont-result-playground"
        : `trancont-result:${apiSlug}`
  );
  useReleaseOnGripHidden(gripStyle, resultHeightLock.releaseHeight);

  // 内容清空 → 彻底解锁：清除会话高度记忆并还原 root，手柄随内容门控
  // 消失；门控表达式的锁定分支保留（服务于「有内容且已锁」的存续态）。
  // useLayoutEffect：空内容解锁须先于绘制，防重挂载首帧以记忆高度闪现。
  // releaseHeight 为 useCallback([lockKey]) 产物（lockKey 不变则引用恒
  // 定），经解构取稳定引用后进依赖数组——消除对 hook 返回对象整体的
  // exhaustive-deps 告警形态（发布面：CRA 下 warning 即构建失败）。
  const { releaseHeight: releaseResultHeight } = resultHeightLock;
  useLayoutEffect(() => {
    // 释放判据用原文而非译文：新请求发起时 trText 先被清空，若监听
    // trText 会在重译同一原文时误删会话高度记忆；仅原文清空才彻底解锁。
    if (!text?.trim()) {
      releaseResultHeight();
    }
  }, [text, releaseResultHeight]);

  // Resolve the translation API settings for this instance's slug.
  const apiSetting = useMemo(
    () => transApis.find((api) => api.apiSlug === apiSlug),
    [transApis, apiSlug]
  );
  const coordinatesBuiltinSource =
    apiSetting?.apiType === OPT_TRANS_BUILTINAI && fromLang === "auto";
  const builtinDetectedLang = coordinatesBuiltinSource ? detectedLang : "";
  const waitForDetection =
    (coordinatesBuiltinSource || waitForSourceDetection) &&
    sourceDetectionPending;

  useEffect(() => {
    requestPendingRef.current = false;
    if (!text?.trim() || !apiSetting) {
      setTrText("");
      setLoading(false);
      setError("");
      return;
    }

    if (waitForDetection) {
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
            text,
            parseLatex
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
              : normalizeTranslationText(
                  trText,
                  apiSetting.apiType,
                  text,
                  parseLatex
                )
          );
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
    parseLatex,
    builtinDetectedLang,
    waitForDetection,
    attemptRevision,
    retryRevision,
  ]);

  // Keep pending requests, including queued batches, intact on repeated submits.
  // Input changes are handled above and must not trigger a second attempt here.
  useEffect(() => {
    if (!requestPendingRef.current) setAttemptRevision(requestRevision);
  }, [requestRevision]);

  if (!apiSetting) {
    return null;
  }

  const resultLabel = `${i18n("translated_text")} - ${
    apiSetting.apiName || apiSetting.apiSlug
  }`;

  if (isPopup) {
    const hasResult = Boolean(trText.trim() && !error);
    const popupError = error ? formatPopupError(error, i18n) : "";
    const actions = (
      <div
        className="kt-popup-text-result__actions"
        onPointerDown={onActionPointerDown}
      >
        {hasResult ? (
          <>
            <CopyBtn
              text={trText}
              title={i18n("copy")}
              copiedLabel={i18n("copy_success", "Copied")}
            />
            <BrowserTtsBtn
              text={trText}
              lang={toLang}
              title={i18n("read_aloud")}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              disabled
              title={i18n("copy")}
              aria-label={i18n("copy")}
            >
              <ContentCopyIcon fontSize="inherit" />
            </button>
            <button
              type="button"
              disabled
              title={i18n("read_aloud")}
              aria-label={i18n("read_aloud")}
            >
              <VolumeUpIcon fontSize="inherit" />
            </button>
          </>
        )}
      </div>
    );

    return (
      <section
        className="kt-popup-text-result"
        data-api-slug={apiSlug}
        data-state={
          error ? "error" : loading ? "loading" : trText ? "ready" : "empty"
        }
        aria-label={resultLabel}
        aria-busy={loading}
      >
        {showProvider ? (
          <div className="kt-popup-text-result__header">
            <div className="kt-popup-text-result__provider">
              <ApiProviderIcon
                apiType={apiSetting.apiType}
                size={18}
                imageSize={14}
                lightSurface
              />
              <span>{apiSetting.apiName || apiSetting.apiSlug}</span>
            </div>
            {actions}
          </div>
        ) : actionContainer ? (
          createPortal(actions, actionContainer)
        ) : (
          <div className="kt-popup-text-result__header">{actions}</div>
        )}
        <div className="kt-popup-text-result__body">
          {error ? (
            <div className="kt-popup-text-result__error" role="alert">
              <p>{popupError}</p>
              <button
                type="button"
                className="kt-popup-text-result__retry"
                onPointerDown={onActionPointerDown}
                onClick={() => setRetryRevision((revision) => revision + 1)}
              >
                <ReplayRoundedIcon fontSize="inherit" />
                {i18n("retry")}
              </button>
            </div>
          ) : (
            <>
              {loading && (
                <div className="kt-popup-text-result__loading">
                  <CircularProgress
                    size={12}
                    aria-label={i18n("popup_translating")}
                  />
                  <span>{i18n("popup_translating")}</span>
                </div>
              )}
              {trText ? (
                <div className="kt-popup-text-result__content">{trText}</div>
              ) : !loading ? (
                <div className="kt-popup-text-result__empty">
                  {i18n(
                    "popup_text_result_empty",
                    "Translation will appear here."
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            width: 1,
            height: 1,
            position: "absolute",
            overflow: "hidden",
            padding: 0,
            margin: -1,
            border: 0,
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
          }}
        >
          {!loading && (error || trText)
            ? `${resultLabel}: ${popupError || trText}`
            : ""}
        </span>
      </section>
    );
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

  return (
    <Box
      className={`kt-translation-result ${
        isPlayground ? "kt-playground-translator__result" : ""
      }`}
    >
      <TextField
        className={
          isPlayground
            ? "kt-resizable-text-field kt-translation-text-field kt-translation-text-field--result"
            : "kt-resizable-text-field"
        }
        size="small"
        label={resultLabel}
        InputLabelProps={isPlayground ? { shrink: true } : undefined}
        fullWidth
        multiline
        inputRef={resultHeightLock.textareaRef}
        minRows={isPlayground ? 4 : undefined}
        maxRows={10}
        inputProps={{
          className: "kt-resizable-textarea",
          style: {
            resize: gripStyle === "hidden" ? "vertical" : "none",
            ...(isPlayground
              ? {}
              : { boxSizing: "border-box", paddingInlineEnd: 16 }),
          },
          "aria-busy": loading,
          "aria-label": resultLabel,
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
        }}
        value={trText}
        helperText={error}
        InputProps={{
          ...resultHeightLock.rootProps,
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
            <>
              <Stack
                onPointerDown={onActionPointerDown}
                className={
                  isPlayground
                    ? "kt-translation-text-field__actions"
                    : undefined
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
                <BrowserTtsBtn
                  text={trText}
                  lang={toLang}
                  title={i18n("read_aloud")}
                />
              </Stack>
              {(trText.trim() || resultHeightLock.lockedHeight != null) && (
                <TextareaResizeGrip
                  target={resultHeightLock.textareaRef}
                  onResize={resultHeightLock.applyHeight}
                  value={resultHeightLock.lockedHeight}
                  label={i18n("field_resize_height")}
                  variant={gripStyle}
                  onRelease={resultHeightLock.releaseHeight}
                  unlockHint={i18n("field_resize_unlock_hint")}
                />
              )}
            </>
          ),
        }}
      />
      {/* Announce completed results without repeating every streaming chunk. */}
      <Box
        role="status"
        aria-live="polite"
        aria-atomic="true"
        sx={{
          width: "1px",
          height: "1px",
          position: "absolute",
          overflow: "hidden",
          padding: 0,
          margin: -1,
          border: 0,
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {!loading && (error || trText)
          ? `${resultLabel}: ${error || trText}`
          : ""}
      </Box>
    </Box>
  );
}
