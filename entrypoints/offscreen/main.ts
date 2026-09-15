import { pipeline, type TextClassificationPipelineType, type TextClassificationSingle } from '@huggingface/transformers';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../../src/core/config';
import type { Verdict } from '../../src/core/types';
import { isClassifyMessage, type ClassifyResponse } from '../../src/messaging/protocol';

const MODEL_ID = 'onnx-community/distilbert-multilingual-toxicity-classifier-ONNX';

let classifierPromise: Promise<TextClassificationPipelineType | null> | null = null;
let warnedOnModelFailure = false;

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
  const toxic = output.find((r) => r.label.toLowerCase().includes('toxic'));
  if (!toxic) return { severity: 'safe', score: 0, source: 'classifier' };

  const config = await loadConfig();
  return { severity: severityFor(toxic.score, config), score: toxic.score, source: 'classifier' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isClassifyMessage(message)) return;

  classify(message.text)
    .then((verdict) => sendResponse(verdict satisfies ClassifyResponse))
    .catch(() => sendResponse(null));

  return true; // keep the message channel open for the async sendResponse above
});
