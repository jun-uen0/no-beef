import { normalizeText } from './normalize';

/**
 * Mechanical checks on a rewrite before it is shown to anyone.
 *
 * These catch accidents of shape, not shifts in meaning: whether the model
 * changed what the post *says* is not decidable here, and ADR 0007 answers
 * that with disclosure (the text is labelled as a rewrite and the original
 * stays one click away) rather than with a test. What is decidable is whether
 * the answer is empty, is the original verbatim, ran away in length, or points
 * at a link or account the original never mentioned — and each of those
 * produces something actively misleading, so they are rejected here.
 */

export type RewriteRejection =
  /** Nothing, or whitespace only. */
  | 'empty'
  /** The original text back again; presenting it as a rewrite would be a lie. */
  | 'unchanged'
  /** Far longer or shorter than the original: truncated, or the model started talking. */
  | 'length'
  /** Names a URL, @account or #tag the original does not — the checkable form of invention. */
  | 'invented-reference';

/** Below this share of the original's length the answer is treated as truncated. */
const MIN_LENGTH_RATIO = 0.3;
/** Above this multiple the answer is treated as the model having gone off. */
const MAX_LENGTH_RATIO = 2.0;
/**
 * Softening a very short post legitimately makes it longer ("死ね" -> a whole
 * polite sentence), so the multiple alone would reject good answers. The
 * allowance is whichever of the two bounds is more generous.
 */
const MAX_EXTRA_CHARS = 40;

/**
 * Links, @mentions and #tags — the references a reader might act on, and the
 * one kind of fabrication that can be checked without understanding the text.
 */
const REFERENCE_PATTERN = /https?:\/\/\S+|[@＠][A-Za-z0-9_]{1,30}|[#＃][^\s#＃]{1,60}/g;

function references(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(REFERENCE_PATTERN), (m) => normalizeText(m[0])));
}

function length(text: string): number {
  // Count code points, so an original full of emoji is not measured as twice
  // its apparent length.
  return Array.from(text).length;
}

/**
 * Returns the reason to refuse `candidate` as a rewrite of `original`,
 * or null when it is acceptable to show.
 */
export function checkRewrite(original: string, candidate: string): RewriteRejection | null {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) return 'empty';
  if (normalizeText(trimmed) === normalizeText(original)) return 'unchanged';

  const originalLength = length(original.trim());
  const candidateLength = length(trimmed);
  const maxLength = Math.max(originalLength * MAX_LENGTH_RATIO, originalLength + MAX_EXTRA_CHARS);
  if (candidateLength > maxLength) return 'length';
  if (candidateLength < originalLength * MIN_LENGTH_RATIO) return 'length';

  const allowed = references(original);
  for (const reference of references(trimmed)) {
    if (!allowed.has(reference)) return 'invented-reference';
  }

  return null;
}
