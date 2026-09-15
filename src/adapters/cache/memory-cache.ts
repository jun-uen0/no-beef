import type { CachePort } from '../../core/ports';
import type { Verdict } from '../../core/types';

/**
 * In-memory LRU-ish cache (Map keeps insertion order; oldest entry evicted).
 * Used as L1 in the background worker and as the test double.
 */
export class MemoryCache implements CachePort {
  private readonly map = new Map<string, Verdict>();

  constructor(private readonly maxEntries = 5000) {}

  async get(key: string): Promise<Verdict | undefined> {
    return this.map.get(key);
  }

  async set(key: string, verdict: Verdict): Promise<void> {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, verdict);
  }
}
