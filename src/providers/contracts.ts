/** Plugin API 1 task contracts. Provider definitions and user instances are separate. */
import type {
  DecisionState,
  ChoiceQuestion,
  ScoreQuestion,
  NoulQuestion,
  Criterion,
  DecisionAnswer,
} from "../localAi/core/jev/types";

export type ProviderDecisionQuestion =
  | (Omit<ChoiceQuestion, "criteria"> & { criteria: Record<string, Criterion> })
  | ScoreQuestion
  | NoulQuestion;
export type ProviderDecisionQuestions = Record<
  string,
  ProviderDecisionQuestion
>;

/** Remote services need not expose the local engine's calibration metadata. */
export type ProviderDecisionAnswer = DecisionAnswer extends infer Answer
  ? Answer extends DecisionAnswer
    ? Omit<Answer, "confidence" | "action"> &
        Partial<Pick<Answer, "confidence" | "action">>
    : never
  : never;
export interface ProviderDecisionResult {
  model: string;
  answers: Record<string, ProviderDecisionAnswer>;
  usage: { input_tokens?: number; output_tokens?: number; cost?: number };
}

/** Plugin API 1: explicit conversion of an asset response to browser-playable WAV. */
export interface ResponseAudio {
  encoding: "pcm_s16le";
  sampleRate: number;
  channels: number;
}
export type Capability =
  | "translate"
  | "chat"
  | "summarize"
  | "detectLanguage"
  | "dictionary"
  | "suggest"
  | "segmentSubtitle"
  | "transcribe"
  | "recognizeText"
  | "parseImage"
  | "analyzeLayout"
  | "evaluate"
  | "synthesizeSpeech"
  | "speak";

export interface AssetRef {
  assetId: string;
  mimeType: string;
  filename?: string;
}
export interface TextItem {
  id: string;
  text: string;
}
export interface TranslationInput {
  translationMode?: "single" | "batch";
  outputProtocol?: "text" | "json" | "line" | "xml";
  items: TextItem[];
  sourceLanguage?: string;
  targetLanguage: string;
  textFormat?: "text" | "html";
  systemPrompt?: string;
  userPrompt?: string;
  glossary?: Record<string, string>;
  context?: string;
  tone?: string;
  document?: {
    title?: string;
    description?: string;
    summary?: string;
    url?: string;
  };
}
export interface TranslationResult {
  items: TextItem[];
  sourceLanguage?: string;
}
export type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image" | "audio"; asset: AssetRef }
    >;
export interface ChatInput {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: MessageContent;
  }>;
}
export interface ChatResult {
  text: string;
  reasoning: string;
  usage?: Record<string, number>;
  finishReason?: string;
}
export interface OcrBlock {
  text: string;
  poly: number[][] | null;
  confidence?: number;
}
export interface OcrResult {
  text: string;
  format: "text" | "markdown";
  items?: OcrBlock[];
}
export interface AudioSegment {
  start: number;
  end: number;
  text: string;
  words?: Array<{ start: number; end: number; text: string }>;
}
export interface SubtitleItem extends TextItem {
  pauseMs?: number;
  start: number;
  end: number;
}
export interface CapabilityMap {
  translate: { input: TranslationInput; result: TranslationResult };
  chat: { input: ChatInput; result: ChatResult };
  summarize: {
    input: {
      text: string;
      language?: string;
      instructions?: string;
      userPrompt?: string;
      context?: string;
      document?: TranslationInput["document"];
    };
    result: { text: string };
  };
  detectLanguage: {
    input: { text: string; candidates?: string[] };
    result: { language: string; confidence?: number };
  };
  dictionary: {
    input: {
      text: string;
      sourceLanguage?: string;
      language?: string;
      context?: string;
      document?: TranslationInput["document"];
      instructions?: string;
      userPrompt?: string;
    };
    result: { text: string; format: "text" | "markdown" };
  };
  suggest: {
    input: { text: string; language?: string };
    result: { items: string[] };
  };
  segmentSubtitle: {
    input: {
      items: SubtitleItem[];
      tone?: string;
      glossary?: Record<string, string>;
      sourceLanguage?: string;
      targetLanguage?: string;
      instructions?: string;
      context?: string;
      document?: TranslationInput["document"];
    };
    result: {
      groups: Array<{ ids: string[]; text: string; translation?: string }>;
    };
  };
  transcribe: {
    input: { audio: AssetRef; language?: string; requireTimestamps?: boolean };
    result: {
      text: string;
      segments?: AudioSegment[];
      language?: string;
      languageConfidence?: number;
      languagePending?: boolean;
    };
  };
  recognizeText: {
    input: {
      image: AssetRef;
      mode?: "doc" | "table" | "formula";
      prompt?: string;
      imageSize?: { width: number; height: number };
    };
    result: OcrResult;
  };
  analyzeLayout: {
    input: { image: AssetRef; imageSize?: { width: number; height: number } };
    result: {
      regions: Array<{ type: string; poly: number[][]; order: number }>;
    };
  };
  parseImage: {
    input: CapabilityMap["recognizeText"]["input"];
    result: OcrResult;
  };
  evaluate: {
    input: { state: DecisionState; questions: ProviderDecisionQuestions };
    result: ProviderDecisionResult;
  };
  synthesizeSpeech: {
    input: { text: string; language?: string; speed?: number; voice?: string };
    result: { audio: AssetRef; mimeType: string };
  };
  speak: {
    input: { text: string; language?: string; speed?: number; voice?: string };
    result: { status: "ended" | "interrupted" };
  };
}
export interface CapabilityDescriptor {
  handler: string;
  batch?: { supported: boolean; maxItems?: number };
  outputModes?: Array<"complete" | "stream">;
  inputModalities?: Array<"text" | "image" | "audio">;
  coordinates?: boolean;
  taskModes?: Array<"doc" | "table" | "formula">;
  timestamps?: boolean;
}
export type ProviderEvent =
  | { type: "text.delta" | "reasoning.delta"; text: string }
  | { type: "item.delta" | "item.complete"; id: string; text: string }
  | { type: "progress"; progress?: number; message?: string };
export interface InvocationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Internal absolute deadline shared by nested calls and IPC. */
  deadlineAt?: number;
  streaming?: "auto" | "disabled" | "required";
}
export interface Invocation<TResult> {
  requestId: string;
  result: Promise<TResult>;
  events: AsyncIterable<ProviderEvent>;
  cancel(): void;
  /** Resolves when execution has actually settled, including after cancellation. */
  finished?: Promise<void>;
}
export interface ProviderSetting {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean" | "select";
  defaultValue?: string | number | boolean;
  isSecret?: boolean;
  required?: boolean;
  options?: Array<{ label: string; value: string | number }>;
  optionsSource?: string;
  min?: number;
  max?: number;
  visibleForCapabilities?: Capability[];
}
export interface ServiceDefinition {
  id: string;
  name: string;
  implementation: { kind: "native" | "script" | "declarative"; entry: string };
  capabilities: Partial<Record<Capability, CapabilityDescriptor>>;
  settings?: ProviderSetting[];
  modelField?: string;
  defaultPrompts?: Partial<
    Record<
      | "batch"
      | "nobatch"
      | "dictionary"
      | "subtitle"
      | "vlm"
      | "summary"
      | "detectLanguage"
      | "suggest"
      | "evaluate"
      | "recognizeText"
      | "analyzeLayout",
      Array<{
        id: string;
        name: string;
        nameI18n?: Record<string, string>;
        description?: string;
        descriptionI18n?: Record<string, string>;
        systemPrompt?: string;
        userPrompt?: string;
        protocol?: "text" | "json" | "line" | "xml";
      }>
    >
  >;
  models?: Array<{
    id: string;
    name?: string;
  }>;
}
export interface PluginCompatibility {
  apiVersion: 1;
  kind?: "provider";
  minHostVersion?: string;
}

export interface PluginManifest extends PluginCompatibility {
  id: string;
  name: string;
  version: string;
  apiVersion: 1;
  services: ServiceDefinition[];
  sharedSettings?: ProviderSetting[];
  icon?: string;
  resources?: Array<{ id: string; path: string; mimeType: string }>;
  permissions?: { network?: string[]; endpointFields?: string[] };
}
export interface DeclarativeCondition {
  $if: { $ref: string };
  then?: unknown;
  else?: unknown;
}
export interface DeclarativeReference {
  $ref: string;
  fallbackRef?: string;
  omitIfEmpty?: boolean;
  omitValues?: unknown[];
  transform?: "languages.toIso6391";
}
export interface ProtocolHandlerRule {
  protocol:
    | "openai-chat-completions"
    | "openai-audio-transcriptions"
    | "openai-audio-speech";
  task: Exclude<Capability, "speak">;
  request: {
    baseUrl: unknown;
    model: unknown;
    auth: { type: "bearer"; secret: { $secret: string } };
    parameters?: Record<string, unknown>;
  };
}
export type DeclarativeRules =
  | {
      format: "http";
      handlers: Record<
        string,
        { request: Record<string, unknown>; response: Record<string, unknown> }
      >;
    }
  | { format: "protocol"; handlers: Record<string, ProtocolHandlerRule> };

export interface ProviderSnapshot
  extends ServiceDefinition,
    PluginCompatibility {
  apiVersion: 1;
  source?: {
    pluginId: string;
    pluginName?: string;
    serviceId: string;
    version: string;
    external?: boolean;
  };
  code?: string;
  resources?: Record<string, { data: string; mimeType: string }>;
  rules?: DeclarativeRules;
}

export interface ProviderInstance {
  apiSlug: string;
  provider: ProviderSnapshot;
  enabledCapabilities: Capability[];
  pluginConfig?: Record<string, unknown>;
  asrMaxDurationSeconds?: number;
  asrTimestampSupport?: "auto" | "supported" | "unsupported";
}
export type PackageSource =
  | { kind: "github"; repoUrl: string; commitSha: string }
  | { kind: "zip"; url: string }
  | { kind: "file" }
  | { kind: "directory" };

export interface ProviderPackageIndex extends PluginCompatibility {
  pluginId: string;
  name: string;
  version: string;
  integrity: string;
  source: PackageSource;
  services: Array<
    Pick<
      ServiceDefinition,
      "id" | "name" | "capabilities" | "modelField" | "models"
    >
  >;
}
