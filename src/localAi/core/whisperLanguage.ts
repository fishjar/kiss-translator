import { Tensor } from "@huggingface/transformers";
import { mapAsrLanguage, type AsrLanguageMap } from "./asrLanguages";

export interface LanguageDetection {
  language?: string;
  languageConfidence?: number;
  languagePending?: boolean;
}

export async function resolveWhisperLanguage(
  transcriber: unknown, audio: Float32Array, language: string, multilingual: boolean
): Promise<AsrLanguageMap & LanguageDetection> {
  const mapped = mapAsrLanguage(language);
  if (!multilingual) {
    if (mapped.whisper && !["en", "english"].includes(mapped.whisper))
      throw new Error("UNSUPPORTED_LANGUAGE: This model only supports English");
    return { whisper: null, language: "en" };
  }
  if (mapped.whisper) return mapped;
  const detected = await detectWhisperLanguage(transcriber, audio);
  return { ...mapped, ...detected, whisper: detected.language || null };
}

/** Whisper's first decoder position predicts language, before task/text tokens. */
export function selectWhisperLanguage(
  logits: ArrayLike<number>,
  languageTokens: Record<string, number>
): LanguageDetection {
  const scores = Object.entries(languageTokens)
    .filter(([token, id]) => /^<\|[a-z]{2,3}\|>$/.test(token) && Number.isFinite(logits[id]))
    .map(([token, id]) => ({ language: token.slice(2, -2), score: logits[id] }))
    .sort((a, b) => b.score - a.score);
  if (!scores.length) throw new Error("LANGUAGE_DETECTION_UNAVAILABLE: Missing Whisper language logits");
  const weights = scores.map(item => Math.exp(item.score - scores[0].score));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const confidence = weights[0] / total;
  if (confidence < 0.8 || confidence - (weights[1] || 0) / total < 0.2)
    return { languagePending: true };
  return { language: scores[0].language, languageConfidence: confidence };
}

export async function detectWhisperLanguage(
  transcriber: unknown,
  audio: Float32Array
): Promise<LanguageDetection> {
  const pipeline = transcriber as {
    model: any;
    processor: (audio: Float32Array) => Promise<Record<string, unknown>>;
  };
  const model = pipeline.model;
  const config = { ...model?.config, ...model?.generation_config };
  if (!config?.lang_to_id || !Number.isInteger(config.decoder_start_token_id))
    throw new Error("LANGUAGE_DETECTION_UNAVAILABLE: Whisper language configuration is missing");
  const inputs = await pipeline.processor(audio.subarray(0, 30 * 16000));
  const decoder = new Tensor("int64", BigInt64Array.of(BigInt(config.decoder_start_token_id)), [1, 1]);
  let output: any;
  try {
    output = await model({ ...inputs, decoder_input_ids: decoder });
    return selectWhisperLanguage(output.logits.data, config.lang_to_id);
  } finally {
    // A forward call returns KV tensors too; none belongs to the transcription call.
    const disposed = new Set<unknown>();
    const dispose = (value: any) => {
      if (!value || typeof value !== "object" || disposed.has(value)) return;
      disposed.add(value);
      if (typeof value.dispose === "function") value.dispose();
      else for (const child of Object.values(value)) dispose(child);
    };
    dispose(output);
    dispose(inputs);
    dispose(decoder);
  }
}
