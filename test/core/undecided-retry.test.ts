import { describe, expect, it } from 'vitest';
import { retryDelayFor, UNDECIDED_RETRY_DELAYS_MS } from '../../src/core/undecided-retry';

describe('retryDelayFor', () => {
  it('backs off between attempts', () => {
    expect(retryDelayFor(0)).toBe(3_000);
    expect(retryDelayFor(1)).toBe(8_000);
    expect(retryDelayFor(2)).toBe(20_000);
  });

  it('stops rather than retrying forever', () => {
    // An environment where no stage can ever answer must not spin.
    expect(retryDelayFor(UNDECIDED_RETRY_DELAYS_MS.length)).toBeNull();
    expect(retryDelayFor(99)).toBeNull();
  });

  it('covers the whole warm-up of the classifier, which gives up after 10s', () => {
    const total = UNDECIDED_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(30_000);
  });

  it('refuses nonsense rather than guessing', () => {
    expect(retryDelayFor(-1)).toBeNull();
    expect(retryDelayFor(1.5)).toBeNull();
  });
});
