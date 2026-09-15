import type { Verdict } from '../core/types';

/**
 * Message contract between extension contexts.
 * content script --MSG_ANALYZE--> background (runs the pipeline)
 * content script --MSG_REWRITE--> background (runs the rewriter, on request)
 * background --MSG_CLASSIFY--> offscreen (runs the ONNX classifier)
 */
export const MSG_ANALYZE = 'nobeef:analyze';
export const MSG_CLASSIFY = 'nobeef:classify';
export const MSG_REWRITE = 'nobeef:rewrite';

export interface AnalyzeMessage {
  type: typeof MSG_ANALYZE;
  text: string;
  lang?: string;
}

export interface RewriteMessage {
  type: typeof MSG_REWRITE;
  text: string;
  lang?: string;
}

export interface ClassifyMessage {
  type: typeof MSG_CLASSIFY;
  text: string;
  lang?: string;
}

/** Background answers content with a full verdict (never null). */
export type AnalyzeResponse = Verdict;

/**
 * Background answers content with the softened text, or null when there is
 * nothing to show (see RewriterPort). Wrapped in an object rather than sent
 * bare, because a bare null is indistinguishable from "no listener answered".
 */
export interface RewriteResponse {
  rewritten: string | null;
}

/**
 * Offscreen answers background with the model's toxicity score, or null for
 * "no opinion" (model unavailable, or a label set it cannot read).
 *
 * A score rather than a Verdict on purpose: turning a score into a severity
 * needs the reader's thresholds, and an offscreen document cannot read them —
 * only chrome.runtime exists there, so chrome.storage is undefined. The
 * background does that half.
 */
export interface ClassifyResult {
  score: number;
}

export type ClassifyResponse = ClassifyResult | null;

export type NoBeefMessage = AnalyzeMessage | ClassifyMessage | RewriteMessage;

export function isAnalyzeMessage(msg: unknown): msg is AnalyzeMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === MSG_ANALYZE;
}

export function isClassifyMessage(msg: unknown): msg is ClassifyMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === MSG_CLASSIFY;
}

export function isRewriteMessage(msg: unknown): msg is RewriteMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === MSG_REWRITE;
}
