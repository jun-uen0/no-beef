import { env, pipeline, type TextClassificationPipelineType, type TextClassificationSingle } from '@huggingface/transformers';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../../src/core/config';
import type { Verdict } from '../../src/core/types';
import { isClassifyMessage, type ClassifyResponse } from '../../src/messaging/protocol';
import { toxicScore } from '../../src/adapters/classifier/onnx/labels';

const MODEL_ID = 'onnx-community/distilbert-multilingual-toxicity-classifier-ONNX';

/**
 * Serve the ONNX Runtime backend from the extension instead of the CDN.
 *
 * Left to itself, transformers.js dynamically imports ort-wasm-*.jsep.mjs from
 * jsDelivr. An MV3 extension page may only load scripts from itself, so that
 * import is blocked by CSP and ORT fails with "no available backend found" —
 * which getClassifier() turns into a cached null, so every later classify()
 * returns in a few milliseconds with no opinion. Stage 2 then looks exactly
 * like a stage that had nothing to say, and the fixture check cannot tell the
 * difference because every post it asserts on is caught by the lexicon.
 *
 * scripts/copy-ort-runtime.mjs puts the files under public/wasm/ at build time.
 */
const wasmBackend = env.backends.onnx.wasm;
if (wasmBackend) {
  wasmBackend.wasmPaths = chrome.runtime.getURL('wasm/');
  // The threaded build needs SharedArrayBuffer, which needs cross-origin
  // isolation an extension page does not have. Ask for one thread up front
  // rather than letting it fail over.
  wasmBackend.numThreads = 1;
}

let classifierPromise: Promise<TextClassificationPipelineType | null> | null = null;
let warnedOnModelFailure = false;
let warnedOnLabels = false;

/** Lazily loads the classifier once, sharing the in-flight promise across calls. */
function getClassifier(): Promise<TextClassificationPipelineType | null> {
  if (!classifierPromise) {
    classifierPromise = pipeline('text-classification', MODEL_ID, { dtype: 'q8' }).catch(
      (err: unknown) => {
        if (!warnedOnModelFailure) {
          warnedOnModelFailure = true;
          console.warn('[no-beef] offscreen: failed to load toxicity classifier model', err);
        }
        return null;
      },
    );
  }
  return classifierPromise;
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

function severityFor(score: number, config: NoBeefConfig): Verdict['severity'] {
  if (score >= config.harmfulThreshold) return 'harmful';
  if (score >= config.mildThreshold) return 'mild';
  return 'safe';
}

async function classify(text: string): Promise<Verdict | null> {
  const classifier = await getClassifier();
  if (!classifier) return null;

  // top_k: null returns the full label distribution instead of just the top
  // prediction, since we need the score for the specific "toxic" label,
  // which may not be the highest-scoring class for mildly hostile text.
  // The upstream type only declares `top_k?: number`, but the runtime (and
  // its own docs) accept `null` to mean "all labels" — cast around that gap.
  const options = { top_k: null } as unknown as { top_k?: number };
  const output = (await classifier(text, options)) as TextClassificationSingle[];
  const score = toxicScore(output);
  // No toxic class in the distribution means the model is not the one this
  // adapter knows how to read. That is "no opinion", not "safe" — see
  // src/adapters/classifier/onnx/labels.ts.
  if (score === null) {
    if (!warnedOnLabels) {
      warnedOnLabels = true;
      console.warn('[no-beef] offscreen: model returned no toxic label; stage 2 has no opinion');
    }
    return null;
  }

  const config = await loadConfig();
  return { severity: severityFor(score, config), score, source: 'classifier' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isClassifyMessage(message)) return;

  classify(message.text)
    .then((verdict) => sendResponse(verdict satisfies ClassifyResponse))
    .catch(() => sendResponse(null));

  return true; // keep the message channel open for the async sendResponse above
});
