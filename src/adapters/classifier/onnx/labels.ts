/**
 * Reading a toxicity score out of a label distribution.
 *
 * Split out of the offscreen document and kept free of any browser API so the
 * label handling can be unit tested — which is the whole point, because this is
 * where it went wrong. The model labels its two classes "not-toxic" and
 * "toxic", and a substring match for "toxic" matches BOTH. Since the
 * distribution arrives sorted by score, the first match was whichever class the
 * model was confident about, so a calm post came back as 0.99 "toxic" and every
 * benign post would have been covered.
 */

export interface LabelScore {
  label: string;
  score: number;
}

/** Folds case and separators so "not_toxic", "Not-Toxic" and "not toxic" all agree. */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[\s_-]+/g, '');
}

const TOXIC = 'toxic';

/**
 * Returns the model's confidence that the text is toxic, or null when this
 * distribution has no toxic class at all.
 *
 * Null means "no opinion", not "safe". A model whose labels we cannot read is
 * not evidence that a post is fine, and saying otherwise would let a silent
 * model swap look like a timeline full of harmless posts.
 */
export function toxicScore(output: readonly LabelScore[]): number | null {
  const match = output.find((entry) => normalizeLabel(entry.label) === TOXIC);
  return match ? match.score : null;
}
