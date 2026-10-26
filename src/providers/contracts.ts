/** SDK v1 task contracts. Provider definitions and user instances are separate. */
import type {
  DecisionState,
  DecisionQuestions,
  DecisionResult,
} from "../localAi/core/jev/types";
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
      sourceLanguage?: string;
      targetLanguage?: string;
      instructions?: string;
      context?: string;
    };
    result: {
      groups: Array<{ ids: string[]; text: string; translation?: string }>;
    };
  };
  transcribe: {
    input: { audio: AssetRef; language?: string; requireTimestamps?: boolean };
    result: { text: string; segments?: AudioSegment[]; language?: string; languageConfidence?: number; languagePending?: boolean };
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
    input: { state: DecisionState; questions: DecisionQuestions };
    result: DecisionResult;
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
      "batch" | "nobatch" | "dictionary" | "subtitle" | "vlm",
      { systemPrompt?: string; userPrompt?: string; protocol?: "text" | "json" | "line" | "xml" }
    >
  >;
  models?: Array<{
    id: string;
    name?: string;
  }>;
}
export interface PluginCompatibility {
  kind?: "provider";
  minHostVersion?: string;
}

export interface PluginManifest extends PluginCompatibility {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  apiVersion: "1";
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
export interface ProtocolHandlerRule {
  protocol: "openai-chat-completions";
  task: "chat" | "translate" | "parseImage";
  request: {
    baseUrl: unknown;
    model: unknown;
    auth: { type: "bearer"; secret: { $secret: string } };
    parameters?: Record<string, unknown>;
  };
}
export type DeclarativeRules =
  | {
      rulesVersion: 1;
      handlers: Record<
        string,
        { request: Record<string, unknown>; response: Record<string, unknown> }
      >;
    }
  | { rulesVersion: 2; handlers: Record<string, ProtocolHandlerRule> };

export interface ProviderSnapshot
  extends ServiceDefinition,
    PluginCompatibility {
  apiVersion: "1";
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
