import type {
  AgentConfig,
  DecisionAnswer,
  DecisionResult,
  InternalQuestion,
  PreparedItem,
} from "./types";
import { QTYPE_NAMES } from "./types";

/** 找出第一个最大值的下标（平局保留最靠前索引，与 Python argmax 一致） */
export function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[best]!) best = i;
  }
  return best;
}

export function softmax(values: ArrayLike<number>): number[] {
  const z = Array.from(values);
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  const e = z.map((v) => Math.exp(v - max));
  let sum = 0;
  for (const v of e) sum += v;
  return e.map((v) => v / sum);
}

/** 移植 Python `temp_bucket` */
export function tempBucket(qtype: number, k: number): string {
  const size = k <= 2 ? "2" : k <= 5 ? "3-5" : k <= 10 ? "6-10" : "11+";
  return `${QTYPE_NAMES[qtype]}:${size}`;
}

/** 移植 Python `confidence_from_probs`: 1 - H(p) / log(k)，裁剪到 [0, 1] */
export function entropyConfidence(p: number[], k = p.length): number {
  if (k < 2) return 1;
  let entropy = 0;
  for (const v of p.slice(0, k)) {
    const c = Math.min(Math.max(v, 1e-12), 1);
    entropy -= v * Math.log(c);
  }
  return Math.min(Math.max(1 - entropy / Math.log(k), 0), 1);
}

export const confidenceFromProbs = entropyConfidence;

export const round4 = (x: number): number => Number(x.toFixed(4));

export interface FormatInput {
  config: AgentConfig;
  questionIds: string[];
  internal: InternalQuestion[];
  items: PreparedItem[];
  logits: Float32Array;
  actLogits: Float32Array;
  markers: number;
  actions: number;
}

/** 移植 Python `Agent.system_one` 后半部分：温度校准 + softmax + 归一化熵置信度 + 答案构造 */
export function formatAnswers(input: FormatInput): DecisionResult {
  const {
    config,
    questionIds,
    internal,
    items,
    logits,
    actLogits,
    markers,
    actions,
  } = input;

  if (logits.length !== items.length * markers) {
    throw new RangeError("formatAnswers: logits length mismatch");
  }
  if (actLogits.length !== items.length * actions) {
    throw new RangeError("formatAnswers: actLogits length mismatch");
  }
  if (questionIds.length !== items.length) {
    throw new RangeError("formatAnswers: questionIds length mismatch");
  }
  if (internal.length !== items.length) {
    throw new RangeError("formatAnswers: internal length mismatch");
  }
  for (let i = 0; i < logits.length; i++) {
    if (!Number.isFinite(logits[i])) {
      throw new RangeError("Non-finite model outputs");
    }
  }
  for (let i = 0; i < actLogits.length; i++) {
    if (!Number.isFinite(actLogits[i])) {
      throw new RangeError("Non-finite model outputs");
    }
  }
  for (const item of items) {
    if (item.markers.length > markers) {
      throw new RangeError(
        "formatAnswers: item markers exceed the logits width"
      );
    }
  }

  const answers: Record<string, DecisionAnswer> = {};
  items.forEach((item, row) => {
    const qid = questionIds[row]!;
    const q = internal[row]!;
    const k = item.markers.length;
    const act = softmax(
      actLogits.subarray(row * actions, (row + 1) * actions)
    );
    const scale =
      config.temperature_by_options?.[tempBucket(item.qtype, k)] ??
      config.temperature?.[item.qtype] ??
      1.0;
    const z = Array.from(
      logits.subarray(row * markers, row * markers + k),
      (v) => v / Math.max(1e-3, scale)
    );
    const p = softmax(z);
    const base = {
      confidence: round4(entropyConfidence(p, k)),
      action: { act_probability: round4(act[0]!) },
    };
    if (q.t === "choice") {
      const labels = Object.keys(q.crit);
      const best = argmax(p);
      answers[qid] = {
        type: "choice",
        ...base,
        choice: labels[best]!,
        probabilities: Object.fromEntries(
          labels.map((label, i) => [label, round4(p[i]!)])
        ),
      };
    } else if (q.t === "score") {
      answers[qid] = {
        type: "score",
        ...base,
        score: round4(p.reduce((sum, v, i) => sum + i * v, 0)),
        legend: Object.fromEntries(
          q.crit.map((value, i) => [String(i), value])
        ),
        probabilities: Object.fromEntries(
          p.map((v, i) => [String(i), round4(v)])
        ),
      };
    } else {
      const pTrue = p[1]!;
      answers[qid] = {
        type: "noul",
        ...base,
        confidence: round4(Math.max(pTrue, 1 - pTrue)),
        noul: round4(pTrue),
      };
    }
  });

  return {
    model: "laya-rl-agent",
    answers,
    usage: {
      input_tokens: items.reduce((n, item) => n + item.ids.length, 0),
      output_tokens: 0,
    },
  };
}
