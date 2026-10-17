import { asrFeedbackEvents, asrFailure } from "./status";
import { ASR_I18N } from "../../config/locales/asr";
const i18n = (key) => ASR_I18N[key]?.en || key;

test("ASR diagnostics retain service reasons but exclude credentials, URLs and bodies", () => {
  expect(
    asrFailure({ message: "[ONNXRuntimeError] WebGPU device lost" }).errorDetail
  ).toBe("[ONNXRuntimeError] WebGPU device lost");
  const result = asrFailure(
    {
      code: "MODEL_NOT_READY",
      message:
        "Model download incomplete: private-key https://host/api?token=secret Bearer sensitive token=hidden\nstack",
    },
    { pluginConfig: { apiKey: "private-key" } }
  );
  expect(result.errorCode).toBe("MODEL_NOT_READY");
  expect(result.errorDetail).toContain("Model download incomplete");
  for (const secret of [
    "private-key",
    "https://",
    "sensitive",
    "hidden",
    "stack",
  ])
    expect(result.errorDetail).not.toContain(secret);
  expect(
    asrFailure({ message: '{"response":"private text"}' }).errorDetail
  ).toBe("");
  expect(
    asrFailure({ code: "unsafe code", message: "x".repeat(500) })
  ).toMatchObject({ errorCode: "ASR_FAILED", errorDetail: "x".repeat(240) });
});

test("errors stay distinct and semantic event keys ignore progress refreshes", () => {
  const state = {
    phase: "recognizing",
    recognitionError: "ASR_FAILED",
    translationError: "TRANSLATION_FAILED",
    cacheSaved: false,
    audio: { phase: "error", code: "AUDIO_NETWORK" },
  };
  const events = asrFeedbackEvents(state, i18n);
  expect(events.filter((event) => event.error)).toHaveLength(4);
  expect(
    asrFeedbackEvents({ ...state, recognition: { percent: 60 } }, i18n)
  ).toEqual(events);
  expect(
    asrFeedbackEvents({ phase: "cached", sourceLanguage: "en" }, i18n).map(
      (event) => event.key
    )
  ).toEqual(["cached"]);
});

test("ASR labels include every locale with matching placeholders", () => {
  for (const translations of Object.values(ASR_I18N)) {
    expect(Object.keys(translations)).toHaveLength(8);
    const tokens = (text) =>
      [...text.matchAll(/\{[^}]+\}/g)].map((match) => match[0]).sort();
    for (const text of Object.values(translations)) {
      expect(typeof text).toBe("string");
      expect(text.trim()).not.toBe("");
      expect(tokens(text)).toEqual(tokens(translations.en));
    }
  }
});
