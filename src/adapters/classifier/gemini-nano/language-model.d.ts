/**
 * Ambient typings for Chrome's built-in Prompt API (Gemini Nano).
 *
 * Declared here rather than pulled from a package because the project has no
 * type dependency for it, and only this adapter touches the API. Names follow
 * the current surface: the older `inputQuota` / `inputUsage` / `measureInputUsage`
 * spellings were renamed to the `context*` ones below.
 */

interface LanguageModelExpected {
  type: 'text' | 'image' | 'audio';
  /** BCP-47 tags, e.g. ["ja"]. Omitting it means "unknown", which may throw NotSupportedError. */
  languages?: string[];
}

interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options that also select which capability availability() reports on. */
interface LanguageModelCreateCoreOptions {
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
  /** Extensions may set these numerically; the web surface deprecated them. */
  temperature?: number;
  topK?: number;
}

interface LanguageModelCreateOptions extends LanguageModelCreateCoreOptions {
  /** A 'system' message must come first and appear at most once. Not evicted on overflow. */
  initialPrompts?: LanguageModelMessage[];
  signal?: AbortSignal;
  monitor?: (m: EventTarget) => void;
}

interface LanguageModelPromptOptions {
  signal?: AbortSignal;
  /** JSON Schema or RegExp. An unsupported schema keyword throws NotSupportedError. */
  responseConstraint?: object;
  omitResponseConstraintInput?: boolean;
}

interface LanguageModelSession {
  prompt(input: string | LanguageModelMessage[], options?: LanguageModelPromptOptions): Promise<string>;
  promptStreaming(input: string | LanguageModelMessage[], options?: LanguageModelPromptOptions): ReadableStream<string>;
  /** Copies the context so far; the original is unchanged. */
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  append(messages: LanguageModelMessage[]): Promise<void>;
  destroy(): void;
  readonly contextWindow: number;
  readonly contextUsage: number;
  measureContextUsage(input: string | LanguageModelMessage[]): Promise<number>;
}

interface LanguageModelParams {
  defaultTopK: number;
  maxTopK: number;
  defaultTemperature: number;
  maxTemperature: number;
}

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelFactory {
  availability(options?: LanguageModelCreateCoreOptions): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  params(): Promise<LanguageModelParams | null>;
}

/**
 * Absent entirely on Chrome below 138 and on unsupported platforms, so every
 * read must be guarded with `typeof LanguageModel === 'undefined'` — a bare
 * reference would throw ReferenceError rather than yield undefined.
 */
declare const LanguageModel: LanguageModelFactory;
