import { speak, stopSpeech } from "../libs/speech";
import { providerError } from "../providers/capabilities";
let activeSpeech;

export function speakNative(input, _api, ctx) {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const task = {};
    const cancel = () => {
      cancelled = true;
      ctx.signal.removeEventListener("abort", cancel);
      reject(providerError("REQUEST_CANCELLED", "Speech cancelled."));
      // Platform stop is global. Cancelling an old task must not stop a newer utterance.
      if (activeSpeech === task) {
        activeSpeech = undefined;
        stopSpeech();
      }
    };
    ctx.signal.addEventListener("abort", cancel, { once: true });
    if (ctx.signal.aborted) {
      cancel();
      return;
    }
    activeSpeech = task;
    if (
      !speak(input.text, input.language, {
        voice: input.voice,
        speed: input.speed,
        onEnd: (reason) => {
          ctx.signal.removeEventListener("abort", cancel);
          if (cancelled) return;
          if (activeSpeech === task) activeSpeech = undefined;
          if (reason === "error")
            reject(providerError("SPEECH_ERROR", "System speech failed."));
          else resolve({ status: reason === "end" ? "ended" : "interrupted" });
        },
      })
    ) {
      ctx.signal.removeEventListener("abort", cancel);
      if (activeSpeech === task) activeSpeech = undefined;
      reject(
        providerError("SERVICE_UNAVAILABLE", "System speech is unavailable.")
      );
    }
  });
}
