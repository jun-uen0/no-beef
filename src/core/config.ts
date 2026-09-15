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
}

export const DEFAULT_CONFIG: NoBeefConfig = {
  enabled: true,
  mode: 'reveal-first',
  harmfulThreshold: 0.8,
  mildThreshold: 0.5,
};

/** chrome.storage.sync key holding the user config. */
export const CONFIG_STORAGE_KEY = 'nobeef:config';
