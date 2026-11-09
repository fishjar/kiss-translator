import {
  asrLanguageOptions,
  resolveAsrLanguage,
  asrLanguagePreferences,
  asrTranslationPreferences,
  recognitionIdentity,
  audioIdentity,
} from "./language";
import { mediaCacheKey } from "./cacheStore";

const identity = {
  videoId: "kSQknoHMFtk",
  trackId: "default",
  mediaVersion: "140.123",
  durationMs: 4000,
  sourceLanguage: "auto",
};
afterEach(() => localStorage.removeItem("kiss-youtube-asr-languages"));
test("manual language wins while automatic uses only a supported audio-track language", () => {
  const whisper = { apiType: "LocalAI", modelRef: "whisper-small-timestamped" };
  expect(
    resolveAsrLanguage(
      { ...identity, sourceLanguage: "en-US" },
      "zh-hans",
      whisper
    )
  ).toBe("zh-hans");
  expect(
    resolveAsrLanguage(
      { ...identity, sourceLanguage: "zh-CN" },
      "auto",
      whisper
    )
  ).toBe("zh-cn");
  expect(
    resolveAsrLanguage({ ...identity, sourceLanguage: "xx" }, "auto", whisper)
  ).toBe("auto");
  expect(
    asrLanguageOptions(whisper).some((option) => option.value === "yue")
  ).toBe(false);
  const sensevoice = { apiType: "LocalAI", modelRef: "sensevoice-small" };
  expect(
    asrLanguageOptions(sensevoice).some((option) => option.value === "yue")
  ).toBe(true);
  expect(
    resolveAsrLanguage(
      { ...identity, sourceLanguage: "fr" },
      "auto",
      sensevoice
    )
  ).toBe("auto");
});
test("choices persist per video and track without modifying identity or service", () => {
  asrLanguagePreferences.set(identity, "zh-hans");
  expect(asrLanguagePreferences.get(identity)).toBe("zh-hans");
  expect(asrLanguagePreferences.get({ ...identity, trackId: "other" })).toBe(
    "auto"
  );
  expect(
    asrLanguagePreferences.get({ ...identity, videoId: "H7LpS6iKxmc" })
  ).toBe("auto");
});
test("recognition cache variants do not change physical audio identity", () => {
  const chinese = recognitionIdentity(identity, "zh-hans");
  const english = recognitionIdentity(identity, "en");
  expect(mediaCacheKey(chinese)).not.toBe(mediaCacheKey(english));
  expect(mediaCacheKey(audioIdentity(chinese))).toBe(mediaCacheKey(identity));
});

test("translation overrides are stored separately for each video and audio track", () => {
  const video = { ...identity, videoId: "H7LpS6iKxmc" };
  expect(asrTranslationPreferences.get(video)).toBeUndefined();
  asrTranslationPreferences.set(video, "ja");
  expect(asrTranslationPreferences.get(video)).toBe("ja");
  expect(
    asrTranslationPreferences.get({ ...video, trackId: "other" })
  ).toBeUndefined();
  expect(
    asrTranslationPreferences.get({ ...video, videoId: "aaaaaaaaaaa" })
  ).toBeUndefined();
  expect(asrLanguagePreferences.get(video)).toBe("auto");
  localStorage.removeItem("kiss-youtube-asr-translation-languages");
});
