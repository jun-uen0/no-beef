import type { Verdict } from '../core/types';

/**
 * Message contract between extension contexts.
 * content script --MSG_ANALYZE--> background (runs the pipeline)
 * background --MSG_CLASSIFY--> offscreen (runs the ONNX classifier)
 */
export const MSG_ANALYZE = 'nobeef:analyze';
export const MSG_CLASSIFY = 'nobeef:classify';

export interface AnalyzeMessage {
  type: typeof MSG_ANALYZE;
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

/** Offscreen answers background with a verdict or null ("no opinion" / model unavailable). */
export type ClassifyResponse = Verdict | null;

export type NoBeefMessage = AnalyzeMessage | ClassifyMessage;

export function isAnalyzeMessage(msg: unknown): msg is AnalyzeMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === MSG_ANALYZE;
}

export function isClassifyMessage(msg: unknown): msg is ClassifyMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === MSG_CLASSIFY;
}
