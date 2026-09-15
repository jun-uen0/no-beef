import { describe, expect, it } from 'vitest';
import { cacheKey, normalizeText } from '../../src/core/normalize';

describe('normalizeText', () => {
  it('folds fullwidth alphanumerics to halfwidth via NFKC', () => {
    expect(normalizeText('ＡＢＣ１２３')).toBe('abc123');
  });

  it('folds halfwidth katakana to fullwidth via NFKC', () => {
    expect(normalizeText('ｼﾈ')).toBe('シネ');
  });

  it('lowercases ascii letters', () => {
    expect(normalizeText('HELLO World')).toBe('hello world');
  });

  it('collapses runs of whitespace into a single space', () => {
    expect(normalizeText('foo   bar\t\tbaz\n\nqux')).toBe('foo bar baz qux');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  padded text  ')).toBe('padded text');
  });
});

describe('cacheKey', () => {
  it('is stable for the same input', async () => {
    const a = await cacheKey('同じテキストです');
    const b = await cacheKey('同じテキストです');
    expect(a).toBe(b);
  });

  it('produces the same key for inputs that normalize to the same text', async () => {
    const fullwidth = await cacheKey('ＡＢＣ');
    const halfwidth = await cacheKey('abc');
    expect(fullwidth).toBe(halfwidth);
  });

  it('produces different keys for different normalized text', async () => {
    const a = await cacheKey('abc');
    const b = await cacheKey('def');
    expect(a).not.toBe(b);
  });

  it('returns a 64-character lowercase hex string (sha-256)', async () => {
    const key = await cacheKey('any input text');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
