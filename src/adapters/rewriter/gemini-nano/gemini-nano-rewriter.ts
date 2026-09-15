import type { RewriterPort } from '../../../core/ports';
import { checkRewrite } from '../../../core/rewrite-guard';
import { withTimeout } from '../../../core/timeout';
import type { RewriteRequest } from '../../../core/types';
import { buildUserPrompt, parseRewrite, RESPONSE_SCHEMA, SYSTEM_PROMPT } from './prompt';

/**
 * Longer than the classifier's budget: this call generates a sentence rather
 * than a word, and the reader is watching a spinner they asked for. Still
 * bounded, because a hung session must not leave that spinner forever.
 */
const PROMPT_TIMEOUT_MS = 20_000;
/** Posts are short; this only guards against a pathological one overflowing the context. */
const MAX_INPUT_CHARS = 2_000;

/** Input and output are both Japanese prose, unlike the classifier's English label. */
export const SESSION_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['ja'] }],
  expectedOutputs: [{ type: 'text', languages: ['ja'] }],
} satisfies LanguageModelCreateCoreOptions;

function isNotSupported(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'NotSupportedError';
}

/**
 * Softens a post with Chrome's built-in Gemini Nano, through the Prompt API.
 *
 * Built like GeminiNanoClassifier (ADR 0005) and for the same reasons: a base
 * session holding only the system prompt, one throwaway clone per request so
 * posts cannot bleed into each other, and no session at all unless the model
 * is already downloaded.
 *
 * The difference is what a null means. A classifier that declines leaves the
 * cheaper stages' verdict standing; a rewriter that declines leaves the reader
 * with the cover they already had, which is why every failure here — including
 * an answer that fails checkRewrite — comes back as null rather than as text
 * nobody vetted.
 */
export class GeminiNanoRewriter implements RewriterPort {
  private basePromise: Promise<LanguageModelSession | null> | null = null;

  async rewrite(req: RewriteRequest): Promise<string | null> {
    const base = await this.getBaseSession();
    if (!base) return null;

    const original = req.text.slice(0, MAX_INPUT_CHARS);
    let turn: LanguageModelSession | null = null;
    try {
      turn = await base.clone();
      const raw = await withTimeout(this.ask(turn, original), PROMPT_TIMEOUT_MS, 'gemini nano rewrite');
      const candidate = parseRewrite(raw);
      if (!candidate) return null;
      return checkRewrite(original, candidate) === null ? candidate : null;
    } catch {
      // The service worker may have been torn down and the session with it.
      // Drop the handle so the next request rebuilds instead of failing forever.
      this.basePromise = null;
      return null;
    } finally {
      turn?.destroy();
    }
  }

  private async ask(turn: LanguageModelSession, text: string): Promise<string> {
    const prompt = buildUserPrompt(text);
    try {
      return await turn.prompt(prompt, { responseConstraint: RESPONSE_SCHEMA });
    } catch (err) {
      if (!isNotSupported(err)) throw err;
      // This runtime rejected the schema. Ask again unconstrained: the system
      // prompt already asks for the bare text, and parseRewrite handles prose.
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
  // multi-gigabyte download. That is the user's decision from the options page
  // (ADR 0005), and pressing a button in a feed is not that decision.
  if ((await LanguageModel.availability(SESSION_OPTIONS)) !== 'available') return null;

  // Unlike classification, rewriting is generation: sampling at temperature 0
  // produces stilted text. Take the runtime's defaults instead of pinning.
  return LanguageModel.create({
    ...SESSION_OPTIONS,
    initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
  });
}
