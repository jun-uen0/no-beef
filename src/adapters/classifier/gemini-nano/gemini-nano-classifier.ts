import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../../../core/config';
import type { ClassifierPort } from '../../../core/ports';
import { withTimeout } from '../../../core/timeout';
import type { AnalyzeRequest, Verdict } from '../../../core/types';
import { buildUserPrompt, parseLabel, RESPONSE_SCHEMA, SYSTEM_PROMPT, toVerdict } from './prompt';

/** A stuck inference must not hold up the posts queued behind it. */
const PROMPT_TIMEOUT_MS = 15_000;
/** Posts are short; this only guards against a pathological one overflowing the context. */
const MAX_INPUT_CHARS = 2_000;

/** Both prompts are Japanese; the answer is a machine-readable label. */
export const SESSION_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['ja'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
} satisfies LanguageModelCreateCoreOptions;

function isNotSupported(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'NotSupportedError';
}

/**
 * Starts the model download and resolves once it finishes. Separate from the
 * classifier on purpose: the download is several gigabytes, so it happens only
 * when the user asks for it from the options page, never while reading a feed.
 *
 * `onProgress` receives a 0..1 fraction.
 *
 * Throws GEMINI_NANO_DOWNLOAD_STALLED if nothing arrives for a while. A real
 * download of this size legitimately takes many minutes, so the guard is not a
 * total time limit — it watches for *no progress at all*, which is what happens
 * when the browser accepts the request but never fetches anything.
 */
export const GEMINI_NANO_DOWNLOAD_STALLED = 'gemini-nano: download made no progress';

/** How long to wait for the next byte of progress before giving up. */
const DOWNLOAD_STALL_MS = 120_000;

export async function downloadGeminiNano(onProgress: (loaded: number) => void): Promise<LanguageModelAvailability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';

  const controller = new AbortController();
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const restartStallTimer = (): void => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(new Error(GEMINI_NANO_DOWNLOAD_STALLED)), DOWNLOAD_STALL_MS);
  };

  restartStallTimer();
  try {
    const session = await LanguageModel.create({
      ...SESSION_OPTIONS,
      signal: controller.signal,
      monitor(m) {
        m.addEventListener('downloadprogress', (event) => {
          restartStallTimer();
          onProgress((event as Event & { loaded?: number }).loaded ?? 0);
        });
      },
    });
    // The classifier builds its own session with the system prompt attached;
    // this one existed only to pull the weights down.
    session.destroy();
  } finally {
    clearTimeout(stallTimer);
  }

  return geminiNanoAvailability();
}

/** Reports what the built-in model can do here, for the options page to show. */
export async function geminiNanoAvailability(): Promise<LanguageModelAvailability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability(SESSION_OPTIONS);
  } catch {
    return 'unavailable';
  }
}

/**
 * Stage 3: Chrome's built-in Gemini Nano, reached through the Prompt API.
 *
 * Runs in the background service worker, which the Prompt API supports
 * directly — unlike the ONNX stage, this one needs no offscreen document.
 *
 * Every failure path returns null ("no opinion") so the pipeline keeps the
 * verdict the cheaper stages already produced.
 */
export class GeminiNanoClassifier implements ClassifierPort {
  /**
   * Holds the system prompt and nothing else. Each classification runs on a
   * clone, so one post can never end up in the context of the next — and the
   * base never grows toward the context window.
   */
  private basePromise: Promise<LanguageModelSession | null> | null = null;

  async classify(req: AnalyzeRequest): Promise<Verdict | null> {
    const base = await this.getBaseSession();
    if (!base) return null;

    let turn: LanguageModelSession | null = null;
    try {
      turn = await base.clone();
      const raw = await withTimeout(this.ask(turn, req.text), PROMPT_TIMEOUT_MS, 'gemini nano prompt');
      const label = parseLabel(raw);
      if (!label) return null;
      return toVerdict(label, await loadConfig());
    } catch {
      // The service worker may have been torn down and the session with it.
      // Drop the handle so the next post rebuilds instead of failing forever.
      this.basePromise = null;
      return null;
    } finally {
      turn?.destroy();
    }
  }

  private async ask(turn: LanguageModelSession, text: string): Promise<string> {
    const prompt = buildUserPrompt(text.slice(0, MAX_INPUT_CHARS));
    try {
      return await turn.prompt(prompt, { responseConstraint: RESPONSE_SCHEMA });
    } catch (err) {
      if (!isNotSupported(err)) throw err;
      // This runtime rejected the schema. Ask again unconstrained: the prompt
      // already asks for the label alone, and parseLabel tolerates prose.
      return await turn.prompt(prompt);
    }
  }

  private getBaseSession(): Promise<LanguageModelSession | null> {
    if (!this.basePromise) {
      this.basePromise = createBaseSession().catch(() => {
        this.basePromise = null;
        return null;
      });
    }
    return this.basePromise;
  }
}

async function createBaseSession(): Promise<LanguageModelSession | null> {
  if (typeof LanguageModel === 'undefined') return null;

  // Anything other than 'available' means creating a session would kick off a
  // multi-gigabyte model download. That has to be the user's decision from the
  // options page, not a side effect of scrolling a feed.
  if ((await LanguageModel.availability(SESSION_OPTIONS)) !== 'available') return null;

  // Classification wants the same answer every time, so sample as narrowly as
  // the runtime allows. Extensions may set these numerically; if params() is
  // missing we take the defaults rather than guess at valid ranges.
  const tuning = await LanguageModel.params().catch(() => null);

  return LanguageModel.create({
    ...SESSION_OPTIONS,
    initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
    ...(tuning ? { temperature: 0, topK: 1 } : {}),
  });
}

async function loadConfig(): Promise<NoBeefConfig> {
  try {
    const stored = await chrome.storage.sync.get(CONFIG_STORAGE_KEY);
    const value = stored[CONFIG_STORAGE_KEY] as Partial<NoBeefConfig> | undefined;
    return value ? { ...DEFAULT_CONFIG, ...value } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
