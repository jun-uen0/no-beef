import type { AnalyzeRequest, DetectedPost, Verdict } from './types';

/**
 * A single analysis stage. Implementations: lexicon (stage 1), on-device
 * classifier (stage 2), LLM (stage 3, later milestone), or a remote proxy
 * that forwards to another context via message passing.
 *
 * Returning null means "no opinion" and lets the pipeline continue.
 * Implementations must not throw for ordinary failures; the pipeline treats
 * a thrown error the same as null (graceful degradation).
 */
export interface ClassifierPort {
  classify(req: AnalyzeRequest): Promise<Verdict | null>;
}

/** Rewrites harsh text into a softened version (milestone M3). */
export interface RewriterPort {
  rewrite(text: string): Promise<string>;
}

/** Verdict cache keyed by a hash of the normalized text. */
export interface CachePort {
  get(key: string): Promise<Verdict | undefined>;
  set(key: string, verdict: Verdict): Promise<void>;
}

/**
 * Driver-side port implemented per site (X, etc.) in the content script.
 * It owns DOM specifics: detecting posts, covering and revealing them.
 */
export interface SiteAdapter {
  /** Start observing the page. Returns a function that stops observing. */
  observe(onPost: (post: DetectedPost, node: Element) => void): () => void;
  /**
   * Apply (or re-apply, idempotently) a cover to a post node.
   * onReveal fires when the user explicitly reveals the post from the cover
   * UI, so the caller can remember the choice across DOM node recycling.
   */
  cover(node: Element, verdict: Verdict, onReveal?: () => void): void;
  /** Remove the cover from a post node. */
  reveal(node: Element): void;
}
