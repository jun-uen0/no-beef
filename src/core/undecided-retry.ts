/**
 * When to ask again about a post nothing had an opinion on.
 *
 * A verdict whose source is 'none' means every stage was skipped or failed.
 * Almost always that is the ML model still loading: the offscreen classifier
 * gives up after ten seconds, so the posts a reader meets in the first moments
 * of a session get no answer at all. Treating that as "safe" is how a feed
 * silently goes unfiltered for exactly as long as the model takes to warm up.
 *
 * So it is worth asking again — but only a few times. In an environment where
 * no stage will ever answer (no built-in model, the classifier genuinely
 * unavailable), retrying forever would be a loop that never produces anything,
 * so the schedule is finite and short.
 */

/** Backoff between retries, in order. Its length is also the attempt limit. */
export const UNDECIDED_RETRY_DELAYS_MS = [3_000, 8_000, 20_000] as const;

/**
 * Milliseconds to wait before attempt number `attemptsSoFar` + 1, or null when
 * the post has had its chances and the undecided verdict should stand.
 */
export function retryDelayFor(attemptsSoFar: number): number | null {
  if (!Number.isInteger(attemptsSoFar) || attemptsSoFar < 0) return null;
  return UNDECIDED_RETRY_DELAYS_MS[attemptsSoFar] ?? null;
}
