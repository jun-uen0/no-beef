import { describe, expect, it, vi } from 'vitest';
import { AnalysisPipeline } from '../../src/core/pipeline';
import { MemoryCache } from '../../src/adapters/cache/memory-cache';
import type { CachePort, ClassifierPort } from '../../src/core/ports';
import type { Verdict } from '../../src/core/types';

/** Minimal in-memory stand-in for CachePort, used by tests that don't care about eviction. */
class StubCache implements CachePort {
  private readonly map = new Map<string, Verdict>();

  async get(key: string): Promise<Verdict | undefined> {
    return this.map.get(key);
  }

  async set(key: string, verdict: Verdict): Promise<void> {
    this.map.set(key, verdict);
  }
}

function stage(classify: ClassifierPort['classify']): ClassifierPort {
  return { classify: vi.fn(classify) };
}

describe('AnalysisPipeline', () => {
  it('calls stages in order and keeps the strongest verdict', async () => {
    const order: string[] = [];
    const s1 = stage(async () => {
      order.push('s1');
      return null;
    });
    const s2 = stage(async () => {
      order.push('s2');
      return { severity: 'mild', score: 0.4, source: 'classifier' } satisfies Verdict;
    });
    const s3 = stage(async () => {
      order.push('s3');
      return { severity: 'mild', score: 0.7, source: 'classifier' } satisfies Verdict;
    });

    const pipeline = new AnalysisPipeline({ stages: [s1, s2, s3], cache: new StubCache() });
    const verdict = await pipeline.analyze({ text: 'foo bar' });

    expect(order).toEqual(['s1', 's2', 's3']);
    expect(verdict.severity).toBe('mild');
    expect(verdict.score).toBe(0.7);
    expect(s1.classify).toHaveBeenCalledTimes(1);
    expect(s2.classify).toHaveBeenCalledTimes(1);
    expect(s3.classify).toHaveBeenCalledTimes(1);
  });

  it('skips remaining stages once a harmful verdict is found', async () => {
    const s1 = stage(async () => ({ severity: 'harmful', score: 0.95, source: 'lexicon' }) satisfies Verdict);
    const s2 = stage(async () => ({ severity: 'mild', score: 0.5, source: 'classifier' }) satisfies Verdict);

    const pipeline = new AnalysisPipeline({ stages: [s1, s2], cache: new StubCache() });
    const verdict = await pipeline.analyze({ text: '死ね' });

    expect(verdict.severity).toBe('harmful');
    expect(s1.classify).toHaveBeenCalledTimes(1);
    expect(s2.classify).not.toHaveBeenCalled();
  });

  it('keeps going when a stage throws, treating it like a null verdict', async () => {
    const s1 = stage(async () => {
      throw new Error('model failed to load');
    });
    const s2 = stage(async () => ({ severity: 'mild', score: 0.6, source: 'classifier' }) satisfies Verdict);

    const pipeline = new AnalysisPipeline({ stages: [s1, s2], cache: new StubCache() });
    const verdict = await pipeline.analyze({ text: 'whatever' });

    expect(verdict.severity).toBe('mild');
    expect(verdict.score).toBe(0.6);
    expect(s1.classify).toHaveBeenCalledTimes(1);
    expect(s2.classify).toHaveBeenCalledTimes(1);
  });

  it('returns a safe/none verdict when every stage has no opinion', async () => {
    const s1 = stage(async () => null);
    const s2 = stage(async () => null);

    const pipeline = new AnalysisPipeline({ stages: [s1, s2], cache: new StubCache() });
    const verdict = await pipeline.analyze({ text: '普通の投稿' });

    expect(verdict).toEqual({ severity: 'safe', score: 0, source: 'none' });
  });

  it('serves the second identical request from cache without re-running stages', async () => {
    const s1 = stage(async () => ({ severity: 'mild', score: 0.6, source: 'classifier' }) satisfies Verdict);

    const pipeline = new AnalysisPipeline({ stages: [s1], cache: new StubCache() });
    const first = await pipeline.analyze({ text: 'repeat me' });
    const second = await pipeline.analyze({ text: 'repeat me' });

    expect(first.source).toBe('classifier');
    expect(second.source).toBe('cache');
    expect(second.severity).toBe(first.severity);
    expect(second.score).toBe(first.score);
    expect(s1.classify).toHaveBeenCalledTimes(1);
  });

  it('recomputes once MemoryCache evicts the oldest entry past maxEntries', async () => {
    const classify = vi.fn(async () => ({ severity: 'mild', score: 0.5, source: 'classifier' }) satisfies Verdict);
    const cache = new MemoryCache(2);
    const pipeline = new AnalysisPipeline({ stages: [{ classify }], cache });

    await pipeline.analyze({ text: 'aaa' });
    await pipeline.analyze({ text: 'bbb' });
    await pipeline.analyze({ text: 'ccc' }); // pushes maxEntries(2) over the edge, evicting 'aaa'

    classify.mockClear();
    await pipeline.analyze({ text: 'aaa' });
    expect(classify).toHaveBeenCalledTimes(1); // evicted -> recomputed

    classify.mockClear();
    await pipeline.analyze({ text: 'ccc' });
    expect(classify).not.toHaveBeenCalled(); // still cached -> hit
  });

  it('skips a gated stage when its condition does not hold', async () => {
    const cheap = stage(async () => ({ severity: 'safe', score: 0.05, source: 'classifier' }) satisfies Verdict);
    const expensive = stage(async () => ({ severity: 'harmful', score: 0.9, source: 'llm' }) satisfies Verdict);

    const pipeline = new AnalysisPipeline({
      stages: [cheap, { classifier: expensive, shouldRun: (_req, current) => current.score >= 0.5 }],
      cache: new StubCache(),
    });
    const verdict = await pipeline.analyze({ text: '普通の投稿' });

    expect(cheap.classify).toHaveBeenCalledTimes(1);
    expect(expensive.classify).not.toHaveBeenCalled();
    expect(verdict.score).toBe(0.05);
  });

  it('runs a gated stage when its condition holds', async () => {
    const cheap = stage(async () => ({ severity: 'mild', score: 0.6, source: 'classifier' }) satisfies Verdict);
    const expensive = stage(async () => ({ severity: 'harmful', score: 0.9, source: 'llm' }) satisfies Verdict);

    const pipeline = new AnalysisPipeline({
      stages: [cheap, { classifier: expensive, shouldRun: (_req, current) => current.score >= 0.5 }],
      cache: new StubCache(),
    });
    const verdict = await pipeline.analyze({ text: 'グレーな投稿' });

    expect(expensive.classify).toHaveBeenCalledTimes(1);
    expect(verdict.severity).toBe('harmful');
    expect(verdict.source).toBe('llm');
  });

  it('lets a gate see the request, not just the accumulated verdict', async () => {
    // Polite sarcasm scores near zero on a toxicity classifier, so the gate that
    // matters for the LLM stage keys off the request rather than the score.
    const cheap = stage(async () => ({ severity: 'safe', score: 0.02, source: 'classifier' }) satisfies Verdict);
    const llm = stage(async () => ({ severity: 'harmful', score: 0.88, source: 'llm' }) satisfies Verdict);
    const shouldRun = vi.fn((req: { lang?: string }) => req.lang === 'ja');

    const pipeline = new AnalysisPipeline({
      stages: [cheap, { classifier: llm, shouldRun }],
      cache: new StubCache(),
    });

    const ja = await pipeline.analyze({ text: 'さすがですね、頭の作りが違う', lang: 'ja' });
    expect(ja.source).toBe('llm');

    const en = await pipeline.analyze({ text: 'nice work as always', lang: 'en' });
    expect(en.source).toBe('classifier');
    expect(llm.classify).toHaveBeenCalledTimes(1);
  });

  it('skips the stage when its gate throws, rather than running it', async () => {
    const cheap = stage(async () => ({ severity: 'safe', score: 0.1, source: 'classifier' }) satisfies Verdict);
    const expensive = stage(async () => ({ severity: 'harmful', score: 0.9, source: 'llm' }) satisfies Verdict);

    const pipeline = new AnalysisPipeline({
      stages: [
        cheap,
        {
          classifier: expensive,
          shouldRun: () => {
            throw new Error('gate blew up');
          },
        },
      ],
      cache: new StubCache(),
    });
    const verdict = await pipeline.analyze({ text: 'whatever' });

    expect(expensive.classify).not.toHaveBeenCalled();
    expect(verdict.score).toBe(0.1);
  });
});
