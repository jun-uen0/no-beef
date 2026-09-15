import type { AnalyzeRequest, DetectedPost, RewriteRequest, Verdict } from './types';

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

/**
 * Rewrites harsh text into a softened version.
 *
 * Returning null means "no rewrite to show" and covers every failure the
 * reader cannot act on: the model is unavailable, the answer was unusable, the
 * call timed out. Implementations must not throw for those, matching
 * ClassifierPort — but here the caller's fallback is to keep the cover as it
 * was rather than to keep a verdict.
 */
export interface RewriterPort {
  rewrite(req: RewriteRequest): Promise<string | null>;
}

/** Verdict cache keyed by a hash of the normalized text. */
export interface CachePort {
  get(key: string): Promise<Verdict | undefined>;
  set(key: string, verdict: Verdict): Promise<void>;
}

/**
 * What a cover can hand back to the caller.
 *
 * onRewrite is optional and its absence is meaningful: a cover offers the
 * rewrite control only when one is supplied, which is how the "judging…" cover
 * in cover-first mode avoids offering to soften a post nothing has read yet.
 * It resolves to null when no rewrite can be shown (see RewriterPort).
 */
export interface CoverHandlers {
  /**
   * Fires when the user explicitly reveals the post from the cover UI, so the
   * caller can remember the choice across DOM node recycling.
   */
  onReveal?(): void;
  onRewrite?(): Promise<string | null>;
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
   * `handlers` wires the cover's controls back to the caller.
   */
  cover(node: Element, verdict: Verdict, handlers?: CoverHandlers): void;
  /** Remove the cover from a post node. */
  reveal(node: Element): void;
}
