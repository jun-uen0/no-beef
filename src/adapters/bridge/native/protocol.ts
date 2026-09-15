import { SEVERITY_LABELS, type SeverityLabel } from '../../classifier/gemini-nano/prompt';

/**
 * The wire contract with a bring-your-own-agent host, and the checks applied to
 * whatever it sends back.
 *
 * The host is a program the reader wrote or installed. It runs on their machine
 * and under their account, which makes it trustworthy in the ways that matter
 * for privacy — and says nothing at all about whether its JSON is well formed.
 * So everything crossing this boundary is validated by shape and range before
 * the rest of the extension sees it, and anything that fails becomes "no
 * opinion" rather than a guess. Kept free of browser APIs so it can be tested.
 */

export const BRIDGE_HOST_NAME = 'dev.junueno.nobeef';

/** What the extension asks the host to do. */
export type BridgeOperation = 'classify' | 'rewrite';

export interface BridgeRequest {
  op: BridgeOperation;
  text: string;
  lang?: string;
}

/** Longest rewrite worth accepting; a post is short and this is not a document. */
const MAX_REWRITE_CHARS = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLabel(value: unknown): value is SeverityLabel {
  return typeof value === 'string' && (SEVERITY_LABELS as readonly string[]).includes(value);
}

export interface BridgeVerdict {
  severity: SeverityLabel;
  score: number;
}

/**
 * Reads a classification out of a host response.
 *
 * Both fields have to be there and both have to be sane: a score outside 0..1
 * would go on to be compared against the reader's thresholds, where a 7 or a
 * NaN silently wins every comparison.
 */
export function parseBridgeVerdict(response: unknown): BridgeVerdict | null {
  if (!isRecord(response)) return null;
  const { severity, score } = response;
  if (!isLabel(severity)) return null;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null;
  return { severity, score };
}

/**
 * Reads a rewrite out of a host response. Only the shape is judged here —
 * whether the text is an acceptable rewrite of the original is checkRewrite's
 * job (src/core/rewrite-guard.ts), and the bridge deliberately uses the very
 * same one the on-device model's output goes through.
 */
export function parseBridgeRewrite(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const { rewritten } = response;
  if (typeof rewritten !== 'string') return null;
  const trimmed = rewritten.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REWRITE_CHARS) return null;
  return trimmed;
}
