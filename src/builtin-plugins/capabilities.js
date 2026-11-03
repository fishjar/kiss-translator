import { getBuiltinServiceDefinition } from "./definitions";
import localModelTasks from "../config/localModelTasks.json";
import { OPT_TRANS_LOCALAI, OPT_TRANS_GEMINI } from "../config/apiConstants";
import { isGeminiInteractionsUrl } from "./thinkingCapabilities";

/** Shared model intersection for actual invocation and capability test choices. */
export function resolveBuiltinCapabilities(api) {
  const definition = getBuiltinServiceDefinition(api.apiType);
  if (!definition) return {};
  // Legacy user Hooks can receive nested request arguments. Never hand them
  // a reference to compiled descriptors shared with other service instances.
  let capabilities = JSON.parse(JSON.stringify(definition.capabilities));
  if (api.apiType === OPT_TRANS_GEMINI && isGeminiInteractionsUrl(api.url))
    delete capabilities.parseImage;
  if (api.apiType === OPT_TRANS_LOCALAI) {
    const task = localModelTasks.models[api.modelRef];
    const ocr = localModelTasks.ocrGroups.some(
      (group) => group.id === api.modelRef
    );
    // Match resolveModelTarget: OCR groups accept either supported device;
    // individual models must support the explicitly selected backend.
    const backends = ocr
      ? ["wasm", "webgpu"]
      : localModelTasks.backends?.[api.modelRef];
    if (api.device && backends && !backends.includes(api.device)) return {};
    const names = ocr
      ? ["recognizeText"]
      : {
          llm: [
            "translate",
            "chat",
            "summarize",
            "dictionary",
            "segmentSubtitle",
          ],
          asr: ["transcribe"],
          tts: ["synthesizeSpeech"],
          "ocr-vlm": ["parseImage"],
          "doc-layout": ["analyzeLayout"],
          decision: ["evaluate"],
        }[task] || [];
    capabilities = Object.fromEntries(
      Object.entries(capabilities)
        .filter(([name]) => names.includes(name))
        .map(([name, descriptor]) => [
          name,
          {
            ...descriptor,
            ...([
              "chat",
              "transcribe",
              "synthesizeSpeech",
              "recognizeText",
              "parseImage",
              "analyzeLayout",
              "evaluate",
            ].includes(name) && { outputModes: ["complete"] }),
            ...(name === "recognizeText" && { coordinates: true }),
            ...(name === "parseImage" && {
              coordinates: false,
              taskModes:
                api.modelRef === "unlimited-ocr-iq2m"
                  ? ["doc"]
                  : ["doc", "table", "formula"],
            }),
            ...(name === "transcribe" && {
              timestamps: localModelTasks.asrTimestamps?.[api.modelRef],
            }),
          },
        ])
    );
  }
  return capabilities;
}
