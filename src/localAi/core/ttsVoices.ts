import { getCatalogModel, KOKORO_VOICES, getPiperVoiceByDir } from "./catalog";
import { AUDIO8_PRESET_VOICES } from "./audio8PresetVoices";

export function localTtsVoiceOptions(modelRef: string) {
  const model = getCatalogModel(modelRef);
  if (model?.task !== "tts") return [];
  if (model.id === "kokoro-82m")
    return KOKORO_VOICES.map((voice) => ({
      value: voice.id,
      label: `${voice.name} (${{ z: "zh-CN", a: "en-US", b: "en-GB" }[voice.lang]})`,
    }));
  if (model.id.includes("audio8"))
    return [
      { value: "default", label: "" },
      ...AUDIO8_PRESET_VOICES.map((voice) => ({
        value: voice.id,
        label: voice.name,
      })),
    ];
  const voice = getPiperVoiceByDir(model.dir);
  return voice ? [{ value: voice.id, label: voice.id }] : [];
}

export function defaultLocalTtsVoice(modelRef: string) {
  return localTtsVoiceOptions(modelRef)[0]?.value || "";
}
