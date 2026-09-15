export interface NoBeefConfig {
  enabled: boolean;
  /**
   * cover-first: cover every post on insertion, reveal once judged safe (fail-safe).
   * reveal-first: leave posts visible, cover only once judged harmful (fail-open).
   */
  mode: 'cover-first' | 'reveal-first';
  /** Classifier score at or above this is 'harmful' (post stays covered). */
  harmfulThreshold: number;
  /** Classifier score at or above this is 'mild' (shown, may be dimmed later). */
  mildThreshold: number;
  /**
   * Where stage 3 and rewriting come from.
   *
   * 'builtin' uses Chrome's on-device model. 'native' hands the work to an
   * agent the reader runs themselves, over native messaging (ADR 0009) — off
   * by default, so the nativeMessaging permission is never exercised unless
   * somebody has deliberately set one up.
   */
  bridge: 'builtin' | 'native';
}

export const DEFAULT_CONFIG: NoBeefConfig = {
  enabled: true,
  mode: 'reveal-first',
  harmfulThreshold: 0.8,
  mildThreshold: 0.5,
  bridge: 'builtin',
};

/** chrome.storage.sync key holding the user config. */
export const CONFIG_STORAGE_KEY = 'nobeef:config';

/**
 * Namespace prefixed onto every persisted verdict key.
 *
 * Bump it whenever a release can make the same text produce a different
 * verdict: a stage added or removed, a lexicon edit, a model swap, a change to
 * a stage's gate. Verdicts are cached by a hash of the text alone, so without a
 * bump a reader who already scrolled past a post keeps the old answer forever —
 * which is exactly what happened when stage 3 was added and the posts it was
 * built to catch kept their pre-LLM verdicts.
 *
 * Entries under older namespaces become unreachable rather than deleted.
 *
 * v3 exists because stage 2 was never running: the ONNX backend was blocked by
 * MV3's CSP, so every post it looked at was cached as "no stage had an
 * opinion". Those entries would otherwise outlive the fix and keep the reader
 * on the verdicts of a pipeline that was missing its middle stage.
 */
export const VERDICT_CACHE_NAMESPACE = 'v3-onnx-alive';
