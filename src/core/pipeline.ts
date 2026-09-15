import type { CachePort, ClassifierPort } from './ports';
import type { AnalyzeRequest, Verdict } from './types';
import { cacheKey } from './normalize';

const SAFE: Verdict = { severity: 'safe', score: 0, source: 'none' };

export interface PipelineOptions {
  /** Stages in cost order (cheapest first). */
  stages: ClassifierPort[];
  cache: CachePort;
}

/**
 * Runs stages in order and keeps the strongest verdict.
 * A 'harmful' verdict is decisive and skips the remaining (costlier) stages.
 * A stage that throws or returns null is skipped — the pipeline must keep
 * working even when e.g. the ML model failed to load.
 */
export class AnalysisPipeline {
  constructor(private readonly opts: PipelineOptions) {}

  async analyze(req: AnalyzeRequest): Promise<Verdict> {
    const key = await cacheKey(req.text);
    const cached = await this.opts.cache.get(key).catch(() => undefined);
    if (cached) return { ...cached, source: 'cache' };

    let result: Verdict = SAFE;
    for (const stage of this.opts.stages) {
      let verdict: Verdict | null = null;
      try {
        verdict = await stage.classify(req);
      } catch {
        continue;
      }
      if (!verdict) continue;
      if (verdict.score >= result.score) result = verdict;
      if (result.severity === 'harmful') break;
    }

    await this.opts.cache.set(key, result).catch(() => {});
    return result;
  }
}
