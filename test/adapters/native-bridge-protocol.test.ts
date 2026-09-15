import { describe, expect, it } from 'vitest';
import { parseBridgeVerdict, parseBridgeRewrite } from '../../src/adapters/bridge/native/protocol';

/**
 * A host is a program the reader supplies. It is trusted with their posts and
 * not trusted to send well-formed JSON, so everything here is about refusing
 * malformed input rather than interpreting it generously.
 */

describe('parseBridgeVerdict', () => {
  it('accepts a well-formed verdict', () => {
    expect(parseBridgeVerdict({ severity: 'harmful', score: 0.9 })).toEqual({ severity: 'harmful', score: 0.9 });
  });

  it('refuses a score outside 0..1', () => {
    // This one matters: the score is compared against the reader's thresholds,
    // where a 7 would beat every setting and a NaN would beat none of them.
    expect(parseBridgeVerdict({ severity: 'harmful', score: 7 })).toBeNull();
    expect(parseBridgeVerdict({ severity: 'harmful', score: -1 })).toBeNull();
    expect(parseBridgeVerdict({ severity: 'harmful', score: Number.NaN })).toBeNull();
    expect(parseBridgeVerdict({ severity: 'harmful', score: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('refuses a severity it does not know', () => {
    expect(parseBridgeVerdict({ severity: 'nuclear', score: 0.5 })).toBeNull();
    expect(parseBridgeVerdict({ severity: 2, score: 0.5 })).toBeNull();
  });

  it('refuses anything that is not an object with both fields', () => {
    expect(parseBridgeVerdict(null)).toBeNull();
    expect(parseBridgeVerdict('harmful')).toBeNull();
    expect(parseBridgeVerdict({ severity: 'harmful' })).toBeNull();
    expect(parseBridgeVerdict({ score: 0.5 })).toBeNull();
  });
});

describe('parseBridgeRewrite', () => {
  it('accepts and trims a rewrite', () => {
    expect(parseBridgeRewrite({ rewritten: '  やわらかい言い方。  ' })).toBe('やわらかい言い方。');
  });

  it('refuses an empty or absent rewrite', () => {
    expect(parseBridgeRewrite({ rewritten: '   ' })).toBeNull();
    expect(parseBridgeRewrite({})).toBeNull();
    expect(parseBridgeRewrite({ rewritten: 42 })).toBeNull();
  });

  it('refuses a rewrite far longer than any post', () => {
    expect(parseBridgeRewrite({ rewritten: 'あ'.repeat(4_001) })).toBeNull();
  });
});
