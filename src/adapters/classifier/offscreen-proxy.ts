import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../../core/config';
import type { ClassifierPort } from '../../core/ports';
import { severityFor } from '../../core/severity';
import type { AnalyzeRequest, Verdict } from '../../core/types';
import { MSG_CLASSIFY, type ClassifyMessage, type ClassifyResponse } from '../../messaging/protocol';
import { withTimeout } from '../../core/timeout';

/** Built by WXT from entrypoints/offscreen/index.html. */
const OFFSCREEN_DOCUMENT_URL = 'offscreen.html';
/** If the offscreen document doesn't answer within this window, degrade to "no opinion". */
const CLASSIFY_TIMEOUT_MS = 10_000;

/**
 * Background-side ClassifierPort that proxies to the offscreen document,
 * since MV3 service workers can't run onnxruntime-web's WASM workers
 * directly. Returning null (rather than throwing) on any failure lets
 * AnalysisPipeline degrade gracefully to the remaining stages.
 */
export class OffscreenClassifierProxy implements ClassifierPort {
  /** Shared across concurrent calls so we never race two createDocument() calls. */
  private ensureDocumentPromise: Promise<void> | null = null;

  async classify(req: AnalyzeRequest): Promise<Verdict | null> {
    try {
      await this.ensureOffscreenDocument();
    } catch {
      return null;
    }

    const message: ClassifyMessage = { type: MSG_CLASSIFY, text: req.text, lang: req.lang };

    try {
      const response = await withTimeout(chrome.runtime.sendMessage(message), CLASSIFY_TIMEOUT_MS, 'offscreen classify');
      const result = (response as ClassifyResponse) ?? null;
      if (!result) return null;
      // Severity is decided here rather than in the offscreen document: this
      // runs in the background, which is the only side of the pair that can
      // read the user's thresholds at all.
      const config = await loadConfig();
      return { severity: severityFor(result.score, config), score: result.score, source: 'classifier' };
    } catch {
      return null;
    }
  }

  private ensureOffscreenDocument(): Promise<void> {
    if (!this.ensureDocumentPromise) {
      this.ensureDocumentPromise = this.createOffscreenDocumentIfNeeded().catch((err: unknown) => {
        // Let a later call retry instead of being permanently stuck on a failed attempt.
        this.ensureDocumentPromise = null;
        throw err;
      });
    }
    return this.ensureDocumentPromise;
  }

  private async createOffscreenDocumentIfNeeded(): Promise<void> {
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existing.length > 0) return;

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_URL,
      reasons: ['WORKERS'],
      justification: 'Run ONNX toxicity classification with WASM workers',
    });
  }
}

async function loadConfig(): Promise<NoBeefConfig> {
  try {
    const stored = await chrome.storage.sync.get(CONFIG_STORAGE_KEY);
    const value = stored[CONFIG_STORAGE_KEY] as Partial<NoBeefConfig> | undefined;
    return value ? { ...DEFAULT_CONFIG, ...value } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
