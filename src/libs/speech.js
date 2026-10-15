function normalizeLang(lang) {
  const value = String(lang || "")
    .trim()
    .replace(/_/g, "-");
  const lowerValue = value.toLowerCase();

  // Chrome TTS 不接受 auto 等检测值，统一兜底为英语发音。
  if (
    !value ||
    lowerValue === "en" ||
    lowerValue === "auto" ||
    lowerValue === "detect" ||
    lowerValue === "und" ||
    lowerValue === "unknown"
  ) {
    return "en-US";
  }

  // 只保留简单的 BCP-47 形态，避免 chrome.tts 报 Invalid lang。
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value)) {
    return "en-US";
  }

  return value;
}

function hasChromeTts() {
  return typeof globalThis.chrome?.tts?.speak === "function";
}

function hasWebSpeech() {
  return (
    typeof globalThis.speechSynthesis?.speak === "function" &&
    typeof globalThis.SpeechSynthesisUtterance === "function"
  );
}

const FINAL_CHROME_TTS_EVENTS = new Set([
  "end",
  "interrupted",
  "cancelled",
  "error",
]);

// Web Speech 通过 utterance 事件通知结束，不会返回可监听的播放句柄。
function speakWithWebSpeech(text, lang, callbacks = {}) {
  if (!hasWebSpeech()) return false;

  try {
    const utterance = new globalThis.SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (callbacks.voice) utterance.voice = globalThis.speechSynthesis.getVoices().find(voice => voice.name === callbacks.voice) || null;
    if (callbacks.speed !== undefined) utterance.rate = callbacks.speed;
    utterance.onend = () => callbacks.onEnd?.("end");
    utterance.onerror = event => callbacks.onEnd?.(["interrupted", "canceled"].includes(event.error) ? "interrupted" : "error");
    globalThis.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    return false;
  }
}

export function canSpeak() {
  return hasChromeTts() || hasWebSpeech();
}

export function speak(text, lang = "en-US", callbacks = {}) {
  const utteranceText = text?.trim();
  if (!utteranceText) return false;

  const normalizedLang = normalizeLang(lang);
  let ended = false;

  // Chrome TTS 和 Web Speech 都可能从多个终态路径回调，需保证只结束一次。
  const onEnd = (reason = "end") => {
    if (ended) return;
    ended = true;
    callbacks.onEnd?.(reason);
  };

  if (hasChromeTts()) {
    try {
      globalThis.chrome.tts.speak(
        utteranceText,
        {
          lang: normalizedLang,
          ...(callbacks.voice && { voiceName: callbacks.voice }),
          ...(callbacks.speed !== undefined && { rate: callbacks.speed }),
          onEvent: (event) => {
            if (FINAL_CHROME_TTS_EVENTS.has(event?.type)) {
              onEnd(event.type);
            }
          },
        },
        () => {
          // 读取 lastError，避免 Chrome 控制台出现 Unchecked runtime.lastError。
          if (globalThis.chrome?.runtime?.lastError) {
            if (!speakWithWebSpeech(utteranceText, normalizedLang, { ...callbacks, onEnd })) {
              onEnd("error");
            }
          }
        }
      );
      return true;
    } catch (err) {
      return speakWithWebSpeech(utteranceText, normalizedLang, { ...callbacks, onEnd });
    }
  }

  return speakWithWebSpeech(utteranceText, normalizedLang, { ...callbacks, onEnd });
}

export function stopSpeech() {
  globalThis.chrome?.tts?.stop?.();
  globalThis.speechSynthesis?.cancel?.();
}
