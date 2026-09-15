/**
 * Normalization shared by lexicon matching and cache keys.
 * NFKC folds full/half width variants (ｼﾈ -> シネ, ＡＢＣ -> abc after lowering).
 */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** SHA-256 hex digest of the normalized text; used as the cache key. */
export async function cacheKey(text: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeText(text));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
