// JEV (Laya System-1 Typed Decision Engine) 核心类型定义

export type QuestionType = "choice" | "score" | "noul";

export const QTYPES: Record<QuestionType, number> = {
  choice: 0,
  score: 1,
  noul: 2,
};

export const QTYPE_NAMES: QuestionType[] = ["choice", "score", "noul"];

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Criterion = Json;
export type DecisionState = string | Json[] | { [key: string]: Json };

export interface ChoiceQuestion {
  type: "choice";
  instructions: Json;
  criteria: string[] | Record<string, Criterion>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: Json;
  criteria: Criterion[];
}

export interface NoulQuestion {
  type: "noul";
  instructions: Json;
  criteria?: { false?: Criterion; true?: Criterion } | null;
}

export type DecisionQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;
export type DecisionQuestions = Record<string, DecisionQuestion>;

/** 对齐上游 Python Agent._to_internal 输出格式 {"t", "ins", "crit"} */
export type InternalQuestion =
  | { t: "choice"; ins: string; crit: Record<string, Criterion> }
  | { t: "score"; ins: string; crit: Criterion[] }
  | {
      t: "noul";
      ins: string;
      crit: { false?: Criterion; true?: Criterion } | null;
    };

export interface AgentConfig {
  encoder: string;
  head_layers: number;
  max_len: number;
  head_max_len: number;
  max_prefixes?: number;
  act_costs?: Record<string, number>;
  temperature: number[];
  temperature_by_options: Record<string, number>;
  [extra: string]: Json | undefined;
}

export interface PreparedItem {
  ids: number[];
  markers: number[];
  qtype: number;
}

export interface Batch {
  rows: number;
  length: number;
  markers: number;
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  markerPos: BigInt64Array;
  markerMask: Uint8Array;
  qtype: BigInt64Array;
}

export interface RunnerOutput {
  logits: Float32Array;
  actLogits: Float32Array;
  rows: number;
  markers: number;
  actions: number;
}

export interface AnswerAction {
  act_probability: number;
}

export interface ChoiceAnswer {
  type: "choice";
  confidence: number;
  action: AnswerAction;
  choice: string;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  confidence: number;
  action: AnswerAction;
  score: number;
  legend: Record<string, Criterion>;
  probabilities: Record<string, number>;
}

export interface NoulAnswer {
  type: "noul";
  confidence: number;
  action: AnswerAction;
  noul: number;
}

export type DecisionAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface DecisionTiming {
  tokenizeMs?: number;
  onnxMs?: number;
  postprocessMs?: number;
  totalMs?: number;
}

export interface DecisionResult {
  model: "laya-rl-agent";
  answers: Record<string, DecisionAnswer>;
  usage: { input_tokens: number; output_tokens: 0 };
  timing?: DecisionTiming;
}

export interface DecisionCapabilities {
  webgpu: boolean;
  wasm: boolean;
  maxLen: number;
  headMaxLen: number;
}

export interface DecisionEngine {
  predict(
    state: DecisionState,
    questions: DecisionQuestions
  ): Promise<DecisionResult>;
}
