import type { CachePort } from '../../core/ports';
import type { Verdict } from '../../core/types';

/**
 * Combines a fast in-memory cache (L1) with a slower persistent cache (L2).
 * A hit in L1 skips L2 entirely; an L2 hit is promoted into L1 so the next
 * lookup for the same key is fast too. set() writes through to both.
 */
export class LayeredCache implements CachePort {
  constructor(
    private readonly l1: CachePort,
    private readonly l2: CachePort,
  ) {}

  async get(key: string): Promise<Verdict | undefined> {
    const l1Hit = await this.l1.get(key);
    if (l1Hit) return l1Hit;

    const l2Hit = await this.l2.get(key);
    if (l2Hit) {
      await this.l1.set(key, l2Hit);
    }
    return l2Hit;
  }

  async set(key: string, verdict: Verdict): Promise<void> {
    await Promise.all([this.l1.set(key, verdict), this.l2.set(key, verdict)]);
  }
}
