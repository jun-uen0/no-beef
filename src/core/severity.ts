import type { NoBeefConfig } from './config';
import type { Severity } from './types';

/**
 * Turns a "how toxic is this" score into the severity the reader's settings
 * ask for. Pure, and deliberately in core: this is policy, not inference, and
 * it has to live where the user's config can actually be read.
 *
 * That last part is not a style preference. The ONNX stage used to apply this
 * itself, inside the offscreen document — where only chrome.runtime exists and
 * chrome.storage is undefined. Reading the config threw on every call, the
 * catch handed back the defaults, and the threshold sliders in the options page
 * silently did nothing for the stage that judges almost every post.
 */
export function severityFor(score: number, config: NoBeefConfig): Severity {
  if (score >= config.harmfulThreshold) return 'harmful';
  if (score >= config.mildThreshold) return 'mild';
  return 'safe';
}
