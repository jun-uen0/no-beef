import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from './config';

/**
 * Reads the reader's settings, falling back to the defaults.
 *
 * ⚠ Only call this where chrome.storage exists: the background service worker,
 * a content script, or an extension page. An offscreen document gets only
 * chrome.runtime, and this would silently hand back the defaults there — which
 * is exactly how the threshold sliders came to do nothing for stage 2 (ADR
 * 0008). That is why this lives in core with the warning attached, rather than
 * being copied into each adapter that needs it.
 */
export async function loadConfig(): Promise<NoBeefConfig> {
  try {
    const stored = await chrome.storage.sync.get(CONFIG_STORAGE_KEY);
    const value = stored[CONFIG_STORAGE_KEY] as Partial<NoBeefConfig> | undefined;
    return value ? { ...DEFAULT_CONFIG, ...value } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
