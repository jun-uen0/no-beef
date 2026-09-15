import { describe, expect, it } from 'vitest';
import { toxicScore } from '../../src/adapters/classifier/onnx/labels';

/** The real label set of onnx-community/distilbert-multilingual-toxicity-classifier-ONNX. */
const LABELS = { toxic: 'toxic', notToxic: 'not-toxic' };

describe('toxicScore', () => {
  it('reads the toxic class, not whichever class the model was sure about', () => {
    // A calm post: the model is 99% sure it is NOT toxic. The distribution
    // arrives sorted by score, so the wrong reading here returns 0.99.
    const calm = [
      { label: LABELS.notToxic, score: 0.9913 },
      { label: LABELS.toxic, score: 0.0087 },
    ];
    expect(toxicScore(calm)).toBeCloseTo(0.0087);
  });

  it('reads the toxic class when it is the top one too', () => {
    const hostile = [
      { label: LABELS.toxic, score: 0.972 },
      { label: LABELS.notToxic, score: 0.028 },
    ];
    expect(toxicScore(hostile)).toBeCloseTo(0.972);
  });

  it('treats separators and case as noise', () => {
    expect(toxicScore([{ label: 'TOXIC', score: 0.4 }])).toBe(0.4);
    expect(toxicScore([{ label: 'Not_Toxic', score: 0.9 }])).toBeNull();
    expect(toxicScore([{ label: 'not toxic', score: 0.9 }])).toBeNull();
  });

  it('has no opinion when the distribution has no toxic class', () => {
    // A swapped model must not read as "everything is fine".
    expect(toxicScore([{ label: 'LABEL_0', score: 0.8 }, { label: 'LABEL_1', score: 0.2 }])).toBeNull();
    expect(toxicScore([])).toBeNull();
  });
});
