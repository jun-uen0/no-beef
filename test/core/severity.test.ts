import { describe, expect, it } from 'vitest';
import { severityFor } from '../../src/core/severity';
import { DEFAULT_CONFIG } from '../../src/core/config';

describe('severityFor', () => {
  it('uses the reader’s thresholds', () => {
    expect(severityFor(0.9, DEFAULT_CONFIG)).toBe('harmful');
    expect(severityFor(0.6, DEFAULT_CONFIG)).toBe('mild');
    expect(severityFor(0.1, DEFAULT_CONFIG)).toBe('safe');
  });

  it('treats the threshold itself as met', () => {
    expect(severityFor(DEFAULT_CONFIG.harmfulThreshold, DEFAULT_CONFIG)).toBe('harmful');
    expect(severityFor(DEFAULT_CONFIG.mildThreshold, DEFAULT_CONFIG)).toBe('mild');
  });

  it('honours a reader who drags the slider all the way down', () => {
    // The options page allows 0, so 0 has to mean "cover everything" rather
    // than being quietly ignored.
    const paranoid = { ...DEFAULT_CONFIG, harmfulThreshold: 0, mildThreshold: 0 };
    expect(severityFor(0.001, paranoid)).toBe('harmful');
    expect(severityFor(0, paranoid)).toBe('harmful');
  });

  it('honours a reader who drags it all the way up', () => {
    const tolerant = { ...DEFAULT_CONFIG, harmfulThreshold: 1, mildThreshold: 1 };
    expect(severityFor(0.99, tolerant)).toBe('safe');
  });
});
